# M8 one-time tool approvals

Write/high-risk tool approval is stored server-side in D1.

An approval record is bound to:

- workspace;
- user;
- tool ID;
- digest of the exact task + tool input;
- expiry;
- one-time status.

The browser may reference an approval ID, but the ID alone grants nothing. The proxy must verify:

1. the record belongs to the authenticated user/workspace;
2. status is approved;
3. it has not expired;
4. the stored request digest matches the exact current tool request.

Only then may the proxy set the trusted `x-m8-approved-tools` header for the private M8 Worker.

After a completed external action, the approval is marked consumed.

## Status lifecycle

    pending
      ├─ approved → consumed
      ├─ denied
      └─ expired

Approved records also expire if unused.

## Privacy

The durable record stores a request digest plus a bounded preview for the UI, not unrestricted full prompt/tool payload history.

## Security boundary

This provides meaningful server-side consent separation from ordinary M8 run requests.

For a larger public service, high-risk operations should additionally consider re-authentication, CSRF protections, and stronger approval-session binding.
