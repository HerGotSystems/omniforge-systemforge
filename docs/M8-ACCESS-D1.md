# M8 account, workspace and usage model

This layer belongs to OmniForge because OmniForge is the product/account shell. M8 receives only a trusted principal and remains reusable infrastructure.

## D1 source of truth

Migration `cloudflare/migrations/0001_m8_access.sql` defines:

- users;
- workspaces;
- memberships;
- entitlements;
- daily usage accounting;
- run audit metadata.

Entitlements currently cover:

- hosted-M8 enable/disable;
- monthly run limit;
- monthly provider-call limit;
- monthly cost limit in integer micro-units;
- maximum task size;
- allowed tool IDs;
- memory mode.

## Access flow

    Cloudflare Access identity
        ↓
    lookup user + workspace membership in D1
        ↓
    load workspace entitlements
        ↓
    check monthly usage
        ↓
    construct trusted M8 principal
        ↓
    service binding → private M8 Worker

Browser JSON never supplies roles, tenant IDs or allowed tools.

## Usage limits vs rate limits

D1 accounting is the source of truth for durable monthly limits.

Cloudflare Worker rate-limit bindings can later protect burst traffic, but they should not be used as billing/accounting counters because they are intentionally permissive/eventually consistent.

## Owner bootstrap

Do not hard-code an owner email into the migration.

For the first deployment, create:

1. one user row for the Access-authenticated owner;
2. one owner workspace;
3. one owner membership;
4. one entitlement row with hosted_enabled=1.

Keep allowed_tools_json as [] until real tool adapters and approval UI are deployed.

## Post-run accounting

The D1 proxy example clones completed `/run` responses, extracts M8 provider receipts, and records runs, provider calls, input/output tokens and estimated cost micro-units into daily usage. It also writes compact run-audit metadata.

Accounting runs in `ctx.waitUntil()` so it does not delay the user response. Failures are logged.

## Concurrency boundary

This is sufficient for owner and small private-beta use, but it is not yet a strict reservation ledger. Two simultaneous requests can both pass a monthly pre-check before either writes usage. Before a larger public hosted tier, add reservation/settlement semantics (for example with a transactional coordinator/Durable Object) so hard spend caps remain strict under concurrency.
