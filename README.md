# LingoPath

> Your English learning path, measured.

LingoPath is a personal English learning analytics and planning system designed to track study activities, goals, consistency, CEFR proficiency milestones, and IELTS/TOEFL preparation, with upcoming advisory AI study recommendations.

---

## Features (Phase 1 Foundation)

- **Study Activity Tracking**: Centralized session management with UTC timestamps and verified duration calculations.
- **English Skills Taxonomy**: 8 core skill domains (Vocabulary, Grammar, Listening, Reading, Writing, Speaking, Pronunciation, Conversation).
- **Responsive Dashboard Shell**: Next.js App Router application shell featuring a desktop sidebar, mobile navigation drawer, theme switching (Light / Dark mode), and typed placeholder routes.
- **RESTful API**: Fastify v4 backend with input validation, centralized error handling, structured logging, and health probing.
- **Single Source of Truth**: `StudySession` records serve as the definitive audit trail for all future analytics, streak calculations, and goal progress.
- **Dockerized PostgreSQL**: Ready-to-run container definition with health checks and persistent volume storage.

---

## Tech Stack

### Frontend (`apps/web`)

- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript (strict)
- **Styling**: Tailwind CSS, `tailwindcss-animate`
- **UI Components**: Radix UI primitives, `class-variance-authority`, Lucide icons
- **State & Data Fetching**: TanStack Query (React Query) v5
- **Forms & Validation**: React Hook Form, Zod
- **Theming**: `next-themes` (system-aware dark/light modes)

### Backend (`apps/api`)

- **Runtime**: Node.js (>=20)
- **Server**: Fastify v4
- **Language**: TypeScript
- **Database & ORM**: PostgreSQL, Prisma ORM v5
- **Validation**: Zod
- **Security**: `@fastify/helmet`, `@fastify/cors`
- **Logging**: Pino with `pino-pretty` development formatting
- **Architecture**: Route → Controller → Service → Repository pattern

### Monorepo & Tooling

- **Package Manager**: pnpm v9 workspaces
- **Monorepo Engine**: Turborepo v2
- **Testing**: Vitest, React Testing Library, JSDOM
- **Code Quality**: ESLint, Prettier with Tailwind plugin
- **Shared Packages**:
  - `@lingopath/types`: Shared schemas, interfaces, and API contracts
  - `@lingopath/tsconfig`: Standardized TypeScript base configs

---

## Project Structure

```text
lingoPath/
├── apps/
│   ├── api/                  # Fastify REST API server
│   │   ├── src/
│   │   │   ├── modules/      # Domain modules (health, skills, sessions)
│   │   │   ├── plugins/      # Fastify plugins (cors, helmet, prisma, error-handler)
│   │   │   ├── shared/       # Error classes and common helpers
│   │   │   ├── app.ts        # App factory
│   │   │   ├── config.ts     # Environment validation
│   │   │   └── server.ts     # Process entrypoint & graceful shutdown
│   │   └── tests/            # Vitest unit and integration suites
│   └── web/                  # Next.js frontend application
│       ├── src/
│       │   ├── app/          # App router pages & layouts
│       │   ├── components/   # UI primitives, shell layout, shared states
│       │   └── lib/          # API client, Query client, utilities
│       └── public/           # Static assets
├── packages/
│   ├── tsconfig/             # Shared TypeScript configuration presets
│   └── types/                # Shared Zod schemas & TypeScript type definitions
├── prisma/
│   ├── schema.prisma         # Prisma data models (User, Skill, StudySession)
│   └── seed.ts               # Database seed script for default user & skills
├── docker-compose.yml        # PostgreSQL container setup
├── turbo.json                # Turborepo task pipeline configuration
└── pnpm-workspace.yaml       # Workspace package definitions
```

---

## Getting Started

### Prerequisites

- **Node.js**: `>= 20.0.0`
- **pnpm**: `>= 9.0.0`
- **Docker & Docker Compose** (optional, for local PostgreSQL)

### Installation

1. Clone the repository and navigate into the project directory:

   ```bash
   git clone <repo-url>
   cd lingoPath
   ```

2. Install dependencies:

   ```bash
   pnpm install
   ```

3. Configure environment variables:
   - Root database configuration:
     ```bash
     cp .env.example .env
     ```
   - API environment:
     ```bash
     cp apps/api/.env.example apps/api/.env
     ```
   - Web environment:
     ```bash
     cp apps/web/.env.example apps/web/.env.local
     ```

### Database Setup

1. Start PostgreSQL using Docker:

   ```bash
   docker compose up -d
   ```

   _(Or point `DATABASE_URL` in `apps/api/.env` to an existing PostgreSQL instance.)_

2. Generate the Prisma client:

   ```bash
   pnpm db:generate
   ```

3. Push the schema to the database and seed initial data:
   ```bash
   pnpm --filter @lingopath/api db:push
   pnpm --filter @lingopath/api db:seed
   ```

### Development

Run all applications and packages concurrently with Turborepo:

```bash
pnpm dev
```

- **Web Frontend**: [http://localhost:3000](http://localhost:3000)
- **API Server**: [http://localhost:3001](http://localhost:3001)
- **API Health Check**: [http://localhost:3001/api/health](http://localhost:3001/api/health)

---

## Available Commands

| Command             | Description                                            |
| ------------------- | ------------------------------------------------------ |
| `pnpm dev`          | Run all applications in development mode               |
| `pnpm build`        | Build all packages and applications                    |
| `pnpm typecheck`    | Run TypeScript type checks across the entire workspace |
| `pnpm lint`         | Run ESLint across all projects                         |
| `pnpm lint:fix`     | Automatically fix ESLint issues                        |
| `pnpm test`         | Run all Vitest test suites                             |
| `pnpm format`       | Format all files using Prettier                        |
| `pnpm format:check` | Verify formatting consistency                          |
| `pnpm db:generate`  | Generate Prisma Client from schema                     |

---

## API Endpoints (v1)

### Health

- `GET /api/health` — Probing endpoint, returns `{"status": "ok"}`

### Skills

- `GET /api/v1/skills` — List default and custom English skills

### Study Sessions

- `GET /api/v1/sessions` — Cursor-paginated study sessions (filterable by `skillId`, date range)
- `POST /api/v1/sessions` — Record a study session
- `GET /api/v1/sessions/:id` — Get session details
- `PUT /api/v1/sessions/:id` — Update session details
- `DELETE /api/v1/sessions/:id` — Remove a session entry

---

## Application Routes

- `/dashboard` — High-level study overview, streaks, and current goals
- `/study` — Study center & quick logging
- `/study/timer` — Real-time study timer
- `/study/history` — Historical session log with filtering
- `/planning` — Study plans & objective milestones
- `/calendar` — Calendar view of learning sessions
- `/analytics` — Study time distribution, heatmaps, and period comparisons
- `/goals` — Daily, weekly, monthly, and yearly target management
- `/levels` — CEFR proficiency tracker
- `/exams` — IELTS/TOEFL exam dates and mock results
- `/settings` — Profile, timezone settings, and preferences

---

## Architectural Principles

1. **Source of Truth**: `StudySession` is the sole source of truth for learning duration. Derived data (streaks, goal completion, distributions) is computed dynamically.
2. **Timezone Integrity**: All dates and times are persisted in UTC. Calendar boundaries and streaks are computed against the user's configured timezone.
3. **Decoupled Layers**: Controllers handle HTTP concerns, services execute business logic and validation, and repositories encapsulate database interactions.
4. **Advisory AI Philosophy**: Recommendations generated by future AI systems remain purely advisory. The user retains absolute control to accept, reject, modify, or postpone proposals.
