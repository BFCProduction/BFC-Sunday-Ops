# Sunday Summary Email Deployment Checklist

This checklist covers the pieces required to make the Sunday summary email run in production.

## 1. Supabase

Project ref currently linked in this repo:

- `jrvootvytlzrymwoufzu`

Run these from the repo root after authenticating the Supabase CLI:

```bash
supabase login
supabase migration list --linked
supabase db push
supabase functions deploy summary-email-admin
```

Set the required Supabase function secrets:

```bash
supabase secrets set ADMIN_PASSWORD=your_shared_admin_password
supabase secrets set SUPABASE_URL=https://your-project.supabase.co
supabase secrets set SUPABASE_SERVICE_KEY=your_service_role_key
```

Notes:

- `ADMIN_PASSWORD` should match the password the team will use to unlock admin mode.
- `SUPABASE_SERVICE_KEY` (or `SUPABASE_SERVICE_ROLE_KEY`) is required by `summary-email-admin`.
- `SUPABASE_URL` is required by the edge functions and sender script.
- Migration `038_event_scoped_summary_email_runs.sql` is required before the sender can record one run per event/service.

## 2. Google Workspace / Gmail API

Create or reuse a Google Cloud project tied to the Workspace environment.

Required setup:

1. Enable the Gmail API.
2. Create a service account.
3. Enable domain-wide delegation for that service account.
4. In Google Workspace Admin, authorize the service account for Gmail send scope:

```text
https://www.googleapis.com/auth/gmail.send
```

5. Download the service account JSON or copy the client email and private key.
6. Confirm the delegated sender mailbox is:

```text
jerry@bethanynaz.org
```

Recommended sender behavior for v1:

- From name: `BFC Sunday Ops`
- From address: `jerry@bethanynaz.org`
- Reply-To: `production@bethanynaz.org`

## 3. GitHub Actions Secrets

Add these repository secrets:

- `VITE_SUPABASE_URL`
- `SUPABASE_SERVICE_KEY`
- `GOOGLE_SERVICE_ACCOUNT_CLIENT_EMAIL`
- `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`
- `GMAIL_DELEGATED_USER`
- `REPORT_EMAIL_FROM_NAME`
- `REPORT_EMAIL_FROM_ADDRESS`
- `REPORT_EMAIL_REPLY_TO`

Suggested values:

- `GMAIL_DELEGATED_USER` = `jerry@bethanynaz.org`
- `REPORT_EMAIL_FROM_NAME` = `BFC Sunday Ops`
- `REPORT_EMAIL_FROM_ADDRESS` = `jerry@bethanynaz.org`
- `REPORT_EMAIL_REPLY_TO` = `production@bethanynaz.org`

## 4. App Admin Setup

After the migration and edge functions are live:

1. Open the app.
2. Enter admin mode.
3. Go to `Settings -> Reporting`.
4. Confirm:
   - enabled
   - send day = Sunday
   - send time = `15:00`
   - reply-to = `production@bethanynaz.org`
5. Add the recipient email addresses.
6. Confirm at least one PCO user who manages recipients has `users.is_admin = true`.

## 5. First Validation Run

Recommended first validation flow:

```bash
node scripts/send-sunday-summary.js --dry-run --now --date YYYY-MM-DD
node scripts/send-sunday-summary.js --now --event-id <events-id> --to your-test-address@example.com
```

Then verify:

- the email is delivered
- the HTML renders correctly in Gmail
- reply-to goes to `production@bethanynaz.org`
- a row is written to `report_email_runs`
- recipient addresses are not exposed in the public app client
- the test-recipient override does not mark the event as sent; a normal run without `--to` records the run

## 6. Scheduled Run

Workflow:

- `.github/workflows/summary-email.yml`

Behavior:

- runs every 15 minutes on Sunday UTC
- checks the configured local church time
- sends one report per event/service with operational activity
- skips blank auto-created service shells
- sends each event only once unless `--force` is used manually

## Current Status

Migration `038_event_scoped_summary_email_runs.sql` has been applied to the linked Supabase project, and a dry-run generated separate 9am and 11am reports for April 12, 2026 without sending mail.
