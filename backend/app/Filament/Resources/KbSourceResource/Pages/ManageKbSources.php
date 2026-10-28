<?php

namespace App\Filament\Resources\KbSourceResource\Pages;

use App\Filament\Resources\KbSourceResource;
use App\Models\KbSource;
use Filament\Actions;
use Filament\Resources\Pages\ManageRecords;

class ManageKbSources extends ManageRecords
{
    protected static string $resource = KbSourceResource::class;

    protected function getHeaderActions(): array
    {
        return [
            Actions\CreateAction::make()
                ->label('Add source')
                ->after(fn (KbSource $record) => KbSourceResource::runIndex($record)),
        ];
    }
}
