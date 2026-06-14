# Schedule Tracker

A small personal web app for tracking how well I stick to a daily schedule.
You keep a recurring **template** (weekday vs weekend blocks), and each day you
log what actually happened: mark each activity done, jot a note, and record an
actual start and end time. Daily, weekly, and monthly reflection boxes round it
out.

Sharing works two ways:

- **Logged-in sharing** — give another account view or edit access using a short
  6-character **share code**. Permissions are enforced in the database.
- **No-login public view** — anyone with your code (or your `/view/CODE` link) can
  open a **read-only** view of your template, no account needed. Only the
  recurring activities and your name are exposed — never your daily notes,
  times, or reflections.

You sign in with a **username and password** (no email needed). Supabase Auth is
email-based under the hood, so the app quietly turns your username into a hidden
`username@schedule.local` address; you never see or type it.

Built with **Vite + React** (plain JavaScript, `.jsx`), **react-router-dom**, and
**Supabase** for auth and data. There is no custom backend: the frontend talks to
Supabase directly, and **Row Level Security** in Postgres is what actually
enforces who can read and write what.

## Folder map

```
schedule-tracker/
├── index.html                  loads Fraunces, mounts /src/main.jsx
├── package.json
├── vite.config.js              @vitejs/plugin-react
├── .env.example                VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY
├── .gitignore                  node_modules, dist, .env
├── supabase/
│   ├── schema.sql              tables, triggers, RLS policies, helper functions
│   ├── migration_username_sharecode.sql   add username + share_code (existing DBs)
│   └── migration_public_view.sql          add the public no-login viewer (existing DBs)
└── src/
    ├── main.jsx                BrowserRouter > AuthProvider > App, imports styles.css
    ├── App.jsx                 Nav + Routes
    ├── styles.css              the single hand-written stylesheet
    ├── lib/
    │   ├── supabase.js         creates the Supabase client from env vars
    │   ├── defaultSchedule.js  the starter weekday/weekend template
    │   └── dates.js            local-time date/day-type helpers
    ├── context/
    │   └── AuthContext.jsx     session state + signUp / signIn / signOut
    ├── components/
    │   ├── Nav.jsx
    │   └── ProtectedRoute.jsx
    └── pages/
        ├── Login.jsx           sign in / create account (username + password)
        ├── Today.jsx           the centerpiece: log today's activities
        ├── Schedule.jsx        edit the recurring template
        ├── Weekly.jsx          this week's completion % + per-day grid
        ├── Monthly.jsx         this month's completion %
        ├── Shared.jsx          your code + public link; grant access by code
        └── PublicView.jsx      /view — read-only schedule by code, NO login
```

## How the data is organized

Two ideas are kept deliberately separate:

- **activities** — the recurring template. Each row is a block on a `weekday` or a
  `weekend`. This rarely changes.
- **logs** — the actual daily tracking. One row per activity per day, holding
  `completed`, `note`, `actual_start`, and `actual_end`.

Each day, the Today page reads the template activities for that day type and
upserts a `log` row per activity as you fill it in. **reflections** holds the
daily/weekly/monthly free text, and **shares** records who can see or edit whom.

The public viewer reads through a single `security definer` function,
`get_public_schedule(code)`, which returns only the template for a matching share
code. It is the one path open to anonymous visitors.

## Setup

1. **Create a Supabase project** at [supabase.com](https://supabase.com). In the
   dashboard open the **SQL Editor**, paste the entire contents of
   `supabase/schema.sql`, and run it. This creates every table, the trigger that
   mirrors new sign-ups into `profiles`, all the RLS policies, and the public
   viewer function.

2. **Add your keys.** Copy the example env file and fill it in:

   ```bash
   cp .env.example .env
   ```

   In the Supabase dashboard under **Project Settings → API**, copy the
   **Project URL** into `VITE_SUPABASE_URL` and the **anon / publishable** key
   into `VITE_SUPABASE_ANON_KEY`.

3. **Install and run:**

   ```bash
   npm install
   npm run dev
   ```

   Open the printed local URL. Create an account, then on the Today page click
   **Load the default schedule** to seed your template.

4. **Turn off email confirmation (required for username login).** In Supabase
   under **Authentication → Providers → Email**, turn **off** "Confirm email" and
   save. Because usernames map to non-deliverable `@schedule.local` addresses,
   there is no inbox to confirm — with this off, new accounts sign in instantly.

> **Already ran an earlier `schema.sql`?** Run the migration files once in the SQL
> Editor to upgrade without losing data:
> `supabase/migration_username_sharecode.sql` (adds username + share codes) and
> `supabase/migration_public_view.sql` (adds the public viewer). Accounts created
> under the old email-based flow won't work with username login, so create a fresh
> account (or delete old ones under **Authentication → Users**).

## Using the no-login share page

On the **Sharing** page you'll see your share code and a public link like
`http://localhost:5173/view/ABC123`. Anyone can open that link — or go to `/view`
and type the code — to see your schedule read-only without signing in. When you
deploy, the link automatically uses your real domain.

## Deploying

Push the repo to GitHub, import it into [Vercel](https://vercel.com), and add the
two `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` environment variables in the
Vercel project settings. Vercel auto-detects Vite, so no extra build config is
needed.

## Notes

- **Security lives in the database.** As long as RLS stays enabled, the policies in
  `schema.sql` reject unauthorized reads and writes no matter what the frontend
  does. The only anonymous access is the deliberate, read-only
  `get_public_schedule` function.
- **`.env` is never committed** (it's in `.gitignore`). The anon key is safe to ship
  to the browser; RLS is what protects the data.
- Times are stored as Postgres `time` and the UI works in `HH:MM`. Time strings are
  sliced to 5 characters when displayed.
- All date math is done in the browser's **local** time zone, not UTC.
