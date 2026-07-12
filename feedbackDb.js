// feedbackDb.js
//
// Same simple JSON-file pattern as db.js — swap for a real database before
// this has more than a handful of users. Stores every accept/reject
// decision so getAcceptanceStats() can personalize future suggestions
// (Feature 7 — Learning AI).

const fs = require("fs");
const path = require("path");

const DB_PATH = path.join(__dirname, "feedback.json");

function loadAll() {
  if (!fs.existsSync(DB_PATH)) return [];
  try {
    return JSON.parse(fs.readFileSync(DB_PATH, "utf-8"));
  } catch {
    return [];
  }
}

function saveAll(records) {
  fs.writeFileSync(DB_PATH, JSON.stringify(records, null, 2), "utf-8");
}

function addFeedback(record) {
  const all = loadAll();
  all.push(record);
  saveAll(all);
}

/**
 * Returns { [itemNameLowercase]: { accepted: number, rejected: number } }
 * for a given user — the cheap, deterministic "layer 1" signal that runs
 * before any LLM call, per the tiered design in the architecture plan.
 */
function getAcceptanceStats(userId) {
  const all = loadAll().filter((r) => r.userId === userId);
  const stats = {};
  for (const r of all) {
    const key = r.itemName.toLowerCase();
    if (!stats[key]) stats[key] = { accepted: 0, rejected: 0 };
    if (r.accepted) stats[key].accepted += 1;
    else stats[key].rejected += 1;
  }
  return stats;
}

module.exports = { addFeedback, getAcceptanceStats };
