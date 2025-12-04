<?php

namespace App\Http\Middleware;

use Closure;
use Firebase\JWT\JWT;
use Firebase\JWT\Key;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;
use App\Models\User;

class AuthenticateJwt
{
    public function handle(Request $request, Closure $next): Response
    {
        $authorization = $request->header('Authorization');

        if (! $authorization || ! str_starts_with($authorization, 'Bearer ')) {
            return $this->unauthorized();
        }

        $token = substr($authorization, 7);
        $secret = config('app.jwt_secret') ?? env('JWT_SECRET');

        if (! $secret) {
            return $this->unauthorized('Token secret missing');
        }

        try {
            $payload = JWT::decode($token, new Key($secret, config('app.jwt_algo', 'HS256')));
        } catch (\Throwable $e) {
            return $this->unauthorized('Invalid token');
        }

        if (($payload->type ?? null) !== 'access') {
            return $this->unauthorized('Invalid token type');
        }

        $userId = $payload->sub ?? null;
        if (! $userId) {
            return $this->unauthorized('Invalid token subject');
        }

        $user = User::find($userId);
        if (! $user) {
            return $this->unauthorized('User not found');
        }

        auth()->setUser($user);

        return $next($request);
    }

    protected function unauthorized(string $message = 'Unauthorized'): JsonResponse
    {
        return response()->json(['message' => $message], Response::HTTP_UNAUTHORIZED);
    }
}
