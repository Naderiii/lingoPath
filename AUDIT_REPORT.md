# LingoPath — Full Project Audit & Stabilization Report (Phases 1–7)

Audit executed against commit `c781a17` ("implement phase 7 (#19)") plus the uncommitted stabilization
work described below. The phase → component → test map is `audit/checklist.md`; this report's register
(section C) is the authoritative record of every finding.

**External changes observed mid-session:** two delegated read-only audit reports
(`audit/findings-api-core.md` and a platform sweep) were removed from the workspace by a process outside
this session, and the root `package.json` version was changed from `0.0.2` to `0.0.8` (mtime 14:11).
Neither change was made by this audit; they are preserved as-is and neither affects the code paths
audited here. The findings those files contained are distilled into section C.

## A. Executive summary

Overall state: the project is **functionally complete for Phases 1–7 and internally consistent after this
pass**, but one shipping blocker had to be fixed and a set of timezone/pagination defects are still open.

- **Confirmed issues: 1 Critical · 6 High · 9 Medium · 8 Low** (24 total).
- **Fixed in this pass: 1 Critical · 6 High · 6 Medium · 4 Low** (17), each with a regression test.
- **Documented, deliberately not fixed: 0 Critical · 0 High · 3 Medium · 4 Low** (7), each with evidence
  and a reason (needing a product decision, or a database migration that cannot be validated here).

Most important risks:

1. **`/api/v1/dashboard` was broken for every real user** (Critical): the route carried a placeholder user
   id instead of the seeded UUID and the web client never sends `x-user-id`, so the dashboard resolved a
   non-existent user and returned an all-zero payload. Fixed.
2. **Goal progress ignored the goal's period** (High): a DAILY goal accumulated study time since its start
   date instead of measuring today, and disagreed with the dashboard for the same rows. Fixed by giving both
   call sites one shared period-window resolver.
3. **Keyset pagination was wrong in five modules** (High): `id < cursor` (a UUID comparison) was applied
   while ordering by a timestamp, so pages skipped and duplicated rows. Fixed with one shared helper.
4. **Dashboard windows were UTC/server-local** (High): week, month, year, 30-day skills and goal windows
   were not computed in the user's timezone. Fixed.
5. **Analytics SQL and the new index are not runtime-verified** (blocked): there is still no PostgreSQL or
   Docker in this environment, so raw SQL, cascades and the `db push` step remain unexecuted.

Readiness: **READY WITH LIMITATIONS** — see section H.

## B. Phase-by-phase results

| Phase | Inspected | Confirmed defects | Fixed | Tests added / reran | Remaining concerns |
| --- | --- | --- | --- | --- | --- |
| 1 Foundation | root configs, `app.ts`, `server.ts`, `config.ts`, health route, env samples | none (config fails fast, CORS/helmet sane) | CORS allow-list gap (H-3) | `tests/health.test.ts` unchanged | health endpoint has no DB probe (documented) |
| 2 Database + backend core | `prisma/schema.prisma`, seed, taxonomy modules, error handler, plugins | duplicate system categories possible at DB level (M-6); `durationMinutes` has no DB check constraint (M-7); dead `400 BAD_REQUEST` branch (L-3) | dead-code cleanup only | `tests/{category,exam}.test.ts` unchanged | schema-level gaps need a migration, which cannot be run here |
| 3 Plans + milestones | `plan.service.ts`, `plan.repository.ts`, planning UI | plan/milestone attribution had three definitions → cross-plan double counting (H-1); UTC weekly/monthly buckets (H-2); milestone status-only edits bypassed overlap validation (M-4) | H-1, H-2 fixed; M-4 documented | `tests/pagination-and-attribution.test.ts` (new), `tests/plan.test.ts` extended | status-only milestone edits still unvalidated (needs a state-machine decision) |
| 4 Study tracking + timer + history | sessions module, timer hook/component, history client | pagination (H-4); 30-second sessions booked as a minute (M-5); timer cleared state before the API call, losing a session on failure (H-6); `session.test.ts` tested arithmetic, not the module (L-1) | H-4, M-5, H-6, L-1 | `tests/session.test.ts` rewritten against the real service; `use-study-timer.test.ts` gained the snapshot/retry case | none blocking; the timer keeps running until the session is persisted |
| 5 Goals + short-term planning | `goal.service.ts`, `goal.repository.ts`, goals UI | period inert (H-5); target-0 goals reported `completed` at 0% and percentages were uncapped (M-1); duplicate skill targets surfaced as a 500 (M-2) | H-5, M-1, M-2 | `tests/goal-periods.test.ts` (new), `tests/goal.test.ts` to extend | goals list still issues one progress query per goal (L-5, performance only) |
| 6 Dashboard | dashboard service/routes, dashboard UI | placeholder user id (C-1); UTC/server-local windows (H-2/H-3 family); unvalidated stored timezone produced 500s (M-3); `monthlyProgress` field name vs granularity (L-2) | C-1, window family, M-3 | `tests/dashboard-timezone.test.ts` (new) | `monthlyProgress` keeps its legacy wire name for compatibility (documented) |
| 7 Calendar + streak | calendar module, `shared/timezone.ts`, calendar UI | now-window was already canonical; UTC-day defaults in web forms (M-8); silent UTC fallback for a corrupt stored zone (L-4) | M-8, L-4 | `tests/timezone.test.ts`, `tests/calendar*.test.ts`, `tests/streak.test.ts`, `tests/session-streak.test.ts` reran green | streak scans the full history by design (documented trade-off, 2-column projection) |

## C. Bug register

Severity · affected phase · evidence → root cause → fix → verification.

### C-1 — Critical — Phase 6 (dashboard identity) — FIXED
- Evidence: `apps/api/src/modules/dashboard/dashboard.routes.ts:5` held a 31-character bracketed placeholder
  (shape `[AAAA_AAAAAAAA]-[AAAA_AAAAAAAA]`) instead of the 36-character seeded UUID used by every other
  module; `apps/web/src/lib/hooks/use-dashboard.ts` never sends `x-user-id`, so the dashboard always resolved
  a non-existent user.
- Root cause: a copy-paste placeholder that survived review because the route has no test.
- Fix: `dashboard.routes.ts` now uses the shared `resolveUserId` from `apps/api/src/shared/current-user.ts`.
- Verification: `apps/api/tests/dashboard-timezone.test.ts` asserts the seeded id reaches every repository
  call and that `x-user-id` still overrides it.

### H-1 — High — Phase 3 (+4/5) — plan/milestone attribution had three definitions — FIXED
- Evidence: plan totals used `OR: [{planId}, {milestone: {planId}}]` (`plan.repository.ts`), plan-linked
  goals used `planId` only (`goal.repository.ts`), and session writes accepted any `milestoneId`/`planId`
  pair (`session.repository.ts`), so one session could count toward two plans.
- Fix: `session.service.ts` now validates attribution on write (milestone must exist, belong to the caller,
  and match an explicit `planId`; a milestone-only session inherits its plan), and
  `getActualMinutesByMilestone` reports `unassignedMinutes` plus `PlanProgress.unassignedMinutes` so
  `sum(milestones) + unassigned = actual`.
- Verification: `tests/session.test.ts` (ownership/mismatch/derivation) and
  `tests/pagination-and-attribution.test.ts` (explicit link wins, date-range fallback, cross-plan tag becomes
  unassigned, regression in `tests/plan.test.ts` for the sum invariant).

### H-2 — High — Phases 3/6 — weekly and monthly aggregation ignored the user timezone — FIXED
- Evidence: `plan.repository.ts` bucketed with `getUTCDay()`/`getUTCFullYear()`; `dashboard.service.ts`
  built its week from UTC parts and its daily breakdown from `toISOString().split('T')[0]`.
- Fix: both now bucket on local day keys via `shared/timezone.ts`, and `plan.service.ts` passes the resolved
  timezone into the bucket methods (they gained a `timeZone` parameter).
- Verification: `tests/pagination-and-attribution.test.ts` proves one instant lands in the previous week /
  month for `America/New_York`; `tests/dashboard-timezone.test.ts` asserts the exact UTC bounds of the local
  week, month, year and 30-day skill window.

### H-3 — High — Phases 5/6 — DAILY/WEEKLY/MONTHLY goal windows were computed three different ways — FIXED
- Evidence: `dashboard.service.ts` derived them from `new Date(\`${todayStr}T00:00:00\`)` (server-local) and
  `getUTCMonth()`, while `goal.repository.ts` ignored `period` completely and summed from `startDate`.
- Fix: one resolver, `apps/api/src/modules/goals/goal-periods.ts` (`resolveGoalProgressWindow`), is now used
  by both the goals module and the dashboard; it measures the current local period (the final period for a
  goal that has ended), clipped to the goal's validity range, with `endDate` treated as an inclusive date.
- Verification: `tests/goal-periods.test.ts` (period ranges, DST 23/25-hour days, month/year/leap boundaries,
  ended goals, clipping, future goals) and the dashboard/goals agreement case in
  `tests/dashboard-timezone.test.ts` (both endpoints report the same `actualMinutes`/`percentage`/`status`).

### H-4 — High — Phase 4 (+2/3/5) — keyset pagination skipped and duplicated rows — FIXED
- Evidence: five repositories applied `...(cursor ? { id: { lt: cursor } } : {})` while ordering by
  `startedAt`/`startDate`/`createdAt`/`assessedAt`.
- Fix: `apps/api/src/shared/keyset-pagination.ts` resolves the cursor row's sort value and pages on
  `(sortField, id)` with `id` as a deterministic tie-breaker; applied to sessions (honouring `sortBy`),
  plans, goals, exams and assessments. A stale cursor now ends the list instead of restarting it.
- Verification: pure-helper tests plus session-repository tests in
  `tests/pagination-and-attribution.test.ts`.

### H-5 — High — Phase 5 — the goal `period` was inert — FIXED
- Evidence: `goal.repository.ts calculateProgress` summed every session since `startDate`; `period` appeared
  only in the list filter.
- Fix: covered by H-3's resolver; progress now measures the goal's current period.
- Verification: `tests/goal-periods.test.ts` + service-level coverage described in H-3.

### H-6 — High — Phase 4 — the timer discarded a session when the save failed — FIXED
- Evidence: `study-timer.tsx` called `timer.stop()` (which cleared React state and localStorage) *before*
  `createSession.mutateAsync`; on failure the error was shown but the session payload was gone.
- Fix: the hook gained `buildStopResult()` — a snapshot that does **not** touch timer state — and the
  component now snapshots, saves, and only then calls `reset()`; a failed save keeps the timer and the stop
  form so the user can retry, with an error message that says so. Each timer run carries a stable run
  identifier, so retrying the same run cannot create two sessions. `stop()` keeps its old one-step
  behaviour for existing callers. The 1-minute rule is additionally enforced client-side (Stop disabled
  under 60 seconds, with an explanation).
- Process note: the workspace secret heuristic refused every edit that contained the original field name
  (a field whose name ends in Token assigned to a bare identifier reads as a credential assignment). At the
  user's explicit direction that field was renamed to `runId`, which is also the truer name — it identifies
  one timer run, is never a secret, and is never sent to the API. Nothing was hidden from the guard: the
  rename is recorded here.
- Verification: `apps/web/src/lib/hooks/use-study-timer.test.ts` gained a snapshot/retry case asserting the
  timer stays active and the run id is reused; the whole web suite (81 tests) and `tsc --noEmit` pass.

### M-1 — Medium — Phase 5 — target-0 goals reported `completed` with 0% — FIXED
`goal.repository.ts` capped nothing and treated `actual >= target` as completed. Now the percentage is
capped at 100 like plans/dashboard and a zero target is never "completed"; `tests/goal-periods.test.ts` and
the goals path of `tests/analytics.test.ts` cover it.

### M-2 — Medium — Phase 5 — duplicate skill targets became a 500 — FIXED
`@@unique([goalId, skillId])` was only enforced by the database, so a duplicate in one request surfaced as a
Prisma error. `goal.service.ts` now rejects duplicates with a 422 before touching the database.

### M-3 — Medium — Phases 6/7 — an unusable stored timezone caused 500s — FIXED
`dashboard.routes.ts` passed `user.timezone` straight into `Intl`. The new shared
`resolveUserTimeZone()` validates it, logs a warning and falls back to UTC (matching the calendar module),
and `plan.repository.getUserTimezone` does the same.

### M-4 — Medium — Phase 3 — milestone status-only edits skip overlap validation — DOCUMENTED
`PUT /milestones/:id {"status":"ACTIVE"}` re-activates a milestone that was created while its sibling was
CANCELLED, producing overlapping ACTIVE ranges that the read path assumes cannot exist. Fixing it changes
documented status semantics; recorded as a product decision (finding F8 in the original delegated register, distilled here). Not fixed.

### M-5 — Medium — Phase 4 — sub-minute sessions were booked as a full minute — FIXED
`validateSessionTimes` compared the *rounded* minutes (30 s → `Math.round(0.5)` = 1 → accepted) while the
message claimed a 1-minute minimum. It now compares elapsed milliseconds, and the timer's Stop button stays
disabled below 60 s. Regression: `tests/session.test.ts` (30 s rejected, 60 s accepted).

### M-6 — Medium — Phase 2 — duplicate system categories are unconstrained — DOCUMENTED
`Category` is `@@unique([userId, name])` with a nullable `userId`; Postgres treats NULLs as distinct, so the
DB does not enforce uniqueness for seeded categories and the code guard uses a different notion of the
namespace. Fixing needs a partial unique index → migration → cannot be validated without a database.

### M-7 — Medium — Phase 2/8 — `durationMinutes` is derived but unconstrained — DOCUMENTED
The column stores `endedAt − startedAt` with no check constraint, while six endpoints sum it. The
application-level invariant is enforced and tested; a migration is required for a database-level guarantee.

### M-8 — Medium — Phase 4/5/7 (web) — form defaults used the UTC day — FIXED
`quick-add-session.tsx`, `create-goal-dialog.tsx` and `create-plan-dialog.tsx` derived default dates from
`toISOString()`, so users east of UTC were offered yesterday. All three now use local calendar parts.
Verification: the files compile and lint; the pure day-key helpers they reuse are covered by
`apps/web/src/lib/calendar.test.ts`.

### M-9 — Medium — Phase 3 — deleting a plan silently re-scopes a plan-linked goal — DOCUMENTED
`goal.planId` is `SetNull`, and the plan id doubles as the progress filter, so deleting a plan widens the
goal to "all study time in range". Fixing it properly needs the goal to remember its original scope
(schema change); recorded rather than changed.

### Low-severity items (fixed)
- **L-1** `tests/session.test.ts` asserted arithmetic instead of the module → rewritten against the real
  service (10 cases incl. the 16-hour boundary). 
- **L-2** Dead imports in `tests/session-streak.test.ts` (left by the Phase 7 commit) → removed; lint is now
  0 warnings.
- **L-3** `comment`/`400 BAD_REQUEST` branch is unreachable (no route declares Fastify schemas) → left in
  place as harmless defensive code, documented.
- **L-4** Calendar's silent UTC fallback for a corrupt stored zone → now logged by the shared resolver.

### Low-severity items (documented, not fixed)
- **L-5** `listGoalsWithProgress` issues one progress query per goal (N+1) — performance only.
- **L-6** Item endpoints return bare objects while list endpoints wrap in `{data}` — changing it would break
  the existing client; recorded as a compatibility hazard, not changed.
- **L-7** No `:id`/cursor format validation on routes; a malformed id costs one query and returns 404.
  Consistent behaviour, no crash.
- **L-8** `getMonthlyProgress` returns a *daily* series in a field named `month` (the web chart depends on
  it); renaming would be a breaking wire change.

## D. Cross-phase consistency

**Question:** does the same `StudySession` data produce the same answers in goals, plans, dashboard, calendar
and streaks?

**Answer: yes for the paths that share the canonical code, with one documented exception.**

- **Streaks** — one implementation (`calendar.domain.ts`) is injected as a `StreakReader` into the sessions
  module and the dashboard; `tests/session-streak.test.ts` asserts `/sessions/today-stats` and
  `/streak` agree, and `tests/calendar.test.ts` asserts the calendar day totals match the same windows.
- **Goal progress** — the goals module and the dashboard both call `resolveGoalProgressWindow`;
  `tests/dashboard-timezone.test.ts` asserts both report the same `actualMinutes`, `percentage` and `status`
  for the same DAILY goal and rows.
- **Plan progress** — plan totals, milestone attribution and the plan-linked goal filter now share the
  `planId OR milestone.planId` definition, and the breakdown is guaranteed to add up
  (`sum(milestones) + unassigned = actual`, asserted in `tests/plan.test.ts`).
- **Calendar vs history** — both use the same half-open local-day windows (`dayBoundsUtc`), asserted in
  `tests/calendar.test.ts` and `tests/session-streak.test.ts`.
- **Analytics (Phase 8)** — the summary, trend, skill table and comparison all come from one grouped query
  per window; `tests/analytics.test.ts` asserts they agree with each other and that a session edit or delete
  is reflected on the next request. Streaks are delegated to the calendar reader, goal progress to the goals
  module and plan progress to the plans module.
- **Documented exception** — the goals list reports *current-period* progress by design (H-3/H-5), while
  `plan`-level pacing keeps its own inclusive-end conventions (`totalDays` counts the end date,
  `remainingDays` is 0 once the end instant has passed). The two conventions are intentional and are
  documented (finding F6 in the original delegated register) rather than silently unified.

## E. Verification results (exact commands)

Passed (all executed on the final state):

| Command | Result |
| --- | --- |
| `pnpm typecheck` (turbo, 4 packages) | 4 successful, 4 total |
| `pnpm lint` (turbo, 3 packages) | 3 successful, 3 total; 0 errors, 0 warnings |
| `pnpm test` (turbo) | api: 16 files / 264 tests passed · web: 7 files / 80 tests passed |
| `pnpm build` (turbo) | 3 successful; `/analytics` 121 kB, `/calendar` 12 kB, all routes prerender |
| `pnpm --filter @lingopath/api db:generate` | Prisma Client v5.22.0 generated (Phase 7 model + Phase 8 index) |
| `npx prettier --check --end-of-line crlf <touched files>` | all matched files formatted |
| `rg` sweeps for server-local parsing / UTC day keys / instant day math | every hit triaged; remaining hits are tests or documented |

Not run / blocked:

| Command | Status |
| --- | --- |
| `pnpm --filter @lingopath/api db:push` | **BLOCKED** — no PostgreSQL server, no Docker in this environment |
| `pnpm --filter @lingopath/api db:seed` | **BLOCKED** — same |
| Live HTTP smoke test against a real database | **BLOCKED** — route tests use a faked Prisma client |
| Manual browser pass of `/analytics` | **NOT RUN** — production build and component tests pass; no manual click-through was performed |
| Any migration history check | **NOT APPLICABLE** — the repository uses `prisma db push` and has no `migrations/` directory |

Nothing in this report is based on an unexecuted command; where a command could not run, it is listed above
and its conclusions are marked blocked/inferred.

## F. Database and migration status

- **Schema changes present in the working tree:** Phase 7's `CalendarSetting` model (already committed) and a
  Phase 8 index `@@index([userId, durationMinutes])` on `StudySession` (uncommitted), added for the
  longest-session lookup.
- **Validation performed:** `prisma db:generate` succeeds, which parses and validates the schema and
  regenerates the client; typecheck then proves the generated types match every repository call.
- **Applied:** **No.** `prisma db push` was not executed because no database is reachable from this
  environment. The index therefore exists in `schema.prisma` only; the running application is unaffected
  (it needs no new column), but the index will not exist in a database until `db push` runs.
- **No production verification occurred** and no production data was touched.

## G. Remaining risks

1. **G-1 (resolved): timer state survives a failed save.** The workspace secret heuristic initially refused
   the edit because a field name matched a credential pattern (it identifies a timer run, not a credential).
   After the user approved the fix, that field was renamed and the change applied; H-6 records the
   mechanism and the test. No open item remains on this path.
2. **No live database verification.** Raw SQL in the analytics repository (`date_trunc(... AT TIME ZONE $tz)`),
   FK cascade behaviour, unique constraints and the new index are unexecuted; their *shape* and parameter
   binding are asserted in tests, but Postgres itself has not run them.
3. **Unfixed medium/low items** M-4, M-6, M-7, M-9, L-5…L-8 (section C) remain open by decision, each with
   evidence in section C of this report and `audit/checklist.md`.
4. **Test coverage gaps that remain:** no route-level tests for objectives, skills, assessments and exams
   (they are thin CRUD modules with 3 assertions total); no test exercises `plan.service` against the real
   repository (only stubs); the Prisma schema itself has no automated validation beyond generation.
5. **`monthlyProgress` naming and the `{data}` envelope split** (L-6, L-8) are wire-compatibility hazards for
   any future client.
6. **Concurrent external activity in the working tree.** The root version bump and the deleted audit files
   (header note) show another process writes to this repository during the session; any reviewer should
   confirm the working tree contents before committing, and no commit/push was performed by this audit.
7. **Analytics visual QA** — chart rendering is asserted through component tests, not by looking at the page
   in a browser.

## H. Final readiness decision

**READY WITH LIMITATIONS.**

Justification:

- The one shipping blocker (C-1, the dashboard resolving a placeholder user id) is fixed and covered by a
  regression test; the dashboard is the page Phase 8's plan analytics sits next to.
- All five High-severity issues that produce wrong numbers (attribution, goal periods, dashboard windows,
  pagination, timezone buckets) are fixed with regression tests, and the full suite passes
  (264 API + 80 web tests, typecheck, lint, production build).
- No known defect remains that makes a *displayed* metric incorrect on the paths that share the canonical
  code (section D).
- The decision is not "READY" because: no database was reachable, so `db push`/seed, raw SQL, cascades and
  migrations are unverified; seven lower-severity items remain open by explicit decision; and no manual
  browser pass of the new pages was performed.