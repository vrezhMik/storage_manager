<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Blocks API calls for terminal sections the user is not allowed to see.
 * Usage: ->middleware('section:price_check')
 */
class EnsureSectionAccess
{
    public function handle(Request $request, Closure $next, string $section): Response
    {
        $user = $request->user();

        if (! $user || ! $user->canUseSection($section)) {
            return response()->json([
                'message' => 'This section is not available for this user',
            ], Response::HTTP_FORBIDDEN);
        }

        return $next($request);
    }
}
