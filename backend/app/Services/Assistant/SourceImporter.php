<?php

namespace App\Services\Assistant;

use App\Models\KbSource;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use RuntimeException;
use ZipArchive;

/**
 * Turns uploaded files (single documents or ZIP archives) into KbSource rows.
 */
class SourceImporter
{
    public const DOCUMENT_EXTENSIONS = ['mhtml', 'mht', 'html', 'htm', 'txt', 'md'];

    public const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'];

    private const MAX_ARCHIVE_ENTRIES = 2000;

    /**
     * @param  string  $path  path on the "kb" disk
     * @return KbSource[]
     */
    public function import(string $path): array
    {
        $extension = strtolower(pathinfo($path, PATHINFO_EXTENSION));

        if ($extension === 'zip') {
            return $this->importZip($path);
        }

        if ($extension === 'rar' || $extension === '7z') {
            throw new RuntimeException('.'.$extension.' archives are not supported, please pack the folder as .zip');
        }

        if (! in_array($extension, self::DOCUMENT_EXTENSIONS, true)) {
            throw new RuntimeException('Unsupported file type .'.$extension);
        }

        return [KbSource::create([
            'title' => '',
            'type' => KbSource::TYPE_FILE,
            'file_path' => $path,
            'status' => KbSource::STATUS_PENDING,
        ])];
    }

    /**
     * @return KbSource[]
     */
    private function importZip(string $path): array
    {
        if (! class_exists(ZipArchive::class)) {
            throw new RuntimeException('ZIP support (php-zip) is not installed on the server');
        }

        $disk = Storage::disk('kb');
        $zip = new ZipArchive();
        if ($zip->open($disk->path($path)) !== true) {
            throw new RuntimeException('Cannot open the ZIP archive');
        }
        if ($zip->numFiles > self::MAX_ARCHIVE_ENTRIES) {
            $zip->close();
            throw new RuntimeException('The archive has too many files (max '.self::MAX_ARCHIVE_ENTRIES.')');
        }

        $folder = 'kb/'.Str::uuid();
        $files = [];
        for ($i = 0; $i < $zip->numFiles; $i++) {
            $name = $this->entryName($zip, $i);
            // Skip folders and anything that tries to escape the target folder.
            if ($name === '' || str_ends_with($name, '/') || str_contains($name, '..')) {
                continue;
            }
            $extension = strtolower(pathinfo($name, PATHINFO_EXTENSION));
            $isDocument = in_array($extension, self::DOCUMENT_EXTENSIONS, true);
            // Pictures are kept next to the pages so answers can show them.
            if (! $isDocument && ! in_array($extension, self::IMAGE_EXTENSIONS, true)) {
                continue;
            }
            $content = $zip->getFromIndex($i);
            if ($content === false) {
                continue;
            }
            $target = $folder.'/'.$name;
            $disk->put($target, $content);
            if ($isDocument) {
                $files[$name] = $target;
            }
        }
        $zip->close();
        $disk->delete($path);

        return $this->createSources($files);
    }

    /**
     * Pages saved as "Webpage, Complete" come as "Page.htm" + "Page_files/".
     * On sites like ITS the article lives in a frame inside "Page_files/", so
     * that frame becomes the source and "Page.htm" only gives the title.
     *
     * @param  array<string, string>  $files  archive name => stored path
     * @return KbSource[]
     */
    private function createSources(array $files): array
    {
        $disk = Storage::disk('kb');
        $usedFolders = [];
        $sources = [];

        foreach ($files as $name => $stored) {
            if (preg_match('#_files/#i', $name)) {
                continue;
            }

            $extension = strtolower(pathinfo($name, PATHINFO_EXTENSION));
            $source = $stored;
            $title = '';

            if (in_array($extension, ['html', 'htm'], true)) {
                $prefix = substr($name, 0, -strlen($extension) - 1).'_files/';
                $frame = $this->largestFrame($files, $prefix);
                if ($frame !== null) {
                    $usedFolders[$prefix] = true;
                    $source = $files[$frame];
                    $title = $this->titleOf($disk->get($stored)) ?? '';
                }
            }

            $sources[] = KbSource::create([
                'title' => mb_substr($title, 0, 255),
                'type' => KbSource::TYPE_FILE,
                'file_path' => $source,
                'status' => KbSource::STATUS_PENDING,
            ]);
        }

        // A "_files" folder whose outer page was not in the archive still
        // counts: its largest page is the article (the rest are helpers).
        foreach ($files as $name => $stored) {
            if (! preg_match('#^(.*_files/)[^/]+\.html?$#i', $name, $m) || isset($usedFolders[$m[1]])) {
                continue;
            }
            $usedFolders[$m[1]] = true;
            $frame = $this->largestFrame($files, $m[1]);
            $sources[] = KbSource::create([
                'title' => '',
                'type' => KbSource::TYPE_FILE,
                'file_path' => $files[$frame],
                'status' => KbSource::STATUS_PENDING,
            ]);
        }

        if ($sources === []) {
            throw new RuntimeException('No documents found in the archive (.mhtml, .html, .htm, .txt, .md)');
        }

        return $sources;
    }

    /**
     * @param  array<string, string>  $files
     */
    private function largestFrame(array $files, string $prefix): ?string
    {
        $best = null;
        $bestSize = 0;
        foreach ($files as $name => $stored) {
            if (! str_starts_with($name, $prefix) || ! preg_match('/\.html?$/i', $name)) {
                continue;
            }
            $size = Storage::disk('kb')->size($stored);
            if ($size > $bestSize) {
                $best = $name;
                $bestSize = $size;
            }
        }

        return $best;
    }

    private function titleOf(string $html): ?string
    {
        if (! preg_match('/<title[^>]*>(.*?)<\/title>/is', $html, $m)) {
            return null;
        }
        $title = trim(html_entity_decode(strip_tags($m[1]), ENT_QUOTES | ENT_HTML5, 'UTF-8'));
        if (! mb_check_encoding($title, 'UTF-8')) {
            $title = mb_convert_encoding($title, 'UTF-8', 'Windows-1251');
        }

        return $title !== '' ? $title : null;
    }

    /**
     * Windows "Send to > Compressed folder" stores Cyrillic names in CP866.
     */
    private function entryName(ZipArchive $zip, int $index): string
    {
        $raw = $zip->getNameIndex($index, ZipArchive::FL_ENC_RAW);
        $name = $raw !== false && ! mb_check_encoding($raw, 'UTF-8')
            ? mb_convert_encoding($raw, 'UTF-8', 'CP866')
            : (string) $zip->getNameIndex($index);

        return ltrim(str_replace('\\', '/', $name), '/');
    }
}
