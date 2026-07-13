// server.js
//
// Health check:
//   GET /health — public, no auth. For uptime monitors and Render's own
//                 health checks. Reports whether required config is present
//                 and whether the disk (JSON-file storage) is writable.
//
// Tag authenticity:
//   POST /api/tags/provision  — you call this once per physical tag, at
//                                manufacturing/setup time. Protected by
//                                ADMIN_API_KEY. Generates the signed QR
//                                payload to print.
//   POST /api/tags/verify     — the app calls this every time a customer
//                                scans a tag to register it. Public, but
//                                only returns a boolean — never leaks the
//                                secret or lets you forge a signature.
//
// AI Suggestions / Learning AI:
//   POST /api/ai/suggestions
//   POST /api/ai/feedback

require("dotenv").config();
const express = require("express");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { sign, verify } = require("./tagSigning");
const db = require("./db");
const ai = require("./ai");
const feedbackDb = require("./feedbackDb");

const app = express();
app.use(express.json());

const { TAG_SIGNING_SECRET, ADMIN_API_KEY, PORT = 3000 } = process.env;

if (!TAG_SIGNING_SECRET || !ADMIN_API_KEY) {
  console.error("Missing TAG_SIGNING_SECRET or ADMIN_API_KEY — copy .env.example to .env and fill them in.");
  process.exit(1);
}

function requireAdminKey(req, res, next) {
  const key = req.header("x-admin-key");
  if (key !== ADMIN_API_KEY) {
    return res.status(401).json({ error: "unauthorized" });
  }
  next();
}

// --- Health check ---
// Public, no auth, no dependencies on the tag/AI logic below — this should
// keep working even if something else in the app is misconfigured, so it
// can actually tell you *what's* wrong instead of just also failing.
app.get("/health", (req, res) => {
  const checks = {
    tagSigningConfigured: Boolean(TAG_SIGNING_SECRET),
    adminKeyConfigured: Boolean(ADMIN_API_KEY),
    aiConfigured: Boolean(process.env.ANTHROPIC_API_KEY),
    diskWritable: false
  };

  // Quick round-trip write+delete to confirm the JSON-file storage this
  // backend relies on (db.js/feedbackDb.js) can actually persist anything —
  // some hosts silently mount read-only or ephemeral filesystems.
  const probePath = path.join(__dirname, ".health-check-probe");
  try {
    fs.writeFileSync(probePath, String(Date.now()));
    fs.unlinkSync(probePath);
    checks.diskWritable = true;
  } catch {
    checks.diskWritable = false;
  }

  const healthy = checks.tagSigningConfigured && checks.adminKeyConfigured && checks.diskWritable;

  res.status(healthy ? 200 : 503).json({
    status: healthy ? "ok" : "degraded",
    uptimeSeconds: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
    checks
  });
});

function generateQrCode() {
  // Simple readable serial: RG- + 6 random hex chars. Swap for a sequential
  // scheme (RG-000001, RG-000002, ...) if you'd rather track a running count.
  return `RG-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
}

// --- Manufacturing-time endpoint: you call this once per tag ---
app.post("/api/tags/provision", requireAdminKey, (req, res) => {
  const { bleId, nickname } = req.body || {};
  if (!bleId || typeof bleId !== "string") {
    return res.status(400).json({ error: "bleId is required" });
  }

  const qrCode = generateQrCode();
  const sig = sign(TAG_SIGNING_SECRET, qrCode, bleId);

  db.saveTag({
    qrCode,
    bleId,
    nickname: nickname || null,
    provisionedAt: new Date().toISOString()
  });

  const qrPayload = JSON.stringify({ qrCode, bleId, sig });

  res.json({
    qrCode,
    bleId,
    sig,
    qrPayload, // paste this directly into your QR generator's "Text" field
    note: "Encode qrPayload as a plain-text QR code and print it on the tag."
  });
});

// --- Registration-time endpoint: the app calls this on every scan ---
app.post("/api/tags/verify", (req, res) => {
  const { qrCode, bleId, sig } = req.body || {};
  if (!qrCode || !bleId || !sig) {
    return res.status(400).json({ valid: false, error: "qrCode, bleId, and sig are all required" });
  }

  const record = db.getTag(qrCode);

  // The tag must (a) exist in our records, (b) have the bleId we issued it
  // with (catches someone reusing a real signature with a different bleId),
  // and (c) have a signature that matches what we'd compute ourselves.
  const knownAndMatching = record && record.bleId === bleId;
  const sigValid = verify(TAG_SIGNING_SECRET, qrCode, bleId, sig);

  res.json({ valid: Boolean(knownAndMatching && sigValid) });
});

// --- Convenience: list what you've provisioned so far (protect this too) ---
app.get("/api/tags", requireAdminKey, (req, res) => {
  res.json(db.listTags());
});

// --- AI Suggestions (Feature 6) ---
// Public — no admin key needed, this is called directly by the app for any
// logged-in user. Rate-limit this in production; LLM calls cost money per
// request unlike everything else in this backend.
app.post("/api/ai/suggestions", async (req, res) => {
  const { userId, destination, startDate, endDate, notes, existingItemNames } = req.body || {};
  try {
    const suggestions = await ai.getSuggestions(userId || "anonymous", {
      destination,
      startDate,
      endDate,
      notes,
      existingItemNames: existingItemNames || []
    });
    res.json({ suggestions });
  } catch (error) {
    console.error("AI suggestion error:", error);
    res.status(500).json({ suggestions: [], error: "failed to generate suggestions" });
  }
});

// --- Learning AI feedback (Feature 7) ---
app.post("/api/ai/feedback", (req, res) => {
  const { userId, itemName, accepted, destination } = req.body || {};
  if (!userId || !itemName || typeof accepted !== "boolean") {
    return res.status(400).json({ error: "userId, itemName, and accepted (boolean) are required" });
  }
  feedbackDb.addFeedback({ userId, itemName, accepted, destination, recordedAt: new Date().toISOString() });
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`Tag auth backend listening on http://localhost:${PORT}`);
});
