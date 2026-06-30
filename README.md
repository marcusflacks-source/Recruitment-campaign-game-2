# cast for the catch

A skill-and-timing fishing mini-game for the **betterhomes** recruitment game hub.
Campaign: _Trust better. Get better._

The brand logic — _every home has a buyer, we know where to find yours_ — flips to
**_every broker has a ceiling, we know how to break it._** The player casts for
opportunity: every successful catch is a "better" (better earnings, better
training, better growth, better progression, better opportunities) and surfaces
one real proof fact. The rarest catch is **an interview fast-track**, which opens
the lead-capture form with the reward pre-attached.

Lead generation for broker recruitment is the point of the build.

---

## What this is (and isn't)

This package is **one game module**. It plugs into the existing hub at
`/careers/play` and **reuses** the hub's shared services — leaderboard, auth,
lead-capture/consent, analytics and the OG card service. It does **not** rebuild
them, and adding it required **no change** to any shared service.

The module depends only on the service _interfaces_ (`src/hub/types.ts`); the hub
injects the concrete implementations at init. For standalone play during
development, `src/dev/` provides local mocks of those services — the module never
imports them.

```
hub (/careers/play)
  └─ registers manifest (src/index.ts)
        └─ creates GameModule (src/game/module.ts)
              ├─ engine  (cast → reel → bite → combo)   src/game/engine.ts
              ├─ render  (canvas, brand visuals)        src/game/render.ts
              ├─ content (marketing-editable catches)   src/content/
              ├─ lead form + end screen (DOM overlays)  src/game/ui/
              └─ talks to injected shared services      src/hub/types.ts
server (additive, game-specific):
  ├─ api/validate-run.ts   anti-cheat hook the shared leaderboard calls
  └─ api/og/card.ts        branded OG score card
```

---

## How it plugs into the hub

The hub discovers a module through a **manifest** (the default export of
`src/index.ts`):

```ts
import castForTheCatch from '@betterhomes/cast-for-the-catch';

hub.register(castForTheCatch); // { id, title, slug, orientation, create, contentConfig }
```

When the player opens the game the hub:

1. calls `const game = manifest.create()`
2. `await game.init(context)` — passes a `HubContext`: the mount `container`, the
   player `identity`, the shared services (`leaderboard`, `leads`, `auth`,
   `analytics`, `og`) and the parsed `params` from `/careers/play`
   (`?code=`, `?target=`, `?challenge=`).
3. `await game.start()` — begins a run.
4. `game.onScore(cb)` — receives a `ScoreReport` when a run ends.
5. `game.teardown()` — releases the canvas, RAF loop and listeners.

This is the full module contract (`GameModule` in `src/hub/types.ts`):
`init`, `start`, `onScore`, `teardown`.

### Build

```bash
npm install
npm run dev          # play locally at http://localhost:5173 (dev hub host + mock services)
npm run build:lib    # emits dist/cast-for-the-catch.js — the ES module the hub imports
npm run typecheck
npm test             # anti-cheat + scoring + content validation
```

The shipped module bundle is ~11 kB gzipped (Canvas, no Phaser) so it loads in
well under 3 s on 4G. Portrait, mobile-first, no install.

### Query params the hub forwards

| Param        | Effect                                                             |
| ------------ | ----------------------------------------------------------------- |
| `?code=`     | Physical-puzzle recipient — linked to their profile as referral.  |
| `?target=`   | Head-to-head challenge: the score to beat (shown on the end card). |
| `?challenge=`| Challenge id, echoed to the leaderboard submission.               |

---

## Catch content (marketing-editable, no code change)

All catches live in **`src/content/catches.config.json`**. Marketing can edit
proof facts, tune values, and add catches without touching code. The file is
validated at load (`src/content/catches.ts`) so a typo fails loudly in CI, and an
editor-facing JSON Schema lives at `src/content/catches.schema.json`.

### Schema

```jsonc
{
  "version": 3,                       // bump on meaningful change (cache-busting)
  "gameId": "cast-for-the-catch",
  "catches": [
    {
      "id": "better-progression",     // stable; used in telemetry/analytics — don't rename casually
      "label": "better progression",  // the "better" shown to the player; sentence case, ≤40 chars
      "rarity": "epic",               // common | uncommon | rare | epic | legendary
      "baseValue": 360,               // points before combo + timing bonus (1..5000)
      "proofFact": "Clear paths from broker to team lead to partner — promotion here is a plan, not a maybe.",
      "optionalReward": {             // optional
        "type": "interview-fast-track",
        "label": "Interview fast-track",
        "triggersLeadCapture": true,  // landing this catch opens the lead form, reward pre-attached
        "ctaLabel": "Claim your fast-track"
      }
    }
  ]
}
```

Rules enforced at load:

- `id` — lowercase letters, digits, hyphens; unique.
- `label` — 1–40 chars, sentence case (ALL CAPS rejected — brand tone).
- `rarity` — one of the five tiers; rarer = less likely to appear **and** harder
  to land (a tighter cast is required) **and** worth more.
- `baseValue` — 1–5000.
- `proofFact` — 1–160 chars. Keep it short, sentence case, on-brand (intelligent,
  witty, confident).
- The catch whose reward has `triggersLeadCapture: true` is the **fast-track**;
  by convention it is the single rarest (`legendary`) catch.

To add a catch: append an object to `catches` and bump `version`. That's it.

---

## Scoring & difficulty tuning

`Score = Σ (catch baseValue × combo multiplier × timing bonus)` over landed
catches. The model is one file — **`src/shared/scoreModel.ts`** — used by **both**
the client and the server validator, so the two never disagree.

| Knob                          | File                       | Meaning                                                            |
| ----------------------------- | -------------------------- | ------------------------------------------------------------------ |
| `comboStep`, `maxCombo`       | `src/shared/scoreModel.ts` | Combo grows `+comboStep` per consecutive catch, capped at `maxCombo`. Resets on any miss. |
| `maxTimingBonus`              | `src/shared/scoreModel.ts` | A perfect cast multiplies up to this; a loose cast → 1.0.          |
| `minCastAccuracy`             | `src/shared/scoreModel.ts` | Below this, a cast lands nothing.                                  |
| `RARITY_DIFFICULTY`           | `src/content/catches.ts`   | Min cast accuracy to land each rarity (rarer = tighter).          |
| `RARITY_WEIGHT`               | `src/content/catches.ts`   | Relative drop weight per rarity.                                   |
| `baseSweepMs` → `minSweepMs`  | `src/game/difficulty.ts`   | Casting meter sweep period at score 0 → hardest. Faster as score rises. |
| `baseBiteMs` → `minBiteMs`    | `src/game/difficulty.ts`   | Bite reaction window at score 0 → tightest. Shorter as score rises. |
| `rampScale`                   | `src/game/difficulty.ts`   | Score at which difficulty is ~63% of the way to its hardest.       |
| `runMs`                       | `src/game/engine.ts`       | Run length (spec: 45–90 s; default 75 s).                          |

Difficulty ramps are pure functions of the live score, so tuning is deterministic
and testable.

---

## Leaderboards, streaks & sharing (shared service)

Scores submit to the shared boards via `LeaderboardService.submit()`:

- **Global** (all-time), **Weekly** (the shared service auto-resets Mon 00:00 GST)
  and optional **Office-vs-office** (when the player picks an office).
- **Catch of the week** — the single biggest weekly haul; the submit result flags
  it (`catchOfTheWeek`).
- **Head-to-head** — `og.buildShareUrl()` produces a shareable link; recipients
  load the game with `?target=` and the end card shows beat / not-beat.
- **Daily streak** + **seasonal reset** are owned by the shared service
  (`getStreakBonus`).

## Lead capture (the point of the build)

Anyone plays anonymously. To **save a score** to a board, or to **claim the
interview fast-track**, the one-step opt-in form collects name, email and/or
WhatsApp, and a segment (`new` / `returning` / `experienced` / `relocating`
broker) with an explicit consent checkbox. On submit the module calls
`LeadCaptureService.capture()`, which (in the hub) writes the lead **and** POSTs
the shared CRM webhook with the segment tag, source/referral code (`?code=`) and
which catch was claimed. PDPL/GDPR-aligned storage and data deletion are owned by
that shared service (`requestDeletion`).

The form (`src/game/ui/leadForm.ts`) only collects and validates — it never owns
persistence.

---

## Anti-cheat

Client scores are **never trusted**. Each run records minimal telemetry
(`src/game/telemetry.ts`): per-catch cast accuracy, bite hit, combo and timing.
On submission the shared leaderboard routes the telemetry (by `gameId`) to this
game's validator, **`api/validate-run.ts`** → `api/_lib/validateRun.ts`, which:

- replays the run through the **same** `scoreModel.ts` the client used and records
  **its own** recomputed score — never the client-reported one;
- recomputes the combo streak server-side (a forged combo is flagged);
- rejects physically impossible runs: too many catches for the elapsed time,
  out-of-order or out-of-range timestamps, a cast too loose for the rarity
  claimed, a "catch" with no bite, unknown catch ids, implausible run duration;
- rate-limits submissions (per-instance backstop; the authoritative limiter is the
  shared managed store).

`npm test` includes the tamper cases (inflated score, loose-cast legendary, missed
bite, event flooding, non-monotonic time, forged combo).

This validator is **additive and game-specific** — it is the hook the shared
service calls, not a change to the shared service.

---

## Analytics

Every event is emitted through the shared `AnalyticsService` and tagged with the
audience segment (`src/analytics/events.ts`):

`play_start`, `cast`, `catch_landed` (with `catchId`), `play_end`, `score_saved`,
`reward_claimed`, `lead_captured`, `share_clicked`.

---

## Sharing / OG cards

`api/og/card.ts` server-renders a branded "catch of the week / beat my catch" SVG
score card (player haul, top catch, the betterhomes mark, Salmon diamond CTA).
The hub's `OgCardService.buildShareUrl()` points share links' `og:image` at it, so
unfurls render the haul. Deterministic and edge-cacheable.

---

## Brand notes

Name is always lowercase **betterhomes**. Palette: Slate `#1F343F`, Denim
`#2C537A`, Powder `#7BA0B2`, Sand `#D9B9A0`, Mist `#EDE8E4`; **Salmon `#FF787A`
for CTA buttons only** (rendered as diamonds). Headlines Georgia/Ivy Mode, body
Segoe UI/Ivy Epic. Sentence case, no ALL CAPS body copy, no exclamation-heavy
copy. Water/coast visuals in the warm Sand/Slate range. Tokens in
`src/brand/theme.ts`.

---

## Layout

```
src/
  index.ts              module manifest + factory (hub entry point)
  hub/types.ts          GameModule + shared-service contracts (the integration surface)
  hub/registry.ts       manifest shape + registerModule()
  game/module.ts        GameModule implementation — wires everything
  game/engine.ts        cast → reel → bite → combo state machine (headless-testable)
  game/render.ts        canvas renderer (brand visuals)
  game/difficulty.ts    sweep-speed / bite-window ramps
  game/catchPool.ts     accuracy-gated weighted catch selection
  game/telemetry.ts     anti-cheat run recorder
  game/rng.ts           seedable PRNG
  game/ui/leadForm.ts   one-step opt-in form (calls shared lead service)
  game/ui/endScreen.ts  haul, save, share, play-again, head-to-head result
  shared/scoreModel.ts  scoring — shared by client AND server validator
  content/              marketing-editable catch config + schema + loader
  analytics/events.ts   typed analytics wrapper (segment-tagged)
  brand/theme.ts        palette, fonts, copy rules
  dev/                  dev hub host + mock shared services (dev only)
api/
  validate-run.ts       anti-cheat endpoint (the hook the shared leaderboard calls)
  _lib/validateRun.ts   pure validator (unit-tested)
  og/card.ts            branded OG score card
tests/                  validateRun, scoreModel, catches
```
