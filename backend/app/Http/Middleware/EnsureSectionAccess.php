<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
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

        if ($user->isOutsideNetwork($section, $request->ip())) {
            Log::warning('Terminal section refused outside the company network', [
                'user' => $user->id,
                'section' => $section,
                'ip' => $request->ip(),
            ]);

            return response()->json([
                'code' => 'network_restricted',
                'message' => 'This section is available only from the company network',
                'ip' => $request->ip(),
            ], Response::HTTP_FORBIDDEN);
        }

        return $next($request);
    }
}
