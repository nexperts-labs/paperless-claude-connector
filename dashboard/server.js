/**
 * Express backend for paperless-claude-dashboard.
 * Reads JSON files from /data (shared volume with connector) and serves them as API.
 * Also serves the built React SPA.
 */

const express = require("express");
const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");

const CONNECTOR_CONTAINER = process.env.CONNECTOR_CONTAINER || "paperless-claude-connector";

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3001;
const DATA_DIR = process.env.DATA_DIR || "/data";
const SETTINGS_FILE = process.env.SETTINGS_FILE || "/config/settings.env";

const STATS_FILE = path.join(DATA_DIR, "stats.json");
const RESULTS_FILE = path.join(DATA_DIR, "results.json");

// --- Helpers ---

function readJsonFile(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    const raw = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function parseEnvFile(filePath) {
  const vars = {};
  if (!fs.existsSync(filePath)) return vars;
  const lines = fs.readFileSync(filePath, "utf-8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim();
    vars[key] = value;
  }
  return vars;
}

function writeEnvFile(filePath, vars) {
  // Preserve comments and ordering from existing file, then update values
  let lines = [];
  if (fs.existsSync(filePath)) {
    lines = fs.readFileSync(filePath, "utf-8").split("\n");
  }

  const updated = new Set();
  const result = lines.map((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return line;
    const idx = trimmed.indexOf("=");
    if (idx === -1) return line;
    const key = trimmed.slice(0, idx).trim();
    if (key in vars) {
      updated.add(key);
      return `${key}=${vars[key]}`;
    }
    return line;
  });

  // Append any new keys not already in file
  for (const [key, value] of Object.entries(vars)) {
    if (!updated.has(key)) {
      result.push(`${key}=${value}`);
    }
  }

  fs.writeFileSync(filePath, result.join("\n"), "utf-8");
}

function maskKey(key) {
  if (!key || key.length < 10) return "****";
  return key.slice(0, 14) + "****" + key.slice(-4);
}

// --- API Routes ---

app.get("/api/stats", (req, res) => {
  const stats = readJsonFile(STATS_FILE, {
    total_processed: 0,
    total_errors: 0,
    total_prompt_tokens: 0,
    total_completion_tokens: 0,
    last_scan: null,
  });
  res.json(stats);
});

app.get("/api/results", (req, res) => {
  const limit = parseInt(req.query.limit) || 50;
  const results = readJsonFile(RESULTS_FILE, []);
  res.json(results.slice(0, limit));
});

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", data_dir: DATA_DIR, ts: new Date().toISOString() });
});

// Settings: return masked values
app.get("/api/settings", (req, res) => {
  const vars = parseEnvFile(SETTINGS_FILE);
  const key = vars["ANTHROPIC_API_KEY"] || "";
  res.json({
    anthropic_key_masked: maskKey(key),
    has_key: key.length > 0,
    scan_interval: vars["SCAN_INTERVAL_SECONDS"] || "300",
    tag_new: vars["TAG_NEW"] || "Neu",
    tag_processed: vars["TAG_PROCESSED"] || "ai-processed",
    fuzzy_threshold: vars["FUZZY_THRESHOLD"] || "80",
    claude_model: vars["CLAUDE_MODEL"] || "claude-sonnet-4-5",
    settings_file_found: fs.existsSync(SETTINGS_FILE),
  });
});

// Settings: reveal full API key
app.get("/api/settings/reveal", (req, res) => {
  const vars = parseEnvFile(SETTINGS_FILE);
  res.json({ anthropic_api_key: vars["ANTHROPIC_API_KEY"] || "" });
});

const ALLOWED_MODELS = [
  "claude-haiku-4-5-20251001",
  "claude-sonnet-4-5",
  "claude-sonnet-4-6",
  "claude-opus-4-6",
];

// Settings: update values
app.post("/api/settings", (req, res) => {
  const { anthropic_api_key, claude_model, tag_new, tag_processed } = req.body;
  const updates = {};

  if (anthropic_api_key !== undefined) {
    if (!anthropic_api_key.trim() || !anthropic_api_key.startsWith("sk-ant-")) {
      return res.status(400).json({ error: "Ungültiges API-Key Format (muss mit sk-ant- beginnen)" });
    }
    updates["ANTHROPIC_API_KEY"] = anthropic_api_key.trim();
  }

  if (claude_model !== undefined) {
    if (!ALLOWED_MODELS.includes(claude_model)) {
      return res.status(400).json({ error: `Unbekanntes Modell. Erlaubt: ${ALLOWED_MODELS.join(", ")}` });
    }
    updates["CLAUDE_MODEL"] = claude_model;
  }

  if (tag_new !== undefined) {
    if (!tag_new.trim()) return res.status(400).json({ error: "Eingangs-Tag darf nicht leer sein" });
    updates["TAG_NEW"] = tag_new.trim();
  }

  if (tag_processed !== undefined) {
    if (!tag_processed.trim()) return res.status(400).json({ error: "Verarbeitet-Tag darf nicht leer sein" });
    updates["TAG_PROCESSED"] = tag_processed.trim();
  }

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: "Nichts zu aktualisieren" });
  }

  try {
    writeEnvFile(SETTINGS_FILE, updates);
    const vars = parseEnvFile(SETTINGS_FILE);
    res.json({
      success: true,
      anthropic_key_masked: maskKey(vars["ANTHROPIC_API_KEY"] || ""),
      claude_model: vars["CLAUDE_MODEL"] || "",
      tag_new: vars["TAG_NEW"] || "",
      tag_processed: vars["TAG_PROCESSED"] || "",
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// Paperless: list all documents (proxied through dashboard to avoid CORS/auth exposure)
app.get("/api/paperless/documents", async (req, res) => {
  const vars = parseEnvFile(SETTINGS_FILE);
  const paperlessUrl = vars["PAPERLESS_URL"] || process.env.PAPERLESS_URL || "";
  const paperlessToken = vars["PAPERLESS_TOKEN"] || process.env.PAPERLESS_TOKEN || "";

  if (!paperlessUrl || !paperlessToken) {
    return res.status(503).json({ error: "Paperless URL oder Token nicht konfiguriert" });
  }

  try {
    const documents = [];
    let url = `${paperlessUrl.replace(/\/$/, "")}/api/documents/?page_size=100&fields=id,title,created`;

    while (url) {
      const response = await fetch(url, {
        headers: { Authorization: `Token ${paperlessToken}` },
      });
      if (!response.ok) {
        const text = await response.text();
        return res.status(response.status).json({ error: `Paperless API Fehler: ${text}` });
      }
      const data = await response.json();
      documents.push(...data.results);
      url = data.next || null;
    }

    res.json(documents);
  } catch (err) {
    console.error("Paperless documents fetch failed:", err);
    res.status(500).json({ error: String(err) });
  }
});

// Reprocess: queue specific document IDs
app.post("/api/reprocess", (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: "ids muss ein nicht-leeres Array sein" });
  }
  const queue = { mode: "ids", ids, requested_at: new Date().toISOString() };
  try {
    fs.writeFileSync(path.join(DATA_DIR, "reprocess_queue.json"), JSON.stringify(queue), "utf-8");
    res.json({ success: true, queued: ids.length });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// Reprocess: queue all documents
app.post("/api/reprocess/all", (req, res) => {
  const queue = { mode: "all", requested_at: new Date().toISOString() };
  try {
    fs.writeFileSync(path.join(DATA_DIR, "reprocess_queue.json"), JSON.stringify(queue), "utf-8");
    res.json({ success: true, mode: "all" });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// Connector restart
app.post("/api/connector/restart", (req, res) => {
  exec(`docker restart ${CONNECTOR_CONTAINER}`, { timeout: 30000 }, (err, stdout, stderr) => {
    if (err) {
      console.error("Restart failed:", stderr);
      return res.status(500).json({ error: stderr || err.message });
    }
    console.log(`Connector restarted: ${stdout.trim()}`);
    res.json({ success: true });
  });
});

// Serve React SPA (production build)
const distPath = path.join(__dirname, "dist");
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  app.get("*", (req, res) => {
    res.sendFile(path.join(distPath, "index.html"));
  });
} else {
  app.get("/", (req, res) => {
    res.send("<h2>Dashboard not built yet. Run <code>npm run build</code>.</h2>");
  });
}

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Dashboard server running on port ${PORT}`);
  console.log(`Data directory: ${DATA_DIR}`);
  console.log(`Settings file: ${SETTINGS_FILE}`);
});
