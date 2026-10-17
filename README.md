# LingoPath

> _Your English learning path, measured._

LingoPath is an English learning planning, tracking, and analytics system. It provides goal-driven language learners with a framework to design structured long-term study plans (e.g., 6-Month IELTS Preparation, TOEFL strategies, or General English fluency), organize multi-stage milestones, track real study sessions via a persistent live timer or manual entry, and monitor planned versus actual progress over time.

---

## Table of Contents

- [Overview](#overview)
- [Key Features](#key-features)
- [System Architecture](#system-architecture)
- [Data Model & Domain Design](#data-model--domain-design)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Installation](#installation)
  - [Environment Setup](#environment-setup)
  - [Database Initialization](#database-initialization)
  - [Running the Application](#running-the-application)
- [Available Commands](#available-commands)
- [API Reference](#api-reference)
- [Architecture Principles](#architecture-principles)

---

## Overview

Self-directed language learners often struggle with long-term consistency, milestone pacing, and realistic progress measurement. LingoPath solves this by uniting long-term preparation timelines with granular day-to-day study tracking:

- **Target-Driven Roadmaps**: Define long-term plans with target study hours, calendar horizons, and structured milestones.
- **Persistent Study Timer & Live Tracking**: Start, pause, resume, and stop study sessions with local persistence that survives page refreshes, accidental navigation, and browser restarts.
- **Accurate Real-Time Accounting**: Study progress is derived strictly from real `StudySession` records—no manual progress increments or vanity numbers.
- **Timezone-Aware Countdown Engine**: Pacing, elapsed time, and remaining days are calculated dynamically using the user's local timezone, accounting for midnight boundaries, month lengths, leap years, and daylight saving time (DST) shifts.
- **Multi-Granular Comparisons**: Evaluate planned targets against actual achievements at the total plan, milestone, monthly, and weekly levels.

---

## Key Features

### 1. Long-Term Planning

- **Plan Management**: Create, edit, archive, cancel, and complete plans.
- **Comprehensive Pacing**: Live calculation of total days, elapsed days, remaining days, time progress percentage, target hours, completed hours, and remaining study time.
- **Multi-Dimensional Comparison**: Planned vs. Actual comparison broken down by Total Plan, Milestones, Monthly pace, and Weekly pace.
- **Lifecycle Preservation**: Archiving or cancelling a plan preserves all historical study session data.

### 2. Milestone Staging

- **Sequential Phases**: Break large preparation periods into sequential focus periods (e.g., Month 1 Foundation, Month 2 Vocabulary & Grammar, Month 3 Reading & Listening).
- **Date Boundary Enforcement**: Milestones are strictly validated against their parent plan boundaries and tested against accidental overlaps.
- **Dynamic Identification**: Automatically detects and surfaces the _Current Milestone_ and _Next Milestone_ relative to today's date.
- **Individual Milestone Tracking**: Track target vs. actual minutes and completion rates for each milestone.

### 3. Study Session Accounting & Timer

- **Persistent Live Timer**: Start, pause, resume, and stop timer sessions. Survives refreshes, tab switching, and navigation via local storage persistence. Timestamp-based elapsed calculation without frequent network polls.
- **Duplicate Prevention**: Unique stop tokens prevent accidental duplicate session creation on retries, double-clicks, or refreshes.
- **Manual Quick-Add Entry**: Record study sessions manually with duration, skill, category, topic, notes, self-rating (1-5), and date/time.
- **Verified Durations**: Session duration is calculated from explicit start and end UTC timestamps with sanity bounds (1 minute to 16 hours).
- **Taxonomy & Skills**: Categorize study time across core English learning domains: Vocabulary, Grammar, Listening, Reading, Writing, Speaking, Pronunciation, and Conversation.

### 4. Study History & Filtering

- **History Management**: Comprehensive `/study/history` view supporting cursor-based pagination, date-range filtering, skill filtering, category filtering, search across topics and notes, and multi-field sorting.
- **Editing & Deletion**: Update or delete past sessions with inline modals and confirmation dialogs, automatically invalidating dependent queries and progress calculations.

### 5. Goals & Short-Term Planning

- **Period-Based Goals**: Create daily, weekly, monthly, and yearly study time targets with automatic period boundary calculation (e.g., Monday-to-Sunday weeks, full calendar months).
- **Real-Time Progress Tracking**: Goal progress computed live from actual `StudySession` data—shows target, actual, remaining time, and completion percentage.
- **Skill Distribution Targets**: Optionally allocate target study time across specific skills (e.g., Listening: 2h, Reading: 2h, Writing: 2h) with individual progress tracking per skill.
- **Over-Target Achievement Display**: When actual study exceeds target, progress bars cap at 100% visually while displaying true values (e.g., "12h 30m / 10h").
- **Long-Term Plan Integration**: Goals can be linked to active long-term plans, with progress automatically filtered to plan-specific study sessions.
- **Comprehensive Goal Management**: Create, view, edit, delete goals with period and active/inactive filters in a dedicated `/goals` interface.

### 6. Learning Objectives & Active Focus

- **Multiple Objectives**: Keep as many objectives as you need at once — IELTS, TOEFL, General English, Immigration or a custom title — each with its own target score and target date.
- **One Active Objective**: Exactly one objective is designated active (`users.active_objective_id`, unique at the database level). Plans, goals and exams default to it, so the current focus actually shapes planning instead of being a label nobody reads.
- **Factual Signals**: The focus card lists observations with the value each one came from ("Based on: recorded target date 2026-11-01 against today") — a missing target date, a date that has passed, an exam with no recorded result, or the target you set next to the last result you recorded. Signals state facts; they never grade the learner.

### 7. CEFR Levels & Exam Tracking

- **Five Dimensions**: Record a CEFR level (A1–C2) for **overall**, **listening**, **reading**, **writing** and **speaking** — independently, and only for the dimensions that were actually assessed.
- **Recorded, Never Inferred**: Levels come solely from assessments you enter. Study hours are never converted into a level, and the `/levels` page says so on screen. The module that computes levels cannot even read `StudySession`.
- **Historical Progress**: Every assessment is kept with its date and method (self-reported, mock test, formal exam). The view shows the most recently *recorded* level per dimension, the earlier recording it changed from, a multi-line history chart and the full table — with edit and delete.
- **IELTS Tracking**: Overall band plus listening, reading, writing and speaking, with the test date, the target band and the target date.
- **Scale-Aware Scoring**: Scores are validated against the exam's own scale, not one hardcoded maximum — an IELTS band out of 9 (half-band steps) and a TOEFL iBT total out of 120 with 30-point sections are both first-class.
- **Future-Proof Model**: The scale is an opaque descriptor stored as JSON and resolved by a preset registry, so a new scoring scheme (a revised TOEFL format, a provider-specific mock scale, a complete custom scale) is a data or preset change — no schema migration, no reinterpretation of old results.
- **No Verdicts**: Nothing labels a learner ready, not ready or weak, and no score is predicted. A result is reported as recorded, next to the target the learner set.

### 8. Consolidated Main Dashboard

- **Real-Time Overview**: Single consolidated dashboard API and view at `/dashboard` bringing together today's study progress, active long-term plan, goals, weekly breakdown, skill distribution, monthly/yearly trends, and recent study activity.
- **Robust States**: Graceful loading, error handling, and helpful empty states guiding new users to start their first session or create their first plan.

### 9. Study Calendar & Streaks

- **GitHub-Style Heatmap**: A `/calendar` view of daily study activity as week-by-week columns, colour-coded by how long you studied.
- **Flexible Ranges**: Current year, previous year, or any custom range up to two years.
- **Configurable Intensity Scale**: The default scale is `0 | 1-20 | 21-40 | 41-60 | 61-90 | 90+` minutes; bounds are editable per user and persist.
- **Day Drill-Down**: Clicking a day shows total study time, session count, first-last session times, per-skill / per-category / per-topic distribution, free-text notes, and every single session.
- **Timezone-Correct Streaks**: Current and longest streak, computed in the user's timezone with a configurable qualifying threshold (20 minutes by default). Multiple short sessions on one day add up.
- **Boundary-Proof**: Midnights, DST transitions (23- and 25-hour days), month ends, year ends and leap days are all covered by tests; missed days break the run, a day still in progress never does.

### 10. Study Analytics

- **Consolidated Analytics Page**: `/analytics` for one selected window — 7 / 30 / 90 days, this year, last year, or a custom range up to two years.
- **Headline Metrics**: total study time, session count, active and inactive days, average daily time, average session length, longest session, current and longest streak, and the share of days that met the daily goal.
- **Skill Analytics**: time, share, session count, average session length and the recent trend for every skill, with a zero-baseline aware comparison.
- **Time Trends**: an area chart whose buckets adapt to the range (days, weeks, months).
- **Period Comparison**: current window against the previous one, reporting an absolute change instead of a misleading infinite percentage when the previous window was empty.
- **Long-Term Plan Analytics**: planned vs actual, elapsed calendar time vs study progress, a pace verdict with the daily minutes needed to catch up, milestone performance, and monthly and weekly performance.
- **Database-Side Aggregation**: one grouped SQL query per window (day x skill) plus SQL aggregates for the longest session; the full study history is never loaded into Node.js.

### 11. AI Recommendations (Decision Support)

- **Advice, Not Decisions**: `POST /api/v1/recommendations/generate` returns one to four grounded recommendations, each with the facts it was built from, a confidence band and an explicit status. Nothing is applied automatically.
- **Six Recommendation Types**: skill focus, session duration, skill balance, exam preparation, consistency, and long-term plan adjustment.
- **Practice Is Not Ability**: a gap in recent practice is described as exactly that. A recorded CEFR level or exam result is quoted as recorded, and the two are never merged into a verdict. The rule is structural — there is no signal kind for "weak ability" — not a prompt instruction.
- **Honest Confidence**: bands come from how much evidence exists (never above `LOW` under four sessions), never from a model's self-report, and every payload says in words that the band is not a probability.
- **Remembers Your Answers**: accepted, rejected, modified, postponed and ignored are stored per recommendation. A recommendation rejected twice with unchanged evidence is suppressed rather than rephrased; changed evidence lets it return.
- **Objective-Aware**: switching the active objective from IELTS to TOEFL retires the previous batch and re-scopes exam advice to the new test.
- **Provider-Agnostic**: the model sits behind an adapter (`LLM_PROVIDER=none` is the default, and a supported one). Malformed JSON, schema mismatches, ability diagnoses and outages all fall back to the deterministic engine instead of failing the request.
- **Explicit Apply**: accepting a recommendation only records a decision. Turning it into a goal takes a second call with `confirm: true`, and only a goal is ever created — never a session, a milestone or a plan edit. No recommendation UI ships with this phase.

---

## System Architecture

LingoPath is designed as a modular monorepo using **Turborepo** and **pnpm workspaces**, separating concerns between the presentation layer, the API engine, and shared contract packages.

```text
┌─────────────────────────────────────────────────────────────┐
│                       Next.js Web App                       │
│      (App Router, TanStack Query v5, Radix UI, Tailwind)     │
└──────────────────────────────┬──────────────────────────────┘
                               │ HTTP / JSON REST
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                      Fastify API Server                     │
│         (Zod Validation, Route / Service / Repository)      │
└──────────────┬───────────────────────────────┬──────────────┘
               │                               │
               ▼                               ▼
┌─────────────────────────────┐ ┌─────────────────────────────┐
│        Prisma ORM           │ │       Shared Packages       │
│  (PostgreSQL Client & Types)│ │ (@lingopath/types, tsconfig)│
└──────────────┬──────────────┘ └─────────────────────────────┘
               │
               ▼
┌─────────────────────────────┐
│     PostgreSQL Database     │
└─────────────────────────────┘
```

### Layered Backend Architecture (`apps/api`)

The backend follows a strict 3-tier decoupled pattern:

1. **Routes / Controllers**: Fastify route definitions that handle HTTP parameters, query parsing, request payload validation with Zod schemas, and HTTP status codes.
2. **Services**: Pure business logic, validation rules (e.g., date boundaries, overlap checks, timezone conversions), and domain calculations.
3. **Repositories**: Data access layer encapsulating all Prisma queries, database aggregations, and transaction management.

### Responsive Frontend Architecture (`apps/web`)

The web application leverages Next.js 14 App Router:

- **Server Components & Client Boundaries**: Layouts and metadata remain server-rendered, while interactive components manage client state cleanly.
- **TanStack Query (React Query) v5**: Provides optimized caching, optimistic updates, request deduplication, and automated background synchronization.
- **Design System**: Accessible UI primitives built on Radix UI, styled with Tailwind CSS, supporting automatic light/dark theme toggling via `next-themes`.

---

## Data Model & Domain Design

```text
               ┌──────────────────────┐
               │         User         │
               └──────────┬───────────┘
                          │ 1
        ┌─────────────────┼─────────────────┐
        │ *               │ *               │ *
┌───────▼────────┐ ┌──────▼────────┐ ┌──────▼────────┐
│ LearningObject.│ │  LongTermPlan │ │     Goal      │
└───────┬────────┘ └──────┬────────┘ └──────┬────────┘
        │                 │ 1               │
        │                 ▼ *               │
        │          ┌───────────────┐        │
        │          │ PlanMilestone │        │
        │          └───────┬───────┘        │
        │                  │                │
        │                  │ *              │
        └──────────────┐   │   ┌────────────┘
                       ▼   ▼   ▼
                    ┌─────────────┐
                    │StudySession │ ◄── [Source of Truth for Study Time]
                    └─────────────┘
```

### Core Entities

- **`User`**: Root identity record storing user configuration such as `timezone` and `activeObjectiveId`.
- **`LearningObjective`**: One of any number of objectives (`type`, `title`, `targetScore`, `targetDate`, `isActive`). The one referenced by `User.activeObjectiveId` is the active focus.
- **`LevelAssessment`**: One recorded CEFR assessment per row, with an independent nullable level for `cefrLevel` (overall), `listeningLevel`, `readingLevel`, `writingLevel` and `speakingLevel` — `null` means "not assessed". Levels are recorded by the learner and never inferred from study time.
- **`Exam`**: A planned or taken exam (`type`, `title`, `scheduledAt`, `status`, `targetScore`, `targetDate`, `scoreScale`). `scoreScale` is an opaque JSON scoring-scale descriptor, so a new scoring scheme never needs a schema change.
- **`ExamResult`**: A recorded result (`takenAt`, `isMock`, optional `overallScore`, flexible `skillScores` JSON), validated against the exam's own scale.
- **`Recommendation`**: one stored recommendation (`type`, `title`, `recommendation`, `rationale`, `supportingData`, `confidence`, `estimatedDurationMinutes`, `relatedSkillId` / `relatedGoalId` / `relatedPlanId`, `objectiveId`, `evidenceKey`, `status`, `source`, `suggestedAction`). The related ids are plain columns rather than foreign keys on purpose: a recommendation is a historical statement, and a later cascade must not quietly rewrite what it said.
- **`RecommendationFeedback`**: one appended row per decision (`recommendationId`, `userId`, `action`, `reason`, `createdAt`). The current status lives on the recommendation; the trail lives here, so "rejected, then accepted two days later" stays visible.
- **`LongTermPlan`**: High-level learning plan (`title`, `startDate`, `endDate`, `targetMinutes`, `status`, `objectiveId`, `examId`).
- **`PlanMilestone`**: Time-bounded phase within a plan (`ordering`, `startDate`, `endDate`, `targetMinutes`, `status`).
- **`StudySession`**: Atomic study record (`startedAt`, `endedAt`, `durationMinutes`, `skillId`, `categoryId`, `planId`, `milestoneId`). **Sole source of truth for study time.**
- **`Goal`**: Recurring study targets across defined periods (`DAILY`, `WEEKLY`, `MONTHLY`, `YEARLY`).
- **`Skill`**: System taxonomy of English learning competencies.
- **`Category`**: User-defined and default activity groupings (e.g., Mock Test, Review, IELTS, Grammar).

---

## Tech Stack

| Layer                  | Technologies                                                                                                          |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------- |
| **Frontend**           | Next.js 14 (App Router), React 18, TypeScript, Tailwind CSS, Radix UI, TanStack Query v5, Lucide Icons, Recharts, `next-themes` |
| **Backend**            | Fastify v4, Node.js (>= 20), TypeScript, Zod, `@fastify/cors`, `@fastify/helmet`, Pino Logger                         |
| **Database & ORM**     | PostgreSQL, Prisma ORM v5                                                                                             |
| **Tooling & Monorepo** | Turborepo v2, pnpm Workspaces, Vitest, React Testing Library, ESLint, Prettier                                        |

---

## Project Structure

```text
lingoPath/
├── apps/
│   ├── api/                     # Fastify backend application
│   │   ├── src/
│   │   │   ├── modules/         # Domain modules
│   │   │   │   ├── assessments/ # CEFR levels per dimension (overall + 4 skills) & history
│   │   │   │   ├── analytics/   # Study-time analytics, trends, comparisons & plan pacing
│   │   │   │   ├── calendar/    # Study calendar heatmap, day drill-down & streaks
│   │   │   │   ├── categories/  # Session category management
│   │   │   │   ├── exams/       # Exam tracking, scoring scales, targets & recorded results
│   │   │   │   ├── goals/       # Recurring goal engine
│   │   │   │   ├── health/      # Health check probes
│   │   │   │   ├── objectives/  # Multiple objectives, the active one & its factual signals
│   │   │   │   ├── plans/       # Long-term plans & milestone services
│   │   │   │   ├── recommendations/ # AI recommendations: context, analysis, LLM adapter & feedback
│   │   │   │   ├── sessions/    # Study session recording & timer stats
│   │   │   │   └── skills/      # Skill taxonomy
│   │   │   ├── plugins/         # Fastify plugins (Prisma, CORS, Helmet, errors)
│   │   │   ├── shared/          # Centralized error classes & utilities
│   │   │   ├── app.ts           # App factory
│   │   │   ├── config.ts        # Environment configuration
│   │   │   └── server.ts        # Server entrypoint
│   │   └── tests/               # Vitest API unit and integration test suites
│   │
│   └── web/                     # Next.js web frontend
│       ├── src/
│       │   ├── app/             # App Router pages and route groups
│       │   │   └── (dashboard)/ # Authenticated dashboard views
│       │   │       ├── analytics/
│       │   │       ├── calendar/ # Study heatmap, streaks & day detail (/calendar)
│       │   │       ├── dashboard/
│       │   │       ├── exams/    # Exams, targets & recorded results (/exams)
│       │   │       ├── goals/    # Goal tracking & management (/goals)
│       │   │       ├── levels/   # CEFR levels, assessment history & active focus (/levels)
│       │   │       ├── planning/ # Long-Term Plan views (/planning, /planning/[id])
│       │   │       └── study/    # Study tracking, live timer (/study, /study/timer, /study/history)
│       │   ├── components/      # UI components
│       │   │   ├── goals/       # Goal cards, lists, creation/detail dialogs, progress displays
│       │   │   ├── levels/      # Dimension cards, level history chart, assessment dialog & focus card
│       │   │   ├── exams/       # Exam cards, exam/result dialogs, score history chart
│       │   │   ├── calendar/    # Heatmap grid, streak cards, day detail & threshold dialogs
│       │   │   ├── layout/      # Sidebar, top-bar, navigation
│       │   │   ├── analytics/   # Summary cards, trend/skill charts, comparison & plan pacing
│       │   │   ├── planning/    # Plan cards, lists, details, progress bars, dialogs
│       │   │   ├── study/       # Study timer, quick-add modal, stats, today sessions
│       │   │   ├── shared/      # Empty, loading, and error states
│       │   │   └── ui/          # Radix UI primitives & buttons
│       │   └── lib/             # API client, React Query hooks (use-goals, use-sessions, use-plans, use-levels, use-exams, use-objectives, use-study-timer), utilities
│       └── public/              # Static assets
│
├── packages/
│   ├── tsconfig/                # Shared TypeScript compiler options
│   └── types/                   # Shared Zod schemas, types, and API contracts
│
├── prisma/
│   ├── schema.prisma            # Prisma domain models and relations
│   └── seed.ts                  # Database seeding script
│
├── docker-compose.yml           # PostgreSQL container definition
├── turbo.json                   # Turborepo task definitions
└── pnpm-workspace.yaml          # Monorepo workspace configuration
```

---

## Getting Started

### Prerequisites

- **Node.js**: `>= 20.0.0`
- **pnpm**: `>= 9.0.0`
- **Docker & Docker Compose** (for running PostgreSQL locally)

### Installation

1. Clone the repository and navigate into the workspace:

   ```bash
   git clone <repo-url>
   cd lingoPath
   ```

2. Install all monorepo dependencies:
   ```bash
   pnpm install
   ```

### Environment Setup

Set up the required environment files across the project:

- **Root environment**:
  ```bash
  cp .env.example .env
  ```
- **API environment (`apps/api/.env`)**:
  ```bash
  cp apps/api/.env.example apps/api/.env
  ```
  Ensure `DATABASE_URL` is set:
  ```env
  DATABASE_URL="postgresql://postgres:postgres@localhost:5432/lingopath?schema=public"
  PORT=3001
  HOST=0.0.0.0
  CORS_ORIGIN="http://localhost:3000"
  # Optional: without it the built-in rule engine writes the recommendations
  LLM_PROVIDER="none"
  LLM_BASE_URL="https://api.openai.com/v1"
  LLM_MODEL="gpt-4o-mini"
  ```
- **Web environment (`apps/web/.env.local`)**:
  ```bash
  cp apps/web/.env.example apps/web/.env.local
  ```
  Ensure the API URL points to the backend:
  ```env
  NEXT_PUBLIC_API_URL="http://localhost:3001"
  ```

### Database Initialization

1. Start the PostgreSQL container:

   ```bash
   docker compose up -d
   ```

2. Generate the Prisma Client:

   ```bash
   pnpm db:generate
   ```

3. Push the database schema and seed the initial skills and default user:
   ```bash
   pnpm --filter @lingopath/api db:push
   ```

   This also creates the `calendar_settings` table that stores the per-user heatmap
   thresholds and the streak rule used by the calendar.

   ```bash
   pnpm --filter @lingopath/api db:seed
   ```

### Running the Application

Start all workspaces in development mode:

```bash
pnpm dev
```

- **Web Frontend**: [http://localhost:3000](http://localhost:3000)
- **API Server**: [http://localhost:3001](http://localhost:3001)
- **API Health Endpoint**: [http://localhost:3001/api/health](http://localhost:3001/api/health)

---

## Available Commands

| Command             | Action                                                                |
| ------------------- | --------------------------------------------------------------------- |
| `pnpm dev`          | Start development servers concurrently across web and api             |
| `pnpm build`        | Compile and build all shared packages and applications for production |
| `pnpm typecheck`    | Run strict TypeScript validation across the entire workspace          |
| `pnpm lint`         | Execute ESLint across all projects                                    |
| `pnpm lint:fix`     | Automatically resolve fixable ESLint warnings and errors              |
| `pnpm test`         | Execute all Vitest unit and integration test suites                   |
| `pnpm format`       | Format code with Prettier and Tailwind CSS class sorter               |
| `pnpm format:check` | Verify code formatting compliance                                     |
| `pnpm db:generate`  | Regenerate Prisma Client from `schema.prisma`                         |

---

## API Reference

All application endpoints are versioned under `/api/v1` (with the exception of `/api/health`).

### Long-Term Plans (`/api/v1/plans`)

| Method          | Endpoint                     | Description                                                           |
| --------------- | ---------------------------- | --------------------------------------------------------------------- |
| `GET`           | `/api/v1/plans`              | List user plans (supports status filter and cursor pagination)        |
| `POST`          | `/api/v1/plans`              | Create a new long-term plan                                           |
| `GET`           | `/api/v1/plans/:id`          | Retrieve plan details by ID                                           |
| `GET`           | `/api/v1/plans/:id/progress` | Consolidated endpoint returning plan progress, milestones, and pacing |
| `PUT` / `PATCH` | `/api/v1/plans/:id`          | Update plan details (title, dates, target, status)                    |
| `DELETE`        | `/api/v1/plans/:id`          | Delete a plan                                                         |

### Milestones (`/api/v1/milestones`)

| Method          | Endpoint                           | Description                             |
| --------------- | ---------------------------------- | --------------------------------------- |
| `GET`           | `/api/v1/plans/:planId/milestones` | List all milestones for a specific plan |
| `POST`          | `/api/v1/plans/:planId/milestones` | Create a milestone within a plan        |
| `PUT` / `PATCH` | `/api/v1/milestones/:id`           | Update milestone details                |
| `DELETE`        | `/api/v1/milestones/:id`           | Delete a milestone                      |

### Study Sessions & Timer Stats (`/api/v1/sessions`)

| Method   | Endpoint                  | Description                                                                 |
| -------- | ------------------------- | --------------------------------------------------------------------------- |
| `GET`    | `/api/v1/sessions`        | List sessions with cursor pagination, search, sorting, and date/skill filters |
| `GET`    | `/api/v1/sessions/today-stats` | Get today's study time, daily target, remaining time, streak, and sessions |
| `POST`   | `/api/v1/sessions`        | Record a new study session (manual or timer)                                |
| `GET`    | `/api/v1/sessions/:id`    | Get details of a single session                                             |
| `PUT`    | `/api/v1/sessions/:id`    | Update a session entry                                                      |
| `DELETE` | `/api/v1/sessions/:id`    | Remove a session entry                                                      |

### Goals & Taxonomy

| Method          | Endpoint             | Description                                                                        |
| --------------- | -------------------- | ---------------------------------------------------------------------------------- |
| `GET`           | `/api/v1/dashboard`  | Consolidated endpoint returning full dashboard overview (today, plan, goals, week) |
| `GET`           | `/api/v1/goals`      | List goals (supports period filter, active filter, and `?includeProgress=true`)    |
| `POST`          | `/api/v1/goals`      | Create a new goal with optional skill distribution targets and plan linkage        |
| `GET`           | `/api/v1/goals/:id`  | Get goal details (supports `?includeProgress=true` for calculated progress)        |
| `PUT` / `PATCH` | `/api/v1/goals/:id`  | Update goal configuration (period, target, dates, skill targets, plan link)        |
| `DELETE`        | `/api/v1/goals/:id`  | Delete a goal                                                                      |
| `GET`           | `/api/v1/skills`     | List available skill taxonomy domains                                              |
| `GET`           | `/api/v1/categories` | List default and user-defined study categories                                     |
| `GET`           | `/api/v1/objectives` | List learning objectives (IELTS, TOEFL, etc.)                                      |
| `GET`           | `/api/v1/objectives/active` | The active objective plus its derived facts and factual signals            |
| `PUT`           | `/api/v1/objectives/active` | Designate the active objective, or clear it with `{"objectiveId": null}`   |
| `POST`          | `/api/v1/objectives` | Create an objective (target score and target date optional)                        |
| `PUT` / `PATCH` | `/api/v1/objectives/:id` | Update an objective                                                           |
| `DELETE`        | `/api/v1/objectives/:id` | Delete an objective; the focus clears itself if it pointed here            |

---

### CEFR Levels (`/api/v1/assessments`)

| Method          | Endpoint                      | Description                                                                                     |
| --------------- | ----------------------------- | ----------------------------------------------------------------------------------------------- |
| `GET`           | `/api/v1/assessments`         | List recorded assessments (cursor pagination, newest first)                                      |
| `GET`           | `/api/v1/assessments/overview` | Most recently recorded level per dimension, the change since the earlier recording, and history |
| `GET`           | `/api/v1/assessments/:id`     | Get a single assessment                                                                          |
| `POST`          | `/api/v1/assessments`         | Record an assessment (at least one of the five dimensions)                                       |
| `PUT` / `PATCH` | `/api/v1/assessments/:id`     | Update an assessment; `null` clears a dimension, an omitted field leaves it alone                |
| `DELETE`        | `/api/v1/assessments/:id`     | Delete an assessment                                                                             |

The overview payload carries `basis: "RECORDED_ASSESSMENTS"`, the dimension display order, the `rankByLevel` map and a `levels` map per history entry, so a client never has to re-state the A1–C2 order, the dimension list or which column holds which dimension.

---

### Exams & Results (`/api/v1/exams`)

| Method          | Endpoint                   | Description                                                                                 |
| --------------- | -------------------------- | ------------------------------------------------------------------------------------------- |
| `GET`           | `/api/v1/exams`            | List exams with their resolved scale, `?type=` and `?status=` filters                        |
| `GET`           | `/api/v1/exams/scales`     | The built-in scoring scales and each exam type's default                                     |
| `GET`           | `/api/v1/exams/:id`        | Get one exam with its scale and recorded results                                             |
| `POST`          | `/api/v1/exams`            | Create an exam, with test date, target and optional `scoreScale` descriptor                   |
| `PUT` / `PATCH` | `/api/v1/exams/:id`        | Update an exam; explicit `null` clears a target or the scale                                 |
| `DELETE`        | `/api/v1/exams/:id`        | Delete an exam and its recorded results                                                      |
| `POST`          | `/api/v1/exams/:id/results` | Record a result, validated against that exam's own scale                                    |
| `GET`           | `/api/v1/exams/:id/results` | List the results recorded for an exam                                                       |

---

### Study Calendar & Streaks (`/api/v1/calendar`, `/api/v1/streak`)

| Method | Endpoint                     | Description                                                                                        |
| ------ | ---------------------------- | -------------------------------------------------------------------------------------------------- |
| `GET`  | `/api/v1/calendar`           | Heatmap payload for `?year=YYYY` (current year by default) or `?from=YYYY-MM-DD&to=YYYY-MM-DD`      |
| `GET`  | `/api/v1/calendar/day/:date` | Day drill-down: totals, skills, categories, topics, notes and individual sessions                   |
| `GET`  | `/api/v1/calendar/settings`  | Effective thresholds, streak rule and timezone (`USER` or `DEFAULT`)                                |
| `PUT`  | `/api/v1/calendar/settings`  | Persist `intensityThresholds` and/or `streakQualifyingMinutes`                                      |
| `GET`  | `/api/v1/streak`             | Current and longest streak plus today's standing                                                    |

These endpoints also accept the optional query overrides `?timezone=`, `?intensityThresholds=20,40,60,90` and `?streakQualifyingMinutes=20`.


---

### Analytics (`/api/v1/analytics`)

| Method | Endpoint            | Description                                                                          |
| ------ | ------------------- | ------------------------------------------------------------------------------------ |
| `GET`  | `/api/v1/analytics` | Consolidated analytics payload for `?range=7d|30d|90d|current-year|previous-year` or `?range=custom&from=YYYY-MM-DD&to=YYYY-MM-DD` (max 731 days), optional `?timezone=` |

The payload contains `summary`, `skills`, `trends`, `comparison`, `plans` and `goals`. Streaks come from the calendar module, goal progress from the goals module and plan progress from the plans module, so analytics never redefines an existing rule.

### AI Recommendations (`/api/v1/recommendations`)

| Method | Endpoint                              | Description                                                                                   |
| ------ | ------------------------------------- | --------------------------------------------------------------------------------------------- |
| `POST` | `/api/v1/recommendations/generate`    | Run the pipeline and store a fresh batch, retiring the previous open one                      |
| `GET`  | `/api/v1/recommendations`             | List stored recommendations (`?status=`, `?type=`, `?limit=`)                                 |
| `GET`  | `/api/v1/recommendations/:id`         | Get one recommendation                                                                        |
| `POST` | `/api/v1/recommendations/:id/feedback` | Record `ACCEPTED` / `REJECTED` / `MODIFIED` / `POSTPONED` / `IGNORED`, with an optional `reason` |
| `POST` | `/api/v1/recommendations/:id/apply`   | Create a goal from an accepted recommendation — requires `{"confirm": true}`                  |

Each item carries `title`, `recommendation`, `rationale`, `supportingData` (label / value / source), `confidence`, `confidenceBasis`, `estimatedDurationMinutes`, `relatedSkillId`, `relatedGoalId`, `relatedPlanId`, `generatedAt`, `status`, `source` and an optional `suggestedAction`. Generation `meta` reports `source` (`LLM` or `RULE_BASED`), the LLM status, the confidence ceiling and the data-quality notes. Accepting returns `meta.followUp` — the "add this to your plan?" question — because accepting and applying are two decisions, not one.

## Architecture Principles

1. **`StudySession` as Single Source of Truth**: All progress metrics, streaks, completed hours, and milestone achievements are computed directly from real session logs. Progress totals are never stored as static editable numbers.
2. **Timezone Accuracy**: Timestamps are stored in UTC. Calendar boundaries, day countdowns, and streak calculations are computed against the user's configured timezone, correctly handling midnight transitions, month lengths, leap years, and Daylight Saving Time (DST).
3. **No Double-Counting**: Explicit milestone attribution takes priority. Unassigned sessions under a plan are mapped to non-overlapping milestone date ranges, ensuring total plan time equals the exact sum of verified study hours.
4. **Decoupled Architecture**: Strict separation of concerns between HTTP routes, business services, and database repositories prevents leaky abstractions and simplifies testing.
5. **Zero Data Loss on State Changes**: Archiving or cancelling plans or milestones never deletes historical study sessions.
6. **Robust Local-First Timer Persistence**: Timer state persists locally across browser refreshes, tab switches, and accidental navigations using timestamp calculations without hammering backend endpoints every second. Duplicate-prevention tokens guarantee exactly one session is created upon stopping.

7. **One Definition of a Streak**: Daily totals, heatmap intensity and streaks are always derived from `StudySession` rows by a single pure module (`apps/api/src/modules/calendar/calendar.domain.ts`). Nothing is cached or persisted, so no second source of truth can drift; the calendar, the study page and the dashboard all read the same reader. Day boundaries come from one DST-aware utility (`apps/api/src/shared/timezone.ts`) instead of per-module offset arithmetic.

---

## Study Calendar & Streak Rules

- **Day ownership**: a session belongs to the local day its `startedAt` falls on, even when it runs past midnight, so a session is never split or double-counted.
- **Qualifying day**: the day's total minutes must reach the configured threshold (20 minutes by default). Several short sessions add up; one long session still counts once.
- **Current streak**: includes today when today qualifies. While today is still in progress the streak keeps counting through yesterday (surfaced as `todayPending`) and only breaks once a whole day is missed.
- **Longest streak**: the best run over the whole history, earliest run winning ties.
- **Intensity buckets**: default `0 | 1-20 | 21-40 | 41-60 | 61-90 | 90+` minutes, configurable per user (up to seven bounds). The UI legend always comes from the server, so screen and data cannot disagree.
- **Timezones**: everything is stored in UTC and reported in the user's configured timezone. 23-hour and 25-hour DST days, skipped local midnights and date-line skips are handled by the timezone utility and covered by `apps/api/tests/timezone.test.ts`.

---

## CEFR Level & Exam Scoring Rules

- **Five dimensions, independently optional**: `overall`, `listening`, `reading`, `writing`, `speaking`. An assessment must record at least one; the others stay `null`, which reads as "not assessed" — never as "unknown" and never as an estimate. An update merges onto the stored row, so a newer assessment that skipped a dimension does not erase that dimension's earlier recording.
- **"Most recently recorded" is per dimension**: the level shown for reading comes from the newest assessment that actually recorded reading, not from the newest assessment overall.
- **Rank, not vibes**: A1–C2 map to ranks 1–6 in one place (`cefrRank`). A change is the difference between two recorded ranks; the first recording has no change to report.
- **IELTS**: overall band plus the four skills, the test date, the target band and the target date. The band scale is 0–9 in half-band steps.
- **TOEFL**: iBT total out of 120 with four 30-point sections. The model never hardcodes this: it is one preset descriptor, so a revised format is a new descriptor rather than a schema change.
- **Scores are stored as reported**: the overall is not recomputed from the sections, and a result with only section scores keeps a `null` overall instead of a fabricated total.
- **`step` is a rendering hint**: it drives the decimals shown (`7.5` vs `110`) and the input increments. It is deliberately not enforced, because mock providers report finer precision than the official scale.
- **Only the day the learner picked**: date-only fields are stored at UTC midnight and read back from their UTC date, so a date never shifts a day for someone west of UTC (`dayKeyFromInstant` in `apps/web/src/lib/calendar.ts`).

8. **Analytics Aggregate in SQL, Not in Node**: analytics windows are computed by one grouped query (`date_trunc` over `AT TIME ZONE`) plus SQL aggregates, so only a bounded set of (day, skill) rows reaches the application. Percentages use one shared definition (`computeStudyProgressPercent`), and period comparisons report "New" rather than an infinite change when the previous window was empty.

9. **Levels Are Recorded, Never Inferred — and Nothing Is Graded**: a CEFR level exists only because the learner recorded an assessment. `apps/api/src/modules/assessments/level.domain.ts` cannot read `StudySession` at all; the overview is empty until an assessment exists; and no code path converts hours studied into a level, a predicted score or a readiness verdict. Where a comparison is shown (a target band against a recorded result, a level against the previous recording), it is arithmetic on values the learner entered, and the observation carries the fact it came from. The signal module (`apps/api/src/modules/objectives/objective.signals.ts`) has no database dependency, and both it and the level domain are covered by guard tests that fail on readiness vocabulary.

10. **Scales Are Data, Not Columns**: an exam's scoring scale is an opaque descriptor (`{ key, label, min, max, step, sections }`) stored in `exams.score_scale` and resolved by a preset registry (`apps/api/src/modules/exams/exam.scoring.ts`). Scores are validated against their own exam's scale, so an IELTS band out of 9 and a TOEFL total out of 120 coexist without a redesign — and a future scoring change is a new preset or a stored descriptor rather than a migration. The resolved scale is sent to the client (including how many decimals to render and what to call the target), so the UI never restates a scoring rule.

11. **Recommendations Are Grounded, Not Improvised**: the model never sees the database, never sees a session, a note, a display name or a timezone, and never authors the evidence. It receives a redacted context built by `recommendation.aggregation.ts`, may only rewrite candidates the deterministic engine produced, and its output is validated twice: by Zod against an exact schema, and by a reasoning guard that rejects ability diagnoses, score predictions and readiness verdicts. `supportingData` is always the engine's own. Every failure path — no provider, timeout, invalid JSON, schema mismatch, rejected prose — returns the rule-based wording, so the endpoint cannot fail because a model misbehaved. `HIGH` additionally requires at least 20 sessions across 10 active days plus a recorded assessment or exam result, and the band is described as coarse in every payload, because a sufficiency rule is not a probability.
