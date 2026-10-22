# Audit checklist — LingoPath Phases 1–7 (and the Phase 8 and Phase 9 follow-ups)

Self-contained working record for the audit. `AUDIT_REPORT.md` in the repository root is the deliverable;
this file is the phase → component → test map behind it.

Note: the delegated read-only audit reports (`audit/findings-api-core.md`, and the platform sweep written to
the run directory) were removed from the workspace by an external process during the session; the findings
distilled from them live in `AUDIT_REPORT.md`.

Repository: Turborepo + pnpm workspaces — `apps/api` (Fastify + Prisma), `apps/web` (Next.js 14 App Router),
`packages/types` (Zod contracts), `prisma/schema.prisma` + `prisma/seed.ts`.

## Phase map (as actually implemented)

| Phase | Content in this repo | Primary files | Tests present |
| --- | --- | --- | --- |
| 1 Foundation | pnpm/turbo scaffolding, tsconfig presets, api+web skeletons, health endpoint, docker-compose, env samples | root configs, `apps/api/src/{app,server,config}.ts`, `apps/api/src/modules/health/*` | `tests/health.test.ts` |
| 2 DB + backend core | Prisma schema (User/Skill/Category/StudySession/LearningObjective/Goal/LongTermPlan/PlanMilestone/LevelAssessment/Exam/ExamResult), seed, taxonomy modules, error handler, prisma plugin | `prisma/*`, `apps/api/src/modules/{skills,categories,objectives,assessments,exams}/*`, `apps/api/src/plugins/*`, `apps/api/src/shared/*` | `tests/{category,exam}.test.ts` (business rules only) |
| 3 Plans + milestones + countdown | Plan/milestone CRUD, pacing math, progress endpoint | `apps/api/src/modules/plans/*`, `apps/web/src/components/planning/*` | `tests/plan.test.ts` (58 cases) |
| 4 Study tracking + timer + history | Session CRUD, duration rules, timer device, history filters/pagination | `apps/api/src/modules/sessions/*`, `apps/web/src/components/study/*`, `apps/web/src/lib/hooks/use-{sessions,study-timer}.ts` | `tests/session.test.ts` (rewritten, 10 cases), `use-study-timer.test.ts` |
| 5 Goals + short-term planning | Goal CRUD, period windows, progress, skill targets, plan link | `apps/api/src/modules/goals/*`, `apps/web/src/components/goals/*` | `tests/goal-periods.test.ts` (new), `tests/goal.test.ts` |
| 6 Dashboard | Consolidated dashboard endpoint + view, cards, charts | `apps/api/src/modules/dashboard/*`, `apps/web/src/components/dashboard/*` | `tests/dashboard-timezone.test.ts` (new), `tests/dashboard.test.ts` |
| 7 Calendar + streak | Heatmap, day drill-down, streaks, thresholds, tz utility | `apps/api/src/modules/calendar/*`, `apps/api/src/shared/{timezone,current-user}.ts`, `apps/web/src/components/calendar/*` | `tests/{timezone,calendar-domain,streak,calendar,session-streak,goal-periods}.test.ts` |
| 8 Analytics (follow-up) | Consolidated analytics endpoint, SQL-side aggregation, `/analytics` page with Recharts | `apps/api/src/modules/analytics/*`, `apps/web/src/components/analytics/*`, `apps/web/src/lib/{analytics.ts,hooks/use-analytics.ts}` | `tests/analytics.test.ts` (34 cases), `apps/web/src/lib/analytics.test.ts`, `apps/web/src/components/analytics/analytics.test.tsx` |
| 9 CEFR levels + exam tracking (follow-up) | Per-dimension CEFR assessments with history, scale-aware exam targets and results, multiple objectives with one active focus, and the `/levels` + `/exams` views | `apps/api/src/modules/assessments/*`, `apps/api/src/modules/exams/*`, `apps/api/src/modules/objectives/*`, `apps/web/src/components/{levels,exams}/*`, `apps/web/src/lib/{levels,exams}.ts`, `apps/web/src/lib/hooks/use-{levels,exams,objectives}.ts` | `tests/{levels,exam-scoring,active-objective}.test.ts` (53 cases), `apps/web/src/components/{levels,exams}/*.test.tsx` (21 cases) |

## Cross-cutting checklist

| # | Component / requirement | Where | Status | Evidence |
| --- | --- | --- | --- | --- |
| 1 | StudySession is the single source of truth | api modules | PASS | no stored aggregates; `tests/analytics.test.ts`, `tests/plan.test.ts` |
| 2 | No duplicated/contradicting calculations | api + web | PASS (after fixes) | goal windows single-sourced; `computeStudyProgressPercent` single-sourced |
| 3 | Route validation at every API boundary | all routes | PARTIAL | calendar/analytics strict; other list routes rely on Zod query schemas; `:id` unvalidated |
| 4 | Consistent error contract | `plugins/error-handler.ts` | PASS | 422 for user error, 404 shape, uniform envelope; dead `400` branch documented |
| 5 | User ownership / isolation | all repositories | PASS | scoped `findFirst({id,userId})` everywhere; new `tests/session.test.ts` covers attribution ownership |
| 6 | Schema integrity (FK, cascade, indexes, unique) | `prisma/schema.prisma` | PARTIAL | cascades deliberate; two documented gaps (nullable-unique categories, `durationMinutes` constraint) |
| 7 | Timezone correctness of day/week/month/year windows | api + web | PASS (after fixes) | `tests/timezone.test.ts`, `tests/dashboard-timezone.test.ts`, `tests/goal-periods.test.ts` |
| 8 | DST, leap year, month/year boundaries | api + web | PASS | 23/25-hour days, Apia date-line skip, leap-day edges |
| 9 | Duration/percentage math | api + web | PASS (after fixes) | 1-minute minimum enforced on elapsed time; percentages capped with one helper |
| 10 | Timer state machine + duplicate protection | `use-study-timer.ts`, `study-timer.tsx` | PASS | snapshot/retry and stable run id covered by `use-study-timer.test.ts`; Stop disabled below 60 seconds |
| 11 | Query invalidation after mutations | `apps/web/src/lib/hooks/*` | PASS | session/goal/plan/calendar/analytics hooks invalidate their query keys |
| 12 | Loading / empty / error states | `apps/web/src/components/*` | PASS | `tests/analytics.test.tsx`, `tests/calendar.test.tsx` cover all three |
| 13 | Dead code, placeholders presented as real data | repo-wide | PASS (after fixes) | dashboard placeholder id fixed; three dead test imports removed; lint 0 warnings |
| 14 | Test coverage vs claimed rules | `apps/api/tests`, web `*.test.*` | PARTIAL | 264 api + 80 web tests at audit time; objectives/skills/assessments/exams routes still thin. Phase 9 follow-up: +60 api and +21 web tests covering the CEFR level domain, the exam scoring scales, the active objective and both new views — at service/domain and component level; **route-level** (`app.inject`) tests are still absent, and `apps/api/tsconfig.json` excludes `tests/`, so `pnpm typecheck` does not check the API test files (a scratch config covering `src` + `tests` was used to check the new ones, and it surfaced six pre-existing type errors in `tests/analytics.test.ts` and `tests/plan.test.ts`) |
| 15 | Build / typecheck / lint / production build | all workspaces | PASS | see report section E |
| 16 | Live database behaviour (cascades, raw SQL, `db push`) | prisma + postgres | BLOCKED | no PostgreSQL/Docker in this environment. Phase 9's schema changes are affected by the same gap: the four new nullable level columns plus `cefr_level` becoming nullable, `exams.target_score` / `target_date` / `score_scale`, `users.active_objective_id` (unique FK to `learning_objectives`, `ON DELETE SET NULL`), the nullable `exam_results.overall_score` and the new `Exam` relation were checked with `prisma validate` and client generation only — `db push` was never run, so "every change is a widening" is reasoned from the schema rather than observed |

## Method

1. Static evidence sweep of the whole tree (server-local date parsing, UTC day keys, instant day math, percentage math, validation gaps, unsafe casts).
2. Two read-only delegated sweeps (API accounting core; API platform + schema + aggregations).
3. A third web-focused sweep performed directly by the coordinator (form defaults, timer flow, query keys).
4. Every reported defect re-verified in source before any fix; fixes kept minimal and backward compatible.
5. Each confirmed defect got a regression test; typecheck, lint, the full test suite and a production build
   were rerun on the frozen state.
