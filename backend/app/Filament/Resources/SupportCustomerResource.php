<?php

namespace App\Filament\Resources;

use App\Filament\Resources\SupportCustomerResource\Pages;
use App\Models\SupportCustomer;
use BackedEnum;
use Filament\Actions;
use Filament\Forms;
use Filament\Resources\Resource;
use Filament\Schemas\Schema;
use Filament\Tables;
use Filament\Tables\Table;

class SupportCustomerResource extends Resource
{
    protected static ?string $model = SupportCustomer::class;

    protected static string|BackedEnum|null $navigationIcon = 'heroicon-o-user-group';

    protected static ?string $navigationLabel = 'Պորտալի հաճախորդներ';

    protected static ?string $modelLabel = 'customer';

    public static function form(Schema $schema): Schema
    {
        return $schema->schema([
            Forms\Components\TextInput::make('first_name')->label('Անուն')->required()->maxLength(120),
            Forms\Components\TextInput::make('last_name')->label('Ազգանուն')->maxLength(120),
            Forms\Components\TextInput::make('email')->email()->required()->maxLength(190)->unique(ignoreRecord: true),
            Forms\Components\TextInput::make('phone')->label('Հեռախոս')->tel()->maxLength(32),
            Forms\Components\TextInput::make('company')->label('Ընկերություն')->maxLength(160),
            Forms\Components\TextInput::make('tin')->label('ՀՎՀՀ')->regex('/^\d{8}$/')->maxLength(8),
            Forms\Components\Toggle::make('contract')->label('Սպասարկման պայմանագիր')->helperText('Հայտերը Telegram-ում նշվում են ⭐-ով'),
            Forms\Components\Toggle::make('active')->label('Կարող է մուտք գործել')->default(true),
            Forms\Components\TextInput::make('password')
                ->label('Նոր գաղտնաբառ')
                ->password()
                ->revealable()
                ->minLength(8)
                ->helperText('Դատարկ՝ մնում է նախկինը')
                ->dehydrated(fn ($state) => filled($state)),
        ]);
    }

    public static function table(Table $table): Table
    {
        return $table
            ->columns([
                Tables\Columns\TextColumn::make('first_name')
                    ->label('Անուն')
                    ->formatStateUsing(fn (SupportCustomer $record) => $record->fullName())
                    ->searchable(['first_name', 'last_name'])
                    ->description(fn (SupportCustomer $record) => $record->email),
                Tables\Columns\TextColumn::make('company')->label('Ընկերություն')->searchable()->placeholder('—'),
                Tables\Columns\TextColumn::make('phone')->label('Հեռախոս')->placeholder('—'),
                Tables\Columns\IconColumn::make('contract')->label('Պայմանագիր')->boolean(),
                Tables\Columns\TextColumn::make('tickets_count')->label('Հայտեր')->counts('tickets'),
                Tables\Columns\IconColumn::make('legacy_password')
                    ->label('Հին գաղտնաբառ')
                    ->tooltip('Fluent Support-ի գաղտնաբառը, դեռ չի մտել նոր պորտալ')
                    ->boolean()
                    ->getStateUsing(fn (SupportCustomer $record) => filled($record->legacy_password)),
                Tables\Columns\TextColumn::make('last_login_at')->label('Վերջին մուտք')->dateTime('d.m.Y H:i')->placeholder('—'),
            ])
            ->defaultSort('id', 'desc')
            ->actions([Actions\EditAction::make()]);
    }

    public static function getPages(): array
    {
        return [
            'index' => Pages\ManageSupportCustomers::route('/'),
        ];
    }
}
