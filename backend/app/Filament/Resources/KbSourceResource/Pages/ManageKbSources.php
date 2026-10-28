<?php

namespace App\Filament\Resources\KbSourceResource\Pages;

use App\Filament\Resources\KbSourceResource;
use App\Jobs\IndexKbSource;
use App\Models\KbSource;
use App\Services\Assistant\KnowledgeBase;
use App\Services\Assistant\SourceImporter;
use Filament\Actions;
use Filament\Forms;
use Filament\Notifications\Notification;
use Filament\Resources\Pages\ManageRecords;
use Throwable;

class ManageKbSources extends ManageRecords
{
    protected static string $resource = KbSourceResource::class;

    // Synchronous indexing stops before PHP / nginx time limits are reached.
    private const SYNC_TIME_BUDGET_SECONDS = 240;

    protected function getHeaderActions(): array
    {
        return [
            Actions\Action::make('bulkUpload')
                ->label('Bulk upload')
                ->icon('heroicon-o-arrow-up-tray')
                ->modalDescription('Many files at once, or a .zip of a folder. Pages saved as "Webpage, Complete" '
                    .'(Page.htm + Page_files) and "Webpage, Single File" (.mhtml) are both understood. '
                    .'Indexing runs in the background.')
                ->schema([
                    Forms\Components\FileUpload::make('files')
                        ->label('Files (.zip, .mhtml, .html, .htm, .txt, .md)')
                        ->disk('local')
                        ->directory('kb/uploads')
                        ->preserveFilenames()
                        ->multiple()
                        ->maxFiles(200)
                        ->maxSize(102400)
                        ->required(),
                ])
                ->action(function (array $data) {
                    $created = 0;
                    $errors = [];
                    foreach ((array) $data['files'] as $path) {
                        try {
                            foreach (app(SourceImporter::class)->import($path) as $source) {
                                IndexKbSource::dispatch($source->id);
                                $created++;
                            }
                        } catch (Throwable $e) {
                            $errors[] = basename($path).': '.$e->getMessage();
                        }
                    }

                    $notification = Notification::make()
                        ->title($created.' source(s) added, indexing in the background')
                        ->body($errors === [] ? null : implode("\n", $errors));
                    ($errors === [] ? $notification->success() : $notification->warning()->persistent())->send();
                }),

            Actions\Action::make('indexPending')
                ->label('Index pending now')
                ->icon('heroicon-o-bolt')
                ->color('gray')
                ->visible(fn () => KbSource::query()->where('status', KbSource::STATUS_PENDING)->exists())
                ->action(function () {
                    // For when no queue worker is running: index here for a few minutes.
                    set_time_limit(self::SYNC_TIME_BUDGET_SECONDS + 60);
                    $started = time();
                    $done = 0;
                    while (time() - $started < self::SYNC_TIME_BUDGET_SECONDS
                        && ($source = KbSource::query()->where('status', KbSource::STATUS_PENDING)->orderBy('id')->first())) {
                        app(KnowledgeBase::class)->index($source);
                        $done++;
                    }
                    $left = KbSource::query()->where('status', KbSource::STATUS_PENDING)->count();
                    Notification::make()
                        ->title($done.' indexed'.($left > 0 ? ', '.$left.' still pending — press again' : ''))
                        ->success()
                        ->send();
                }),

            Actions\CreateAction::make()
                ->label('Add source')
                ->after(fn (KbSource $record) => KbSourceResource::runIndex($record)),
        ];
    }
}
