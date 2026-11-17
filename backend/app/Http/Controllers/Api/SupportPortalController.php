<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Jobs\PostSupportResponse;
use App\Jobs\PostSupportTicket;
use App\Models\SupportCustomer;
use App\Models\SupportResponse;
use App\Models\SupportTicket;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Symfony\Component\HttpFoundation\Response;

/**
 * The customer support portal on flexit.am ("Խնդրի գրանցում"), replacing
 * Fluent Support: sign up, sign in, the customer's tickets with their
 * conversation, new tickets, replies, closing, password reset.
 */
class SupportPortalController extends Controller
{
    private const FILES = ['files' => ['nullable', 'array', 'max:3'], 'files.*' => ['image', 'mimes:jpg,jpeg,png,webp', 'max:5120']];

    public function register(Request $request): JsonResponse
    {
        // One account per address, whatever the letter case.
        $request->merge(['email' => mb_strtolower(trim((string) $request->input('email')))]);
        $data = $request->validate([
            'firstName' => ['required', 'string', 'max:120'],
            'lastName' => ['nullable', 'string', 'max:120'],
            'email' => ['required', 'email', 'max:190', Rule::unique('support_customers', 'email')],
            'phone' => ['nullable', 'string', 'max:32', 'regex:/^[0-9+()\-\s]{6,32}$/'],
            'company' => ['nullable', 'string', 'max:160'],
            'password' => ['required', 'string', 'min:8', 'max:190'],
        ]);

        $customer = SupportCustomer::create([
            'first_name' => trim($data['firstName']),
            'last_name' => filled($data['lastName'] ?? null) ? trim($data['lastName']) : null,
            'email' => mb_strtolower(trim($data['email'])),
            'phone' => $data['phone'] ?? null,
            'company' => $data['company'] ?? null,
            'password' => $data['password'],
        ]);

        return response()->json(['token' => $customer->issueToken(), 'customer' => $customer->toPortal()], Response::HTTP_CREATED);
    }

    public function login(Request $request): JsonResponse
    {
        $data = $request->validate(['email' => ['required', 'string', 'max:190'], 'password' => ['required', 'string', 'max:190']]);

        $customer = SupportCustomer::where('email', mb_strtolower(trim($data['email'])))->first();
        if (! $customer || ! $customer->active || ! $customer->checkPassword($data['password'])) {
            return response()->json(['message' => 'Wrong email or password'], Response::HTTP_UNPROCESSABLE_ENTITY);
        }

        return response()->json(['token' => $customer->issueToken(), 'customer' => $customer->toPortal()]);
    }

    public function logout(Request $request): JsonResponse
    {
        $request->attributes->get('supportToken')->delete();

        return response()->json(['ok' => true]);
    }

    public function me(Request $request): JsonResponse
    {
        return response()->json($this->customer($request)->toPortal());
    }

    public function updateProfile(Request $request): JsonResponse
    {
        $customer = $this->customer($request);
        $data = $request->validate([
            'firstName' => ['required', 'string', 'max:120'],
            'lastName' => ['nullable', 'string', 'max:120'],
            'phone' => ['nullable', 'string', 'max:32', 'regex:/^[0-9+()\-\s]{6,32}$/'],
            'company' => ['nullable', 'string', 'max:160'],
            'password' => ['nullable', 'string', 'min:8', 'max:190'],
        ]);
        $customer->fill([
            'first_name' => $data['firstName'],
            'last_name' => $data['lastName'] ?? null,
            'phone' => $data['phone'] ?? null,
            'company' => $data['company'] ?? null,
        ]);
        if (filled($data['password'] ?? null)) {
            $customer->password = $data['password'];
            $customer->legacy_password = null;
        }
        $customer->save();

        return response()->json($customer->toPortal());
    }

    public function tickets(Request $request): JsonResponse
    {
        $tickets = $this->customer($request)->tickets()->latest('updated_at')->limit(300)->get();

        return response()->json(['tickets' => $tickets->map->toPortal()->all()]);
    }

    public function createTicket(Request $request): JsonResponse
    {
        $customer = $this->customer($request);
        $data = $request->validate([
            'title' => ['required', 'string', 'max:190'],
            'product' => ['required', Rule::in(SupportTicket::PRODUCTS)],
            'priority' => ['required', Rule::in(array_keys(SupportTicket::PRIORITY_LABELS))],
            'description' => ['required', 'string', 'min:10', 'max:10000'],
        ] + self::FILES);

        $ticket = SupportTicket::create([
            'support_customer_id' => $customer->id,
            'status' => SupportTicket::STATUS_NEW,
            'name' => $customer->fullName(),
            'phone' => $customer->phone ?: '—',
            'company' => $customer->company,
            'tin' => $customer->tin,
            'title' => trim($data['title']),
            'product' => $data['product'],
            'priority' => $data['priority'],
            'urgent' => $data['priority'] === 'critical',
            'description' => trim($data['description']),
            'source' => 'portal',
            'ip' => $request->ip(),
        ]);
        if ($paths = $this->storeFiles($request, 'support/'.$ticket->id)) {
            $ticket->update(['attachments' => $paths]);
        }

        PostSupportTicket::dispatch($ticket->id);

        return response()->json($ticket->fresh()->toPortal(true), Response::HTTP_CREATED);
    }

    public function showTicket(Request $request, int $id): JsonResponse
    {
        return response()->json($this->ticket($request, $id)->load('responses')->toPortal(true));
    }

    public function reply(Request $request, int $id): JsonResponse
    {
        $ticket = $this->ticket($request, $id);
        $customer = $this->customer($request);
        $data = $request->validate(['body' => ['required', 'string', 'min:1', 'max:10000']] + self::FILES);

        $response = SupportResponse::create([
            'support_ticket_id' => $ticket->id,
            'author' => SupportResponse::AUTHOR_CUSTOMER,
            'author_name' => $customer->fullName(),
            'body' => trim($data['body']),
        ]);
        if ($paths = $this->storeFiles($request, 'support/'.$ticket->id.'/r'.$response->id)) {
            $response->update(['attachments' => $paths]);
        }

        // An answer on a closed ticket opens it again for the team.
        $ticket->status = $ticket->isOpen() ? $ticket->status : SupportTicket::STATUS_NEW;
        $ticket->closed_at = null;
        $ticket->touch();
        $ticket->save();

        PostSupportResponse::dispatch($response->id);

        return response()->json($ticket->fresh()->load('responses')->toPortal(true), Response::HTTP_CREATED);
    }

    public function close(Request $request, int $id): JsonResponse
    {
        $ticket = $this->ticket($request, $id);
        $ticket->update(['status' => SupportTicket::STATUS_SOLVED, 'solved_at' => $ticket->solved_at ?? now(), 'closed_at' => now()]);

        return response()->json($ticket->load('responses')->toPortal(true));
    }

    // Always the same answer, so nobody learns which emails have an account.
    public function forgotPassword(Request $request): JsonResponse
    {
        $data = $request->validate(['email' => ['required', 'email', 'max:190']]);
        $email = mb_strtolower(trim($data['email']));
        $customer = SupportCustomer::where('email', $email)->where('active', true)->first();

        if ($customer) {
            $plain = Str::random(48);
            DB::table('support_password_resets')->updateOrInsert(['email' => $email], ['token' => hash('sha256', $plain), 'created_at' => now()]);
            $link = rtrim((string) config('services.support_portal.url'), '/').'/?reset='.$plain.'&email='.rawurlencode($email);
            Mail::raw("Բարև Ձեզ, {$customer->first_name}։\n\nՆոր գաղտնաբառ սահմանելու համար անցեք հղումով (գործում է 2 ժամ).\n{$link}\n\nԵթե դուք չեք խնդրել, պարզապես անտեսեք այս նամակը։\n\nFlexit", function ($m) use ($customer) {
                $m->to($customer->email, $customer->fullName())->subject('Flexit · գաղտնաբառի վերականգնում');
            });
        }

        return response()->json(['ok' => true]);
    }

    public function resetPassword(Request $request): JsonResponse
    {
        $data = $request->validate([
            'email' => ['required', 'email'],
            'token' => ['required', 'string'],
            'password' => ['required', 'string', 'min:8', 'max:190'],
        ]);
        $email = mb_strtolower(trim($data['email']));
        $row = DB::table('support_password_resets')->where('email', $email)->first();
        $customer = SupportCustomer::where('email', $email)->first();

        if (! $row || ! $customer || ! hash_equals($row->token, hash('sha256', $data['token'])) || now()->subHours(2)->gt($row->created_at)) {
            return response()->json(['message' => 'The link is not valid'], Response::HTTP_UNPROCESSABLE_ENTITY);
        }

        $customer->forceFill(['password' => $data['password'], 'legacy_password' => null])->save();
        DB::table('support_password_resets')->where('email', $email)->delete();

        return response()->json(['token' => $customer->issueToken(), 'customer' => $customer->toPortal()]);
    }

    // The signed links handed out in the portal for attached pictures.
    public function file(Request $request, string $owner, int $id, int $index)
    {
        abort_unless($request->hasValidSignature(), Response::HTTP_FORBIDDEN);
        $model = $owner === 'response' ? SupportResponse::findOrFail($id) : SupportTicket::findOrFail($id);
        $path = ($model->attachments ?? [])[$index] ?? null;
        abort_unless(is_string($path) && Storage::disk('local')->exists($path), Response::HTTP_NOT_FOUND);

        return Storage::disk('local')->response($path);
    }

    private function customer(Request $request): SupportCustomer
    {
        return $request->attributes->get('supportCustomer');
    }

    private function ticket(Request $request, int $id): SupportTicket
    {
        return $this->customer($request)->tickets()->findOrFail($id);
    }

    private function storeFiles(Request $request, string $dir): array
    {
        $paths = [];
        foreach ($request->file('files', []) as $file) {
            $paths[] = $file->storeAs($dir, Str::random(24).'.'.$file->extension(), 'local');
        }

        return $paths;
    }
}
