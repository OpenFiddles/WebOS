# WebOS media apps and FFmpeg worker

The desktop adds Camera, Audio Recorder, Notes Studio, Print Center, and Video Player. Camera/microphone access is permission-gated by the browser and never starts automatically.

## Deploy the FFmpeg worker

The worker is deliberately separate from the Vercel frontend: video transcoding is CPU- and memory-intensive and should not run inside the WebOS serverless request path.

1. Deploy the `media-worker/` directory as a Node.js service on a host that supports long-running processes and FFmpeg binaries.
2. Set `SUPABASE_URL` and `SUPABASE_ANON_KEY` (or `SUPABASE_PUBLISHABLE_KEY`) on the worker.
3. Set `ALLOWED_ORIGINS=https://web-os-iota.vercel.app` (add your own preview origin only if needed).
4. Set `MEDIA_WORKER_URL` in the WebOS Vercel project to the worker's HTTPS base URL and redeploy.
5. Sign in to WebOS before using compression. The worker verifies the user's Supabase access token.

The worker accepts uploads up to 1 GB, but hosting plans may impose lower request, execution-time, memory, or bandwidth limits. Choose a host plan accordingly. Compression targets are 10 MB, 30 MB, and 50 MB. The worker retries with a lower video bitrate up to three times and reports whether the target was reached.

## Local development

Install dependencies inside `media-worker/`, set the environment variables above, and run `npm start`. Set `MEDIA_WORKER_URL` in the WebOS server environment to the local worker URL. Use HTTPS or localhost for browser camera/microphone permissions.
