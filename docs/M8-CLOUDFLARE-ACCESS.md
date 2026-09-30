# M8 Lab access and service-binding bridge

This is a deployment design, not yet the production `wrangler.jsonc`.

## Owner access

Protect both:

- `/app/m8-lab.html`
- `/api/m8/*`

with a Cloudflare Access application/policy restricted to the owner/tester identities.

After Access authenticates the browser, Cloudflare supplies the authenticated user email header to the Worker. The proxy example converts that authenticated identity into M8's principal headers.

## Service binding

The browser-facing OmniForge Worker has an `M8` service binding to the private M8 Worker.

Cloudflare service bindings let the caller invoke `env.M8.fetch(request)` without exposing the M8 Worker through a public URL.

Access context is not automatically propagated across a service binding, so the proxy explicitly forwards a derived M8 principal.

## Header trust boundary

The proxy **deletes and replaces**:

- x-m8-user-id
- x-m8-tenant-id
- x-m8-roles
- x-m8-tools
- x-m8-service-secret

This prevents browser code from granting itself another user, role, tenant or tool permission.

The M8 service secret belongs in a Cloudflare secret named `M8_SERVICE_SECRET`, not in `vars` or source code.

## Owner phase

For the first deployment there should be exactly one access class:

- owner/tester

No public signup, billing or public hosted M8 yet.

This gives us a safe place to run real M8 calls and evaluate the UX before building accounts/subscriptions.

## Later role mapping

Replace static `M8_ROLES` / `M8_ALLOWED_TOOLS` environment settings with a server-side account/workspace lookup:

- owner
- tester
- beta
- user
- workspace-admin

Tool permissions should come from durable account data, not browser fields.


## Approval header

The browser-facing proxy must delete any incoming `x-m8-approved-tools` header.

Only a future server-side approval store may set this header after validating a specific approval record. Browser JSON or browser headers are never approval authority.
