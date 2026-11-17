<?php

namespace App\Filament\Resources\SupportTicketResource\Pages;

use App\Filament\Resources\SupportTicketResource;
use Filament\Resources\Pages\ManageRecords;

// Tickets come from the form on flexit.am, so there is no "create" here.
class ManageSupportTickets extends ManageRecords
{
    protected static string $resource = SupportTicketResource::class;
}
