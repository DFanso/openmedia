# AI Assistant (BYOK)

> **Status: Design.** Module: `src-tauri/src/ai/`.

The user brings their own API key. The assistant turns a plain-language request ("remove the Reels tab and suggested posts, keep stories") into a validated recipe patch for the page they are looking at. With no key configured, everything else (bundled recipes, picker, manual editing) still works.

## Providers

One `Provider` trait; each adapter maps our request to the vendor's API and returns a **structured** recipe patch.

| Adapter | Structured output mechanism | Notes |
|---------|-----------------------------|-------|
| Anthropic | Forced tool use (tool input schema = patch schema) | Calls from Rust, so no browser-CORS opt-in header is needed |
| OpenAI | `response_format: json_schema` (strict) | |
| Google Gemini | `responseSchema` / JSON mode | |
| OpenRouter | OpenAI-compatible | Lets users pick any model with one key |
| OpenAI-compatible (custom base URL) | `json_schema` if supported, else JSON mode + validation | Covers Ollama / LM Studio / self-hosted. Local models mean the snapshot never leaves the machine. |

Model name is user-selectable per provider; we ship suggested defaults but do not hardcode a model as the only option. Defaults are verified at implementation time, not assumed here.

All requests go through Rust (`reqwest`). The webview never sees the key and never makes the request.

## Key handling

- Entered once in Settings, written straight to the OS secure store via the `secrets` trait. The shell receives only a `hasKey: bool` and a masked tail.
- Read only inside the `ai` module at request time; held in a zeroizing buffer for the duration of the call.
- Never logged, never in error strings (errors from providers are scrubbed of headers/bodies containing it), never in recipe exports or settings files.
- "Test key" issues a minimal request and reports success/failure only.
- Delete removes it from the store.

## Privacy: what is sent

The only page-derived data sent to a provider is the redacted [snapshot](./site-runtime.md#snapshot) plus the user's request. Core applies a second redaction pass:

- email, phone, long digit runs, URL query strings, tokens-looking strings → placeholder;
- drops any text node not on the allow-list of UI-label contexts;
- caps total size.

Settings exposes:

- **Preview before send** (default **on**): shows the exact payload and a token estimate; the user confirms.
- **Include page text** (default off): widens the text allow-list for sites where UI labels alone are not enough.
- A persistent notice that the snapshot goes to the user's chosen provider, with link to that provider's data policy.

Users who care most should be steered to a local OpenAI-compatible endpoint.

## Prompt contract

System prompt (in `src-tauri/src/ai/prompt.rs`, versioned):

1. Role: edit a recipe for the given site; output only a patch conforming to the schema.
2. The recipe schema and rule semantics (see [Recipe Format](./recipe-format.md)), with **target-selection guidance**: prefer `ariaLabel`/`href`/`role`/`text` over `css`; never use hashed or generated-looking class names; prefer `hide` over `remove`; use the narrowest target that satisfies the request.
3. Hard prohibitions: no `script` rules (the assistant cannot emit them in v1), no cross-origin redirects, no automation of site actions.
4. Inputs: user request, current URL (path only), viewport class, existing recipe (for edits), snapshot.

The response is a **patch**: `{ addRules[], updateRules[], removeRuleIds[], summary }`, not a full recipe, so edits are diffable and the UI can show "AI will: hide Reels tab; hide Suggested posts".

## Generate → preview → verify → accept

1. Core requests a snapshot, redacts, optionally shows the preview, sends.
2. Response is validated in Rust against the patch schema and recipe validator. Invalid → one automatic retry with the validation error; still invalid → surfaced to the user.
3. The patch is applied to the live view as an **ephemeral preview** (nothing saved).
4. The engine returns match counts for each new/updated rule.
5. **Repair loop:** any `expect: "match"` rule that matched 0 elements is fed back to the model with a fresh snapshot ("rule X matched nothing"). Max 2 rounds, then show the user which rules did not match.
6. The user accepts (saved as an `ai` recipe, versioned) or rejects (view reverts). Undo is one tap after accept as well.

## Repair of stale rules

A rule flagged stale (see [Recipe Format](./recipe-format.md#health)) can be repaired with the same pipeline scoped to that rule: send the rule, its last-known intent (`label`), and a fresh snapshot; receive `updateRules[]`.

## Cost and limits

- Show a token estimate before send; a configurable max input size per request.
- No background or automatic calls: the assistant runs only on explicit user action. Stale-rule detection is local and free; repair is user-triggered.
- Streaming is optional polish (shows the summary as it arrives); correctness does not depend on it.

## Errors the UI must distinguish

Missing/invalid key · rate limit/quota · provider/network failure · model refused or returned invalid structure · patch rejected by validator · patch applied but matched nothing.

## Testing

- Provider adapters: recorded request/response fixtures, no live calls, no real keys.
- Prompt/patch pipeline: fixture snapshots (scrubbed DOM of real sites) + canned model responses → assert validator accepts/rejects and engine fixtures show the intended elements hidden.
- Redaction: property tests asserting that known-sensitive patterns never survive.
- Optional, manual and out of CI: an evaluation script that runs real models against the fixtures to compare recipe quality across providers.

## See Also

[Recipe Format](./recipe-format.md) · [Site Runtime](./site-runtime.md) · [Security](./security.md)
