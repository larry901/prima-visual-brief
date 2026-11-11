# Prima Visual Brief

A full-stack Next.js 14 web application for collecting pre-shoot creative briefs from real estate clients. Clients fill out a detailed form covering shoot logistics, video types, music preferences, inspiration references, and file uploads. Submissions are stored in a Neon Postgres database (Vercel's native PostgreSQL offering) and emailed to the team via Resend.

## Features

- Multi-section brief form with conditional video detail sections
- File uploads (local disk or S3-compatible storage)
- Email notifications via Resend on every submission
- Spotify track suggestions based on music vibe selections (dashboard only)
- Password-protected dashboard to view all submitted briefs
- Cookie-based session auth (no third-party auth library)
- Mobile-first responsive design with a luxury real estate aesthetic
- Client portal at `/portal` for retainer clients: plan, shoots left, next-shoot countdown, Frame.io links, and an embedded Acuity scheduler
- Passwordless email sign-in for roster emails, and a bearer-token endpoint that records Acuity notification emails

## Prerequisites

- Node.js 18 or later
- npm 9 or later
- A Neon Postgres database (free tier available at https://neon.tech, or via Vercel's Storage tab)

## Installation

```bash
cd "Prima Visual Brief"
npm install
```

## Environment Variables

Copy `.env.local.example` to `.env.local` and fill in the values:

```bash
cp .env.local.example .env.local
```

| Variable | Required | Description |
|---|---|---|
| `POSTGRES_URL` | Yes | Neon (or any PostgreSQL) connection string with `?sslmode=require` |
| `POSTGRES_URL_NON_POOLING` | Recommended | Direct (non-pooled) connection string — used for migrations |
| `SPOTIFY_CLIENT_ID` | Yes | Spotify Developer App client ID |
| `SPOTIFY_CLIENT_SECRET` | Yes | Spotify Developer App client secret |
| `SPOTIFY_PLAYLIST_ID` | Yes | ID of the public Spotify playlist that powers "Reference songs" on the brief form. Grab it from the playlist URL: `open.spotify.com/playlist/<THIS_PART>?si=...` |
| `EMAIL_API_KEY` | Yes | Resend API key (from resend.com). Also sends client-portal magic links. |
| `DASHBOARD_PASSWORD` | Yes | Password to access the /dashboard route |
| `APP_URL` | No | Public origin used in magic-link emails. Production: `https://brief.primavisual.io`. When unset, the link uses the request host, which is what you want on preview URLs. |
| `ACUITY_INGEST_TOKEN` | For ingest | Bearer token for `POST /api/ingest/acuity`. The route returns 401 until this is set. |
| `PORTAL_DEMO_SEED` | No | Set to `true` locally or on a preview deployment to load fictional `@example.com` clients and to show their sign-in links on screen. Leave unset in production. |

### Setting up Neon Postgres

**Option A — Via Vercel (recommended for Vercel deployments):**
1. Open your project in the Vercel dashboard
2. Go to **Storage → Create Database → Neon**
3. After creation, open the database and click the **`.env.local`** tab
4. Copy the generated variables into your local `.env.local`

**Option B — Direct Neon account:**
1. Sign up at https://neon.tech
2. Create a new project and database
3. Copy the **Connection string** from the dashboard
4. Set it as `POSTGRES_URL` in `.env.local`

The `briefs` table is created automatically on the first request — no manual migrations needed.

### Getting Other API Keys

**Spotify:** Create an app at https://developer.spotify.com/dashboard. Use the Client ID and Client Secret. The app uses the Client Credentials flow (no user auth required).

**Resend:** Sign up at https://resend.com, verify your sending domain (`primavisual.io`), and create an API key. Update the `from` address in `lib/email.ts` if using a different domain.

## Running Locally

```bash
npm run dev
```

- Brief form: http://localhost:3000/brief
- Dashboard login: http://localhost:3000/dashboard
- Dashboard briefs list: http://localhost:3000/dashboard/briefs
- Client roster: http://localhost:3000/dashboard/clients
- Client portal: http://localhost:3000/portal

To click through the portal without a real inbox, set `PORTAL_DEMO_SEED=true`. Sign in as `maya.chen@example.com` or `andre.walsh@example.com`. The response includes a one-time demo link instead of sending mail. `npm run seed:portal` loads the same fictional roster into Neon when `POSTGRES_URL` is set.

```bash
npm test
```

File uploads go to `public/uploads/` by default.

## Building for Production

```bash
npm run build
npm start
```

## Deploying to Vercel

1. Push your code to a GitHub repository
2. Import it in the Vercel dashboard
3. Go to **Storage** and attach or create a Neon Postgres database — Vercel will auto-inject `POSTGRES_URL` and related variables
4. Add the remaining environment variables in **Settings → Environment Variables**:
   - `SPOTIFY_CLIENT_ID`
   - `SPOTIFY_CLIENT_SECRET`
   - `EMAIL_API_KEY`
   - `DASHBOARD_PASSWORD`
5. Deploy

### File Uploads on Vercel

Vercel has an ephemeral filesystem — locally uploaded files will not persist between deployments or function invocations. Configure S3-compatible storage for production:

- **AWS S3**: Set `STORAGE_BUCKET`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`
- **Cloudflare R2**: Set all the above plus `AWS_ENDPOINT_URL=https://<account-id>.r2.cloudflarestorage.com`
- **MinIO or other**: Set `AWS_ENDPOINT_URL` to your endpoint

The `@aws-sdk/client-s3` package is dynamically imported at runtime only when S3 is configured, so it does not need to be installed for local development.

## Client portal

Clients on a retainer sign in at `/portal`. The page shows:

- Plan size (2 or 4 shoots a month) and the next renewal date
- Shoots left in the current cycle
- A live countdown to the next shoot, in America/Chicago, or an empty state when nothing is booked
- Labeled Frame.io links, each opening in a new tab
- Larry's Acuity scheduler embedded from `https://primavisual.as.me` with `firstName`, `lastName`, and `email` prefilled

Acuity is on the Standard plan, so the app does not call the Acuity API. After someone books, the portal keeps a **Fill out your brief** button. It also shows that button whenever an upcoming shoot has no matching brief. The link opens the existing form with name, email, and shoot date filled in when they are known.

There are no reminder emails or texts. Crystal keeps doing those.

### Cycle rules

The renewal date is the day a new cycle starts. On that morning in America/Chicago the plan resets to 2 or 4 and the renewal date moves forward one month. The billing day is remembered, so a plan that renews on the 31st uses the last day of a short month and returns to the 31st afterward (January 31 → February 28/29 → March 31).

Only appointment types in the dashboard list **Shoots that count** use up a shoot. The starting list includes Listing Shoot, Property Shoot, Video Shoot, Real Estate Shoot, Photo & Video Shoot, and One-Time Shoot (the shoot type on the public scheduler today). Discovery Call does not count unless someone adds it. Cancelled shoots do not count. Rescheduled shoots count once.

### Storage

The portal uses the Neon database the brief form already uses (`POSTGRES_URL`). New tables (`clients`, `appointments`, `magic_links`, `portal_sessions`, `portal_settings`) are created on the first portal, roster, or ingest request. No second database and no paid plan.

If this project does not have Neon yet:

1. Open the project in Vercel.
2. Go to **Storage** (or **Integrations → Marketplace**) and add **Neon**. The free tier is enough.
3. Connect it to this project so Vercel injects `POSTGRES_URL`.
4. Redeploy.

Locally, with no `POSTGRES_URL`, the portal stores its demo data in `.data/portal-store.json` (gitignored). That file is only for local clicks. Vercel always uses Neon.

### Magic-link sign-in

`POST /api/portal/login` with `{ "email": "..." }` emails a one-time link when that address belongs to an active client. Unknown addresses get the same response, so the roster is not listed. Links expire in 20 minutes. The session cookie lasts 14 days. Set `APP_URL` in production so the link host is `https://brief.primavisual.io`.

### Ingesting Acuity notification emails

Crystal's assistant reads Gmail messages from `no-reply@acuityscheduling.com` whose subjects start with `New Appointment:`, `Appointment Rescheduled:`, or `Appointment Cancelled:`, then POSTs the parsed event here. This app does not read Gmail itself.

```http
POST /api/ingest/acuity
Authorization: Bearer $ACUITY_INGEST_TOKEN
Content-Type: application/json
```

```json
{
  "event": "new",
  "client_email": "maya.chen@example.com",
  "client_name": "Maya Chen",
  "appointment_type": "Listing Shoot",
  "start": "2026-11-18T16:00:00.000Z",
  "acuity_appointment_id": "1234567890",
  "raw_subject": "New Appointment: Listing Shoot with Maya Chen"
}
```

| Field | Required | Notes |
|---|---|---|
| `event` | Yes | `new`, `rescheduled`, or `cancelled` |
| `client_email` | Yes | Matched to the roster, case-insensitive |
| `client_name` | Yes | Stored for the review list |
| `appointment_type` | Yes | Compared to the counted-types list |
| `start` | Yes | ISO 8601 datetime. The new time for a reschedule. |
| `acuity_appointment_id` | No | Strongly preferred. Upserts are keyed on it. |
| `raw_subject` | No | Original Gmail subject, shown in the review list |

`event: "new"` maps to status `scheduled`. Repeating the same event does not create a second row. A repeated `new` will not move a shoot that was already rescheduled or cancelled. Without an Acuity id, a reschedule or cancellation updates a row only when exactly one open appointment of that type exists for the email. If several could match, the event is stored for review and the existing rows are left alone.

An email whose address is not on the roster is saved with `needs_review: true` and shows under **Needs review** in the dashboard. It is not dropped, and it does not count against a plan. Adding that email to the roster attaches the waiting rows.

```json
{ "ok": true, "action": "created", "appointment_id": 12, "needs_review": false, "review_reason": null }
```

`action` is `created`, `updated`, or `unchanged`. `401` means the bearer token is missing or wrong. `400` means the JSON didn't match the shape above.

```bash
curl -s -X POST https://brief.primavisual.io/api/ingest/acuity \
  -H "Authorization: Bearer $ACUITY_INGEST_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"event":"new","client_email":"maya.chen@example.com","client_name":"Maya Chen","appointment_type":"Listing Shoot","start":"2026-11-18T16:00:00.000Z","acuity_appointment_id":"1234567890"}'
```

### What to set in Vercel

The brief form's variables stay as they are. For the portal, add:

| Name | Environments | Value |
|---|---|---|
| `ACUITY_INGEST_TOKEN` | Production, and Preview if the bot should hit a preview | A long random string. Give the same value to Crystal's bot. |
| `APP_URL` | Production | `https://brief.primavisual.io` |
| `PORTAL_DEMO_SEED` | Preview only, optional | `true` |

Do not enable `PORTAL_DEMO_SEED` on production. Redeploy after saving the variables. Then sign in at `/dashboard`, open **Clients**, and add the real roster. Clients visit `https://brief.primavisual.io/portal`.

## Project Structure

```
app/
  brief/           — Public brief submission form
  portal/          — Client portal (magic-link sign-in)
  dashboard/       — Staff dashboard (password protected), including Clients
  api/             — API routes
    submit-brief/  — Saves brief to DB + sends email
    upload/        — File upload handler
    dashboard/     — Auth, briefs, and client roster
    ingest/acuity/ — Acuity notification ingest
    portal/        — Magic-link login and logout
lib/
  db.ts            — Neon Postgres queries for briefs
  portal/          — Cycle math, ingest, roster store, magic links
  email.ts         — Resend email templates
  spotify.ts       — Spotify Client Credentials API
  storage.ts       — Local disk / S3 file storage
  auth.ts          — Cookie-based dashboard session helpers
public/
  uploads/         — Local file upload directory (dev only)
```
