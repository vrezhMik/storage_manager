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
use Filament\Support\Icons\Heroicon;
use UnitEnum;

class DbEntryResource extends Resource
{
    protected static ?string $model = DbEntry::class;

    protected static string|BackedEnum|null $navigationIcon = Heroicon::ServerStack;

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
