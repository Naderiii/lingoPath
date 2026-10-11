# LingoPath

> _Your English learning path, measured._

LingoPath is an English learning planning, tracking, and analytics system. It provides goal-driven language learners with a framework to design structured long-term study plans (e.g., 6-Month IELTS Preparation, TOEFL strategies, or General English fluency), organize multi-stage milestones, track real study sessions, and monitor planned versus actual progress over time.

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

### 3. Study Session Accounting

- **Verified Durations**: Session duration is calculated from explicit start and end UTC timestamps with sanity bounds.
- **Taxonomy & Skills**: Categorize study time across 8 core domains: Vocabulary, Grammar, Listening, Reading, Writing, Speaking, Pronunciation, and Conversation.
- **Attribution & Audit Trail**: Sessions associate with plans and milestones without double-counting.

### 4. Learning Objectives & Goals

- **Exam & Custom Objectives**: Support for IELTS, TOEFL, General English, Immigration, and custom learning targets with target scores and deadlines.
- **Recurring Goals**: Daily, weekly, monthly, and yearly study goals per skill domain.

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
| **Frontend**           | Next.js 14 (App Router), React 18, TypeScript, Tailwind CSS, Radix UI, TanStack Query v5, Lucide Icons, `next-themes` |
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
│   │   │   │   ├── categories/  # Session category management
│   │   │   │   ├── exams/       # Exam & mock test tracking
│   │   │   │   ├── goals/       # Recurring goal engine
│   │   │   │   ├── health/      # Health check probes
│   │   │   │   ├── objectives/  # Learning objectives
│   │   │   │   ├── plans/       # Long-term plans & milestone services
│   │   │   │   ├── sessions/    # Study session recording
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
│       │   │       ├── calendar/
│       │   │       ├── dashboard/
│       │   │       ├── goals/
│       │   │       ├── planning/ # Long-Term Plan views (/planning, /planning/[id])
│       │   │       └── study/
│       │   ├── components/      # UI components
│       │   │   ├── layout/      # Sidebar, top-bar, navigation
│       │   │   ├── planning/    # Plan cards, lists, details, progress bars, dialogs
│       │   │   ├── shared/      # Empty, loading, and error states
│       │   │   └── ui/          # Radix UI primitives & buttons
│       │   └── lib/             # API client, React Query hooks, utilities
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

### Study Sessions (`/api/v1/sessions`)

| Method   | Endpoint               | Description                                                 |
| -------- | ---------------------- | ----------------------------------------------------------- |
| `GET`    | `/api/v1/sessions`     | List sessions with cursor pagination and date/skill filters |
| `POST`   | `/api/v1/sessions`     | Record a new study session                                  |
| `GET`    | `/api/v1/sessions/:id` | Get details of a single session                             |
| `PUT`    | `/api/v1/sessions/:id` | Update a session entry                                      |
| `DELETE` | `/api/v1/sessions/:id` | Remove a session entry                                      |

### Goals & Taxonomy

| Method | Endpoint             | Description                                           |
| ------ | -------------------- | ----------------------------------------------------- |
| `GET`  | `/api/v1/goals`      | List recurring goals (daily, weekly, monthly, yearly) |
| `POST` | `/api/v1/goals`      | Create a recurring study goal with skill allocations  |
| `GET`  | `/api/v1/skills`     | List available skill taxonomy domains                 |
| `GET`  | `/api/v1/categories` | List default and user-defined study categories        |
| `GET`  | `/api/v1/objectives` | List learning objectives (IELTS, TOEFL, etc.)         |

---

## Architecture Principles

1. **`StudySession` as Single Source of Truth**: All progress metrics, streaks, completed hours, and milestone achievements are computed directly from real session logs. Progress totals are never stored as static editable numbers.
2. **Timezone Accuracy**: Timestamps are stored in UTC. Calendar boundaries, day countdowns, and streak calculations are computed against the user's configured timezone, correctly handling midnight transitions, month lengths, leap years, and Daylight Saving Time (DST).
3. **No Double-Counting**: Explicit milestone attribution takes priority. Unassigned sessions under a plan are mapped to non-overlapping milestone date ranges, ensuring total plan time equals the exact sum of verified study hours.
4. **Decoupled Architecture**: Strict separation of concerns between HTTP routes, business services, and database repositories prevents leaky abstractions and simplifies testing.
5. **Zero Data Loss on State Changes**: Archiving or cancelling plans or milestones never deletes historical study sessions.
