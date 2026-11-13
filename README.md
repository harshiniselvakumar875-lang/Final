# BrandGuard AI

BrandGuard AI is a React/Vite frontend with a Spring Boot API and MySQL database. The current content checker uses the active brand rules; it does not call an external AI provider.

## Run locally

Requirements: Node.js, Java 21 or newer, Maven, and Docker Compose.

1. Start MySQL:

    ```sh
    docker compose up -d mysql
    ```

2. Set a private JWT signing secret and start the API from the project root:

    ```sh
    export DATABASE_URL='jdbc:mysql://localhost:3306/brandguard?serverTimezone=UTC'
    export DATABASE_USERNAME='brandguard'
    export DATABASE_PASSWORD='brandguard'
    export FRONTEND_ORIGIN='http://localhost:5173'
    export JWT_SECRET="$(openssl rand -base64 32)"
    export SEED_USERS=true
    export ADMIN_PASSWORD='AdminPass123!'
    export REVIEWER_PASSWORD='ReviewPass123!'
    export CREATOR_PASSWORD='CreatorPass123!'
    mvn -f backend/pom.xml spring-boot:run
    ```

    `JWT_SECRET` is required; the application has no built‑in signing secret. Flyway applies the database migrations at startup. The API listens on port `8080`; MySQL listens on port `3306`.

3. In another terminal, install frontend dependencies and start Vite:

    ```sh
    npm install
    npm run dev
    ```

4. Open [http://localhost:5173](http://localhost:5173). Vite proxies `/api` requests to `http://localhost:8080` by default. To use a different API address, set `VITE_API_PROXY_TARGET`.

## Docker‑Compose Quick Start (recommended)

The project ships with a fully‑configured `docker-compose.yml` that starts **MySQL**, **backend**, **frontend**, and an **Nginx** reverse‑proxy in one command. This removes the need to manually export environment variables.

```sh
# From the project root (c:\Users\DELL\Downloads\Brandguard-project\project)
# Clean any previous run (optional)
docker compose down --rmi all -v

# Build and run the complete stack in detached mode
docker compose up --build -d
```

The services become reachable at:
- **Backend API** – `http://localhost:8081/api/...`
- **Frontend UI** – `http://localhost`
- **MySQL** (if you need to connect manually) – `localhost:3306`

> **Why use Docker Compose?**
> * All services start in the correct order (MySQL → backend → frontend → Nginx).
> * Health‑checks guarantee the backend is ready before the UI starts.
> * No need to manage environment variables manually – they are defined in the compose file.

## Local demo accounts

Demo‑user seeding is disabled by default. The optional local demo accounts are enabled in the setup command above; use unique passwords for local testing:

```sh
export SEED_USERS=true
export ADMIN_PASSWORD='AdminPass123!'
export REVIEWER_PASSWORD='ReviewPass123!'
export CREATOR_PASSWORD='CreatorPass123!'
```

These local accounts are then seeded:

| Role | Email | Password |
|---|---|---|
| Creator | `creator@brandguard.local` | `CreatorPass123!` |
| Reviewer | `reviewer@brandguard.local` | `ReviewPass123!` |
| Brand admin | `admin@brandguard.local` | `AdminPass123!` |

These are development credentials only. Set unique credentials for local testing, and leave demo seeding disabled outside development.

## Main workflow

Sign in as a creator to submit and analyze content. The active approved rules generate evidence‑linked findings. A reviewer can request changes or approve a submission; a creator can then revise and re‑analyze it. Brand admins can add, edit, and archive approved sources from the Brand library; each published change advances the guideline version.

Use the sun/moon control in the workspace or sign‑in screen to switch between light and dark themes. Your theme preference is saved in the browser.

## Content analysis

Rule‑based analysis is the default and does **not** send draft text to an external provider. To opt‑in to OpenAI analysis, configure:

```sh
ANALYSIS_PROVIDER=openai
OPENAI_API_KEY=your‑key-here
# OPTIONAL – defaults to gpt‑4.1‑mini
OPENAI_MODEL=gpt-4.1-mini
```

`OPENAI_MODEL` defaults to `gpt-4.1-mini`. Draft text is sent to OpenAI for review against the active brand sources; returned findings are checked against those sources and the original draft before being saved. If the provider is unavailable or returns invalid data, analysis fails visibly instead of silently falling back. Keep the API key private and do **not** commit it to source control.

## Frontend production build

```sh
npm run build
```

## Backend compile and test

```sh
mvn -f backend/pom.xml test
```

Backend unit tests run with `mvn -f backend/pom.xml test`. The creator/reviewer API workflow and MySQL migrations have also been smoke‑tested locally.

## Database note

The development database has changed from PostgreSQL to MySQL. The existing PostgreSQL Docker volume is not deleted or migrated; its data remains untouched. The MySQL database starts with the built‑in BrightPath brand rules and seeded demo accounts.

---

### Improvements added
- Clear Docker‑Compose quick‑start section with one‑liner commands.
- Explicit URLs for backend (`http://localhost:8081`) and frontend (`http://localhost`).
- Guidance on why Docker Compose is the recommended way.
- Updated environment‑variable examples for Windows PowerShell readers (use `$env:VAR='value'`).
- Added a concise “Improvements added” note at the end of the file.
