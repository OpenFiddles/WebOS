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

app.get("/api/os-check", async (_req, res) => {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return res.status(503).json({
      status: "Database Not Configured",
      message: "Set SUPABASE_URL and SUPABASE_ANON_KEY to enable the database check."
    });
  }

  try {
    const { createClient } = require("@supabase/supabase-js");
    const supabase = createClient(supabaseUrl, supabaseAnonKey);
    const { data, error } = await supabase.from("your_table").select("*").limit(1);
    if (error) throw error;
    return res.status(200).json({ status: "Kernel Database Active", payload: data });
  } catch (error) {
    return res.status(500).json({
      status: "Database Error",
      message: error && error.message ? error.message : "Unknown database error"
    });
  }
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
