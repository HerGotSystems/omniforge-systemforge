# Campaign Forge / execution-mode rework — test status

Branch: `feature/campaign-forge-v1`. **PR #2 open. Not merged. Not deployed to production.** Do not treat this PR as ready to merge until the checks referenced in it pass — see "NOT yet verified" below.

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

### Added in the PR #2 review-response pass

| Item | How it was verified |
|---|---|
| Post-forge RunPack (📦 button) works for any forge type | `buildAIPacketText()` previously hard-coded System-Forge field names (`framework`/`sheet`/`assumptions`/`contradictions`) into its snapshot, silently dropping Campaign Forge's sections. Replaced with `buildForgeSnapshot()`, a generic pass over all of `currentData`'s own keys (excluding internal `_`-prefixed bookkeeping and, defensively, anything matching `key/secret/token/password`). Verified in-browser: a Campaign Forge result's packet now contains all 17 of its fields (thesis, angles, hooks, concepts, scripts, shotlists, platformCopy, ctaVariants, launchSequence, repurposing, visualRecipe, assetChecklist, metricool, runpack, plus the shared name/summary/problem/contradictions fields); a System Forge result's packet still contains framework/assets/experiments/pilot/sheet as before; neither contains any key-like field or the `_reforged`/`_lastReforge` bookkeeping fields |
| No-key Reforge works end-to-end | Previously contradictory: Reforge refused outright in Run With My AI mode, telling the user to use the RunPack button, which itself said to "paste result back via Reforge" — a dead end. Reforge now builds its own RunPack packet (same `#out-packet` UI, `pendingPacketKind = 'reforge'`) containing the current forge's full data, the user's changed-context text, and the selected sections, with the same copy/download/paste-back-import workflow. Verified in-browser end-to-end: opened Reforge on a Campaign Forge result in Run With My AI mode, entered context, selected two sections, got a Reforge RunPack packet containing both the context and the section names, pasted back a partial JSON result, and confirmed it merged correctly — the two selected sections updated, an untouched section (`hooks`) was preserved exactly, `_reforged` incremented, `_lastReforge` set, state became `reforged`, the saved history record was patched with the same data, and the result rendered with the "Generated by Connected AI · via RunPack" chip |
| Direct API Reforge path still exists, unchanged | `runReforge()` now dispatches to `runReforgeViaApi()` only when `executionMode === 'api'` and a key is present; that function's live-call logic is otherwise the same as before this pass. Verified the dispatch condition directly (no live call made) |
| Generic RunPack modal no longer describes an impossible step | Removed the "reforge" option from the 📦 RunPack modal's task list (Reforge now has its own dedicated, working flow via the Reforge button) and rewrote the modal's note to stop claiming results can be "paste[d] back via Reforge" for tasks that have no import path — it now says plainly that stress/extend/assumption/contradiction packets are exploratory with no automatic import, and points to the Reforge button for section updates |
| Public landing page (`index.html`) matches current architecture | Rewrote copy (not layout): removed the £5/10-credits pricing card, "credits never expire," and "shareable forge links" claims; replaced the 3-tier pricing grid with Run With My AI (£0, no key) / Connect AI API (£0 from Omniforge, optional) / Omniforge Hosted (coming later, no price); updated forge-type count from 6 to 8; rewrote the "How It Works" pipeline step and FAQ to present Run With My AI as the default, no-key path and Connect AI API as optional; updated meta/OG description tags. Verified via rendered page text: no `£5`, `10 forges`, "credits never expire", "shareable forge links", or "Forge Credits" claims remain; forge-type stat reads 8 |

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
