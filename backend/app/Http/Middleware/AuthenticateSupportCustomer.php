<?php

namespace App\Http\Middleware;

use App\Models\SupportCustomerToken;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * The support portal's sign-in: "Authorization: Bearer <token>" from the
 * customer's browser; the customer is put on the request as "supportCustomer".
 */
class AuthenticateSupportCustomer
{
    public function handle(Request $request, Closure $next): Response
    {
        $plain = (string) $request->bearerToken();
        $token = $plain === '' ? null : SupportCustomerToken::with('customer')
            ->where('token', hash('sha256', $plain))
            ->where('expires_at', '>', now())
            ->first();

        if (! $token || ! $token->customer?->active) {
            return response()->json(['message' => 'Unauthenticated'], Response::HTTP_UNAUTHORIZED);
        }

        // Each use keeps the sign-in alive; written at most once an hour.
        if (! $token->last_used_at || $token->last_used_at->lt(now()->subHour())) {
            $token->forceFill(['last_used_at' => now(), 'expires_at' => now()->addDays(30)])->save();
        }

        $request->attributes->set('supportCustomer', $token->customer);
        $request->attributes->set('supportToken', $token);

        return $next($request);
    }
}
