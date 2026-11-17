<?php

use App\Models\SupportTicket;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\Facades\Storage;

Route::get('/', function () {
    return view('welcome');
});

// Pictures attached to a support ticket, for people signed in to the admin panel.
Route::get('/support-files/{ticket}/{index}', function (SupportTicket $ticket, int $index) {
    abort_unless(auth()->check(), 403);
    $path = ($ticket->attachments ?? [])[$index] ?? null;
    abort_unless($path && Storage::disk('local')->exists($path), 404);

    return Storage::disk('local')->response($path);
})->whereNumber('index')->name('support-files');
