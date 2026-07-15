# Connectors plan: ChatGPT app + Claude connector (drafted 2026-07-14)

Owner direction: plan ChatGPT application and Claude connector compatibility ("I think we
can do great things with it"). This is the plan; nothing is built yet. Platform facts
below verified against live docs on 2026-07-14.

## The headline: one MCP server serves both

Both platforms converged on the Model Context Protocol:

- **ChatGPT apps** are built with the Apps SDK *on an MCP server*, submitted as plugins
  through OpenAI's submission portal (live since 2025-12-17; identity or business
  verification required; reviewed before App Directory listing). Widgets (interactive UI
  cards in chat) are an Apps SDK layer on top of the same MCP server.
- **Claude connectors** are remote MCP servers, added by users directly (custom
  connector, no review) or listed in the connectors directory (reviewed; OAuth with a
  real user consent flow is mandatory for anything touching private data).
- Both mandate **OAuth 2.1 with PKCE** and a user-consented connection; both connect to
  our server from their cloud, so it must be publicly reachable.

So the build is: **one remote MCP server, one OAuth flow, two thin platform skins**
(Apps SDK widget layer for ChatGPT; directory metadata for Claude). No fork.

## What it unlocks (why this is worth doing)

1. **Acquisition:** the ChatGPT App Directory is a discovery channel with enormous foot
   traffic; "peptide progress tracker" inside ChatGPT is differentiated shelf space.
2. **Zero-friction logging:** "log 250mcg ipamorelin" typed to the assistant someone
   already has open. The quick-log parse concept, but in the surface the user lives in.
3. **The companion, extended:** ChatGPT/Claude can answer "how's my cut going?" from the
   verdict and signals. Pepi becomes the data spine; their models become extra mouths.

## Architecture

### Server + auth
- **Remote MCP server** reusing the Supabase stack. First choice: a Supabase Edge
  Function speaking MCP's streamable HTTP transport (same Deno infra as `ai-service`);
  verify transport compatibility at build time, fall back to a small dedicated Deno host
  if edge functions fight the protocol. Either way it is stateless and RLS-scoped.
- **Supabase Auth as the OAuth 2.1 + PKCE provider.** The token maps to the Supabase
  user, so **owner-only RLS does all data scoping for free**; the MCP server never
  hand-rolls access control. Every connection is user-consented (both platforms require
  this anyway). Connector access therefore requires a Pepi account + cloud sync ON,
  which already exists (M1).

### The structural constraint: Pepi is local-first
Cloud state today is (a) the `user_state` snapshot blob, a one-way device-to-cloud
debounce mirror, and (b) normalized tables written at sign-up migration. That shapes the
plan:

- **Reads are easy.** The snapshot mirrors on every change while the app is signed in
  and flushes on background, so verdict/doses/check-in reads are fresh to the last time
  the app was open. Acceptable for v1; stated in tool descriptions.
- **Writes cannot touch the snapshot** (the next device mirror would clobber them).
  Two options:
  1. **`connector_event` inbox table (pragmatic v1):** MCP write tools append events
     (dose logged, check-in field, symptom, weight); the app pulls and merges them into
     the local store on foreground, then mirrors back as usual. Conflict-safe by
     construction (append-only, device is the merger). This is also the exact primitive
     remote push notifications will need later, so it is not throwaway.
  2. **The normalized per-entity sync engine** (already Polish-tier on the roadmap):
     the "right" fix; connectors become just another writer. Long pole.
  Plan: inbox for v1, folds into the sync engine when that track lands.

### Safety: the postures ride along
- Tool outputs are **posture-gated by `market_category`** exactly like `ai-service`:
  observational, attributed, non-individualized compound info; controlled = track-only;
  OTC = hedged + contraindication pointer. The gate logic gets extracted into a shared
  module both the edge function and the MCP server import.
- What ChatGPT or Claude *says around* our data is their model's speech; our
  responsibility is that **tool payloads and tool descriptions never carry or induce
  prescriptive content**. The spec-05 eval suite gains a fifth boundary: connector tool
  outputs.
- **Photos are excluded from connectors, full stop.** Progress photos never leave the
  hardened bucket to third-party models (spec 04/11: private by default, never used to
  train models; we cannot guarantee what a third party does downstream). Text-only.
- Privacy copy must state plainly: whatever a user discusses with ChatGPT/Claude about
  their Pepi data is processed by OpenAI/Anthropic under those platforms' terms; the
  connector only transmits what its tools return.

## Tool surface

**DECIDED (owner 2026-07-14): v1 is a two-way street** (reads + writes together), and we
go **straight at both directories** (no custom-connector-only soft launch). Placement is
**post-beta**, confirmed.

**v1 reads:**
| Tool | Returns |
|---|---|
| `get_today` | Doses due/done, check-in status, attention flags |
| `get_verdict` | State + hero + top signals, in the hedged register |
| `get_recent_logs` | Last N days of check-ins/symptoms/doses (text) |
| `get_protocol` | Protocol items + inventory levels (descriptive only) |
| `get_compound_info` | Catalog facts through the posture gate |

**v1 writes (via the inbox):** `log_dose`, `log_checkin`, `log_symptom`, `log_weight`.
Same entities the quick-log parser writes; the parse smarts live on the platform side
(their model formulates the structured call), so this costs us no AI tokens. Because v1 is
two-way, the `connector_event` inbox + app-side merge is **on the critical path for
launch, not a later phase.**

**Later (widgets):** a Today card and a Verdict card as ChatGPT Apps SDK components,
matching the instrument design language where their component system allows.

## Phasing

| Phase | Ships | Effort | Gates |
|---|---|---|---|
| 0 | OAuth 2.1/PKCE provider (Supabase Auth) + MCP skeleton + RLS-scoped reads + **`connector_event` inbox + app-side merge** | M/L | None new (auth + cloud sync exist) |
| 1 (v1) | Read + write tools (two-way); validate in ChatGPT developer mode + Claude custom connector as the **test harness** | M | Phase 0 |
| 2 (launch) | **Both directory submissions** (OpenAI identity/business verification + review; Anthropic connector-directory review) | M | Phase 1 + review readiness |
| 3 | ChatGPT widgets (Today + Verdict cards) | M | Phase 2 |

**Placement DECIDED: post-beta (Polish tier)**, alongside the sync-engine track. It depends
on nothing in the current beta batch, and the beta batch (calorie sync fix, review-step
rework, companion pivot, micro check-ins) directly improves what the connector exposes.

**Tradeoff we accepted by going straight at the directories:** the peptide-app review
scrutiny (same "is this a steroid app?" question as App Store review) is now **on the
critical path to any public connector launch**, rather than something we could sidestep
with a custom-connector-only release. The custom connector is demoted from
distribution-hedge to test harness. The `market_category` posture gates are the defense;
readiness for that review gates Phase 2. If a directory rejects, the custom-connector path
still exists as a fallback, but it is no longer the plan of record.

## Risks, honestly

- **Platform review of a peptide app.** The same "is this a steroid app?" scrutiny from
  App Store review applies to OpenAI's and Anthropic's directory reviews. The
  market_category gates are the defense; the Claude *custom* connector path (no review)
  is the hedge that guarantees beta users get value regardless of review outcomes.
- **Health-data sensitivity.** Users routing grey-market compound logs through OpenAI is
  a real privacy consideration; consented connection + explicit privacy copy + text-only
  scope is the mitigation. Photos never.
- **Young SDKs.** The Apps SDK and connector directory processes are under a year old
  and shifting; re-verify docs at build time (developers.openai.com/apps-sdk,
  support.claude.com custom-connector guide).
- **Freshness illusion.** Read tools reflect the last app-open. Tool descriptions must
  say so, or the assistant will confidently report stale data.

## Decisions (2026-07-14)
- **Placement:** post-beta (Polish tier).
- **v1 scope:** two-way (reads + writes); the inbox is on the launch critical path.
- **Distribution:** straight at both directories; custom connector is the test harness +
  rejection fallback, not the primary channel.
