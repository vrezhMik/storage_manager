<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class Cors
{
    public function handle(Request $request, Closure $next): Response
    {
        $origin = $request->headers->get('Origin');
        $defaultOrigins = 'http://localhost:3000,http://127.0.0.1:3000';
        $allowedOrigins = collect(explode(',', (string) env('ALLOWED_ORIGINS', $defaultOrigins)))
            ->map(fn ($o) => trim($o))
            ->filter()
            ->all();

        $allowOrigin = $origin && (empty($allowedOrigins) || in_array($origin, $allowedOrigins, true))
            ? $origin
            : null;

        $headers = [
            'Access-Control-Allow-Origin' => $allowOrigin,
            'Access-Control-Allow-Methods' => 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
            'Access-Control-Allow-Headers' => 'Content-Type, Authorization, Accept, Origin, X-Requested-With',
            'Access-Control-Max-Age' => '600',
            'Access-Control-Allow-Credentials' => 'true',
            'Vary' => 'Origin',
        ];

        if ($request->getMethod() === Request::METHOD_OPTIONS) {
            return response('', Response::HTTP_NO_CONTENT, $headers);
        }

        $response = $next($request);

        foreach ($headers as $key => $value) {
            if ($value !== null) {
                $response->headers->set($key, $value);
            }
        }

        return $response;
    }
}
