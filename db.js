// db.js
//
// Extremely simple JSON-file-backed storage, good enough for a handful of
// prototype tags. Swap this for a real database (Postgres, SQLite,
// DynamoDB, whatever) before you have more than a few dozen tags or more
// than one server instance running.

const fs = require("fs");
const path = require("path");

const DB_PATH = path.join(__dirname, "tags.json");

function loadAll() {
  if (!fs.existsSync(DB_PATH)) return {};
  const raw = fs.readFileSync(DB_PATH, "utf-8");
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function saveAll(tags) {
  fs.writeFileSync(DB_PATH, JSON.stringify(tags, null, 2), "utf-8");
}

function getTag(qrCode) {
  const tags = loadAll();
  return tags[qrCode] || null;
}

function saveTag(record) {
  const tags = loadAll();
  tags[record.qrCode] = record;
  saveAll(tags);
}

function listTags() {
  return Object.values(loadAll());
}

module.exports = { getTag, saveTag, listTags };
