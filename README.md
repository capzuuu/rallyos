# RallyOS — Pickleball Game & Tournament Management Platform

**RallyOS — Every Game. Every Court. Every Point.**

RallyOS is a responsive, high-contrast sports technology platform built for pickleball clubs, sports facilities, tournament organizers, and court scorekeepers.

---

## Unified Login, Registration & Google OAuth (`/login`)

RallyOS uses **one unified authentication portal (`/login`)** with built-in **Self-Registration** and **Google Sign-In**:

- **Sign In**: Enter username/email and password to authenticate.
- **Create Account (Register)**: Self-registration tab allowing new facility managers to sign up with their Full Name, Username, Email, and Password. Automatically provisions a clean **Administrator** account with its own independent workspace.
- **Continue with Google**: Authenticate with Google OAuth via Supabase Auth (`supabase.auth.signInWithOAuth`). Seamlessly provisions an **Administrator** profile and syncs session tokens into RallyOS.

| Role | Username | Password | Access Scope & Permissions |
| :--- | :--- | :--- | :--- |
| **Super Admin** | `superadmin` | `SuperAdmin123!` | **Full Platform Governance**: System health, active database monitoring, Administrator account provisioning, activation/deactivation, and facility management. |
| **Administrator** | `admin` *(or Register / Google)* | `Admin123!` | **All Club Features**: Games, Tournaments, Courts, Live Scorekeeper, TV Scoreboard, Settings, and **exclusive authority to create & manage Scorekeeper accounts**. |
| **Scorekeeper** | `referee_alex` *(created by Admin)* | `Password123!` | **Score & TV Scoreboard**: Dedicated access to the Live Scorekeeper Console (`/scorekeeper`, `/scorekeeper/:gameId`) and Public TV Scoreboard (`/scoreboard`, `/scoreboard/:gameId`). |

### Enabling Google OAuth in Supabase Dashboard

To connect live Google accounts in production:
1. Go to your **[Supabase Project Dashboard](https://supabase.com/dashboard/project/qaocdecturwknyrbisse)** > **Authentication** > **Providers** > **Google**.
2. Toggle Google **ON**.
3. Enter your Google Cloud OAuth **Client ID** and **Client Secret**.
4. In Google Cloud Console, ensure the **Authorized Redirect URI** includes:
   `https://qaocdecturwknyrbisse.supabase.co/auth/v1/callback`
5. A built-in **Demo Google Sign-In** button is also available on `/login` for immediate testing.

---

## Core Operational Modules

1. **Games (`/games`, `/games/:gameId`)**
   - Create **Singles (1v1)** and **Doubles (2v2)** matches.
   - Real-time court availability filter with automatic conflict prevention.
   - Switch between **List View** and **Calendar View**.
   - Filter by player/game code, date, court, match type, and status (`Upcoming`, `Live`, `Completed`, `Cancelled`).
   - Dedicated Game Details page with live scoreboard header, match rules, and point-by-point audit history.

2. **Live Game Scoring (`/scorekeeper/:gameId`)**
   - Dedicated full-screen scorekeeper terminal separate from the administrative dashboard.
   - Optimized for touch operation during live pickleball matches.
   - Configurable rules: **Traditional Side-Out** or **Rally** scoring, games to **11 / 15 / 21**, **Win by 2 points**, and **Single Game / Best of 3 / Best of 5**.
   - Large neon lime (`#D7F66B`) scoreboard numbers, teal (`#12B9B0`) serving indicator, Server `#1` / `#2` rotation, and live match clock.
   - **Undo Last Point** with full event snapshot restoration and audit log.
   - Automatic tournament bracket advancement upon match completion.

3. **Public Live Scoreboard (`/scoreboard/:gameId`)**
   - Read-only full-screen display (`#172131` Deep Navy) built for arena televisions, courtside monitors, tablets, and phones.
   - Real-time synchronization via `BroadcastChannel`, `storage` events, and FastAPI WebSockets (`/api/v1/ws/games/:gameId`)—updates instantaneously whenever the scorekeeper awards a point or switches servers.

4. **Tournaments (`/tournaments`, `/tournaments/:tournamentId`)**
   - Organize **Single Elimination**, **Double Elimination**, and **Round Robin** competitions.
   - Dedicated 5-tab management workspace:
     - **Overview**: Tournament metadata, registration status, upcoming matches, and assigned courts.
     - **Participants**: Seeded player/team roster with Add, Edit, and Remove controls.
     - **Brackets**: Interactive bracket rounds with automatic winner advancement (or Round Robin standings table + match matrix).
     - **Schedule**: Match schedule with conflict-checked court assignment and rescheduling.
     - **Results**: Completed match scores and final tournament rankings.

5. **Courts (`/courts`)**
   - Real-time court cards showing court number, name, **Indoor / Outdoor** surface, status (`Available`, `Reserved`, `Occupied`, `Maintenance`, `Disabled`), current live game, and next scheduled match.
   - **Daily View** and **Weekly View** interactive schedule matrix with color-coded slots (`#D7F66B` Available, `#253247` Assigned Match, `#12B9B0` Live Game, `#E76B72` Maintenance/Disabled).
   - 6-step Court Assignment workflow with conflict prevention.

6. **Settings (`/settings`)**
   - **Business Settings**: Facility name, logo mark, contact info, and location.
   - **User Management**: Administrator, Staff, and Scorekeeper accounts, roles, and operator switcher.
   - **Game Settings**: Default scoring format, points per game, win-by-two rule, and match duration.
   - **Tournament Settings**: Available formats, default registration window, and bracket advancement preferences.
   - **Court Settings**: Court naming prefix, default surface type, operating hours, and availability defaults.

---

## Visual & Color System

- **Typography**: `Poppins` (`24px` bold titles, `17px` semibold section headers, `14px` semibold card headers, `64–80px` bold scoreboard numerals).
- **Color Palette**:
  - Primary Lime: `#D7F66B`
  - Dark Navy: `#253247`
  - Deep Navy: `#172131`
  - Off-White: `#F5F5F0`
  - Pure White: `#FFFFFF`
  - Teal Accent: `#12B9B0`
  - Muted Text: `#AEB8C7`
  - Light Text: `#F1F3F5`
  - Border: `#3C485B` / `#E5E8E3`
  - Status Accents: `#A6D957` (Success), `#F3C969` (Warning), `#E76B72` (Danger)

---

## Running the Project

### Option A: One-Command Launcher (Local + Network IP)

```powershell
cd d:\rallyos
.\start-rallyos.ps1
```

This binds both FastAPI (`0.0.0.0:8000`) and Vite (`0.0.0.0:5173`) to all network interfaces and prints your LAN IP URL (e.g. `http://192.168.x.x:5173`) so phones, tablets, and court TVs on the same Wi-Fi/network can open RallyOS directly.

### Option B: Manual Terminals

#### 1. Backend (`d:\rallyos\backend` — Python FastAPI + SQLAlchemy 2.x + PostgreSQL / Supabase / MySQL)

```powershell
cd d:\rallyos\backend
.\.venv\Scripts\uvicorn.exe app.main:app --reload --host 0.0.0.0 --port 8000
```

- Connects to Supabase PostgreSQL (Project `qaocdecturwknyrbisse` in `ap-south-1`) via `DATABASE_URL` in `d:\rallyos\backend\.env`.
- Automatically provisions all tables (`users`, `courts`, `games`, `tournaments`, `platform_settings`), indexes, and default administrator accounts on startup.
- If offline, automatically falls back to local SQLite WAL mode (`rallyos_local.db`).

#### 2. Frontend (`d:\rallyos\frontend` — React + Vite + Tailwind CSS + Supabase JS)

```powershell
cd d:\rallyos\frontend
npm run dev
```

- Vite is configured (`host: '0.0.0.0'`, port `5173`) to print both `Local` (`http://127.0.0.1:5173`) and `Network` (`http://<your-ip>:5173`) URLs automatically and proxy `/api` + WebSockets to `http://127.0.0.1:8000`.
- Supabase client initialized via `d:\rallyos\frontend\src\api\supabase.js` using `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.

---

## Default Accounts

| Role | Username | Password |
| :--- | :--- | :--- |
| **Super Admin** | `superadmin` | `SuperAdmin123!` |
| **Administrator** | `admin` | `Admin123!` |
| **Administrator 1** | `admin1` | `Admin123!` |
| **Administrator 2** | `admin2` | `Admin123!` |

---

## Production Deployment

### Option A: Cloud Hosting (Render Backend + Vercel Frontend)

This is the recommended production architecture:
- **Backend on Render**: Long-lived WebSockets for live TV scoring, automated background tasks, and FastAPI.
- **Frontend on Vercel**: Global Edge CDN, instant zero-latency asset delivery, and automatic SSL.
- **Database on Supabase**: Managed PostgreSQL in `ap-south-1` with connection pooling.

#### Step 1: Deploy Backend on Render
1. Push your repository to GitHub.
2. Log in to [Render](https://render.com) and click **New +** -> **Web Service** (or **Blueprint**).
3. Connect your GitHub repository.
4. Settings:
   - **Name**: `rallyos-api`
   - **Root Directory**: `backend`
   - **Runtime**: `Docker` (uses `backend/Dockerfile`) or `Python 3`
   - **Build Command** (if Python): `pip install -r requirements.txt`
   - **Start Command** (if Python): `gunicorn app.main:app -w 2 -k uvicorn.workers.UvicornWorker --bind 0.0.0.0:$PORT`
   - **Health Check Path**: `/health`
5. Add Environment Variables in Render Dashboard:
   ```env
   APP_ENV=production
   APP_NAME=RallyOS API
   SECRET_KEY=generate-a-secure-random-64-character-string
   DATABASE_URL=postgresql+psycopg2://postgres.qaocdecturwknyrbisse:Joemarcapitle110103@aws-0-ap-south-1.pooler.supabase.com:6543/postgres?sslmode=require
   SUPABASE_URL=https://qaocdecturwknyrbisse.supabase.co
   SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFhb2NkZWN0dXJ3a255cmJpc3NlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTU0OTMxMTcsImV4cCI6MjExMTA2OTExN30.Tl3AirSaAvOwvzHkOkNBOYl3LfIHrRz1zxqjIHcwH6Y
   CORS_ORIGINS=https://your-app.vercel.app
   CORS_ORIGIN_REGEX=^https?://(localhost|127\.0\.0\.1|\[::1\]|(?:\d{1,3}\.){3}\d{1,3}|.*\.vercel\.app)(:\d+)?$
   ```
6. Click **Deploy**. Note your public Render URL (e.g., `https://rallyos-api.onrender.com`).

#### Step 2: Deploy Frontend on Vercel
1. Log in to [Vercel](https://vercel.com) and click **Add New** -> **Project**.
2. Import your GitHub repository.
3. Configure Project Settings:
   - **Framework Preset**: `Vite`
   - **Root Directory**: `frontend`
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
4. Add Environment Variables in Vercel:
   ```env
   VITE_API_BASE_URL=https://rallyos-api.onrender.com/api/v1
   VITE_SUPABASE_URL=https://qaocdecturwknyrbisse.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFhb2NkZWN0dXJ3a255cmJpc3NlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTU0OTMxMTcsImV4cCI6MjExMTA2OTExN30.Tl3AirSaAvOwvzHkOkNBOYl3LfIHrRz1zxqjIHcwH6Y
   ```
5. Click **Deploy**. Vercel will build and assign your domain (e.g., `https://rallyos.vercel.app`).
6. Once deployed, ensure your Vercel URL is listed in Render's `CORS_ORIGINS` (or handled automatically by the preconfigured `CORS_ORIGIN_REGEX`).

---

### Option B: Docker Compose (Full Stack Single VM / VPS)

```bash
docker compose up --build -d
```
- Starts the production-grade Gunicorn + Uvicorn worker backend on port 8000.
- Serves the optimized frontend on port 80 via high-performance Nginx with reverse proxy and WebSocket upgrade support.
- Automatically connects to Supabase PostgreSQL using `backend/.env`.
