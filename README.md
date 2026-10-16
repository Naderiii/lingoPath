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

### 6. Learning Objectives & Exam Tracking

- **Exam & Custom Objectives**: Support for IELTS, TOEFL, General English, Immigration, and custom learning targets with target scores and deadlines.
- **Exam Scheduling**: Plan and track exam dates, venues, and registration status.

### 7. Consolidated Main Dashboard

- **Real-Time Overview**: Single consolidated dashboard API and view at `/dashboard` bringing together today's study progress, active long-term plan, goals, weekly breakdown, skill distribution, monthly/yearly trends, and recent study activity.
- **Robust States**: Graceful loading, error handling, and helpful empty states guiding new users to start their first session or create their first plan.

### 8. Study Calendar & Streaks

- **GitHub-Style Heatmap**: A `/calendar` view of daily study activity as week-by-week columns, colour-coded by how long you studied.
- **Flexible Ranges**: Current year, previous year, or any custom range up to two years.
- **Configurable Intensity Scale**: The default scale is `0 | 1-20 | 21-40 | 41-60 | 61-90 | 90+` minutes; bounds are editable per user and persist.
- **Day Drill-Down**: Clicking a day shows total study time, session count, first-last session times, per-skill / per-category / per-topic distribution, free-text notes, and every single session.
- **Timezone-Correct Streaks**: Current and longest streak, computed in the user's timezone with a configurable qualifying threshold (20 minutes by default). Multiple short sessions on one day add up.
- **Boundary-Proof**: Midnights, DST transitions (23- and 25-hour days), month ends, year ends and leap days are all covered by tests; missed days break the run, a day still in progress never does.

### 9. Study Analytics

- **Consolidated Analytics Page**: `/analytics` for one selected window — 7 / 30 / 90 days, this year, last year, or a custom range up to two years.
- **Headline Metrics**: total study time, session count, active and inactive days, average daily time, average session length, longest session, current and longest streak, and the share of days that met the daily goal.
- **Skill Analytics**: time, share, session count, average session length and the recent trend for every skill, with a zero-baseline aware comparison.
- **Time Trends**: an area chart whose buckets adapt to the range (days, weeks, months).
- **Period Comparison**: current window against the previous one, reporting an absolute change instead of a misleading infinite percentage when the previous window was empty.
- **Long-Term Plan Analytics**: planned vs actual, elapsed calendar time vs study progress, a pace verdict with the daily minutes needed to catch up, milestone performance, and monthly and weekly performance.
- **Database-Side Aggregation**: one grouped SQL query per window (day x skill) plus SQL aggregates for the longest session; the full study history is never loaded into Node.js.

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

- **`User`**: Root identity record storing user configuration such as `timezone`.
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
│   │   │   │   ├── assessments/ # CEFR level evaluation
│   │   │   │   ├── analytics/   # Study-time analytics, trends, comparisons & plan pacing
│   │   │   │   ├── calendar/    # Study calendar heatmap, day drill-down & streaks
│   │   │   │   ├── categories/  # Session category management
│   │   │   │   ├── exams/       # Exam & mock test tracking
│   │   │   │   ├── goals/       # Recurring goal engine
│   │   │   │   ├── health/      # Health check probes
│   │   │   │   ├── objectives/  # Learning objectives
│   │   │   │   ├── plans/       # Long-term plans & milestone services
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
│       │   │       ├── goals/    # Goal tracking & management (/goals)
│       │   │       ├── planning/ # Long-Term Plan views (/planning, /planning/[id])
│       │   │       └── study/    # Study tracking, live timer (/study, /study/timer, /study/history)
│       │   ├── components/      # UI components
│       │   │   ├── goals/       # Goal cards, lists, creation/detail dialogs, progress displays
│       │   │   ├── calendar/    # Heatmap grid, streak cards, day detail & threshold dialogs
│       │   │   ├── layout/      # Sidebar, top-bar, navigation
│       │   │   ├── analytics/   # Summary cards, trend/skill charts, comparison & plan pacing
│       │   │   ├── planning/    # Plan cards, lists, details, progress bars, dialogs
│       │   │   ├── study/       # Study timer, quick-add modal, stats, today sessions
│       │   │   ├── shared/      # Empty, loading, and error states
│       │   │   └── ui/          # Radix UI primitives & buttons
│       │   └── lib/             # API client, React Query hooks (use-goals, use-sessions, use-plans, use-study-timer), utilities
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

8. **Analytics Aggregate in SQL, Not in Node**: analytics windows are computed by one grouped query (`date_trunc` over `AT TIME ZONE`) plus SQL aggregates, so only a bounded set of (day, skill) rows reaches the application. Percentages use one shared definition (`computeStudyProgressPercent`), and period comparisons report "New" rather than an infinite change when the previous window was empty.
