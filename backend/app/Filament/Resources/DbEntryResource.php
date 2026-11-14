<?php

namespace App\Filament\Resources;

use App\Filament\Resources\DbEntryResource\Pages;
use App\Models\DbEntry;
use App\Models\EhdmReceipt;
use App\Services\Ehdm\EhdmClient;
use App\Services\Ehdm\EhdmException;
use App\Services\Ehdm\EhdmMock;
use BackedEnum;
use Filament\Actions;
use Filament\Forms;
use Filament\Notifications\Notification;
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
            Forms\Components\TextInput::make('api_retail_plan')
                ->label('API: Retail Plan')
                ->helperText('Date is filled in as DD.MM.YYYY, e.g. http://host:port/terminal/hs/Eportal/RetailPlan?Date=')
                ->maxLength(255),
            Forms\Components\TextInput::make('api_retail_suppliers')
                ->label('API: Retail Suppliers')
                ->helperText('Date (DD.MM.YYYY), Days and the user\'s Store are filled in, e.g. http://host:port/terminal/hs/Eportal/RetailSuppliers?Date=')
                ->maxLength(255),
            Forms\Components\TextInput::make('catalog_url')
                ->label('Catalog site (WooCommerce)')
                ->helperText('The company\'s shop site, e.g. https://shinmall.am. Groups, names, prices and pictures for the Sales product picker come from it; each product\'s SKU must be its 1C code.')
                ->url()
                ->maxLength(255),
            Forms\Components\TextInput::make('api_stock')
                ->label('API: Stock by codes')
                ->helperText('Codes (comma separated 1C codes) is added, e.g. http://host:port/terminal/hs/Eportal/Stock. Answer: [{"Code","Stock","Unit","ClassifierCode"}].')
                ->maxLength(255),
            Forms\Components\Textarea::make('allowed_ips')
                ->label('Allowed IPs (company network)')
                ->helperText('The company\'s public IPs, one per line (ranges like 203.0.113.0/24 work). For users marked "Միայն կազմակերպության ցանցից". Empty = those users are refused.')
                ->regex('/^[\da-fA-F.:\/\s,;]*$/')
                ->rows(3),
            Forms\Components\TextInput::make('einvoice_tin')
                ->label('E-invoicing: ՀՎՀՀ (TIN)')
                ->helperText('The company\'s 8-digit TIN in e-invoicing.taxservice.am')
                ->regex('/^\d{8}$/')
                ->maxLength(8),
            Forms\Components\TextInput::make('einvoice_login')
                ->label('E-invoicing: login')
                ->maxLength(255),
            Forms\Components\TextInput::make('einvoice_password')
                ->label('E-invoicing: password')
                ->password()
                ->helperText('Stored encrypted. Leave empty to keep the current password.')
                ->dehydrated(fn ($state) => filled($state))
                ->maxLength(255),
            Forms\Components\Select::make('ehdm_mode')
                ->label('e-ՀԴՄ: mode')
                ->options([
                    'off' => 'Off',
                    'mock' => 'Mock (simulated, nothing is sent to the tax service)',
                    'test' => 'Test (tax service test system)',
                    'live' => 'Live (real receipts)',
                ])
                ->default('off')
                ->required()
                ->helperText('The tax service accepts e-ՀԴՄ requests only from the IP given in the u6 application, with its certificate.'),
            Forms\Components\TextInput::make('ehdm_crn')
                ->label('e-ՀԴՄ: register number (CRN)')
                ->helperText('«ՀԴՄ գրանցման համար» on file-online → ՀԴՄ-ների ցանկ')
                ->maxLength(32),
            Forms\Components\TextInput::make('ehdm_dep')
                ->label('e-ՀԴՄ: department (բաժին)')
                ->helperText('Department number used on receipts (created with «e-ՀԴՄ: departments»).')
                ->numeric()
                ->minValue(1)
                ->default(1),
            Forms\Components\Textarea::make('ehdm_cert')
                ->label('e-ՀԴՄ: certificate and key (PEM)')
                ->helperText('From the .jks: keytool -importkeystore -srckeystore zzz.jks -destkeystore zzz.p12 -deststoretype PKCS12, then openssl pkcs12 -in zzz.p12 -nodes -out zzz.pem; paste zzz.pem. Stored encrypted. Leave empty to keep the current one.')
                ->rows(4)
                ->dehydrated(fn ($state) => filled($state)),
            Forms\Components\TextInput::make('ehdm_cert_password')
                ->label('e-ՀԴՄ: key password')
                ->password()
                ->helperText('Only if the PEM key is encrypted. Stored encrypted.')
                ->dehydrated(fn ($state) => filled($state))
                ->maxLength(255),
        ]);
    }

    /**
     * Runs one e-ՀԴՄ setup call and shows the answer.
     */
    private static function ehdmAction(string $name, string $label, callable $run): Actions\Action
    {
        return Actions\Action::make($name)
            ->label($label)
            ->icon('heroicon-o-receipt-percent')
            ->visible(fn (DbEntry $record) => $record->hasEhdm())
            ->requiresConfirmation()
            ->action(function (DbEntry $record) use ($run): void {
                try {
                    $answer = $run(EhdmClient::for($record), $record);
                    Notification::make()->title($label)->body((string) $answer)->success()->send();
                } catch (EhdmException $e) {
                    Notification::make()->title($label)->body($e->getMessage())->danger()->persistent()->send();
                }
            });
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
                Tables\Columns\TextColumn::make('api_retail_plan')
                    ->label('Retail Plan API')
                    ->limit(50)
                    ->tooltip(fn ($state) => $state),
                Tables\Columns\TextColumn::make('api_retail_suppliers')
                    ->label('Retail Suppliers API')
                    ->limit(50)
                    ->tooltip(fn ($state) => $state),
                Tables\Columns\TextColumn::make('created_at')
                    ->dateTime()
                    ->sortable(),
            ])
            ->actions([
                Actions\EditAction::make(),
                Actions\ActionGroup::make([
                    self::ehdmAction('ehdmCheck', 'e-ՀԴՄ: check connection', fn (EhdmClient $c) => $c->checkConnection()),
                    self::ehdmAction('ehdmActivate', 'e-ՀԴՄ: activate', fn (EhdmClient $c) => $c->activate()),
                    self::ehdmAction('ehdmDepartments', 'e-ՀԴՄ: departments', fn (EhdmClient $c, DbEntry $r) => $c->configureDepartments([(int) $r->ehdm_dep => 1]))
                        ->modalDescription(fn (DbEntry $record) => 'Sends department '.$record->ehdm_dep.' with tax regime 1 (ԱԱՀ-ով հարկվող) to the tax service.'),
                    Actions\Action::make('ehdmMockReset')
                        ->label('e-ՀԴՄ: clear mock receipts')
                        ->icon('heroicon-o-trash')
                        ->visible(fn (DbEntry $record) => $record->ehdm_mode === 'mock')
                        ->requiresConfirmation()
                        ->action(function (DbEntry $record): void {
                            EhdmMock::forget($record);
                            EhdmReceipt::query()->where('db_entry_id', $record->id)->where('mode', 'mock')->delete();
                            Notification::make()->title('Mock receipts cleared')->success()->send();
                        }),
                ])->label('e-ՀԴՄ')->icon('heroicon-o-receipt-percent'),
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
