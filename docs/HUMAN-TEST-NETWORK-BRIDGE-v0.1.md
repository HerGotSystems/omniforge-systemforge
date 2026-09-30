# Omniforge ↔ Human Test Network Bridge v0.1

## Purpose

Use Omniforge's existing Stress Test, Reforge, RunPack and lineage mechanics as the creator-side intelligence layer for Human Test Network (HTN).

Omniforge does not own the tester marketplace or Test Minutes ledger.

## Portable packet

Omniforge should emit a stable JSON object rather than coupling itself to HTN database tables.

```json
{
  "schema": "human-test-packet/v1",
  "source": {
    "system": "omniforge",
    "source_id": "forge-or-runpack-id"
  },
  "project": {
    "name": "Example App",
    "url": "https://example.com",
    "description": "Optional public description"
  },
  "test": {
    "title": "First-time mobile test",
    "mode": "mobile",
    "instructions": "Use the app without documentation.",
    "minutes_reward": 10,
    "max_claims": 3,
    "permissions": ["public_navigation"],
    "tasks": [
      { "prompt": "Explain what you think the app does." },
      { "prompt": "Try to complete the primary action." }
    ]
  }
}
```

## HTN bridge

- `POST /api/bridge/validate` validates the packet without spending Test Minutes.
- `POST /api/bridge/import` creates/reuses the creator project, publishes the test and reserves Test Minutes.

## Result lifecycle

The existing Omniforge lifecycle can be extended conceptually as:

`forged → stressed → human_tested → reforged → ready`

Raw human evidence stays authoritative in HTN. Omniforge consumes a sanitized result bundle with source IDs so every reforge can retain lineage back to the exact test and claims that caused the change.

## Safety

A generated test must include explicit bounded permission scopes. Omniforge must never interpret a URL as permission for destructive testing, real purchasing, credential probing or actions outside the declared scope.
