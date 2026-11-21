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

// Allow the bundled Capacitor app (https://localhost) to call the hosted API.
// Browser deployments remain same-origin; only the native app origins are added.
const nativeAppOrigins = new Set(["https://localhost", "capacitor://localhost", "http://localhost"]);
app.use("/api", (req, res, next) => {
  const origin = req.get("Origin");
  if (origin && nativeAppOrigins.has(origin)) {
    res.set("Access-Control-Allow-Origin", origin);
    res.set("Vary", "Origin");
    res.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.set("Access-Control-Allow-Headers", "Content-Type");
  }
  if (req.method === "OPTIONS") return res.sendStatus(origin && nativeAppOrigins.has(origin) ? 204 : 403);
  next();
});

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
  return res.status(200).json({ configured:true, url, anonKey:publicKey, turnstileSiteKey:process.env.TURNSTILE_SITE_KEY || "" });
});

app.post("/api/turnstile/verify", async (req,res) => {
  res.set("Cache-Control","no-store");
  const secret=process.env.TURNSTILE_SECRET_KEY || "";
  const token=typeof req.body?.token==="string"?req.body.token:"";
  if(!secret)return res.status(503).json({success:false,message:"Turnstile server verification is not configured."});
  if(!token || token.length>4096)return res.status(400).json({success:false,message:"A valid security token is required."});
  try{
    const body=new URLSearchParams({secret,response:token});
    const response=await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body});
    const result=await response.json();
    const allowed=(process.env.TURNSTILE_ALLOWED_HOSTNAMES||"").split(",").map(value=>value.trim().toLowerCase()).filter(Boolean);
    const hostname=String(result.hostname||"").toLowerCase();
    if(!response.ok || !result.success || (allowed.length && !allowed.includes(hostname))){
      return res.status(403).json({success:false,message:"Security verification failed. Please retry."});
    }
    return res.status(200).json({success:true});
  }catch(error){
    console.error("[WebOS Turnstile] Verification request failed:",error?.message||error);
    return res.status(502).json({success:false,message:"Security verification is temporarily unavailable."});
  }
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
