# wegetfound Findability Score — Methodology Reference

**Methodology version:** v1.1  
**Source of truth:** `packages/scoring/src/score.ts`, `packages/shared/src/engines.ts`, `packages/db/src/score-business.ts`  
**Last verified against code:** 2026-05-29

---

## 1. What the Findability Score Measures

The Findability Score is a single integer (0–100) that measures how visible a local business is across five major AI answer engines: ChatGPT, Perplexity, Claude, Gemini, and Google AI Overviews. The score is derived from real query results — the system sends prompts to each engine, checks whether the engine names the business in its response, and combines the inclusion rates into a weighted composite. Signal multipliers then adjust the score upward (when on-site and directory signals are healthy) or downward (when there is a major business-info mismatch). The result is a proprietary composite, not a raw output from any single engine.

---

## 2. The Score in One Sentence

The Findability Score tells you what percentage of the time AI search engines name your business when a potential customer asks them a relevant question.

---

## 3. Inputs

### 3.1 Engines and Weights

Five engines are queried on every audit. Weights are defined in `packages/shared/src/engines.ts` and must sum to 1.0.

| Engine | `engineId` | Display Name | Weight |
|---|---|---|---|
| ChatGPT | `chatgpt` | ChatGPT | **0.25** |
| Perplexity | `perplexity` | Perplexity | **0.20** |
| Claude | `claude` | Claude | **0.15** |
| Gemini | `gemini` | Gemini | **0.20** |
| Google AI Overviews | `google_aio` | Google AI Overviews | **0.20** |

### 3.2 Prompts

Each engine is queried once per active tracked prompt for the business. Tracked prompts are stored in the `tracked_prompts` table and managed by the user. If no prompts exist when an audit runs, `buildDefaultPrompts` in `packages/db/src/score-business.ts` auto-seeds up to 3 prompts from business data:

1. **Category + location** — `"Best {shortCategory} in {city}, {country}"`. If no category is present and a city is known, falls back to `"{name} in {city}, {country}"`. The category string is trimmed at the first comma or `&` to avoid overly long phrases.
2. **Brand + city** — `"{name} {city}"` (word-of-mouth / returning-customer query). Added only when `city` is known.
3. **Universal brand review** — `"{name} reviews"`. Always added.

Duplicates are removed and the list is capped at 3. Geography context (city + country, if available) is appended to prompts at query time: `"{prompt} (near {city}, {country})"`.

### 3.3 Signal Inputs

Four continuous signals (each normalized 0–1) and one boolean flag are collected by the on-site audit (`auditBusiness` in `packages/audit`) and passed to the scoring engine. Their definitions are in `packages/scoring/src/types.ts`:

| Signal | Type | Max multiplier contribution |
|---|---|---|
| `schemaCompleteness` | 0–1 | +0.10 |
| `napConsistency` | 0–1 | +0.10 |
| `reviewHealth` | 0–1 | +0.05 |
| `crawlerAccessibility` | 0–1 | +0.05 |
| `hasMajorNapMismatch` | boolean | ×0.5 hard penalty |

---

## 4. How a Single Engine Result Becomes a Signal

All five adapters delegate to the shared `detectMention` function in `packages/ai-adapters/src/detect.ts`.

**Detection logic (v1):** After the engine's raw response is parsed into a `ParsedResponse` (`{ text: string, citations: Citation[] }`), `detectMention` lower-cases both the response text and the business name (plus any aliases), then checks whether any name string appears as a substring of the response text. Result: `{ mentioned: boolean, competitors: [] }`.

The per-prompt result (engine ID, `businessMentioned`, `competitorsMentioned`, raw response, and a cache key) is written to the `prompt_results` table immediately after detection.

**Citation extraction** is handled per-adapter. The ChatGPT adapter, for example, pulls `url_citation` annotations from the Responses API output. Extracted citations are stored as part of the parsed response but are not currently used in the score formula (see Known Gaps).

---

## 5. The Math

All scoring logic lives in `packages/scoring/src/score.ts`. The three functions execute in sequence:

### Step 1 — Per-engine inclusion score

```
inclusionScore(promptsTested, promptsWinning) = round((promptsWinning / promptsTested) × 100)
```

Returns 0 if `promptsTested` is 0. Result is an integer 0–100 representing the percentage of prompts on which the engine named the business.

If an engine errored during the audit (missing API key, quota, region block), its `engineScore` is set to `0` and its stored column is `null`. The engine does not count toward `promptsTested`.

### Step 2 — Weighted engine base

```
weightedBase = Σ (clamp(engineScore, 0, 100) × weight)  over LIVE engines
               ────────────────────────────────────────────────────────
                          Σ (weight)  over LIVE engines
```

A "live" engine is one that was actually queried during the audit (had a working
API key and did not error). Dead engines — no key, quota exhausted, region block —
are excluded from both the numerator and the denominator.

Because the five engine weights sum to 1.0, when **all** engines are live the
denominator is 1.0 and this reduces to a plain weighted sum: a perfect 100 on all
engines produces `weightedBase = 100`.

**Why re-normalize (v1.1).** Before v1.1 the denominator was fixed at 1.0, so a
dead engine silently consumed its weight share and capped the maximum achievable
score. Example: with only Claude (0.15) + Gemini (0.20) + Google AIO (0.20) live,
a business mentioned everywhere it could be still maxed out at ~55. Re-normalizing
over live weights means a business is scored on the engines it could actually be
found in, not penalized for engines the operator hasn't enabled.

### Step 3 — Signal multiplier

Each continuous signal contributes an additive delta capped at its maximum:

```
bonus = (schemaCompleteness × 0.10)
      + (napConsistency    × 0.10)
      + (reviewHealth      × 0.05)
      + (crawlerAccessibility × 0.05)
```

Maximum possible bonus = 0.30 (all signals at 1.0).

The penalty factor is applied multiplicatively:

```
penaltyFactor = 0.5   if hasMajorNapMismatch = true
penaltyFactor = 1.0   otherwise
```

The raw multiplier is assembled and then clamped to [0.5, 1.2]:

```
rawMultiplier = (1 + bonus) × penaltyFactor
multiplier    = clamp(rawMultiplier, 0.5, 1.2)
```

### Step 4 — Final score

```
overallScore = round(clamp(weightedBase × multiplier, 0, 100))
```

**In one line:**

```
overallScore = round(clamp( Σ(engineScore_i × weight_i) × clamp((1 + bonus) × penaltyFactor, 0.5, 1.2), 0, 100 ))
```

### Worked examples from the test suite (`score.test.ts`)

**All engines 100, no signals (neutral baseline):**
- `weightedBase = 100`
- `bonus = 0`, `penaltyFactor = 1`, `multiplier = 1.0`
- `overallScore = 100`

**All engines 100, all signals maxed:**
- `weightedBase = 100`
- `bonus = 0.30`, `rawMultiplier = 1.30`, `multiplier = clamp(1.30, 0.5, 1.2) = 1.2`
- `overallScore = clamp(100 × 1.2, 0, 100) = 100` (clamped at ceiling)

**All engines 100, major NAP mismatch:**
- `weightedBase = 100`
- `bonus = 0`, `rawMultiplier = 1.0 × 0.5 = 0.5`, `multiplier = 0.5`
- `overallScore = round(100 × 0.5) = 50`

**All engines 0, no signals:**
- `weightedBase = 0`
- `overallScore = 0`

---

## 6. Methodology Version

```typescript
export const METHODOLOGY_VERSION = 'v1.1';  // packages/scoring/src/score.ts
```

Every score row stores its `methodology_version`. When the formula changes, the constant is bumped (e.g. to `v1.1`). This means:

- Historical scores remain trustworthy — they are not retroactively recalculated.
- Score trends can only be compared within the same version.
- The cache key includes the methodology version (`{engineId}:{METHODOLOGY_VERSION}:{promptId}`), so a formula bump automatically invalidates cached results and forces fresh queries.

---

## 7. What Gets Stored

Schema defined in `packages/db/src/schema/scoring.ts`, table `findability_scores`. The table is append-only (never updated, never deleted). Columns:

| Column | Type | Description |
|---|---|---|
| `id` | uuid | Primary key |
| `business_id` | uuid | FK to `businesses` |
| `methodology_version` | text | e.g. `'v1.1'` |
| `overall_score` | integer | 0–100, the headline score |
| `chatgpt_score` | integer (nullable) | Per-engine score; null if engine was dead |
| `perplexity_score` | integer (nullable) | " |
| `claude_score` | integer (nullable) | " |
| `gemini_score` | integer (nullable) | " |
| `google_aio_score` | integer (nullable) | " |
| `prompts_tested` | integer | Total prompt×engine queries run |
| `prompts_winning` | integer | Total queries where the business was named |
| `signals` | jsonb | Full `audit.signals`, the `ScoreBreakdown`, and `audit.findings` — used for debugging and explainability |
| `calculated_at` | timestamptz | When the row was written |

Index: `idx_scores_business_calculated` on `(business_id, calculated_at DESC)` — used for fast latest-score lookups.

---

## 8. Worked Example

**Business:** Pai Off Grid Solar — Pai, Thailand  
**Active tracked prompts:** 2  
1. "Best solar installation in Pai, Thailand"  
2. "Pai Off Grid reviews"

**Audit run:**

| Prompt | ChatGPT | Perplexity | Claude | Gemini | Google AIO |
|---|---|---|---|---|---|
| Best solar installation in Pai, Thailand | ✗ | ✓ | ✗ | ✓ | ✗ |
| Pai Off Grid reviews | ✗ | ✓ | ✓ | ✗ | ✗ |

**Per-engine inclusion scores:**

| Engine | Tested | Winning | inclusionScore |
|---|---|---|---|
| chatgpt | 2 | 0 | 0 |
| perplexity | 2 | 2 | 100 |
| claude | 2 | 1 | 50 |
| gemini | 2 | 1 | 50 |
| google_aio | 2 | 0 | 0 |

**Weighted base:**

```
weightedBase = (0 × 0.25) + (100 × 0.20) + (50 × 0.15) + (50 × 0.20) + (0 × 0.20)
             = 0 + 20 + 7.5 + 10 + 0
             = 37.5
```

**On-site signals (hypothetical):**

```
schemaCompleteness    = 0.5   → delta = 0.5 × 0.10 = 0.05
napConsistency        = 0.8   → delta = 0.8 × 0.10 = 0.08
reviewHealth          = 0.4   → delta = 0.4 × 0.05 = 0.02
crawlerAccessibility  = 0.6   → delta = 0.6 × 0.05 = 0.03
hasMajorNapMismatch   = false

bonus = 0.05 + 0.08 + 0.02 + 0.03 = 0.18
rawMultiplier = (1 + 0.18) × 1.0 = 1.18
multiplier = clamp(1.18, 0.5, 1.2) = 1.18
```

**Final score:**

```
overallScore = round(clamp(37.5 × 1.18, 0, 100))
             = round(44.25)
             = 44
```

---

## 9. Known Gaps and TODOs

The following gaps are evident from the code as of v1.1. They are noted in code comments or reflect v1-simplified behavior.

1. **Competitor extraction is not implemented.** `detectMention` in `packages/ai-adapters/src/detect.ts` always returns `competitors: []`. The code comment states competitor extraction is "intentionally left to a later pass (NLP)." The `competitors_mentioned` column is stored as an empty array on every row.

2. **Citation signals are not used in scoring.** Citations are extracted and stored by adapters (e.g. the ChatGPT adapter parses `url_citation` annotations), but citation data does not feed into any signal or multiplier in the current formula.

3. **Signal values are computed by an external audit package.** `auditBusiness` in `packages/audit` is called in the orchestration layer (`score-business.ts`) but is not part of the `packages/scoring` package. How `schemaCompleteness`, `napConsistency`, `reviewHealth`, and `crawlerAccessibility` are measured is defined elsewhere and not covered in this document.

4. **Google AI Overviews adapter.** The `GoogleAioAdapter` is registered and queried, but production data quality depends on whether the underlying SerpAPI or headless browser approach is reliable. Refer to the adapter documentation for its specific implementation status.

5. **Default prompts are generic.** `buildDefaultPrompts` generates category + city, brand + city, and brand reviews queries. These are low-specificity for v1. Vertical-specific prompt templates are planned for v2 (see CLAUDE.md §4, "Vertical Packages").

6. **Dead-engine scoring — FIXED in v1.1.** Previously, when an engine failed (no API key, quota, region block) its score was set to `0` in the `engineScores` map, and because `weightedBase` summed over all five fixed weights, the dead engine silently capped the maximum achievable score. As of v1.1, `weightedEngineBase` and `computeFindabilityScore` accept a `liveEngines` list and re-normalize over only the engines that were actually queried (`score-business.ts` passes the `live` set it already tracks). The stored per-engine column remains `null` for dead/untested engines (distinguishing "not tested" from "tested and scored 0"); the difference is that dead engines no longer drag down the weighted base.
