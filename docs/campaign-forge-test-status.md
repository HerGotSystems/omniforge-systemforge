# Campaign Forge / execution-mode rework — test status

Branch: `feature/campaign-forge-v1`. **Pushed to GitHub. Not merged. Not deployed. No PR opened.**

This records what has actually been verified against real systems versus what
remains unverified, so status here should not be read more optimistically
than the evidence supports. "Confirmed" below means checked against real
code execution (and, where noted, a real live Anthropic API call) — not
"should work based on reading the code." Where evidence is limited (see the
billing note below), the claim is scoped to exactly what was observed, not
extended to cover things that weren't.

## Confirmed

| Item | How it was verified |
|---|---|
| A real Anthropic API key reached Anthropic | A live call with a real key produced an Anthropic-issued response (a `400` with a billing message — see below), confirming the key was transmitted and processed by Anthropic's servers |
| Deliberate invalid key returned 401 | A live call with a deliberately invalid key produced a live `401 Unauthorized` from Anthropic, surfaced by the app as a plain, readable error — no crash |
| Sonnet 5 model ID is configured | `claude-sonnet-5` is set as the default in the central `MODELS` config and is what a live request actually sent |
| Haiku 4.5 model ID is configured | `claude-haiku-4-5-20251001` is configured as the alternate option and is what a live request actually sent when selected |
| Request construction tests pass | The request body `callClaude()` builds (model, headers, message shape) was checked against its actual serialized form for both models and for Campaign Forge's real system prompt — no live generation was required to verify this |
| Session-only key behaviour works | Verified in-browser: an unremembered key lives only in `sessionStorage`, is absent from `localStorage`, and disappears if `sessionStorage` is cleared (tab-close proxy) |
| Remember opt-in behaviour works | Verified in-browser: checking "Remember this API key on this device" persists it to `localStorage`; unchecked, it never touches `localStorage` |
| RunPack / no-key flow works | Full flow tested end-to-end with zero API key configured: packet generation, preview, copy, download, and paste-back import all work |
| Campaign Forge RunPack flow works | Campaign Forge's real production system prompt was used to build both the no-key RunPack packet (copy/download/paste-back-import, all working) and a live API attempt (see billing note — the live attempt did not complete a generation) |
| Media Forge works without API | Code audit: zero references to `anthropic`, any key, or any `fetch()` call anywhere in `app/media-forge.html`; loads and renders (generative background, overlays, export paths) with no key configured |
| Friendly insufficient-credit handling works | Verified in-browser (simulated with the real error text Anthropic returned, no repeated paid calls): a tagged `insufficient_credit` error renders the specified user-facing message with one-click "Switch to Run With My AI" and "Open Settings" — never an automatic retry or spend. Generic errors (invalid key, malformed JSON) confirmed to still render through the plain, unmodified error path |

Also confirmed by code audit: no key is referenced anywhere in history records, RunPack exports, or `console.*` calls — `DB.getKey()` is called in exactly 5 places in `app/index.html` (`updateKeyBadge`, `callClaude`, the two execution-mode key guards, `refreshSettings`), none of them inside `finalizeForgeResult`, `buildRunPackForgeJSON`, `buildAIPacketText`, or `DB.saveForge`/`updateForge`. Only two `fetch()` targets exist in the whole app: `api.anthropic.com` (with the key) and a no-op hit-counter ping to `countapi.xyz` (no key, no user data).

## NOT yet verified

- Successful HTTP 200 generation with Sonnet 5
- Successful HTTP 200 generation with Haiku 4.5
- Real streaming start-to-completion
- Parsing of a real successful streamed response
- A full Campaign Forge result produced through the live Anthropic API

**Reason:** the real account hit Anthropic's insufficient-credit/billing response — `400 invalid_request_error`, *"Your credit balance is too low to access the Anthropic API"* — before a successful generation occurred, on every live attempt (Sonnet 5, Haiku 4.5, and Campaign Forge). That response confirms the API key reached and was processed by Anthropic; it does **not** by itself confirm that the full request body passed every stage of request/model validation, since it isn't known at what point in Anthropic's pipeline the billing check occurs relative to full validation. These items are not described as passed anywhere in this document, and should not be treated as passed until an actual `200` response with a real streamed body has been observed.

## Next step to close the gap

Once the Anthropic account has available credit, re-running a live request
would be needed to actually observe a `200` response and a real stream —
nothing found so far rules that out, but nothing found so far confirms it
either. That is a test still to run, not a predicted result.
