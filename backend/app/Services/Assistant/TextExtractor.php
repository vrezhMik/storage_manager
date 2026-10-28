<?php

namespace App\Services\Assistant;

use DOMDocument;
use DOMElement;
use DOMNode;
use DOMXPath;
use RuntimeException;

/**
 * Turns a web page or an uploaded file into plain-text sections:
 * [['heading' => ..., 'text' => ...], ...].
 */
class TextExtractor
{
    private const BLOCK_TAGS = ['p', 'li', 'td', 'th', 'pre', 'blockquote', 'dd', 'dt', 'div'];

    /**
     * @return array{title: string|null, sections: array<int, array{heading: string|null, text: string}>}
     */
    public function fromHtml(string $html): array
    {
        $html = $this->toUtf8($html);

        $dom = new DOMDocument();
        libxml_use_internal_errors(true);
        $dom->loadHTML('<?xml encoding="UTF-8">'.$html, LIBXML_NOERROR | LIBXML_NOWARNING);
        libxml_clear_errors();

        $xpath = new DOMXPath($dom);
        foreach (['//script', '//style', '//noscript', '//nav', '//header', '//footer', '//aside', '//form', '//iframe', '//svg'] as $query) {
            foreach (iterator_to_array($xpath->query($query)) as $node) {
                $node->parentNode?->removeChild($node);
            }
        }

        $title = trim((string) $xpath->evaluate('string(//title)')) ?: null;
        $root = $xpath->query('//main | //article')->item(0) ?? $xpath->query('//body')->item(0) ?? $dom->documentElement;

        $sections = [];
        $current = ['heading' => null, 'lines' => []];
        $this->walk($root, $sections, $current);
        $this->flush($sections, $current);

        return ['title' => $title, 'sections' => $sections];
    }

    /**
     * @return array{title: string|null, sections: array<int, array{heading: string|null, text: string}>}
     */
    public function fromFile(string $path, string $originalName): array
    {
        $extension = strtolower(pathinfo($originalName, PATHINFO_EXTENSION));
        $content = file_get_contents($path);

        if ($content === false) {
            throw new RuntimeException('Cannot read the uploaded file');
        }

        return match ($extension) {
            'html', 'htm' => $this->fromHtml($content),
            'txt', 'md' => $this->fromPlainText($this->toUtf8($content)),
            default => throw new RuntimeException('Unsupported file type .'.$extension.' (use .txt, .md, .html)'),
        };
    }

    /**
     * Plain text / Markdown: "#" lines (Markdown) start a new section.
     *
     * @return array{title: string|null, sections: array<int, array{heading: string|null, text: string}>}
     */
    public function fromPlainText(string $text): array
    {
        $sections = [];
        $current = ['heading' => null, 'lines' => []];

        foreach (preg_split('/\R/u', $text) as $line) {
            if (preg_match('/^\s{0,3}#{1,6}\s+(.+)$/u', $line, $m)) {
                $this->flush($sections, $current);
                $current = ['heading' => trim($m[1]), 'lines' => []];
                continue;
            }
            $current['lines'][] = $line;
        }
        $this->flush($sections, $current);

        return ['title' => $sections[0]['heading'] ?? null, 'sections' => $sections];
    }

    private function walk(DOMNode $node, array &$sections, array &$current): void
    {
        foreach ($node->childNodes as $child) {
            if (! $child instanceof DOMElement) {
                continue;
            }

            $tag = strtolower($child->tagName);

            if (preg_match('/^h[1-6]$/', $tag)) {
                $this->flush($sections, $current);
                $current = ['heading' => $this->clean($child->textContent), 'lines' => []];
                continue;
            }

            // A block that contains other blocks: go deeper so headings inside are seen.
            if ($tag === 'div' || $tag === 'section' || $tag === 'ul' || $tag === 'ol' || $tag === 'table' || $tag === 'tbody' || $tag === 'tr') {
                if ($this->hasBlockChildren($child)) {
                    $this->walk($child, $sections, $current);
                    continue;
                }
            }

            if (in_array($tag, self::BLOCK_TAGS, true) || in_array($tag, ['ul', 'ol', 'table', 'tr', 'section', 'span', 'a', 'b', 'strong'], true)) {
                $text = $this->clean($child->textContent);
                if ($text !== '') {
                    $current['lines'][] = $tag === 'li' ? '• '.$text : $text;
                }
                continue;
            }

            $this->walk($child, $sections, $current);
        }
    }

    private function hasBlockChildren(DOMElement $element): bool
    {
        foreach ($element->childNodes as $child) {
            if ($child instanceof DOMElement && (preg_match('/^h[1-6]$/', strtolower($child->tagName)) || in_array(strtolower($child->tagName), ['div', 'p', 'section', 'ul', 'ol', 'table', 'tr', 'li', 'pre'], true))) {
                return true;
            }
        }

        return false;
    }

    private function flush(array &$sections, array $current): void
    {
        $text = trim(implode("\n", array_filter(array_map('trim', $current['lines']), fn ($l) => $l !== '')));
        if ($text !== '') {
            $sections[] = ['heading' => $current['heading'], 'text' => $text];
        }
    }

    private function clean(string $text): string
    {
        return trim(preg_replace('/[ \t\x{00A0}]+/u', ' ', preg_replace('/\s*\R\s*/u', ' ', $text)));
    }

    private function toUtf8(string $content): string
    {
        if (mb_check_encoding($content, 'UTF-8')) {
            return $content;
        }

        // Old 1C/ITS pages are often windows-1251.
        return mb_convert_encoding($content, 'UTF-8', 'Windows-1251');
    }
}
