// ai.js
//
// Two-tier suggestion logic, per the architecture plan:
//   1. Deterministic layer (free, instant): filters out anything already
//      packed, and anything this user has consistently rejected before
//      (Feature 7 — Learning AI) — runs regardless of whether an LLM is configured.
//   2. LLM layer (optional, costs money): only runs if ANTHROPIC_API_KEY is
//      set. Falls back to a small static baseline list if not, so the
//      feature still demonstrates value with zero setup.
//
// Swap callLlmForSuggestions' body for a different provider (OpenAI, etc.)
// if you prefer — nothing else in this file needs to change.

const feedbackDb = require("./feedbackDb");

const BASELINE_SUGGESTIONS = [
  { name: "Phone charger", reason: "Easy to forget, needed on almost every trip.", category: "Electronics" },
  { name: "Universal power adapter", reason: "Useful for most international destinations.", category: "Electronics" }
];

async function callLlmForSuggestions({ destination, startDate, endDate, notes, existingItemNames }) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null; // not configured — caller falls back to BASELINE_SUGGESTIONS

  const prompt = `You are helping someone pack for a trip.
Destination: ${destination || "unknown"}
Dates: ${startDate || "unspecified"} to ${endDate || "unspecified"}
Notes: ${notes || "none"}
They already have these items on their checklist: ${existingItemNames.join(", ") || "none yet"}.

Suggest up to 5 additional packing items they might be missing, considering likely weather, culture, and trip length for the destination and dates given. Do not repeat anything already in their list.

Respond with ONLY a JSON array, no other text, in this exact shape:
[{"name": "Umbrella", "reason": "Rain is likely there this time of year", "category": "Weather"}]`;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model: "claude-sonnet-5",
      max_tokens: 512,
      messages: [{ role: "user", content: prompt }]
    })
  });

  if (!response.ok) {
    console.warn("AI suggestion LLM call failed:", response.status, await response.text());
    return null;
  }

  const data = await response.json();
  const text = (data.content || []).map((block) => block.text || "").join("");

  try {
    const cleaned = text.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(cleaned);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    console.warn("AI suggestion response wasn't valid JSON:", text);
    return null;
  }
}

async function getSuggestions(userId, input) {
  const stats = feedbackDb.getAcceptanceStats(userId);
  const existingLower = (input.existingItemNames || []).map((n) => n.toLowerCase());

  let suggestions = await callLlmForSuggestions(input);
  if (!suggestions) suggestions = BASELINE_SUGGESTIONS;

  return suggestions.filter((s) => {
    const key = (s.name || "").toLowerCase();
    if (!key || existingLower.includes(key)) return false;

    // Learning AI: if this user has rejected this exact item 3+ times and
    // never accepted it, stop suggesting it — a cheap, deterministic signal
    // that needs no LLM call to apply.
    const stat = stats[key];
    if (stat && stat.rejected >= 3 && stat.accepted === 0) return false;

    return true;
  });
}

module.exports = { getSuggestions };
