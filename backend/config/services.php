<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Third Party Services
    |--------------------------------------------------------------------------
    |
    | This file is for storing the credentials for third party services such
    | as Mailgun, Postmark, AWS and more. This file provides the de facto
    | location for this type of information, allowing packages to have
    | a conventional file to locate the various service credentials.
    |
    */

    'postmark' => [
        'key' => env('POSTMARK_API_KEY'),
    ],

    'resend' => [
        'key' => env('RESEND_API_KEY'),
    ],

    'ses' => [
        'key' => env('AWS_ACCESS_KEY_ID'),
        'secret' => env('AWS_SECRET_ACCESS_KEY'),
        'region' => env('AWS_DEFAULT_REGION', 'us-east-1'),
    ],

    // Local AI for the assistant (embeddings run on our own server).
    'ollama' => [
        'url' => env('OLLAMA_URL', 'http://127.0.0.1:11434'),
        'embed_model' => env('OLLAMA_EMBED_MODEL', 'bge-m3'),
        // Limit CPU use so the website stays responsive while embedding.
        'num_thread' => (int) env('OLLAMA_NUM_THREAD', 2),
        'timeout' => (int) env('OLLAMA_TIMEOUT', 120),
        // Chat model that turns assistant questions into report requests.
        // Empty = off: the terminal then uses its built-in rules.
        'chat_model' => env('OLLAMA_CHAT_MODEL', ''),
        'chat_timeout' => (int) env('OLLAMA_CHAT_TIMEOUT', 60),
        'chat_num_thread' => (int) env('OLLAMA_CHAT_NUM_THREAD', 2),
        'chat_keep_alive' => env('OLLAMA_CHAT_KEEP_ALIVE', '30m'),
    ],

    // Local translator for the assistant (tools/translator). Empty URL = off.
    'translator' => [
        'url' => env('TRANSLATOR_URL', ''),
        'timeout' => (int) env('TRANSLATOR_TIMEOUT', 600),
    ],

    'assistant' => [
        // Chunks scoring below this (cosine similarity, 0..1) are not shown as
        // answers; bge-m3 gives roughly 0.55+ for related text.
        'min_score' => (float) env('ASSISTANT_MIN_SCORE', 0.5),
    ],

    'slack' => [
        'notifications' => [
            'bot_user_oauth_token' => env('SLACK_BOT_USER_OAUTH_TOKEN'),
            'channel' => env('SLACK_BOT_USER_DEFAULT_CHANNEL'),
        ],
    ],

];
