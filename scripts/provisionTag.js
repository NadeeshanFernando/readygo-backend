// scripts/provisionTag.js
//
// Convenience CLI so you don't have to hand-write curl commands each time
// you provision a physical tag. Requires Node 18+ (for global fetch) and
// the server to already be running (npm start).
//
// Usage:
//   node scripts/provisionTag.js <bleId> [nickname]
//
// Example:
//   node scripts/provisionTag.js "AA:BB:CC:DD:EE:01" "Prototype tag 1"

require("dotenv").config();

const [, , bleId, nickname] = process.argv;
const { ADMIN_API_KEY, PORT = 3000 } = process.env;

if (!bleId) {
  console.error("Usage: node scripts/provisionTag.js <bleId> [nickname]");
  process.exit(1);
}

if (!ADMIN_API_KEY) {
  console.error("ADMIN_API_KEY is not set — copy .env.example to .env and fill it in.");
  process.exit(1);
}

async function main() {
  const response = await fetch(`http://localhost:${PORT}/api/tags/provision`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-admin-key": ADMIN_API_KEY
    },
    body: JSON.stringify({ bleId, nickname })
  });

  const data = await response.json();

  if (!response.ok) {
    console.error("Provisioning failed:", data);
    process.exit(1);
  }

  console.log("\nTag provisioned successfully:\n");
  console.log(`  qrCode:  ${data.qrCode}`);
  console.log(`  bleId:   ${data.bleId}`);
  console.log(`  sig:     ${data.sig}`);
  console.log(`\nPaste this exact text into your QR generator (as plain text):\n`);
  console.log(`  ${data.qrPayload}\n`);
}

main().catch((err) => {
  console.error("Error calling provision endpoint:", err.message);
  console.error("Is the server running? Try: npm start");
  process.exit(1);
});
