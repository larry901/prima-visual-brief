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
| `EMAIL_API_KEY` | Yes | Resend API key (from resend.com) |
| `DASHBOARD_PASSWORD` | Yes | Password to access the /dashboard route |
| `STORAGE_BUCKET` | No | S3 bucket name — if set, uploads go to S3 instead of local disk |
| `AWS_ACCESS_KEY_ID` | No | AWS (or S3-compatible) access key ID |
| `AWS_SECRET_ACCESS_KEY` | No | AWS (or S3-compatible) secret access key |
| `AWS_REGION` | No | AWS region (default: `us-east-1`) |
| `AWS_ENDPOINT_URL` | No | Custom S3 endpoint for non-AWS providers (e.g. Cloudflare R2, MinIO) |

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

## Project Structure

```
app/
  brief/           — Public brief submission form
  dashboard/       — Staff-only dashboard (password protected)
  api/             — API routes
    submit-brief/  — Saves brief to DB + sends email
    upload/        — File upload handler
    dashboard/     — Auth + brief data endpoints
    spotify/       — Spotify track suggestions
lib/
  db.ts            — Neon Postgres queries (@neondatabase/serverless)
  email.ts         — Resend email templates
  spotify.ts       — Spotify Client Credentials API
  storage.ts       — Local disk / S3 file storage
  auth.ts          — Cookie-based session helpers
public/
  uploads/         — Local file upload directory (dev only)
```
