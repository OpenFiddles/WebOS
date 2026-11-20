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

app.get("/api/health", (_req, res) => {
  res.status(200).json({
    ok: true,
    runtime: "node",
    node: process.version
  });
});

app.get("/api/cloud/config", (_req, res) => {
  res.set("Cache-Control", "no-store");
  const url = process.env.SUPABASE_URL || "";
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || "";
  let validUrl = false;
  try { const parsed = new URL(url); validUrl = parsed.protocol === "https:" && parsed.hostname.endsWith(".supabase.co"); } catch (_) {}
  if (!validUrl || !anonKey) return res.status(200).json({ configured:false, message:"Cloud accounts are not configured. WebOS will continue in local mode." });
  return res.status(200).json({ configured:true, url, anonKey });
});

app.get("/api/media/config", (_req,res) => { res.set("Cache-Control","no-store"); res.json({workerUrl:process.env.MEDIA_WORKER_URL||""}); });

app.get("/api/os-check", (_req, res) => {
  const configured = Boolean(process.env.SUPABASE_URL && (process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY));
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
