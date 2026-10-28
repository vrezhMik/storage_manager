<?php

namespace App\Filament\Resources;

use App\Filament\Resources\UserResource\Pages;
use App\Models\User;
use Filament\Actions;
use Filament\Forms;
use Filament\Resources\Resource;
use Filament\Schemas\Components\Section;
use Filament\Schemas\Schema;
use Filament\Tables;
use Filament\Tables\Table;
use Illuminate\Support\Facades\Hash;
use BackedEnum;
use UnitEnum;

class UserResource extends Resource
{
    protected static ?string $model = User::class;

    protected static string|BackedEnum|null $navigationIcon = 'heroicon-o-users';

    protected static string|UnitEnum|null $navigationGroup = 'Admin';

    public static function form(Schema $schema): Schema
    {
        return $schema->schema([
            Forms\Components\TextInput::make('name')
                ->label('Name')
                ->required()
                ->maxLength(255),
            Forms\Components\TextInput::make('email')
                ->label('Email')
                ->email()
                ->required()
                ->unique(ignoreRecord: true),
            Forms\Components\TextInput::make('password')
                ->label('Password')
                ->password()
                ->revealable()
                ->required(fn (string $context) => $context === 'create')
                ->dehydrateStateUsing(fn ($state) => filled($state) ? Hash::make($state) : null)
                ->dehydrated(fn ($state) => filled($state))
                ->maxLength(255),
            Forms\Components\Toggle::make('allow_manual_items')
                ->label('Allow manual item input')
                ->default(true)
                ->helperText('If disabled, users can only use camera/device scanning'),
            Forms\Components\Toggle::make('allow_manual_text_input')
                ->label('Allow manual text input')
                ->default(true)
                ->helperText('Controls whether the barcode input field is shown'),
            Section::make('Terminal sections')
                ->description('Sections this user can see in the terminal')
                ->columns(2)
                ->schema([
                    Forms\Components\Checkbox::make('can_documents_in')
                        ->label('Մուտքեր (Incoming)')
                        ->default(true),
                    Forms\Components\Checkbox::make('can_documents_out')
                        ->label('Ելքեր (Outgoing)')
                        ->default(true),
                    Forms\Components\Checkbox::make('can_reports')
                        ->label('Հաշվետվություններ (Reports)')
                        ->default(true),
                    Forms\Components\Checkbox::make('can_price_check')
                        ->label('Գնի հարցում (Price check)')
                        ->default(true),
                    Forms\Components\Checkbox::make('can_dashboard')
                        ->label('Flexit Դաշբորդ (Dashboard)')
                        ->default(false),
                    Forms\Components\Checkbox::make('can_assistant')
                        ->label('Flexik օգնական (Assistant)')
                        ->default(false),
                ]),
            Forms\Components\Select::make('db_entry_id')
                ->label('DB Config')
                ->relationship('dbEntry', 'name')
                ->searchable()
                ->preload()
                ->native(false)
                ->helperText('Assign which remote DB/API config this user will use')
                ->nullable(),
        ]);
    }

    public static function table(Table $table): Table
    {
        return $table
                ->columns([
                    Tables\Columns\TextColumn::make('name')
                        ->sortable()
                        ->searchable(),
                    Tables\Columns\TextColumn::make('email')
                        ->sortable()
                        ->searchable(),
                    Tables\Columns\TextColumn::make('dbEntry.name')
                        ->label('DB Config')
                        ->sortable()
                        ->default('-'),
                    Tables\Columns\IconColumn::make('allow_manual_items')
                        ->boolean()
                        ->label('Manual input'),
                    Tables\Columns\IconColumn::make('allow_manual_text_input')
                        ->boolean()
                        ->label('Text input'),
                    Tables\Columns\TextColumn::make('visible_sections')
                        ->label('Sections')
                        ->state(fn (User $record) => collect([
                            'can_documents_in' => 'Մուտքեր',
                            'can_documents_out' => 'Ելքեր',
                            'can_reports' => 'Հաշվետվություններ',
                            'can_price_check' => 'Գնի հարցում',
                            'can_dashboard' => 'Flexit Դաշբորդ',
                            'can_assistant' => 'Flexik օգնական',
                        ])->filter(fn ($label, $column) => (bool) $record->{$column})->values()->all())
                        ->badge()
                        ->placeholder('—'),
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
            'index' => Pages\ManageUsers::route('/'),
        ];
    }
}
