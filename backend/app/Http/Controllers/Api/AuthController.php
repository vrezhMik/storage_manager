<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\RefreshToken;
use App\Models\User;
use Carbon\CarbonImmutable;
use Firebase\JWT\JWT;
use Firebase\JWT\Key;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Cookie;
use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\Response;

class AuthController extends Controller
{
    public function login(Request $request): JsonResponse
    {
        $data = $request->validate([
            'email' => ['required', 'email'],
            'password' => ['required', 'string'],
        ]);

        $user = User::where('email', $data['email'])->first();

        if (! $user || ! Hash::check($data['password'], $user->password)) {
            return response()->json(['message' => 'Invalid credentials'], Response::HTTP_UNAUTHORIZED);
        }

        return $this->respondWithTokens($this->issueTokens($user));
    }

    public function refresh(Request $request): JsonResponse
    {
        $data = $request->validate([
            'refresh_token' => ['nullable', 'string'],
        ]);

        $provided = $data['refresh_token'] ?? $request->cookie('refresh_token');
        if (! $provided) {
            return response()->json(['message' => 'Invalid refresh token'], Response::HTTP_UNAUTHORIZED);
        }

        $hashed = $this->hashRefreshToken($provided);

        /** @var RefreshToken|null $record */
        $record = RefreshToken::where('token_hash', $hashed)->first();

        if (! $record || ! $record->isActive()) {
            return response()->json(['message' => 'Invalid refresh token'], Response::HTTP_UNAUTHORIZED);
        }

        $user = $record->user;

        if (! $user) {
            return response()->json(['message' => 'Invalid refresh token'], Response::HTTP_UNAUTHORIZED);
        }

        $record->update(['revoked_at' => now()]);

        return $this->respondWithTokens($this->issueTokens($user));
    }

    public function logout(Request $request): JsonResponse
    {
        $data = $request->validate([
            'refresh_token' => ['nullable', 'string'],
        ]);

        $refreshToken = $data['refresh_token'] ?? $request->cookie('refresh_token');

        if (! empty($refreshToken)) {
            RefreshToken::where('token_hash', $this->hashRefreshToken($refreshToken))
                ->update(['revoked_at' => now()]);
        }

        return response()
            ->json(['message' => 'Logged out'])
            ->withoutCookie('access_token')
            ->withoutCookie('refresh_token');
    }

    public function me(Request $request): JsonResponse
    {
        return response()->json($request->user());
    }

    private function issueTokens(User $user): array
    {
        $accessTtl = (int) env('JWT_ACCESS_TTL', 900); // seconds, default 15 minutes
        $refreshTtlDays = (int) env('JWT_REFRESH_TTL_DAYS', 30);

        $now = CarbonImmutable::now();
        $accessToken = $this->encodeJwt([
            'iss' => config('app.url'),
            'sub' => $user->getKey(),
            'iat' => $now->getTimestamp(),
            'exp' => $now->addSeconds($accessTtl)->getTimestamp(),
            'type' => 'access',
        ]);

        $refreshToken = Str::random(64);
        RefreshToken::create([
            'user_id' => $user->getKey(),
            'token_hash' => $this->hashRefreshToken($refreshToken),
            'expires_at' => $now->addDays($refreshTtlDays),
        ]);

        return [
            'token_type' => 'Bearer',
            'access_token' => $accessToken,
            'expires_in' => $accessTtl,
            'refresh_token' => $refreshToken,
            'refresh_expires_at' => $now->addDays($refreshTtlDays)->toIso8601String(),
            'user' => [
                'id' => $user->getKey(),
                'name' => $user->name,
                'email' => $user->email,
                'allow_manual_items' => (bool) $user->allow_manual_items,
                'allow_manual_text_input' => (bool) $user->allow_manual_text_input,
            ],
        ];
    }

    private function respondWithTokens(array $tokens): JsonResponse
    {
        $cookies = $this->buildCookies($tokens);
        $response = response()->json($tokens);
        foreach ($cookies as $cookie) {
            $response->headers->setCookie($cookie);
        }

        return $response;
    }

    private function buildCookies(array $tokens): array
    {
        $secure = (bool) config('session.secure', false);
        $sameSite = config('session.same_site', 'lax');

        $accessMinutes = ($tokens['expires_in'] ?? 900) / 60;
        $refreshExpiry = $tokens['refresh_expires_at'] ?? null;
        $refreshMinutes = $refreshExpiry ? now()->diffInMinutes($refreshExpiry) : (int) env('JWT_REFRESH_TTL_DAYS', 30) * 1440;

        return [
            Cookie::make(
                'access_token',
                $tokens['access_token'],
                (int) ceil($accessMinutes),
                '/',
                null,
                $secure,
                true,
                false,
                $sameSite
            ),
            Cookie::make(
                'refresh_token',
                $tokens['refresh_token'],
                (int) ceil($refreshMinutes),
                '/',
                null,
                $secure,
                true,
                false,
                $sameSite
            ),
        ];
    }

    private function encodeJwt(array $payload): string
    {
        $secret = config('app.jwt_secret') ?? env('JWT_SECRET');
        $algo = config('app.jwt_algo', 'HS256');

        if (! $secret) {
            throw new \RuntimeException('JWT_SECRET is not configured');
        }

        return JWT::encode($payload, $secret, $algo);
    }

    private function hashRefreshToken(string $token): string
    {
        return hash('sha256', $token);
    }
}
