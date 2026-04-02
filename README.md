# Prima Visual Brief

A full-stack Next.js 14 web application for collecting pre-shoot creative briefs from real estate clients. Clients fill out a detailed form covering shoot logistics, video types, music preferences, inspiration references, and file uploads. Submissions are stored in a local SQLite database and emailed to the team via Resend.

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
| `SPOTIFY_CLIENT_ID` | Yes | Spotify Developer App client ID |
| `SPOTIFY_CLIENT_SECRET` | Yes | Spotify Developer App client secret |
| `EMAIL_API_KEY` | Yes | Resend API key (from resend.com) |
| `DASHBOARD_PASSWORD` | Yes | Password to access the /dashboard route |
| `STORAGE_BUCKET` | No | S3 bucket name — if set, uploads go to S3 instead of local disk |
| `AWS_ACCESS_KEY_ID` | No | AWS (or S3-compatible) access key ID |
| `AWS_SECRET_ACCESS_KEY` | No | AWS (or S3-compatible) secret access key |
| `AWS_REGION` | No | AWS region (default: `us-east-1`) |
| `AWS_ENDPOINT_URL` | No | Custom S3 endpoint for non-AWS providers (e.g. Cloudflare R2, MinIO) |

### Getting API Keys

**Spotify:** Create an app at https://developer.spotify.com/dashboard. Use the Client ID and Client Secret. The app uses the Client Credentials flow (no user auth required).

**Resend:** Sign up at https://resend.com, verify your sending domain (`primavisual.io`), and create an API key. Update the `from` address in `lib/email.ts` if using a different domain.

## Running Locally

```bash
npm run dev
```

- Brief form: http://localhost:3000/brief
- Dashboard login: http://localhost:3000/dashboard
- Dashboard briefs list: http://localhost:3000/dashboard/briefs

The SQLite database (`prima-brief.db`) is created automatically in the project root on first run.

File uploads go to `public/uploads/` by default.

## Building for Production

```bash
npm run build
npm start
```

## Deploying

### Important: SQLite Limitations on Serverless Platforms

SQLite stores data as a local file on disk. This works perfectly for local development and traditional VPS/VM deployments, but **does not work on serverless platforms like Vercel** because:

- Each serverless function invocation may run on a different container
- The filesystem is ephemeral and does not persist between deployments or invocations

**Recommended alternatives for production:**

1. **Turso** (libSQL, SQLite-compatible): https://turso.tech — swap `better-sqlite3` for `@libsql/client`
2. **PlanetScale** (MySQL-compatible): https://planetscale.com — swap for `mysql2` or Drizzle ORM
3. **Supabase** (PostgreSQL): https://supabase.com — swap for `pg` or Prisma
4. **Railway / Render / Fly.io** — traditional VM-style hosting where SQLite works fine as-is

### Deploying to a VPS (Railway, Render, Fly.io, DigitalOcean)

These platforms give you a persistent filesystem, so SQLite works without changes. Set all environment variables in your platform's dashboard and deploy normally.

### File Uploads on Serverless

If deploying to a serverless platform, local file uploads will not persist. Set the `STORAGE_BUCKET` and AWS credentials to use S3-compatible storage:

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
  db.ts            — SQLite database singleton
  email.ts         — Resend email templates
  spotify.ts       — Spotify Client Credentials API
  storage.ts       — Local disk / S3 file storage
  auth.ts          — Cookie-based session helpers
public/
  uploads/         — Local file upload directory
```
