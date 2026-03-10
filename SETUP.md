# Choice Properties — Setup Guide

Do these steps in order. Don't skip any.

---

## Step 1 — Generate Your Relay Secret

Generate a random 48-character secret. You can use any password manager, or run `openssl rand -hex 24` in your terminal.

Save it somewhere (Notes app, password manager). You'll paste it in two places — both must be identical or emails won't send.

---

## Step 2 — Supabase Project

1. Go to **supabase.com** → create a new project
2. Once it loads, go to **SQL Editor → New query**
3. Paste the entire contents of `SCHEMA.sql` → click **Run** → wait for success
4. Click **New query** again
5. Paste the entire contents of `SECURITY-PATCHES.sql` → click **Run**

> Don't skip the security patches. They make the lease PDF bucket private and mask any existing SSNs.

**Save these from Supabase → Project Settings → API:**
- Project URL (looks like `https://xxxx.supabase.co`)
- Anon public key (the `eyJ...` key labelled "anon public")

---

## Step 3 — Supabase Edge Function Secrets

In Supabase → **Edge Functions → Manage Secrets**, add these 7 secrets:

| Secret Name | Value |
|---|---|
| `GAS_EMAIL_URL` | Your GAS Web App URL (you'll get this in Step 4) |
| `GAS_RELAY_SECRET` | Your relay secret from Step 1 |
| `IMAGEKIT_PRIVATE_KEY` | From ImageKit → Developer Options |
| `IMAGEKIT_URL_ENDPOINT` | From ImageKit → Developer Options |
| `ADMIN_EMAIL` | Your admin email address |
| `DASHBOARD_URL` | Your live site URL e.g. `https://yourdomain.com` |
| `FRONTEND_ORIGIN` | Same as DASHBOARD_URL |

> You can come back and add the ImageKit secrets later — everything else works without them.

---

## Step 4 — Google Apps Script Email Relay

1. Go to **script.google.com** → New project
2. Delete all default code, paste the entire contents of `GAS-EMAIL-RELAY.gs`
3. Click **Project Settings** (gear icon) → **Script Properties** → add these:

| Property | Value |
|---|---|
| `RELAY_SECRET` | Your relay secret from Step 1 — must be identical |
| `ADMIN_EMAILS` | Your admin email |
| `COMPANY_NAME` | Your business name |
| `COMPANY_EMAIL` | Your reply-to email |
| `COMPANY_PHONE` | Your phone number |
| `DASHBOARD_URL` | Your live site URL |

4. Click **Deploy → New deployment**
   - Type: **Web App**
   - Execute as: **Me**
   - Who has access: **Anyone**
5. Copy the Web App URL → go back to Step 3 and add it as `GAS_EMAIL_URL`

> Future updates: always use **Deploy → Manage deployments → Edit (pencil)** — never create a new deployment or you'll get a new URL and break everything.

---

## Step 5 — Supabase Auth Settings

Supabase → **Authentication → URL Configuration**:

- Site URL: `https://yourdomain.com`
- Redirect URLs — add both:
  - `https://yourdomain.com/landlord/login.html`
  - `https://yourdomain.com/admin/login.html`

---

## Step 6 — Netlify Frontend Deploy

This is the only way to deploy the frontend. Netlify runs the build command automatically which generates `config.js` from your environment variables.

1. Go to **netlify.com** → Add new site → **Import from Git**
2. Connect your GitHub repo
3. Build settings are already in `netlify.toml` — don't change anything
4. Go to **Site configuration → Environment variables** and add:

| Variable | Value |
|---|---|
| `SUPABASE_URL` | Your Supabase project URL |
| `SUPABASE_ANON_KEY` | Your Supabase anon public key |
| `IMAGEKIT_URL` | `https://ik.imagekit.io/your-id` |
| `IMAGEKIT_PUBLIC_KEY` | Your ImageKit public key |
| `COMPANY_NAME` | Your business name |
| `COMPANY_EMAIL` | Your business email |
| `COMPANY_PHONE` | Your phone number |
| `COMPANY_ADDRESS` | Your business address |
| `ADMIN_EMAILS` | Your admin email |

5. Click **Deploy site** — Netlify builds and goes live automatically

From now on: every push to `main` → Netlify auto-redeploys the frontend. No action needed.

---

## Step 7 — Deploy Edge Functions (One Time)

This deploys all 9 backend functions to Supabase. You only need to do this once. After that they stay live permanently unless you change them.

**You need Node.js installed on your computer for this step.**
Check by running `node -v` in your terminal. If you don't have it, download it from nodejs.org.

1. Open your terminal and navigate to your project folder
2. Run this command, replacing `YOUR_PROJECT_REF` with your Reference ID from your notes:

```
npx supabase login
```

3. It opens a browser — log in to your Supabase account and authorize
4. Then run:

```
npx supabase functions deploy --project-ref YOUR_PROJECT_REF
```

5. Wait for it to finish — it deploys all 9 functions one by one
6. Go to **Supabase → Edge Functions** in the sidebar — you should see all 9 listed and active

That's it. The functions are live permanently. You only need to repeat this if you ever edit the function code.

---

## Step 8 — Create Your Admin Account

1. Go to your live site and register as a landlord (or use any signup flow)
2. Supabase → **Authentication → Users** → find your email → copy your User UID
3. Supabase → **SQL Editor → New query** → run:

```sql
INSERT INTO admin_roles (user_id, email)
VALUES ('your-user-uid-here', 'your@email.com');
```

4. Sign out and back in — you'll now have access to `/admin/dashboard.html`

---

## When You Change Domains

Update all of these — missing even one breaks something:

- Supabase Secrets: `DASHBOARD_URL` and `FRONTEND_ORIGIN`
- GAS Script Properties: `DASHBOARD_URL`
- Supabase → Authentication → URL Configuration: Site URL and both Redirect URLs
- Netlify → Environment variables: nothing domain-specific stored there

---

## Troubleshooting

**Emails not sending / email_logs shows `failed`**
→ Check Supabase → Edge Functions → click function → Logs tab for the exact error
→ Most common: `GAS_EMAIL_URL` secret is wrong or GAS not deployed yet
→ Verify `GAS_RELAY_SECRET` in Supabase secrets matches `RELAY_SECRET` in GAS Script Properties exactly

**Site loads but shows errors / CONFIG not defined**
→ Netlify env vars are not set — go to Site configuration → Environment variables
→ Trigger a redeploy after setting them: Netlify → Deploys → Trigger deploy

**Admin login redirects incorrectly after domain change**
→ Update redirect URLs in Supabase → Authentication → URL Configuration

**Lease signing link is broken**
→ `DASHBOARD_URL` in Supabase secrets is pointing to the old domain — update it

**Images not loading**
→ `IMAGEKIT_URL` Netlify env var is wrong or not set — the placeholder image shows as fallback until fixed

---

*Choice Properties · Your trust is our standard.*
