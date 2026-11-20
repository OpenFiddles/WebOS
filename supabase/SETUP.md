# WebOS Supabase setup

WebOS keeps working locally when Supabase is unavailable. Cloud account and backup features are enabled only when the public Supabase configuration is present.

## 1. Vercel environment variables

In Vercel → Project → Settings → Environment Variables, configure:

- `SUPABASE_URL` — the Project URL from Supabase → Project Settings → API.
- `SUPABASE_PUBLISHABLE_KEY` — the current `sb_publishable_...` key. The legacy `SUPABASE_ANON_KEY` is supported only as a fallback.

Set them for the environments you deploy (Production, and Preview/Development if needed), then redeploy. The production values are managed in the Vercel `web-os` project.

The browser config endpoint intentionally returns only the public publishable/anon key. Never put `SUPABASE_SECRET_KEY`, `service_role`, or any other server-only credential in browser code or expose it through an API response. WebOS cloud backup uses per-user access and Row Level Security; it does not need a secret key.

## 2. Create the cloud data table

The WebOS Supabase project should contain `public.webos_cloud_data`. The migration creates this table and policies that allow each authenticated user to access only the row whose `user_id` matches `auth.uid()`.

Keep Row Level Security enabled. Do not add public/anonymous access policies.

## 3. Enable email authentication

In Supabase → Authentication → Providers, enable Email.

Set the Supabase Auth Site URL to:

`https://web-os-iota.vercel.app`

Add that origin to the allowed redirect URLs. If you use Vercel preview deployments, add only the preview origins you intend to use.

Email confirmation can remain enabled. New users may need to confirm their email before signing in.

## 4. Use WebOS

Open WebOS → Better Settings → Account & Cloud.

1. Create an account or sign in.
2. Choose **Back up to cloud** for the first upload.
3. Enable automatic sync only on devices where you want local preference and virtual-file changes uploaded.
4. On another device, sign in and choose **Restore from cloud**. Restore replaces that device's current WebOS virtual filesystem and synced preferences.

Cloud backups are limited to 8 MB per upload. Sensitive files should not be included on shared devices. Supabase Row Level Security protects account rows, but backups are not end-to-end encrypted.

## 5. Local fallback

If environment variables are missing, the Supabase library cannot load, or the service is unavailable, WebOS switches to local mode. Local files and preferences remain available. A failed cloud sign-in or sync does not delete local data.
