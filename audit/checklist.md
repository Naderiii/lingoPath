# Audit checklist — LingoPath Phases 1–7 (and Phase 8 follow-up)

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
| 14 | Test coverage vs claimed rules | `apps/api/tests`, web `*.test.*` | PARTIAL | 264 api + 80 web tests; objectives/skills/assessments/exams routes still thin |
| 15 | Build / typecheck / lint / production build | all workspaces | PASS | see report section E |
| 16 | Live database behaviour (cascades, raw SQL, `db push`) | prisma + postgres | BLOCKED | no PostgreSQL/Docker in this environment |

## Method

1. Static evidence sweep of the whole tree (server-local date parsing, UTC day keys, instant day math,
   percentage math, validation gaps, unsafe casts).
2. Two read-only delegated sweeps (API accounting core; API platform + schema + aggregations).
3. A third web-focused sweep performed directly by the coordinator (form defaults, timer flow, query keys).
4. Every reported defect re-verified in source before any fix; fixes kept minimal and backward compatible.
5. Each confirmed defect got a regression test; typecheck, lint, the full test suite and a production build
   were rerun on the frozen state.
