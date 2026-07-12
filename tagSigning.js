// tagSigning.js
//
// The actual cryptographic core of "only our tags register." Keep this
// file's SECRET on the server only — never in the app, never in git history
// in plaintext, never logged.

const crypto = require("crypto");

function sign(secret, qrCode, bleId) {
  return crypto.createHmac("sha256", secret).update(qrCode + bleId).digest("hex");
}

/**
 * Constant-time comparison so an attacker can't use response-timing
 * differences to guess a valid signature byte-by-byte.
 */
function safeEqual(a, b) {
  const bufA = Buffer.from(a, "hex");
  const bufB = Buffer.from(b, "hex");
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function verify(secret, qrCode, bleId, sig) {
  try {
    const expected = sign(secret, qrCode, bleId);
    return safeEqual(expected, sig);
  } catch {
    return false;
  }
}

module.exports = { sign, verify };
