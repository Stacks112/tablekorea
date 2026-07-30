/**
 * TableKorea worker — minimal skeleton, grows as features land.
 *
 * Routes:
 *   GET  /health    → { ok: true }
 *   POST /feedback  → store a "wrong info" report from the app
 *                     body: { placeId, field, note, lang }
 *
 * Security posture copied from the Stacks security review (playbook 1 §4):
 *  - all D1 queries use ?N + .bind()   (no string interpolation, ever)
 *  - CORS via explicit ALLOWED_ORIGINS whitelist (no wildcard)
 *  - Origin header verified on POST (text/plain simple requests skip preflight)
 *  - rate limit per ip-hash + duplicate-content block
 *  - indexes created alongside tables, not later
 */

const ALLOWED_ORIGINS = [
  "http://localhost:8000",
  // "https://<account>.github.io",   ← uncomment + fill on first deploy
  // "https://tablekorea.example",    ← custom domain when purchased
];

const MAX_NOTE_LEN = 500;
const RATE_LIMIT_PER_HOUR = 10;

function corsHeaders(origin) {
  const ok = ALLOWED_ORIGINS.includes(origin);
  return {
    "Access-Control-Allow-Origin": ok ? origin : ALLOWED_ORIGINS[0] || "",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json; charset=utf-8",
  };
}

async function ensureTables(db) {
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS feedback (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      place_id TEXT NOT NULL,
      field TEXT NOT NULL,
      note TEXT NOT NULL,
      lang TEXT NOT NULL DEFAULT 'EN',
      ip_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`),
    db.prepare(
      `CREATE INDEX IF NOT EXISTS idx_feedback_ip ON feedback (ip_hash, created_at)`
    ),
  ]);
}

async function sha256hex(s) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin") || "";
    const headers = corsHeaders(origin);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers });
    }

    if (url.pathname === "/health") {
      return new Response(JSON.stringify({ ok: true }), { headers });
    }

    if (url.pathname === "/feedback" && request.method === "POST") {
      // Origin check — simple requests skip CORS preflight, so verify here.
      if (!ALLOWED_ORIGINS.includes(origin)) {
        return new Response(JSON.stringify({ error: "forbidden" }), { status: 403, headers });
      }
      let body;
      try {
        body = await request.json();
      } catch {
        return new Response(JSON.stringify({ error: "bad json" }), { status: 400, headers });
      }
      const placeId = String(body.placeId || "").slice(0, 20);
      const field = String(body.field || "").slice(0, 30);
      const note = String(body.note || "").trim().slice(0, MAX_NOTE_LEN);
      const lang = ["EN", "JA", "ZH"].includes(body.lang) ? body.lang : "EN";
      if (!placeId || !field || !note) {
        return new Response(JSON.stringify({ error: "missing fields" }), { status: 400, headers });
      }

      await ensureTables(env.DB);
      const ip = request.headers.get("CF-Connecting-IP") || "0.0.0.0";
      const ipHash = (await sha256hex(ip + (env.IP_SALT || "tk"))).slice(0, 24);

      // rate limit
      const recent = await env.DB.prepare(
        `SELECT COUNT(*) AS n FROM feedback
         WHERE ip_hash = ?1 AND created_at > datetime('now', '-1 hour')`
      ).bind(ipHash).first();
      if (recent && recent.n >= RATE_LIMIT_PER_HOUR) {
        return new Response(JSON.stringify({ error: "rate limited" }), { status: 429, headers });
      }
      // duplicate block
      const dup = await env.DB.prepare(
        `SELECT id FROM feedback
         WHERE ip_hash = ?1 AND place_id = ?2 AND note = ?3
         AND created_at > datetime('now', '-1 day') LIMIT 1`
      ).bind(ipHash, placeId, note).first();
      if (dup) {
        return new Response(JSON.stringify({ ok: true, dedup: true }), { headers });
      }

      await env.DB.prepare(
        `INSERT INTO feedback (place_id, field, note, lang, ip_hash)
         VALUES (?1, ?2, ?3, ?4, ?5)`
      ).bind(placeId, field, note, lang, ipHash).run();

      return new Response(JSON.stringify({ ok: true }), { headers });
    }

    return new Response(JSON.stringify({ error: "not found" }), { status: 404, headers });
  },
};
