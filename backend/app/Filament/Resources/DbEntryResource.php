<?php

namespace App\Filament\Resources;

use App\Filament\Resources\DbEntryResource\Pages;
use App\Models\DbEntry;
use BackedEnum;
use Filament\Actions;
use Filament\Forms;
use Filament\Resources\Resource;
use Filament\Schemas\Schema;
use Filament\Tables;
use Filament\Tables\Table;
use UnitEnum;

class DbEntryResource extends Resource
{
    protected static ?string $model = DbEntry::class;

    protected static string|BackedEnum|null $navigationIcon = 'heroicon-o-server-stack';

    protected static string|UnitEnum|null $navigationGroup = 'DBs';

    protected static ?string $recordTitleAttribute = 'name';

    public static function form(Schema $schema): Schema
    {
        return $schema->schema([
            Forms\Components\TextInput::make('name')
                ->label('Name')
                ->required()
                ->maxLength(255),
            Forms\Components\TextInput::make('username')
                ->label('Username')
                ->required()
                ->maxLength(255),
            Forms\Components\TextInput::make('password')
                ->label('Password')
                ->password()
                ->revealable()
                ->required()
                ->maxLength(255),
            Forms\Components\TextInput::make('api_get_purchase')
                ->label('API: Get Purchase')
                ->required()
                ->maxLength(255),
            Forms\Components\TextInput::make('api_get_orders')
                ->label('API: Get Orders')
                ->required()
                ->maxLength(255),
            Forms\Components\TextInput::make('api_post_orders')
                ->label('API: Post Orders')
                ->required()
                ->maxLength(255),
            Forms\Components\TextInput::make('api_post_purchases')
                ->label('API: Post Purchases')
                ->required()
                ->maxLength(255),
            Forms\Components\TextInput::make('api_price_check')
                ->label('API: Price Check')
                ->helperText('The barcode is appended to the end, e.g. http://host:port/terminal/hs/Eportal/GET_ORDER?Barcode=')
                ->maxLength(255),
            Forms\Components\TextInput::make('api_sales')
                ->label('API: Sales')
                ->helperText('Datestart and Date are filled in as DD.MM.YYYY, e.g. http://host:port/terminal/hs/Eportal/Sales?Datestart=&Date=')
                ->maxLength(255),
            Forms\Components\TextInput::make('api_sales_by_warehouse')
                ->label('API: Sales by Warehouse')
                ->helperText('Same as Sales: Datestart and Date are filled in as DD.MM.YYYY. Rows must include Склад.')
                ->maxLength(255),
            Forms\Components\TextInput::make('api_debts')
                ->label('API: Debts')
                ->helperText('Datestart and Date are filled in as DD.MM.YYYY, e.g. http://host:port/terminal/hs/Eportal/Debts?Datestart=&Date=')
                ->maxLength(255),
            Forms\Components\TextInput::make('api_dashboard')
                ->label('API: Dashboard')
                ->helperText('Date is filled in as DD.MM.YYYY, e.g. http://host:port/terminal/hs/Eportal/Dashboard?Date=')
                ->maxLength(255),
            Forms\Components\TextInput::make('api_frozen_stock')
                ->label('API: Frozen Stock')
                ->helperText('Date (DD.MM.YYYY) and Days are filled in, e.g. http://host:port/terminal/hs/Eportal/FrozenStock?Date=&Days=')
                ->maxLength(255),
            Forms\Components\TextInput::make('api_abc')
                ->label('API: Top Items (ABC)')
                ->helperText('Datestart and Date are filled in as DD.MM.YYYY, e.g. http://host:port/terminal/hs/Eportal/ABC?Datestart=&Date=')
                ->maxLength(255),
            Forms\Components\TextInput::make('api_overdue_debts')
                ->label('API: Overdue Debts')
                ->helperText('Date is filled in as DD.MM.YYYY, e.g. http://host:port/terminal/hs/Eportal/OverdueDebts?Date=')
                ->maxLength(255),
            Forms\Components\TextInput::make('api_sales_monthly')
                ->label('API: Sales by Month')
                ->helperText('Datestart and Date are filled in as DD.MM.YYYY, e.g. http://host:port/terminal/hs/Eportal/SalesMonthly?Datestart=&Date=')
                ->maxLength(255),
        ]);
    }

    public static function table(Table $table): Table
    {
        return $table
            ->columns([
                Tables\Columns\TextColumn::make('name')
                    ->sortable()
                    ->searchable(),
                Tables\Columns\TextColumn::make('username')
                    ->sortable()
                    ->searchable(),
                Tables\Columns\TextColumn::make('api_get_purchase')
                    ->label('Get Purchase API')
                    ->limit(50)
                    ->tooltip(fn ($state) => $state),
                Tables\Columns\TextColumn::make('api_get_orders')
                    ->label('Get Orders API')
                    ->limit(50)
                    ->tooltip(fn ($state) => $state),
                Tables\Columns\TextColumn::make('api_post_orders')
                    ->label('Post Orders API')
                    ->limit(50)
                    ->tooltip(fn ($state) => $state),
                Tables\Columns\TextColumn::make('api_post_purchases')
                    ->label('Post Purchases API')
                    ->limit(50)
                    ->tooltip(fn ($state) => $state),
                Tables\Columns\TextColumn::make('api_price_check')
                    ->label('Price Check API')
                    ->limit(50)
                    ->tooltip(fn ($state) => $state),
                Tables\Columns\TextColumn::make('api_sales')
                    ->label('Sales API')
                    ->limit(50)
                    ->tooltip(fn ($state) => $state),
                Tables\Columns\TextColumn::make('api_sales_by_warehouse')
                    ->label('Sales by Warehouse API')
                    ->limit(50)
                    ->tooltip(fn ($state) => $state),
                Tables\Columns\TextColumn::make('api_debts')
                    ->label('Debts API')
                    ->limit(50)
                    ->tooltip(fn ($state) => $state),
                Tables\Columns\TextColumn::make('api_dashboard')
                    ->label('Dashboard API')
                    ->limit(50)
                    ->tooltip(fn ($state) => $state),
                Tables\Columns\TextColumn::make('api_frozen_stock')
                    ->label('Frozen Stock API')
                    ->limit(50)
                    ->tooltip(fn ($state) => $state),
                Tables\Columns\TextColumn::make('api_abc')
                    ->label('ABC API')
                    ->limit(50)
                    ->tooltip(fn ($state) => $state),
                Tables\Columns\TextColumn::make('api_overdue_debts')
                    ->label('Overdue Debts API')
                    ->limit(50)
                    ->tooltip(fn ($state) => $state),
                Tables\Columns\TextColumn::make('api_sales_monthly')
                    ->label('Sales by Month API')
                    ->limit(50)
                    ->tooltip(fn ($state) => $state),
                Tables\Columns\TextColumn::make('created_at')
                    ->dateTime()
                    ->sortable(),
            ])
            ->actions([
                Actions\EditAction::make(),
            ])
            ->bulkActions([
                Actions\DeleteBulkAction::make(),
            ]);
    }

    public static function getPages(): array
    {
        return [
            'index' => Pages\ManageDbEntries::route('/'),
        ];
    }
}
