# ReadyGo Tag Auth Backend (example)

This is the piece that makes "only tags we issued can register" actually
true, instead of just a UI-level suggestion. It holds a secret key that
never gets shipped inside the ReadyGo app, and is the only thing capable of
producing (or checking) a valid tag signature.

## Why this has to be a separate server

Anything embedded in the React Native app — including any "secret" string —
can be extracted by someone who unpacks the app bundle. That's true of any
mobile app, not a ReadyGo-specific weakness. So the signing secret has to
live somewhere the app never touches directly: this server.

## Setup

```bash
cd tag-auth-backend-example
npm install
cp .env.example .env
```

Generate two random secrets and put them in `.env`:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Run that twice — once for `TAG_SIGNING_SECRET`, once for `ADMIN_API_KEY`.
**Keep `.env` out of git** (there's a reason it's `.env.example`, not `.env`).

Start the server:

```bash
npm start
```

You should see: `Tag auth backend listening on http://localhost:3000`

## Provisioning your first physical tag

1. Flash/power on your tag, read its real BLE MAC using nRF Connect (see our
   earlier conversation on building the hardware) — that's your `bleId`.
2. With the server running, provision it:
   ```bash
   npm run provision -- "AA:BB:CC:DD:EE:01" "Prototype tag 1"
   ```
3. The script prints a `qrPayload` string like:
   ```
   {"qrCode":"RG-4F2A9C","bleId":"AA:BB:CC:DD:EE:01","sig":"8f3a...e21"}
   ```
4. Paste that exact string into a QR generator (plain text type — see our
   earlier note about myqrcode.com) and print/display the resulting code.
5. Stick it on your tag.

## Connecting the app to this server

In the ReadyGo app, set an environment variable so it stops using the
insecure local dev fallback and starts calling this real server:

```
EXPO_PUBLIC_TAG_AUTH_API_URL=http://YOUR_SERVER_ADDRESS:3000
```

(For local testing on a physical phone, `localhost` won't reach your laptop
— use your laptop's LAN IP, or deploy this server somewhere reachable, e.g.
Railway, Render, Fly.io, or a small VPS.)

Once that's set, scanning a tag in the app will call `POST /api/tags/verify`
here, and only tags with a valid signature will register successfully.

## AI Suggestions & Learning AI (Features 6 & 7)

Two additional endpoints, unrelated to tag authenticity, sharing this same
small server for convenience:

- `POST /api/ai/suggestions` — body: `{ userId, destination, startDate, endDate, notes, existingItemNames[] }`.
  Returns `{ suggestions: [{ name, reason, category? }] }`. Works with zero
  setup (falls back to a small static baseline list); set `ANTHROPIC_API_KEY`
  in `.env` to enable real LLM-generated, destination-aware suggestions.
- `POST /api/ai/feedback` — body: `{ userId, itemName, accepted, destination }`.
  The app calls this every time someone accepts/rejects a suggestion.
  Stored in `feedback.json` (same "swap for a real DB later" caveat as
  `tags.json`). After 3+ rejections with zero accepts, an item stops being
  suggested to that user — a cheap deterministic personalization layer that
  runs before any LLM call.

Both endpoints are public (no admin key) since any logged-in app user calls
them directly. Rate-limit `/api/ai/suggestions` in production — unlike
everything else here, it costs real money per request once
`ANTHROPIC_API_KEY` is set.

## Going to production

Before real customers use this:
- **Swap the JSON file storage (`db.js`) for a real database.** The current
  version isn't safe for concurrent writes or more than a handful of tags.
- **Put this behind HTTPS** (a reverse proxy like Caddy/Nginx, or your
  hosting provider's built-in TLS) — sending secrets/signatures over plain
  HTTP defeats the point.
- **Rate-limit `/api/tags/verify`** so someone can't brute-force signatures
  by hammering the endpoint.
- **Rotate `ADMIN_API_KEY`** if it's ever exposed, and never expose the
  `/api/tags/provision` or `/api/tags` (list) endpoints publicly — they
  should only ever be called by you, from a trusted machine.
- Consider logging every verify attempt (qrCode + result, not the secret)
  so you can spot patterns like the same `qrCode` being checked from many
  different `bleId`s — a sign someone's trying to reuse a signature.
