<?php

namespace App\Filament\Resources;

use App\Filament\Resources\KbSourceResource\Pages;
use App\Models\KbSource;
use App\Jobs\TranslateKbSource;
use App\Services\Assistant\KnowledgeBase;
use App\Services\Assistant\TranslatorClient;
use BackedEnum;
use Filament\Actions;
use Filament\Forms;
use Filament\Notifications\Notification;
use Filament\Resources\Resource;
use Filament\Schemas\Components\Utilities\Get;
use Filament\Schemas\Schema;
use Filament\Tables;
use Filament\Tables\Table;
use Illuminate\Database\Eloquent\Collection;
use UnitEnum;

class KbSourceResource extends Resource
{
    protected static ?string $model = KbSource::class;

    protected static string|BackedEnum|null $navigationIcon = 'heroicon-o-book-open';

    protected static string|UnitEnum|null $navigationGroup = 'AI';

    protected static ?string $navigationLabel = 'Knowledge base';

    protected static ?string $modelLabel = 'source';

    protected static ?string $recordTitleAttribute = 'title';

    public static function form(Schema $schema): Schema
    {
        return $schema->schema([
            Forms\Components\TextInput::make('title')
                ->label('Title')
                ->helperText('Leave empty to use the page title')
                ->maxLength(255),
            Forms\Components\Radio::make('type')
                ->label('Source')
                ->options([
                    KbSource::TYPE_URL => 'Web page (link)',
                    KbSource::TYPE_FILE => 'File (.mhtml, .html, .txt, .md)',
                ])
                ->default(KbSource::TYPE_URL)
                ->required()
                ->live(),
            Forms\Components\TextInput::make('url')
                ->label('Link')
                ->url()
                ->maxLength(2048)
                ->required(fn (Get $get) => $get('type') === KbSource::TYPE_URL)
                ->visible(fn (Get $get) => $get('type') === KbSource::TYPE_URL),
            Forms\Components\FileUpload::make('file_path')
                ->label('File')
                ->disk('kb')
                ->directory('kb')
                ->preserveFilenames()
                ->maxSize(10240)
                ->required(fn (Get $get) => $get('type') === KbSource::TYPE_FILE)
                ->visible(fn (Get $get) => $get('type') === KbSource::TYPE_FILE),
        ]);
    }

    public static function table(Table $table): Table
    {
        return $table
            ->columns([
                Tables\Columns\TextColumn::make('title')
                    ->searchable()
                    ->limit(60)
                    ->description(fn (KbSource $record) => $record->type === KbSource::TYPE_URL ? $record->url : $record->file_path),
                Tables\Columns\TextColumn::make('status')
                    ->badge()
                    ->color(fn (string $state) => match ($state) {
                        KbSource::STATUS_INDEXED => 'success',
                        KbSource::STATUS_FAILED => 'danger',
                        default => 'gray',
                    })
                    ->tooltip(fn (KbSource $record) => $record->error),
                Tables\Columns\TextColumn::make('chunks_count')
                    ->label('Chunks')
                    ->numeric(),
                Tables\Columns\TextColumn::make('translation_status')
                    ->label('Armenian')
                    ->badge()
                    ->formatStateUsing(fn (?string $state) => match ($state) {
                        'done' => 'translated',
                        'pending' => 'translating…',
                        'failed' => 'failed',
                        'not_needed' => 'already hy',
                        default => '—',
                    })
                    ->color(fn (?string $state) => match ($state) {
                        'done', 'not_needed' => 'success',
                        'failed' => 'danger',
                        default => 'gray',
                    })
                    ->tooltip(fn (KbSource $record) => $record->translation_error)
                    ->placeholder('—'),
                Tables\Columns\TextColumn::make('indexed_at')
                    ->dateTime()
                    ->sortable(),
            ])
            ->defaultSort('id', 'desc')
            // Refresh while background indexing is still running.
            ->poll(fn () => KbSource::query()
                ->where('status', KbSource::STATUS_PENDING)
                ->orWhere('translation_status', 'pending')
                ->exists() ? '5s' : null)
            ->actions([
                Actions\Action::make('index')
                    ->label('Index')
                    ->icon('heroicon-o-arrow-path')
                    ->action(fn (KbSource $record) => static::runIndex($record)),
                Actions\EditAction::make()
                    ->after(fn (KbSource $record) => static::runIndex($record)),
                Actions\DeleteAction::make(),
            ])
            ->bulkActions([
                Actions\BulkAction::make('indexSelected')
                    ->label('Index selected')
                    ->icon('heroicon-o-arrow-path')
                    ->action(fn (Collection $records) => static::runIndexMany($records))
                    ->deselectRecordsAfterCompletion(),
                Actions\BulkAction::make('translateSelected')
                    ->label('Translate to Armenian')
                    ->icon('heroicon-o-language')
                    ->visible(fn () => app(TranslatorClient::class)->enabled())
                    ->action(function (Collection $records) {
                        foreach ($records->where('status', KbSource::STATUS_INDEXED) as $record) {
                            $record->forceFill(['translation_status' => 'pending', 'translation_error' => null])->save();
                            TranslateKbSource::dispatch($record->id, fresh: true);
                        }
                        Notification::make()->title('Translation started in the background')->success()->send();
                    })
                    ->deselectRecordsAfterCompletion(),
                Actions\DeleteBulkAction::make(),
            ]);
    }

    /**
     * Indexing runs right away (no queue worker yet); one page or file takes seconds.
     */
    public static function runIndex(KbSource $record): void
    {
        set_time_limit(600);
        $record = app(KnowledgeBase::class)->index($record);

        if ($record->status === KbSource::STATUS_INDEXED) {
            Notification::make()
                ->title('Indexed: '.$record->chunks_count.' chunks')
                ->success()
                ->send();
        } else {
            Notification::make()
                ->title('Indexing failed')
                ->body($record->error)
                ->danger()
                ->persistent()
                ->send();
        }
    }

    // Synchronous indexing stops before PHP / nginx time limits are reached.
    private const SYNC_TIME_BUDGET_SECONDS = 240;

    /**
     * Indexes the selected sources in this request (no queue worker needed).
     *
     * @param  Collection<int, KbSource>  $records
     */
    public static function runIndexMany(Collection $records): void
    {
        set_time_limit(self::SYNC_TIME_BUDGET_SECONDS + 60);
        $started = time();
        $indexed = 0;
        $failed = 0;
        $skipped = 0;

        foreach ($records as $record) {
            if (time() - $started >= self::SYNC_TIME_BUDGET_SECONDS) {
                $skipped++;
                continue;
            }
            $record = app(KnowledgeBase::class)->index($record);
            $record->status === KbSource::STATUS_INDEXED ? $indexed++ : $failed++;
        }

        Notification::make()
            ->title($indexed.' indexed'.($failed ? ', '.$failed.' failed' : '').($skipped ? ', '.$skipped.' left — run again' : ''))
            ->{$failed ? 'warning' : 'success'}()
            ->send();
    }

    public static function getPages(): array
    {
        return [
            'index' => Pages\ManageKbSources::route('/'),
        ];
    }
}
