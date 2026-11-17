<?php

namespace App\Filament\Resources;

use App\Filament\Resources\SupportTicketResource\Pages;
use App\Models\SupportTicket;
use App\Services\Support\SupportTelegram;
use BackedEnum;
use Filament\Actions;
use Filament\Forms;
use Filament\Resources\Resource;
use Filament\Schemas\Schema;
use Filament\Tables;
use Filament\Tables\Table;
use Illuminate\Support\HtmlString;
use Throwable;

class SupportTicketResource extends Resource
{
    protected static ?string $model = SupportTicket::class;

    protected static string|BackedEnum|null $navigationIcon = 'heroicon-o-lifebuoy';

    protected static ?string $navigationLabel = 'Հայտեր (Support)';

    protected static ?string $modelLabel = 'ticket';

    public static function form(Schema $schema): Schema
    {
        return $schema->schema([
            Forms\Components\Placeholder::make('request')
                ->label('Հայտ')
                ->columnSpanFull()
                ->content(fn (?SupportTicket $record) => $record ? new HtmlString(
                    '<b>'.e($record->name).'</b>'.($record->company ? ' · '.e($record->company) : '')
                    .' · '.e($record->phone).($record->tin ? ' · ՀՎՀՀ '.e($record->tin) : '')
                    .'<br>'.e($record->product).($record->urgent ? ' · <b style="color:#dc2626">ՇՏԱՊ</b>' : '')
                    .'<br><br>'.nl2br(e($record->description))
                    .static::attachmentLinks($record)
                ) : ''),
            Forms\Components\Select::make('status')
                ->options(SupportTicket::STATUS_LABELS)
                ->required(),
            Forms\Components\TextInput::make('assignee')
                ->label('Պատասխանատու')
                ->maxLength(255),
            Forms\Components\TextInput::make('price')
                ->label('Գին (֏)')
                ->numeric()
                ->minValue(0),
            Forms\Components\Textarea::make('notes')
                ->label('Նշումներ')
                ->rows(3)
                ->columnSpanFull(),
        ]);
    }

    public static function table(Table $table): Table
    {
        return $table
            ->columns([
                Tables\Columns\TextColumn::make('id')->label('№')->sortable()->searchable(),
                Tables\Columns\TextColumn::make('created_at')->label('Ստացվել է')->dateTime('d.m.Y H:i')->sortable(),
                Tables\Columns\TextColumn::make('name')
                    ->label('Ով')
                    ->searchable()
                    ->description(fn (SupportTicket $record) => trim($record->phone.' · '.$record->company, ' ·')),
                Tables\Columns\TextColumn::make('product')->label('1C')->toggleable(),
                Tables\Columns\TextColumn::make('description')->label('Խնդիր')->limit(60)->searchable()->wrap(),
                Tables\Columns\IconColumn::make('urgent')->label('Շտապ')->boolean(),
                Tables\Columns\TextColumn::make('status')
                    ->badge()
                    ->formatStateUsing(fn (string $state) => SupportTicket::STATUS_LABELS[$state] ?? $state)
                    ->color(fn (string $state) => match ($state) {
                        SupportTicket::STATUS_NEW => 'danger',
                        SupportTicket::STATUS_IN_PROGRESS => 'warning',
                        SupportTicket::STATUS_SOLVED => 'success',
                        default => 'gray',
                    }),
                Tables\Columns\TextColumn::make('assignee')->label('Պատասխանատու')->placeholder('—'),
            ])
            ->defaultSort('id', 'desc')
            ->filters([
                Tables\Filters\SelectFilter::make('status')->options(SupportTicket::STATUS_LABELS),
            ])
            ->poll('30s')
            ->actions([
                Actions\EditAction::make()
                    ->after(function (SupportTicket $record) {
                        // Keeps the Telegram message in step with the admin panel.
                        try {
                            app(SupportTelegram::class)->refresh($record);
                        } catch (Throwable $e) {
                            report($e);
                        }
                    }),
            ]);
    }

    private static function attachmentLinks(SupportTicket $record): string
    {
        $links = [];
        foreach ($record->attachments ?? [] as $i => $path) {
            $links[] = '<a href="'.e(route('support-files', [$record->id, $i])).'" target="_blank" style="text-decoration:underline">Նկար '.($i + 1).'</a>';
        }

        return $links ? '<br><br>📎 '.implode(' · ', $links) : '';
    }

    public static function getPages(): array
    {
        return [
            'index' => Pages\ManageSupportTickets::route('/'),
        ];
    }
}
