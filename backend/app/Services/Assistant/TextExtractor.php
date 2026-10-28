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

    // "3.4.6. Title" (at least two numbers), short, not ending with a full stop.
    private const NUMBERED_HEADING = '/^\d+(\.\d+)+\.?\s+\S.{0,118}(?<![.:;,])$/u';

    // Pictures are kept in the text as their own line: [[img:relative/path.png]].
    public const IMAGE_MARKER = '/\[\[img:([^\]\n]+)\]\]/u';
    public const IMAGE_LINE = '/^\s*\[\[img:[^\]\n]+\]\]\s*$/u';

    public static function stripImages(string $text): string
    {
        return trim(preg_replace("/\n{2,}/", "\n", preg_replace(self::IMAGE_MARKER, '', $text)));
    }

    /**
     * Marker for an <img src>, or null for images we cannot show later
     * (inline data, tracking pixels, paths leaving the saved folder).
     */
    public static function imageMarker(string $src): ?string
    {
        $src = trim(html_entity_decode($src, ENT_QUOTES | ENT_HTML5, 'UTF-8'));
        if ($src === '' || str_starts_with($src, 'data:')) {
            return null;
        }
        if (! preg_match('#^https?://#i', $src)) {
            $src = rawurldecode(preg_replace('/[?#].*$/', '', $src));
            $src = preg_replace('#^\./#', '', str_replace('\\', '/', $src));
            if ($src === '' || str_starts_with($src, '/') || str_contains($src, '..')) {
                return null;
            }
        }
        if (! preg_match('/\.(png|jpe?g|gif|webp|svg)(\?|$)/i', $src) || preg_match('/(avatar|logo|icon|pixel|24px)/i', basename($src))) {
            return null;
        }

        return '[[img:'.str_replace([']', "\n"], '', $src).']]';
    }

    private function addImages(DOMElement $element, array &$current): void
    {
        $images = strtolower($element->tagName) === 'img' ? [$element] : iterator_to_array($element->getElementsByTagName('img'));
        foreach ($images as $img) {
            $marker = self::imageMarker((string) $img->getAttribute('src'));
            if ($marker !== null) {
                $current['lines'][] = $marker;
            }
        }
    }

    /**
     * @return array{title: string|null, sections: array<int, array{heading: string|null, text: string}>}
     */
    public function fromHtml(string $html): array
    {
        $html = $this->toUtf8($html);
        // The text is UTF-8 now; an old <meta charset=windows-1251> would make
        // libxml decode it a second time.
        $html = preg_replace('/<meta[^>]+charset[^>]*>/i', '', $html);

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

        $document = match ($extension) {
            'html', 'htm' => $this->fromHtml($content),
            'mhtml', 'mht' => $this->fromMhtml($content),
            'txt', 'md' => $this->fromPlainText($this->toUtf8($content)),
            default => throw new RuntimeException('Unsupported file type .'.$extension.' (use .mhtml, .html, .txt, .md)'),
        };

        if (in_array($extension, ['html', 'htm'], true)) {
            $this->guardFramedPage($document, $content);
        }

        return $document;
    }

    // Pages like ITS show the article in an <iframe>; saved or downloaded
    // without it, only a few words of site menu are left.
    private const FRAMED_PAGE_MIN_CHARS = 300;

    public function guardFramedPage(array $document, string $html): void
    {
        $chars = array_sum(array_map(fn ($s) => mb_strlen($s['text']), $document['sections']));

        if ($chars < self::FRAMED_PAGE_MIN_CHARS && stripos($html, '<iframe') !== false) {
            throw new RuntimeException(
                'The page text is inside a frame (e.g. ITS), so only the site menu was found. '
                .'Save the page in Chrome as "Webpage, Single File" (.mhtml) and upload that file, '
                .'or upload "..._files/saved_resource.html" from the saved folder.'
            );
        }
    }

    /**
     * "Webpage, Single File" (.mhtml) saved by Chrome/Edge: a MIME archive with
     * the page and its frames. Frames hold the real text on sites like ITS, so
     * the frame parts are used and the outer page (the one with the <iframe>)
     * only when it is the sole HTML part.
     *
     * @return array{title: string|null, sections: array<int, array{heading: string|null, text: string}>}
     */
    public function fromMhtml(string $content): array
    {
        if (! preg_match('/boundary="?([^";\r\n]+)"?/i', $content, $m)) {
            throw new RuntimeException('Not a valid .mhtml file (no MIME boundary)');
        }

        $parts = [];
        foreach (explode('--'.$m[1], $content) as $part) {
            $split = preg_split('/\r?\n\r?\n/', $part, 2);
            if (count($split) < 2 || ! preg_match('/content-type:\s*text\/html/i', $split[0])) {
                continue;
            }

            [$headers, $body] = $split;
            if (preg_match('/content-transfer-encoding:\s*quoted-printable/i', $headers)) {
                $body = quoted_printable_decode($body);
            } elseif (preg_match('/content-transfer-encoding:\s*base64/i', $headers)) {
                $body = (string) base64_decode(preg_replace('/\s+/', '', $body));
            }

            if (preg_match('/charset="?([\w-]+)"?/i', $headers, $cs) && strcasecmp($cs[1], 'utf-8') !== 0) {
                $body = mb_convert_encoding($body, 'UTF-8', $cs[1]);
            }

            $parts[] = ['html' => $body, 'outer' => stripos($body, '<iframe') !== false];
        }

        if ($parts === []) {
            throw new RuntimeException('No HTML found inside the .mhtml file');
        }

        $frames = array_values(array_filter($parts, fn ($p) => ! $p['outer']));
        $use = $frames !== [] ? $frames : $parts;

        $title = null;
        $sections = [];
        foreach ($use as $part) {
            $document = $this->fromHtml($part['html']);
            $title ??= $document['title'];
            array_push($sections, ...$document['sections']);
        }

        // The outer page usually has the best title (frames may have none).
        $title ??= $this->fromHtml($parts[0]['html'])['title'];

        return ['title' => $title, 'sections' => $sections];
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
                // ITS writes sub-headings like "3.4.6. Бонусные программы" as plain
                // paragraphs; treat such short numbered lines as headings.
                if ($tag !== 'li' && preg_match(self::NUMBERED_HEADING, $text)) {
                    $this->flush($sections, $current);
                    $current = ['heading' => $text, 'lines' => []];
                    continue;
                }
                if ($text !== '') {
                    $current['lines'][] = $tag === 'li' ? '• '.$text : $text;
                }
                $this->addImages($child, $current);
                continue;
            }

            if ($tag === 'img') {
                $this->addImages($child, $current);
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
