# Prima Visual Brief

A full-stack Next.js 14 web application for collecting pre-shoot creative briefs from real estate clients. Clients fill out a detailed form covering shoot logistics, video types, music preferences, inspiration references, and file uploads. Submissions are stored in a Neon Postgres database (Vercel's native PostgreSQL offering) and emailed to the team via Resend.

## Features

- Multi-section brief form with conditional video detail sections
- File uploads (local disk or S3-compatible storage)
- Email notifications via Resend on every submission
- Spotify track suggestions based on music vibe selections (dashboard only)
- Password-protected dashboard to view all submitted briefs
- Signed session cookie for the staff dashboard (no third-party auth library)
- Mobile-first responsive design with a luxury real estate aesthetic
- Client portal at `/portal` for retainer clients: plan, shoots left, next-shoot countdown, one Frame.io link, video edit progress from Notion, and an embedded Acuity scheduler
- Passwordless email sign-in for roster emails, and a bearer-token endpoint that records Acuity notification emails
- Staff hub at `/hub` for two people: leads, follow-ups, Notion edits, roster health, and KPIs. It does not message clients.

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
| `DASHBOARD_PASSWORD` | Yes | Password for `/dashboard`. The session cookie is signed with a key derived from this value, so changing it signs everyone out. The same value encrypts each client's personal portal link. After a change, the Clients page can't show an existing link until you reset it. A link a client already saved keeps working until that reset. |
| `APP_URL` | No | Public origin used in magic-link emails. Production: `https://brief.primavisual.io`. When unset, the link uses the request host, which is what you want on preview URLs. |
| `ACUITY_INGEST_TOKEN` | For ingest | Bearer token for `POST /api/ingest/acuity`. The route returns 401 until this is set. |
| `WEBSITE_LEAD_TOKEN` | For website leads | Bearer token for `POST /api/ingest/website-lead`. Separate from the Acuity token. The route returns 401 until this is set. |
| `STAFF_EMAILS` | For the hub | Comma-separated staff inboxes that can request a Prima Hub magic link. Do not commit real addresses. The dashboard password still opens the hub if this is unset. |
| `PORTAL_DEMO_SEED` | No | Set to `true` locally or on a preview deployment to load fictional `@example.com` clients and to show their sign-in links on screen. Leave unset in production. |
| `NOTION_TOKEN` | No | Read-only internal integration token for the Prima Visual Edit database. When set, a linked client sees Video progress on `/portal`, and Clients can pick a Notion page. When unset, or if Notion errors, that section is hidden. |

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
   - `NOTION_TOKEN` (optional; leave unset until the integration is ready)
5. Deploy

### File Uploads on Vercel

Vercel has an ephemeral filesystem — locally uploaded files will not persist between deployments or function invocations. Configure S3-compatible storage for production:

- **AWS S3**: Set `STORAGE_BUCKET`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`
- **Cloudflare R2**: Set all the above plus `AWS_ENDPOINT_URL=https://<account-id>.r2.cloudflarestorage.com`
- **MinIO or other**: Set `AWS_ENDPOINT_URL` to your endpoint

The `@aws-sdk/client-s3` package is dynamically imported at runtime only when S3 is configured, so it does not need to be installed for local development.

## Client portal

Clients sign in at `/portal`. There are two kinds:

- **Subscription.** Plan of 1, 2, or 4 shoots a month, a renewal date, shoots left this cycle, and a private Acuity scheduling link (the full URL, including any certificate or package code). The portal embeds that link and adds `firstName`, `lastName`, and `email` without dropping the code. If the link is blank, the portal says **Contact us to schedule** and does not open the paid public scheduler. The roster flags that client. A client can list extra emails (a team on one retainer). Each address signs in to the same portal, and bookings from any of them count toward that plan. An email can only be on one client.
- **Per project.** No plan and no renewal, so those blocks are hidden. Booking uses the public scheduler at `https://primavisual.as.me` with the client's name and email filled in.

Both kinds see one card labeled **View your Videos**, or “Videos coming soon” when that link is empty, then the briefs they submitted, the countdown, and **Fill out your brief**.

### Video progress

When `NOTION_TOKEN` is set, a signed-in client whose roster row has a Notion client page sees **Video progress**. The portal reads that client's rows from the Prima Visual Edit database and shows five stages: In Queue, Edit Started, Ready for Approval, Needs Revision, and Approved. Internal edit statuses are not shown. The last client-facing stage is stored in `video_stage_memory`, so a later internal status does not move the indicator backward. Approved videos leave the list 30 days after the completed date. Ready for Approval and Approved point at the **View your Videos** card. The section is omitted when the token is missing, the client is not linked, or Notion cannot be reached. Responses are reused for about 60 seconds.

On **Clients**, **Notion client** is optional. Paste a Notion page link (the id is taken from the URL) or pick a page from the Clients database when the token is set. A client only receives videos whose Client relation includes that page.

A client only sees their own briefs from the last two months in America/Chicago, using the shoot date, or the submission date when there is no shoot date. A future shoot always stays on the list. Older briefs are not deleted: staff still see them, and a direct link still opens one read-only. They can edit a brief until the shoot starts (the appointment time that day, or midnight Chicago when the brief only has a date). After that it is read-only. Edits save over the same submission, keep the previous version, mark **Edited by client** on the dashboard, and email the team through Resend. The confirmation screen also includes a private edit link.

Acuity is on the Standard plan, so the app does not call the Acuity API. The brief link opens the existing form with name, email, and shoot date filled in when those are known. Scheduling links are shown only to that signed-in client and to staff in the dashboard. They are not written to logs.

The cycle rules below apply to subscription clients only.

There are no reminder emails or texts. Crystal keeps doing those.

### Cycle rules

The renewal date is the day a new cycle starts. On that morning in America/Chicago the plan resets to its monthly count (1, 2, or 4) and the renewal date moves forward one month. The billing day is remembered, so a plan that renews on the 31st uses the last day of a short month and returns to the 31st afterward (January 31 → February 28/29 → March 31).

Only appointment types in the dashboard list **Shoots that count** use up a shoot. The starting list includes Listing Shoot, Property Shoot, Video Shoot, Real Estate Shoot, Photo & Video Shoot, and One-Time Shoot (the shoot type on the public scheduler today). A discovery call never counts, even if someone adds it to that list. It opens a lead in the hub instead. Cancelled shoots do not count. Rescheduled shoots count once.

### Storage

The portal uses the Neon database the brief form already uses (`POSTGRES_URL`). New tables (`clients`, `client_emails`, `appointments`, `magic_links`, `portal_sessions`, `portal_settings`, `client_portal_links`, `portal_link_attempts`, `video_stage_memory`) are created on the first portal, roster, or ingest request, and `clients.notion_client_id` is added the same way. Hub tables (`leads`, `lead_stage_events`, `lead_touches`, `hub_plan_prices`, `hub_client_prices`, `hub_magic_links`, `hub_sessions`) are created the same way, on the first signed-in hub request or the first discovery-call or website-lead ingest. `client_emails` only stores addresses beyond the primary, so existing clients are unchanged. No second database, no manual migration, and no paid plan.

Do not run `npm run seed:portal` against production. After deploy, set the hub env vars, sign in at `/hub` once (or send one discovery-call POST). That first request runs `CREATE TABLE IF NOT EXISTS`. It does not rewrite portal rows. A preview that shares the production `POSTGRES_URL` creates those tables in production on that first authenticated request. That is the migration. It is idempotent.

If this project does not have Neon yet:

1. Open the project in Vercel.
2. Go to **Storage** (or **Integrations → Marketplace**) and add **Neon**. The free tier is enough.
3. Connect it to this project so Vercel injects `POSTGRES_URL`.
4. Redeploy.

Locally, with no `POSTGRES_URL`, the portal stores its demo data in `.data/portal-store.json` (gitignored). That file is only for local clicks. Vercel always uses Neon.

### Magic-link sign-in

`POST /api/portal/login` with `{ "email": "..." }` emails a one-time link when that address is the primary email or an additional email on an active client. The link opens that client's portal. Unknown addresses get the same response, so the roster is not listed. Links expire in 20 minutes. The session cookie lasts 14 days. Set `APP_URL` in production so the link host is `https://brief.primavisual.io`.

### Personal client links

Each client has one stable link, shaped like `/portal/c/<token>`. On **Clients**, copy it and send it when a video is ready. The client opens the link, enters an email on that account (the primary or an additional email), and gets the same 14-day portal session as a magic link. A wrong email gets a generic error that does not list the valid addresses. Five wrong tries in 15 minutes, or 20 in a day, pause further tries on that link. An inactive client's link does not sign anyone in. **Reset link** asks you to confirm, then the old link stops working immediately.

The token is 32 random bytes. It is not derived from the client id or email. The database stores a SHA-256 hash for lookup and an encrypted copy of the token so staff can show the link. A copy of the row is not a usable URL without the dashboard password. New clients get a link when they are added. Clients who were already on the roster get one the next time someone opens **Clients**. Nothing here sends email. The sign-in form at `/portal` is unchanged.

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
| `client_email` | Yes | Matched to a client's primary or additional email, case-insensitive. The shoot counts toward that client. |
| `client_name` | Yes | Stored for the review list |
| `appointment_type` | Yes | Compared to the counted-types list |
| `start` | Yes | ISO 8601 datetime. The new time for a reschedule. |
| `acuity_appointment_id` | No | Strongly preferred. Upserts are keyed on it. |
| `raw_subject` | No | Original Gmail subject, shown in the review list |
| `phone` | No | String. Stored on a discovery-call lead when that lead has no phone yet. |
| `company` | No | String. Stored on a discovery-call lead when that lead has no company yet. |

`event: "new"` maps to status `scheduled`. Repeating the same event does not create a second row. A repeated `new` will not move a shoot that was already rescheduled or cancelled. Without an Acuity id, a reschedule or cancellation updates a row only when exactly one open appointment of that type exists for the email. If several could match, the event is stored for review and the existing rows are left alone.

An email whose address is not on the roster is saved with `needs_review: true` and shows under **Needs review** in the dashboard. It is not dropped, and it does not count against a plan. Adding that address as a client's primary or additional email attaches the waiting rows.

```json
{ "ok": true, "action": "created", "appointment_id": 12, "needs_review": false, "review_reason": null }
```

`action` is `created`, `updated`, or `unchanged`. The response also includes `lead_id` and `lead_action`. Both are `null` for shoots and strategy calls. `401` means the bearer token is missing or wrong. `400` means the JSON didn't match the shape above.

### Discovery calls

The bot should post discovery calls to the same route. Do not skip them. `appointment_type` must be `Discovery`, `Discovery Call`, or any name that starts with `Discovery ` (case-insensitive; underscores and hyphens count as spaces). `Strategy Call` is not a discovery call.

```json
{
  "event": "new",
  "client_email": "prospect@example.com",
  "client_name": "Jordan Lee",
  "appointment_type": "Discovery Call",
  "start": "2026-11-20T15:00:00.000Z",
  "acuity_appointment_id": "9876543210",
  "raw_subject": "New Appointment: Discovery Call with Jordan Lee",
  "phone": "312-555-0199",
  "company": "Lee Realty"
}
```

`phone` and `company` are optional. `event` is still `new`, `rescheduled`, or `cancelled`. Repeating the same payload does not create a second lead. The lead is matched by email. A new lead is stage `Discovery Booked` and source `Acuity discovery call`. An open lead that was already `New` moves to `Discovery Booked`. A later stage is not moved backward. The original source is kept, so a referral who then books on Acuity still converts as a referral. A won or lost lead is left alone and a new open lead is created. A cancellation keeps the stage and marks the call cancelled.

The appointment is stored so the hub can show it. It does not reduce shoots left. An unmatched discovery call is not left in the roster **Needs review** queue. If the lead write fails, the route returns 500 and the bot should retry the same body. The appointment upsert is idempotent.

```json
{ "ok": true, "action": "created", "appointment_id": 12, "needs_review": false, "review_reason": null, "lead_id": 4, "lead_action": "created" }
```

`lead_action` is `created`, `updated`, or `unchanged`.

### Website form leads

The marketing site is separate. Its server posts new form leads here. Do not call this from the browser. The token is `WEBSITE_LEAD_TOKEN`, not the Acuity token.

```http
POST /api/ingest/website-lead
Authorization: Bearer $WEBSITE_LEAD_TOKEN
Content-Type: application/json
```

```json
{
  "name": "Casey Ortiz",
  "email": "casey.ortiz@example.com",
  "phone": "713-555-0177",
  "company": "Ortiz Homes",
  "message": "Looking at a one-time shoot.",
  "service_type": "project",
  "estimated_value": 6000,
  "source": "Website form"
}
```

| Field | Required | Notes |
|---|---|---|
| `name` | Yes | |
| `email` | Yes | Matched to an open lead, case-insensitive |
| `phone` | No | Fills a blank phone. Does not overwrite one staff already entered |
| `company` | No | Same |
| `message` | No | Appended to notes. The same message sent again is not duplicated |
| `service_type` | No | `subscription` or `project` |
| `estimated_value` | No | Whole dollars |
| `source` | No | Omit it, or send `Website form` |

A new lead is stage `New`, source `Website form`, and the follow-up date is today in America/Chicago so it shows on Today. An open lead with the same email is updated instead of duplicated. Won and lost leads are not reopened.

```json
{ "ok": true, "lead_id": 8, "action": "created" }
```

`action` is `created`, `updated`, or `unchanged`. `401` means the bearer token is missing or wrong. `400` means the JSON didn't match. The hub does not email the person.

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
| `WEBSITE_LEAD_TOKEN` | Production, and Preview if the website should hit a preview | A different long random string. Give it to the website server only. |
| `STAFF_EMAILS` | Production, and Preview if staff should sign in there | Comma-separated staff inboxes. Do not commit them. |
| `APP_URL` | Production | `https://brief.primavisual.io` |
| `PORTAL_DEMO_SEED` | Preview only, optional | `true` |

Do not enable `PORTAL_DEMO_SEED` on production. Redeploy after saving the variables. Then sign in at `/dashboard`, open **Clients**, and add the real roster. Clients visit `https://brief.primavisual.io/portal`.

## Prima Hub

Staff open `/hub` on a phone. It installs as **Prima Hub** (manifest scope `/hub/`, standalone). The client portal does not link to it. A client session cannot open it.

Sign-in is a magic link to an address in `STAFF_EMAILS`. The existing dashboard password session also opens the hub, and the dashboard itself is unchanged. Signing out of the hub also ends that dashboard session, because the password session is accepted as hub access. The hub does not email or text leads or clients. Suggested follow-up text is copied by staff and sent by them. Web push for due follow-ups is a later phase. The unused hook is `notifyDueFollowUps` in `lib/hub/push.ts`.

Tabs: Today, Leads, Edits, Clients, KPIs. Edits read the same Notion Edit database as the portal and show internal statuses. Clients reuse the roster, cycle math, and shoot counts. Monthly subscription prices are entered by staff on KPIs (per plan) and Clients (per client). They are not read from Stripe.

KPIs that are approximate because the data is limited:

- Revenue is estimated deal value plus staff-entered monthly prices, not cash collected. A new subscriber can be counted in both in the same month if both numbers are filled in.
- Stripe would plug in at `computeKpis` in `lib/hub/kpis.ts`: subscription amounts replace the monthly price fields, and collected invoices replace won-this-month.
- Conversion uses stage changes stored after this install. Older leads are not backfilled. A deal marked Won counts as having reached discovery.
- Edit turnaround is Date Shot to Completed Date on rows currently Completed or Approved. Revision rate only sees the current Notion status.
- Subscriber churn is the share of subscription clients marked inactive. There is no cancellation date.
- Shoots per week only include appointments the bot has posted. Discovery calls are excluded.

## Project Structure

```
app/
  brief/           — Public brief submission form
  portal/          — Client portal (magic-link sign-in and personal links)
  hub/             — Staff hub (PWA). Not linked from the portal.
  dashboard/       — Staff dashboard (password protected), including Clients
  api/             — API routes
    submit-brief/  — Saves brief to DB + sends email
    upload/        — File upload handler
    dashboard/     — Auth, briefs, and client roster
    hub/           — Staff lead, touch, convert, and price routes
    ingest/acuity/ — Acuity notification ingest, including discovery calls
    ingest/website-lead/ — Website form leads
    portal/        — Magic-link login and logout
lib/
  db.ts            — Neon Postgres queries for briefs
  portal/          — Cycle math, ingest, roster store, magic links
  hub/             — Leads, follow-ups, KPIs, staff magic links
  email.ts         — Resend email templates
  spotify.ts       — Spotify Client Credentials API
  storage.ts       — Local disk / S3 file storage
  auth.ts              — Signed staff-dashboard session cookie
  dashboard-session.ts — HMAC session token (Node and Edge)
middleware.ts          — Requires that cookie on dashboard pages and APIs
public/
  hub/             — Prima Hub manifest, icons, and network-only service worker
  uploads/         — Local file upload directory (dev only)
```
