# Recommendation System — Stress Test & Remediation Report

**Scope:** the Phase 10/11 recommendation pipeline in `apps/api/src/modules/recommendations/*`
(aggregation → context → analysis → candidates → feedback rules → prompt → LLM → merge → API).
**Method:** twelve realistic product scenarios, run through the real pipeline, asserted on what a
learner would read. Not a code-run check: every scenario was first probed to observe what the system
actually said, then judged against the product promise, then fixed and locked with a regression test.

**Baseline commit:** `49c51eb` (working tree already had two unrelated modifications: `package.json`
version and `audit/checklist.md`). No database, PostgreSQL or Docker exists in this environment, so
everything below is verified against the domain/engine/service/route layers with fake Prisma clients —
never against a live database.

---

## 1. Executive summary

**15 findings: 8 High · 5 Medium · 2 Low. 13 fixed with regression tests, 2 documented and deferred.**

The pipeline's *structure* was sound: context is aggregated, ability and practice are separate types,
the LLM is optional, malformed JSON is caught, and every failure lands on the deterministic candidates.
The defects were in the **rules that turn evidence into claims** — and in three cases the system said
something confidently false:

1. It reported a 62%-vocabulary account as *“Your study time is spread evenly”* (Scenario 1).
2. It told a learner who had never studied that their daily target was **at fault** —
   *“0 of the last 14 days met it. Try 10 min.”* (Scenario 10).
3. It produced, for a single plan, *“Adding 240 minutes per day would close the gap”* **and**
   *“240 minutes per day is not realistic”* in the same batch (Scenario 11).

It also failed to say anything useful in two of the most important cases: an IELTS exam four months
away produced **no exam-shaped advice at all** (Scenario 2), and a strong recorded writing level with a
collapsed practice schedule produced **nothing about writing** (Scenario 5) — because `overall` won the
comparison and because per-skill practice drop was computed but never read.

All eight High findings are fixed. The two deferred items are documented with a reason, not a shrug.

| Severity | Found | Fixed | Deferred |
| --- | --- | --- | --- |
| High | 8 | 8 | 0 |
| Medium | 5 | 5 | 0 |
| Low | 2 | 0 | 2 |
| **Total** | **15** | **13** | **2** |

---

## 2. How each scenario was evaluated

Every scenario ran the deterministic pipeline for real:

```
context (built from aggregated raw rows)
  → analyzeContext        (signals, ceiling, data-quality notes)
  → buildCandidates       (learner-facing wording)
  → applyFeedbackRules    (suppression / band lowering)
  → generateRecommendations (the full engine, including the LLM path where relevant)
```

Three standards were applied to the output, not to the code:

- **Grounded** — every number in the prose appears in `supportingData`, sourced from the learner's own
  record.
- **Calibrated** — confidence never exceeds what the evidence supports (`minConfidence` ceiling, LOW at
  ≤ 3 sessions).
- **Non-diagnostic** — practice is described as practice; ability only as a recorded assessment or exam
  result; no score, band or readiness prediction; no weakness verdict; no guarantee.

---

## 3. Defect register

Format: **severity · scenario · affected component · observed symptom · root cause · fix · regression
test.**

---

### R-1 — High — Scenario 1 — `SKILL_LOW_SHARE` / `SKILL_BALANCED` rules

**Affected component:** `recommendation.analysis.ts` → `analyzeContext`, balance block.

**Observed symptom.** With 620 min Vocabulary / 180 Grammar / 110 Reading / 90 Writing (62 / 18 / 11 / 9%),
the batch contained one BALANCE candidate titled *“Your study time is spread evenly”* whose text read
*“No skill takes more than 62% of your recorded time”*. A 70/10/10/10 split produced the same claim.
An account that had only ever studied Vocabulary produced **no balance observation at all**.

**Root cause.** Three independent mistakes combined:
1. `weakestShare.share < SKILL_SHARE_FLOOR` used an *absolute* 8% floor, so 9% counted as balanced.
2. `unbalanced` also required `studiedSkills.length >= 3`, so a single-skill account could never be
   reported as concentrated.
3. The `else if (studiedSkills.length >= 3)` branch treated **every case that was not skewed** as
   positive evidence of balance — including 70% dominance.

**Fix.** Dominance-first logic:
- `SKILL_LOW_SHARE` fires when the top share ≥ 45% **and** the least-practised relevant skill is below
  8% *or* at most half the top share (a relative floor, not an absolute one).
- The least-practised skill is now looked up across every **relevant** skill — including one named by a
  goal or plan but never timed — instead of only the ones with minutes.
- New `SKILL_CONCENTRATED` signal/candidate for dominance that has no defensible rebalance target
  (single-skill account, or the remaining skills are too close to single one out). It reports the split
  and explicitly does not grade the other skills.
- `SKILL_BALANCED` is emitted **only** when the top share is below the 45% ceiling.

**Regression tests** — `tests/recommendation-scenarios.test.ts`, Scenario 1:
`identifies the imbalance in minutes instead of calling it balance`,
`quotes both shares and never turns them into a weakness claim`,
`reports total concentration when only one skill was ever practised`,
`still says "evenly" when the split really is even`.

---

### R-2 — High — Scenario 5 — recorded ability comparison

**Affected component:** `recommendation.analysis.ts` → `analyzeContext`, `RECORDED_STRENGTH_UNPRACTISED` /
`RECORDED_LEVEL_LOWER`.

**Observed symptom.** A learner who recorded `overall C1` and `writing C1` from the same report — the
normal shape of an IELTS/TOEFL result — received **no ability-side observation about writing at all**,
even with a 12-day practice gap.

**Root cause.** `ranked` included the `overall` dimension, and `isHighest` required
`entry.dimension === highest.dimension`. When `overall` tied with `writing` at C1, `overall` won the
top slot; writing was neither `isHighest` nor `< highest.rank`, so it fell through both branches. The
same bug dropped every dimension tied for the top rank.

**Fix.** Rank only skill-mappable dimensions (`DIMENSION_SKILL_NAMES` excludes `overall`), compute the
top rank once, and treat **every** dimension at that rank as highest.

**Regression tests** — Scenario 5:
`recognises the highest recorded dimension when 'overall' ties with it`,
`treats every dimension tied for the top rank as highest`.

---

### R-3 — High — Scenario 5 — per-skill practice volume was dead data

**Affected component:** `recommendation.analysis.ts` (no rule) / `ContextSkill.recentMinutes`,
`priorMinutes`.

**Observed symptom.** Writing practice fell from 4 h 20 min to 15 min between two equal fortnights, with
a 12-day gap. The only output was *“Your study time is spread evenly”*. Nothing mentioned writing.

**Root cause.** The context has always carried per-skill `recentMinutes` and `priorMinutes`, but no rule
read them. The only per-skill practice rule was `lastPracticedDaysAgo >= 14`, so a learner who practises
a little but far less than before was invisible — exactly the case the product must distinguish
*practice frequency* from *ability* for.

**Fix.** New `SKILL_PRACTICE_DROPPED` signal and candidate: two equal windows, prior ≥ 60 min, recent
≤ 50% of prior. The wording quotes both windows and, when a level is on record, states it separately and
explicitly unchanged — *“Your recorded writing level is C1; that recording has not changed.”* Priority 54
puts it ahead of the plain recency gap for the same skill, and the existing per-skill de-duplication keeps
one candidate.

**Regression tests** — Scenario 5:
`separates practice frequency from recorded ability in one observation`,
`supports the claim with both kinds of evidence, labelled by source`,
`does not repeat the same skill as both a drop and a recency gap`.

---

### R-4 — High — Scenarios 2 and 3 — no exam-shaped advice beyond 60 days

**Affected component:** `recommendation.analysis.ts` exam block + `recommendation.candidates.ts`.

**Observed symptom.**
- IELTS in 120 days, with a plan and a recorded assessment → only *“Your study time is spread evenly”*.
- IELTS in 75 days with **no score at all** → no request to record a baseline; only the generic balance
  note.
- IELTS in 400 days → correctly silent (a design choice worth keeping).

**Root cause.** `UPCOMING_EXAM_DAYS = 60` was the only exam-date rule. Beyond it, the exam row was
ignored entirely. `ContextObjective.daysUntilTargetDate` was computed, passed into the LLM payload and
never reasoned about by any rule.

**Fix.** New `EXAM_HORIZON` signal for exams 61–180 days out:
- **ATTENTION** when no baseline exists (no recorded assessment **and** no result within 21 days) →
  candidate *“N days until your IELTS: record a baseline”*, which asks for one timed section and a
  recorded result.
- **INFO** when a baseline exists → *“keep the current pace”*, no alarm.
- Evidence includes the exam type, day count, the objective's target date and target score, the active
  plan's remaining days, and the baseline that is (or is not) on file.
- Also removed an ungrounded phrase from the on-track goal wording (*“revisit it when the exam gets
  closer”*), which assumed an exam the account may not have.

**Regression tests** — Scenario 2:
`uses the exam date even beyond the 60-day countdown`,
`ties the exam date, the objective and the long-term plan together`,
`adds the recent-practice observation without turning it into readiness`,
`stays silent about an exam more than six months away`; Scenario 3:
`keeps the missing-score request when the exam is closer than the horizon`.

---

### R-5 — High — Scenarios 4 and 10 — calibration verdicts from no attempts

**Affected component:** `recommendation.context.ts` (`trackedDays`) + `recommendation.analysis.ts`
(`MISSED_GOALS` gate).

**Observed symptom.**
- Zero sessions, one 60-minute daily goal → *“Your daily goal is 1 h and 0 of the last 14 days met it.
  Try 10 min for two weeks.”*
- Three sessions, two active days → *“Your daily goal is 30 min and 0 of the last 14 days met it.
  Try 5 min.”*

Both are false in the same way: they treat **absence** as evidence about the **size of the target**.

**Root cause.** Two independent over-claims:
1. `trackedDays` was hardcoded to `recent.days` (14). A goal created today was judged against fourteen
   days of history it never had.
2. `MISSED_GOALS` was gated only on `rate < 50`; nothing required the learner to have actually studied
   often enough to test the target.

**Fix.**
- `trackedDays` is now bounded by the daily goal's own start day
  (`min(14, whole days since the start day + 1)`), and `daysMeetingTarget` is counted over the same window.
- `MISSED_GOALS` and `GOALS_ON_TRACK` require `recent.activeDays >= 7`. Below that, the analysis emits a
  **note** instead of a verdict — *“You studied on 2 of the last 14 days. That is too few attempts to say
  whether the daily target is the right size.”* — and the consistency signals carry the advice.

**Regression tests** — Scenario 4: `does not conclude that the daily target is too large`; Scenario 10:
`shows a transparent low-data state instead of a finding`,
`does not judge the goal that was never attempted`,
`bounds the judged window by the goal's own start date`.

---

### R-6 — High — Scenario 7 — goals from another objective drove current advice

**Affected component:** `recommendation.context.ts` → `buildRecommendationContext`, goal scoping.

**Observed symptom.** After switching IELTS → TOEFL with one daily goal per objective:
- the advice used the **IELTS** goal (*“Your daily goal is 1 h … Try 15 min”*) while the active objective
  was TOEFL;
- it reported *“Two daily targets are active at once (1 h / 1 h 30 min)”* — two goals for two different
  objectives, which is not a conflict;
- the TOEFL goal was ignored entirely.

**Root cause.** `ContextGoal.objectiveId` existed and was populated, but no rule or builder read it. The
goal list, goal completion and conflict detection all treated every active goal as belonging to the
current focus.

**Fix.** `buildRecommendationContext` scopes goals to the active objective (`objectiveId === null` goals
stay in scope; goals for a different objective are excluded). Goal completion, skill targets, conflict
detection and the LLM payload all follow the same scoped list. With no active objective there is no focus
to compare against, so every goal stays — documented in the code.

**Regression tests** — Scenario 7:
`drops goals that belong to the objective the learner moved away from`,
`does not report two objectives' targets as one conflict`,
`recommends in TOEFL terms and never mentions the retired IELTS exam`,
`speaks about the new objective's own daily target`,
`adapts back when the objective switches again`.

---

### R-7 — High — Scenario 6 — a rejection was forgotten when the objective changed; “not seen” silenced forever

**Affected component:** `recommendation.candidates.ts` → `applyFeedbackRules`, `REJECTION_ACTIONS`.

**Observed symptom.**
- Two rejections of a listening recommendation stopped suppressing it as soon as **any** objective was
  set — an unrelated action retracted the learner's explicit “no”.
- Two rows with action `IGNORED` — labelled *“Not seen”* in the UI — suppressed the same observation
  permanently.

**Root cause.** The feedback match required `(entry.objectiveId ?? null) === currentObjectiveId`, so
changing the objective invalidated every prior decision. `REJECTION_ACTIONS` included `IGNORED`, an action
the learner never took.

**Fix.**
- Match on `evidenceKey` alone. The key already contains the coarse evidence fingerprint; exam signals
  additionally carry the exam type (and the exam id on result signals), so a genuine objective change that
alters the facts still produces a new key.
- Only `REJECTED` counts as a rejection. `IGNORED` is neutral, with the reason recorded in the code.

**Regression tests** — Scenario 6:
`stops repeating after two rejections of the same evidence`,
`keeps the rejection after the learner adds an objective`,
`does not treat "not seen" as a rejection`,
`honours a postponement only until its window closes`,
`lets the observation back when the evidence itself moved`.

---

### R-8 — High — Scenario 11 — one plan, two contradictory recommendations, one promise

**Affected component:** `recommendation.analysis.ts` plan block + `recommendation.candidates.ts`
(`PLAN_BEHIND`, `PLAN_UNREALISTIC_PACE`, candidate de-duplication).

**Observed symptom.** For a plan with 20 days left and 20% of its target complete, the batch contained:
1. *“Study progress is 20% against 75% … **Adding 240 minutes per day would close the gap**”*
2. *“Hitting the plan target would need 240 minutes per day … **above the 180 minutes a day this engine
   treats as sustainable**”*

The first is a guarantee; the two together are mutually exclusive instructions. The same path, for a plan
that had already ended, divided the outstanding minutes by a one-day floor — printing an unactionable number
instead of saying that the plan's end date had passed.

**Root cause.** `PLAN_BEHIND` fired on `paceStatus === 'behind'` alone, with no check on whether the
required pace was achievable and no check that days remained. Nothing de-duplicated candidates by plan.

**Fix.**
- `PLAN_BEHIND` only when the required pace is ≤ 180 min/day **and** `remainingDays > 0`.
- Above that threshold, `PLAN_UNREALISTIC_PACE` is the single plan observation, and it now states study
  progress, elapsed calendar time, remaining days and the required pace.
- Wording changed from *“would close the gap”* to *“needs about N minutes a day”*, with the rationale
  saying explicitly that neither option is applied and no outcome is promised.
- `buildCandidates` de-duplicates by `relatedPlanId`, as it already did per skill.

**Regression tests** — Scenario 11:
`reports the numbers exactly once and never promises the outcome`,
`offers the arithmetic path when the required pace is sustainable`,
`stays silent when the plan has already run out of days`; updated
`tests/recommendation-domain.test.ts` → `offers two options, applies neither, and does not contradict itself`.

---

### R-9 — Medium — `POST /recommendations/generate` ignored `refresh` (API contract)

**Affected component:** `recommendation.routes.ts`, `recommendation.service.ts`,
`recommendation.repository.ts`.

**Observed symptom.** `GenerateRecommendationsSchema.refresh` is documented as *“`false` returns the
current unexpired batch instead of generating again”*. The route parsed the body and discarded it, so every
`refresh: false` call regenerated, spent a model call and **superseded the learner's open batch**.

**Root cause.** The parsed body was never passed to the service; the service had no replay path and the
repository had no “current batch” query.

**Fix.** `findOpenBatch` (status `NEW`, not expired) + a service branch that returns the open batch with
`llm.attempted = false`, a reason saying no generation ran, current data-quality figures and a note that
the batch was generated earlier. The route now forwards `refresh`.

**Regression tests** — `tests/recommendation-http.test.ts`:
`returns the open batch without generating when refresh is false`,
`generates a fresh batch when refresh is true or omitted`.

---

### R-10 — Medium — the proposed daily target ignored the minutes actually achieved

**Affected component:** `recommendation.candidates.ts` → `proposeLowerDailyTarget` + `MISSED_GOALS`.

**Observed symptom.** Fourteen days at 59 minutes against a 60-minute target is a 0% hit rate, so the
engine proposed **20 minutes** to a learner who was one minute short every day.

**Root cause.** The proposal was `target × hitRate`, using only the number of days that reached the
target. `context.activity.recent.minutes / activeDays` — the achieved daily amount — was available and
unused.

**Fix.** `ContextGoalCompletion.averageActiveDayMinutes` is now part of the context, and the proposal is
`max(rate-based, achieved)`, rounded to five minutes and capped strictly below the current target. The
wording quotes the achieved amount, so the learner can see the basis.

**Regression tests** — `tests/recommendation-scenarios.test.ts`, `the proposed daily target`:
`follows the minutes actually achieved, not only the hit rate`,
`still lowers a target the learner is nowhere near`,
`never proposes a block below five minutes`.

---

### R-11 — Medium — the reasoning guard accepted “weakest” and “weaker than”

**Affected component:** `recommendation.prompt.ts` → `findReasoningViolation`.

**Observed symptom.** A model document containing *“Your weakest skill is listening”* and *“Listening is
weaker than your writing”* passed the guard and would have been persisted as learner-facing advice.

**Root cause.** The ability patterns covered `weak|poor|bad|failing` as adjectives but not the comparative
and superlative forms, and not `below average`.

**Fix.** Two new rules: `weakest-skill` (`weakest|weaker than|weak spot|weak point`) and `ability-deficit`
(`below average`). The built-in wording is asserted against the same guard, so the fallback cannot become
the looser path.

**Regression tests** — Scenario 8: `rejects a valid document written by a model that diagnoses a weakness`;
cross-cutting: `rejects weakest/weaker claims the previous guard let through`.

---

### R-12 — Medium — the goal the engine would create could differ from the goal it printed

**Affected component:** `recommendation.candidates.ts` → `MISSED_GOALS.suggestedAction`.

**Observed symptom.** The recommendation said *“Try 5 min”* while `suggestedAction.targetMinutes` was
`Math.max(10, proposed)` = 10. A client that applied the action without overriding it created a goal the
learner had not agreed to.

**Root cause.** A defensive floor of 10 was applied at the action site but not in the displayed text or
`estimatedDurationMinutes`.

**Fix.** The action uses `proposed` (already floored at 5), so text, estimate and action agree.

**Regression test** — `the proposed daily target` → `matches the goal it creates to the target it printed`.

---

### R-13 — Medium — the dashboard timezone suite depended on the wall clock

**Affected component:** `tests/dashboard-timezone.test.ts` (test harness, not production code).

**Observed symptom.** The suite failed on the baseline run:
`expected +0 to be 30` — the identity test hardcoded `2026-10-16T10:00:00Z` as “today”. It passed only on
the day it was written. The yearly-bucketing test would have failed from 2027 onward for the same reason.

**Root cause.** Fixture instants were absolute dates while the service under test uses the real clock;
there is no injectable clock in these routes.

**Fix.** The “today” fixture is derived from the current UTC day; the yearly test derives its year from the
current New York day.

**Regression test** — the file itself now passes on any date (verified on 2026-10-22).

---

### R-14 — Low — objective target dates on non-exam objectives are unused

**Affected component:** `recommendation.analysis.ts` (objective block).

**Observed symptom.** An `IMMIGRATION`, `GENERAL_ENGLISH` or `CUSTOM` objective with a target date 120 days
out produces no deadline-shaped advice. IELTS/TOEFL are covered by `EXAM_HORIZON` / `EXAM_MISSING_FOR_OBJECTIVE`.

**Root cause.** Only `Exam` rows have a day-count rule; the objective's own `targetDate` is carried into the
context and the LLM payload but no deterministic rule reads it.

**Why deferred (product decision).** The right advice depends on the objective type (book the test? start
revision? confirm documents?), and a generic *“your date is near”* card would duplicate the countdown the
objectives UI already shows without adding evidence. Recommended next step: define the per-type action, not
just the signal.

---

### R-15 — Low — a recorded level has no staleness rule

**Affected component:** `recommendation.analysis.ts` (ability block) + `SKILL_PRACTICE_DROPPED` evidence.

**Observed symptom.** A three-year-old CEFR assessment is quoted as *“your recorded writing level”* with no
age in the sentence (the age is only in the `RECORDED_STRENGTH_UNPRACTISED` evidence row, not in the drop
candidate).

**Why deferred.** The statement is factually true and labelled as recorded; adding a staleness threshold
(e.g. ask for a re-assessment after 12 months) is a product rule that needs a decision on the window. Low
risk: nothing is inferred from the age either way.

---

## 4. Scenario verdicts

| # | Scenario | Verdict before | Verdict after | Evidence |
| --- | --- | --- | --- | --- |
| 1 | Vocabulary dominates | **Fail** — 62% reported as “spread evenly”; single-skill invisible | **Pass** — `SKILL_LOW_SHARE` names the 9% skill in minutes; `SKILL_CONCENTRATED` for single-skill; no weakness wording | Scenario 1 (4 tests) |
| 2 | IELTS in ~4 months | **Fail** — no exam advice at all beyond 60 days; objective date unused | **Pass** — horizon signal uses exam date + objective date + target score + plan days + baseline | Scenario 2 (4 tests) |
| 3 | No IELTS scores | **Pass** (no invention) / **Fail** (no baseline request) | **Pass** — no level/score/weakness; asks for one measured baseline | Scenario 3 (4 tests) |
| 4 | Three sessions | **Partial** — LOW everywhere ✓, but a calibration verdict from 0/14 | **Pass** — LOW ceiling, no target verdict, note explains why | Scenario 4 (3 tests) |
| 5 | Strong writing, low practice | **Fail** — nothing about writing (overall tie + no volume rule) | **Pass** — drop quoted in minutes, level quoted separately and unchanged | Scenario 5 (5 tests) |
| 6 | Repeated listening rejections | **Partial** — suppressed, but forgotten on objective change; IGNORED silenced forever | **Pass** — survives objective changes; IGNORED neutral; returns only on new evidence | Scenario 6 (5 tests) |
| 7 | IELTS → TOEFL | **Fail** — old goal drove advice; spurious goal conflict | **Pass** — goals/exams scoped to the active objective; back-switch works | Scenario 7 (5 tests) |
| 8 | Invalid JSON | **Pass** — every malformed shape rejected and fell back | **Pass**, hardened — 6 shapes + guard-violating document + partial document | Scenario 8 (9 tests) |
| 9 | Provider unavailable | **Pass** — typed failures, rule fallback, no throw | **Pass**, locked at the HTTP boundary (201 + rule-based body) | Scenario 9 (6 tests) + 1 HTTP test |
| 10 | Zero history | **Fail** — “Try 10 min” from zero sessions | **Pass** — one LOW data-request candidate, explicit notes, goal not judged | Scenario 10 (3 tests) |
| 11 | Plan 20 days / 20% | **Fail** — contradictory advice + “would close the gap” | **Pass** — one plan observation, exact numbers, no guarantee | Scenario 11 (3 tests) |
| 12 | Ahead of target | **Pass** — no “behind” claim | **Pass**, locked — no PLAN signals; completed plan not called unreachable | Scenario 12 (2 tests) |

---

## 5. Verification

All commands run from the repository root on Windows, Node 24.20.0, pnpm 9.15.9.

| Command | Result |
| --- | --- |
| `pnpm typecheck` | **4 successful, 4 total** (api, web, types ×2) |
| `pnpm lint` | **3 successful, 3 total** — API `eslint .` 0 errors 0 warnings; web “No ESLint warnings or errors” |
| `pnpm test` | **3 successful** — API **23 files / 473 tests**, web **11 files / 134 tests** |
| `pnpm build` | **3 successful** — Next.js production build, all routes prerendered, `/recommendations` 1.55 kB |
| Test-file typecheck (temporary `tsconfig.testcheck.json`, deleted) | The recommendation test files (and their fixture) plus `dashboard-timezone.test.ts` compile with `tsc` under the repo's strict config |

**Test counts.** Baseline: API 22 files / 407 tests (1 pre-existing failure), web 134. Final: API 23 files /
473 tests, web 134 — **+66 API tests**, all passing. The new `tests/recommendation-scenarios.test.ts` holds 63
of them; `recommendation-http.test.ts` gained 3.

**Test layers.**

- **Unit:** `recommendation-scenarios.test.ts` (analysis/candidates/guard, 63 tests),
  `recommendation-domain.test.ts` (31), the target-proposal block.
- **Integration:** `recommendation.test.ts` (engine + service with fake aggregation/repository, 38), and the
  scenario suite's full `buildRecommendationContext → analyzeContext → buildCandidates` runs.
- **API:** `recommendation-http.test.ts` (17, `app.inject` against the real routes with a fake Prisma client).
- **E2E/browser:** not performed (no browser pass in this environment).

**Baseline → final on the same machine:**

| | Baseline (`49c51eb`) | Final |
| --- | --- | --- |
| API tests | 407 (1 failed) | 473 (0 failed) |
| Web tests | 134 | 134 |
| Typecheck | pass | pass |
| Lint | pass (0 warnings) | pass (0 warnings) |
| Production build | pass | pass |

**Not verified (environment limit).** No PostgreSQL, no Docker: `prisma db push`, the seed, raw SQL
(`percentile_cont`, `date_trunc … AT TIME ZONE`), cascades and indexes were not executed. The recommendation
changes add no schema change and no new raw SQL; the aggregation contract (`RawGoal.startDate`) is already
selected by `listActiveGoals`.

---

## 6. Changes by file

| File | Change |
| --- | --- |
| `recommendation.analysis.ts` | balance rules (R-1), ability ranking (R-2), per-skill drop (R-3), exam horizon (R-4), goal attendance gate (R-5), plan exclusivity (R-8), new signal kinds and constants |
| `recommendation.candidates.ts` | `SKILL_CONCENTRATED`, `SKILL_PRACTICE_DROPPED`, `EXAM_HORIZON` builders; plan wording + per-plan de-dupe (R-8); achieved-minutes target (R-10) and action parity (R-12); feedback matching + `IGNORED` (R-7) |
| `recommendation.context.ts` | goal scoping (R-6), `startedOn` + bounded `trackedDays` (R-5), `averageActiveDayMinutes` (R-10) |
| `recommendation.aggregation.ts` | passes the goal `startDate` into the raw context |
| `recommendation.prompt.ts` | guard rules (R-11); `averageActiveDayMinutes` in the model payload |
| `recommendation.repository.ts` | `findOpenBatch` (R-9) |
| `recommendation.service.ts` | `refresh: false` replay path (R-9) |
| `recommendation.routes.ts` | forwards `refresh` (R-9) |
| `tests/recommendation-scenarios.test.ts` | **new** — the 12-scenario suite (63 tests) |
| `tests/recommendation-http.test.ts` | refresh contract + provider-outage HTTP tests, injectable adapter |
| `tests/recommendation-domain.test.ts` | plan test updated to the non-contradictory behaviour; raw goal gains `startDate` |
| `tests/recommendation-fixtures.ts` | `recentActiveDays`, `startedOn`, `averageActiveDayMinutes` |
| `tests/dashboard-timezone.test.ts` | wall-clock independence (R-13) |

---

## 7. Residual risks

1. **No live database.** See §5. The SQL paths the recommendation module relies on are exercised only through
   fakes that honour the documented shapes.
2. **The LLM path is only as good as its guard.** The guard is a regex list, not a classifier; R-11 closed the
   confirmed hole, but a novel phrasing can still pass. The structural guarantees (grounded `supportingData`,
   confidence clamping, candidate whitelist) do not depend on it.
3. **Evidence budget.** With a hard cap of 4 candidates, a genuinely crowded account surfaces only the four
   highest-priority observations. The rest are reported as `considered`/`suppressed` in the meta but not shown.
4. **`EXAM_HORIZON` treats any recorded assessment as a baseline**, however old (R-15). The date is in the
   evidence; the wording does not over-claim recency.
5. **Deferred by decision:** objective horizons for non-exam objectives (R-14), recorded-level staleness (R-15).
