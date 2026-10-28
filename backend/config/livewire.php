<?php

// Only the keys we change; everything else keeps Livewire's defaults.
return [

    'temporary_file_upload' => [
        'disk' => null,
        // Knowledge-base ZIP archives can be large (default limit is 12 MB).
        'rules' => ['required', 'file', 'max:102400'], // 100 MB
        'directory' => null,
        'middleware' => null,
        'preview_mimes' => [
            'png', 'gif', 'bmp', 'svg', 'wav', 'mp4',
            'mov', 'avi', 'wmv', 'mp3', 'm4a',
            'jpg', 'jpeg', 'mpga', 'webp', 'wma',
        ],
        'max_upload_time' => 10,
        'cleanup' => true,
    ],

];
