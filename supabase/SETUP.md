# WebOS Supabase setup

WebOS keeps working locally when Supabase is unavailable. Cloud account and backup features are enabled only when the public Supabase configuration is present.

## 1. Vercel environment variables

In Vercel → Project → Settings → Environment Variables, add:

- `SUPABASE_URL` — the Project URL from Supabase → Project Settings → API.
- `SUPABASE_ANON_KEY` — the legacy anon/public key, **or** `SUPABASE_PUBLISHABLE_KEY` — the publishable key.

Set them for the environments you deploy (Production, and Preview/Development if needed), then redeploy.

The browser config endpoint intentionally returns only the public anon/publishable key. Never put `SUPABASE_SERVICE_ROLE_KEY` in browser code or expose it through an API response. WebOS cloud backup uses per-user access and Row Level Security; it does not need the service-role key.

## 2. Create the cloud data table

Open Supabase → SQL Editor, paste the contents of [schema.sql](./schema.sql), and run it. The script creates `public.webos_cloud_data` and policies that allow each authenticated user to access only the row whose `user_id` matches `auth.uid()`.

Do not disable Row Level Security or add a public/anonymous policy.

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
