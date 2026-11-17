<?php

namespace App\Filament\Resources\SupportCustomerResource\Pages;

use App\Filament\Resources\SupportCustomerResource;
use App\Services\Support\FluentImport;
use Filament\Actions;
use Filament\Forms;
use Filament\Notifications\Notification;
use Filament\Resources\Pages\ManageRecords;
use Illuminate\Support\Facades\Storage;
use Throwable;

class ManageSupportCustomers extends ManageRecords
{
    protected static string $resource = SupportCustomerResource::class;

    protected function getHeaderActions(): array
    {
        return [
            Actions\CreateAction::make(),
            Actions\Action::make('importFluent')
                ->label('Import from Fluent Support')
                ->icon('heroicon-o-arrow-down-tray')
                ->modalDescription('The JSON exported from flexit.am (customers, tickets, replies) and, to keep the customers\' passwords, wp_users exported from phpMyAdmin as CSV (with user_email and user_pass columns). Running it again updates instead of doubling.')
                ->schema([
                    Forms\Components\FileUpload::make('export')
                        ->label('Fluent Support export (.json)')
                        ->disk('local')
                        ->directory('imports')
                        ->acceptedFileTypes(['application/json', 'text/plain'])
                        ->maxSize(51200)
                        ->required(),
                    Forms\Components\FileUpload::make('users')
                        ->label('wp_users (.csv), optional')
                        ->disk('local')
                        ->directory('imports')
                        ->acceptedFileTypes(['text/csv', 'text/plain', 'application/vnd.ms-excel'])
                        ->maxSize(10240),
                ])
                ->action(function (array $data) {
                    $disk = Storage::disk('local');
                    try {
                        $export = json_decode($disk->get($data['export']), true, 512, JSON_THROW_ON_ERROR);
                        $passwords = filled($data['users'] ?? null) ? FluentImport::passwordsFromCsv($disk->get($data['users'])) : [];
                        $counts = app(FluentImport::class)->run($export, $passwords);
                        Notification::make()
                            ->title("Imported: {$counts['customers']} customers, {$counts['tickets']} tickets, {$counts['responses']} replies, {$counts['passwords']} passwords")
                            ->success()
                            ->persistent()
                            ->send();
                    } catch (Throwable $e) {
                        Notification::make()->title('Import failed')->body($e->getMessage())->danger()->persistent()->send();
                    } finally {
                        // The files hold password hashes: not kept after the import.
                        $disk->delete(array_filter([$data['export'] ?? null, $data['users'] ?? null]));
                    }
                }),
        ];
    }
}
