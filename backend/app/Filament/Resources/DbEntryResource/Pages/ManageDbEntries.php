<?php

namespace App\Filament\Resources\DbEntryResource\Pages;

use App\Filament\Resources\DbEntryResource;
use Filament\Actions;
use Filament\Resources\Pages\ManageRecords;

class ManageDbEntries extends ManageRecords
{
    protected static string $resource = DbEntryResource::class;

    protected function getHeaderActions(): array
    {
        return [
            Actions\CreateAction::make(),
        ];
    }
}
