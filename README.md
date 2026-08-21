# Parking Reservation MVP

Simple parking reservation system for 100–150 users and 200 spaces (3000–3199).

## Stack

- Vite + React
- Supabase Auth
- Supabase PostgreSQL
- Supabase Realtime
- Vercel

## 1. Create Supabase project

Create a free Supabase project.

Open **SQL Editor** and run:

`supabase/schema.sql`

## 2. Get Supabase keys

In Supabase, open the project API settings and copy:

- Project URL
- Publishable/anon key

Create `.env.local` from `.env.example`:

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_KEY
```

Never put the Supabase service-role key in this frontend project.

## 3. Run locally

Install Node.js 20+.

```bash
npm install
npm run dev
```

Open the local URL shown by Vite.

## 4. Create users

The login page allows registration.

If email confirmation is enabled in Supabase, users must confirm their email before logging in.

For a private company system, you can later disable public signups and create/invite users from the admin side.

## 5. Make someone an admin

After the user has registered, run this in Supabase SQL Editor:

```sql
update public.profiles
set role = 'admin'
where id = (
  select id from auth.users where email = 'admin@example.com'
);
```

The current MVP does not yet include a separate admin UI. The database role is already prepared for it.

## 6. Deploy to Vercel

Push the project to GitHub, then import the repository into Vercel.

Add these environment variables in Vercel:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Deploy.

The included `vercel.json` handles SPA routing.

## Reservation logic

The database has:

```sql
unique (spot_number, reservation_date)
```

Therefore two people cannot reserve the same parking spot for the same date, even if they click at exactly the same time.

Realtime refreshes the grid when a reservation is created or deleted.

## Important production improvements

Before using this as a company-wide system, consider adding:

- Admin UI
- Company-email-only registration
- Reservation opening time
- Reservation closing time
- Maximum one reservation per user per day
- Reservation history
- Parking map
- Blocked/reserved-for-management spaces
- Audit log
- Better error messages
- Backup/export
