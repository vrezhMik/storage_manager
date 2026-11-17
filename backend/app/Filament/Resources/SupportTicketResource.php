<?php

namespace App\Filament\Resources;

use App\Filament\Resources\SupportTicketResource\Pages;
use App\Jobs\MailSupportReply;
use App\Models\SupportResponse;
use App\Models\SupportTicket;
use App\Services\Support\SupportTelegram;
use BackedEnum;
use Filament\Actions;
use Filament\Forms;
use Filament\Notifications\Notification;
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
                    ($record->title ? '<b style="font-size:1.1em">'.e($record->title).'</b><br>' : '')
                    .'<b>'.e($record->name).'</b>'.($record->company ? ' · '.e($record->company) : '')
                    .' · '.e($record->phone).($record->customer?->email ? ' · '.e($record->customer->email) : '')
                    .($record->tin ? ' · ՀՎՀՀ '.e($record->tin) : '')
                    .($record->customer?->contract ? ' · ⭐ պայմանագրային' : '')
                    .'<br>'.e($record->product).($record->urgent || $record->priority === 'critical' ? ' · <b style="color:#dc2626">ՇՏԱՊ</b>' : '')
                    .'<br><br>'.nl2br(e($record->description))
                    .static::attachmentLinks($record)
                    .static::conversation($record)
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
                Tables\Columns\TextColumn::make('title')->label('Թեմա')->limit(40)->searchable()->placeholder('—'),
                Tables\Columns\TextColumn::make('product')->label('1C')->toggleable(isToggledHiddenByDefault: true),
                Tables\Columns\IconColumn::make('customer.contract')->label('⭐')->boolean()->tooltip('Պայմանագրային հաճախորդ'),
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
                Actions\Action::make('reply')
                    ->label('Պատասխանել')
                    ->icon('heroicon-o-chat-bubble-left-right')
                    ->modalHeading(fn (SupportTicket $record) => 'Հայտ №'.$record->id.($record->title ? ' · '.$record->title : ''))
                    ->modalDescription(fn (SupportTicket $record) => new HtmlString(nl2br(e(mb_strimwidth($record->description, 0, 600, '…'))).static::conversation($record)))
                    ->schema([
                        Forms\Components\Textarea::make('body')->label('Պատասխան')->rows(5)->required(),
                        Forms\Components\FileUpload::make('files')
                            ->label('Նկարներ')
                            ->disk('local')
                            ->directory('support/staff')
                            ->image()
                            ->multiple()
                            ->maxFiles(3)
                            ->maxSize(5120),
                        Forms\Components\Checkbox::make('solve')->label('Նշել լուծված'),
                    ])
                    ->action(fn (SupportTicket $record, array $data) => static::reply($record, $data)),
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
            $url = is_array($path) ? $path['url'] : route('support-files', [$record->id, $i]);
            $links[] = '<a href="'.e($url).'" target="_blank" style="text-decoration:underline">Նկար '.($i + 1).'</a>';
        }

        return $links ? '<br><br>📎 '.implode(' · ', $links) : '';
    }

    // The ticket's conversation, oldest first, for the edit form.
    private static function conversation(SupportTicket $record): string
    {
        $html = '';
        foreach ($record->responses as $r) {
            $staff = $r->author === SupportResponse::AUTHOR_STAFF;
            $files = array_map(fn ($f) => '<a href="'.e($f['url']).'" target="_blank" style="text-decoration:underline">'.e($f['name']).'</a>',
                SupportTicket::fileLinks($r->attachments, 'response', $r->id));
            $html .= '<div style="margin-top:10px;padding:10px 12px;border-radius:10px;background:'.($staff ? '#e8f8ee' : '#f3f4f6').'">'
                .'<b>'.e($staff ? ($r->author_name ?: 'Flexit') : ($r->author_name ?: 'Հաճախորդ')).'</b>'
                .' <span style="opacity:.6">'.$r->created_at?->timezone('Asia/Yerevan')->format('d.m.Y H:i').'</span><br>'
                .nl2br(e($r->body)).($files ? '<br>📎 '.implode(' · ', $files) : '').'</div>';
        }

        return $html ? '<br><br><b>Նամակագրություն</b>'.$html : '';
    }

    // A team reply: shown to the customer in the portal and emailed to them.
    public static function reply(SupportTicket $record, array $data): void
    {
        $user = auth()->user();
        $response = SupportResponse::create([
            'support_ticket_id' => $record->id,
            'author' => SupportResponse::AUTHOR_STAFF,
            'author_name' => $user?->name ?: 'Flexit',
            'user_id' => $user?->id,
            'body' => trim($data['body']),
            'attachments' => array_values(array_filter((array) ($data['files'] ?? []))) ?: null,
        ]);

        if ($record->status === SupportTicket::STATUS_NEW) {
            $record->fill(['status' => SupportTicket::STATUS_IN_PROGRESS, 'assignee' => $record->assignee ?: $response->author_name, 'taken_at' => now()]);
        }
        if (! empty($data['solve'])) {
            $record->fill(['status' => SupportTicket::STATUS_SOLVED, 'solved_at' => now()]);
        }
        $record->touch();
        $record->save();

        if ($record->support_customer_id) {
            MailSupportReply::dispatch($response->id);
        }
        try {
            app(SupportTelegram::class)->refresh($record);
        } catch (Throwable $e) {
            report($e);
        }
        Notification::make()->title($record->support_customer_id ? 'Պատասխանն ուղարկված է հաճախորդին' : 'Պատասխանը պահված է (հաճախորդը պորտալում չէ)')->success()->send();
    }

    public static function getPages(): array
    {
        return [
            'index' => Pages\ManageSupportTickets::route('/'),
        ];
    }
}
