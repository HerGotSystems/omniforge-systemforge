# OmniForge ↔ M8 integration v1

This repository should remain the product/UI shell. M8 remains a separate orchestration engine/service.

## Separation

    Browser
      |
      v
    OmniForge Worker / M8 Lab
      |
      | service binding
      v
    private M8 Worker
      |
      +-- model provider gateway
      +-- storage
      +-- tools

Do not copy M8 routing, memory or permission logic into OmniForge.

## M8 Lab

`app/m8-lab.html` is the initial owner/tester surface.

It supports:

- health/status;
- task entry;
- inspect-plan;
- run;
- requested-tool selection;
- route inspection;
- provider-call/audit inspection;
- raw result inspection.

It intentionally does not fake features not yet connected: billing, memory management, credits, uploads, or side-effect approval dialogs.

Do not link this page from public navigation until Cloudflare Access protects it.

## Client

`app/lib/m8-client.js` is a small browser client for:

- `GET /api/m8/health`
- `POST /api/m8/plan`
- `POST /api/m8/run`

It sends cookies with `credentials: include` so a future Cloudflare Access session can authorize the browser-facing Worker. Optional bearer tokens remain session-only in the Lab.

## Recommended Cloudflare proxy

The OmniForge Worker should proxy `/api/m8/*` to an M8 Worker through a Cloudflare service binding. The M8 Worker can therefore remain without a public route.

The browser-facing Worker should derive the M8 principal from authenticated user/session state and forward only trusted identity fields to the private M8 service.

Do not accept user-supplied `userId`, `tenantId`, roles or allowed-tools claims from browser JSON.

## Next layers

1. Cloudflare Access protection for owner Lab.
2. browser Worker → private M8 Worker service binding.
3. hosted provider secret/gateway.
4. usage accounting and hard spend caps.
5. D1 identity/workspace/run schema.
6. tool approval UI.
7. memory UI.
8. private beta role.
9. public hosted tier.
10. OmniForge “Orchestrate with M8” action.
