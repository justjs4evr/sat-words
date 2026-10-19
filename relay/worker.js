// Cloudflare Worker: a pass-through relay so the site can call NVIDIA from the browser.
// NVIDIA's API does not accept requests sent directly from web pages (no CORS), so the
// browser sends each request here and this Worker forwards it unchanged.
//
// What it does NOT do: it never stores, logs or reads the visitor's API key. The key
// arrives in the Authorization header and is passed straight to NVIDIA.
//
// Settings (Worker → Settings → Variables):
//   ALLOWED_ORIGINS  comma-separated list of sites allowed to use this relay,
//                    e.g. "https://yourname.github.io"

const UPSTREAM = "https://integrate.api.nvidia.com/v1/chat/completions";
const ALLOWED_MODELS = ["nvidia/nemotron-3.5-super-vl-120b-a12b"];
const MAX_BODY = 32 * 1024;

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const allowed = String(env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean);
    const okOrigin = allowed.includes(origin);
    const cors = okOrigin ? {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Max-Age": "86400",
      "Vary": "Origin",
    } : { "Vary": "Origin" };
    const reply = (status, obj) => new Response(JSON.stringify(obj), { status, headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" } });

    if (!okOrigin) return reply(403, { error: "origin not allowed" });
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    const url = new URL(request.url);
    if (request.method !== "POST" || url.pathname !== "/v1/chat/completions") return reply(404, { error: "not found" });

    const auth = request.headers.get("Authorization") || "";
    if (!/^Bearer nvapi-[A-Za-z0-9_\-]{20,}$/.test(auth)) return reply(401, { error: "missing or malformed key" });

    const text = await request.text();
    if (text.length > MAX_BODY) return reply(413, { error: "request too large" });
    let body;
    try { body = JSON.parse(text); } catch (e) { return reply(400, { error: "invalid json" }); }
    if (!ALLOWED_MODELS.includes(body.model)) return reply(400, { error: "model not allowed" });
    body.stream = false;

    const upstream = await fetch(UPSTREAM, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json", "Authorization": auth },
      body: JSON.stringify(body),
    });
    return new Response(upstream.body, {
      status: upstream.status,
      headers: { ...cors, "Content-Type": upstream.headers.get("Content-Type") || "application/json", "Cache-Control": "no-store" },
    });
  },
};
