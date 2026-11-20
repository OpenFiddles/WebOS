/**
 * WebOS Node.js server.
 * Serves the desktop application and a small set of first-party API endpoints.
 * The built-in WebOS Browser and its server-side proxy have been removed.
 */
if (!process.env.VERCEL) require("dotenv").config();

const express = require("express");
const path = require("node:path");

const app = express();
const publicDirectory = path.join(__dirname, "public");

app.use(express.json({ limit: "1mb" }));
app.use(express.static(publicDirectory));

// Public marketing pages live under /page; keep / serving the WebOS desktop.
app.get("/page", (_req, res) => res.redirect(301, "/page/"));
app.get("/page/*", (req, res, next) => {
  const requested = path.join(publicDirectory, "page", req.params[0] || "index.html");
  if (!requested.startsWith(path.join(publicDirectory, "page") + path.sep)) return res.status(400).send("Invalid page path");
  res.sendFile(requested, err => { if (err) next(); });
});

app.get("/api/health", (_req, res) => {
  res.status(200).json({
    ok: true,
    runtime: "node",
    node: process.version
  });
});

function getSupabasePublicKey() {
  // Prefer the current publishable key; retain the legacy anon key as a fallback.
  return process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || "";
}

app.get("/api/cloud/config", (_req, res) => {
  res.set("Cache-Control", "no-store");
  const url = process.env.SUPABASE_URL || "";
  const publicKey = getSupabasePublicKey();
  let validUrl = false;
  try { const parsed = new URL(url); validUrl = parsed.protocol === "https:" && parsed.hostname.endsWith(".supabase.co"); } catch (_) {}
  if (!validUrl || !publicKey) return res.status(200).json({ configured:false, message:"Cloud accounts are not configured. WebOS will continue in local mode." });
  return res.status(200).json({ configured:true, url, anonKey:publicKey });
});

app.get("/api/media/config", (_req,res) => { res.set("Cache-Control","no-store"); res.json({workerUrl:process.env.MEDIA_WORKER_URL||""}); });

app.get("/api/os-check", (_req, res) => {
  const configured = Boolean(process.env.SUPABASE_URL && getSupabasePublicKey());
  return res.status(200).json({ status:configured?"Cloud configuration present":"Local mode", configured });
});

app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api/")) return next();
  res.sendFile(path.join(publicDirectory, "index.html"));
});

if (process.env.NODE_ENV !== "production" && !process.env.VERCEL) {
  const port = process.env.PORT || 3000;
  app.listen(port, () => console.log("WebOS Node.js server listening on port " + port));
}

module.exports = app;
