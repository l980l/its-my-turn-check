import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const url = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const tokenSecret = Deno.env.get("RUN_TOKEN_SECRET")!;
const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

const allowedOrigins = new Set([
  "https://l980l.github.io",
  "http://localhost:3000",
  "http://localhost:5173",
]);

function headers(origin: string | null) {
  return {
    "Access-Control-Allow-Origin": allowedOrigins.has(origin || "") ? origin! : "https://l980l.github.io",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
    "Vary": "Origin",
  };
}
function reply(origin: string | null, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: headers(origin) });
}
function bytes(text: string) { return new TextEncoder().encode(text); }
function base64(bytes: ArrayBuffer) {
  return btoa(String.fromCharCode(...new Uint8Array(bytes))).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}
async function sign(value: string) {
  const key = await crypto.subtle.importKey("raw", bytes(tokenSecret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return base64(await crypto.subtle.sign("HMAC", key, bytes(value)));
}
async function tokenFor(id: string, createdAt: string) {
  const payload = `${id}.${Math.floor(new Date(createdAt).getTime() / 1000)}`;
  return `${payload}.${await sign(payload)}`;
}
const pieces = new Set(["pawn", "knight", "bishop", "rook", "queen", "king"]);
// Clients older than the piece column send nothing; store null instead of rejecting.
function pieceOf(value: unknown) { return typeof value === "string" && pieces.has(value) ? value : null; }
function validString(value: unknown, min: number, max: number) {
  return typeof value === "string" && value.trim().length >= min && value.trim().length <= max;
}

Deno.serve(async (request) => {
  const origin = request.headers.get("origin");
  if (request.method === "OPTIONS") return new Response("ok", { headers: headers(origin) });
  if (request.method !== "POST" || !allowedOrigins.has(origin || "")) return reply(origin, { error: "Forbidden" }, 403);
  if (!tokenSecret) return reply(origin, { error: "Server token secret is not configured" }, 500);

  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return reply(origin, { error: "Invalid request" }, 400); }

  if (body.action === "start") {
    const { data: run, error } = await admin
      .from("game_runs")
      .insert({ created_at: new Date().toISOString(), mode: body.mode === "coop" ? "coop" : "solo" })
      .select("id,created_at")
      .single();
    if (error || !run) return reply(origin, { error: "Could not start a verified run" }, 500);
    return reply(origin, { runId: run.id, runToken: await tokenFor(run.id, run.created_at) });
  }

  if (body.action !== "submit") return reply(origin, { error: "Unknown action" }, 400);
  const { runId, runToken, score, name, names, wave = 0, message = "", piece, pieces: teamPieces } = body;
  if (typeof runId !== "string" || typeof runToken !== "string" || !Number.isInteger(score) || (score as number) <= 0) return reply(origin, { error: "Invalid score submission" }, 400);

  const { data: run, error: runError } = await admin.from("game_runs").select("id,created_at,claimed_at,expires_at,mode").eq("id", runId).maybeSingle();
  // Co-op runs carry both players' names and the wave; solo runs a name and message.
  const coop = run?.mode === "coop";
  if (coop ? !(Array.isArray(names) && names.length === 2 && names.every((n) => validString(n, 1, 18)) && Number.isInteger(wave) && (wave as number) >= 0)
    : !(validString(name, 1, 18) && validString(String(message), 0, 120))) return reply(origin, { error: "Invalid name or message" }, 400);
  if (runError || !run) return reply(origin, { error: "This run was not verified" }, 403);
  if (run.claimed_at || new Date(run.expires_at).getTime() < Date.now()) return reply(origin, { error: "This run has already expired" }, 403);
  if (runToken !== await tokenFor(run.id, run.created_at)) return reply(origin, { error: "Invalid run token" }, 403);

  const seconds = Math.max(0, (Date.now() - new Date(run.created_at).getTime()) / 1000);
  // A fast run advances an enemy turn every 0.45s, and boss/chain scoring can spike
  // sharply. Keep the check high enough for legitimate quick runs while still making
  // an instant forged million-point post impossible.
  const maxScore = Math.max(5000, Math.floor(seconds * 1500));
  if ((score as number) > maxScore) return reply(origin, { error: "Score exceeds this run's verified time limit" }, 422);

  const { error: insertError } = coop
    ? await admin.from("coop_leaderboard").insert({ name1: (names as string[])[0].trim(), name2: (names as string[])[1].trim(), piece1: pieceOf((teamPieces as unknown[])?.[0]), piece2: pieceOf((teamPieces as unknown[])?.[1]), score, wave })
    : await admin.from("leaderboard").insert({ name: (name as string).trim(), piece: pieceOf(piece), score, message: String(message).trim() });
  if (insertError) return reply(origin, { error: "Could not save score" }, 500);
  await admin.from("game_runs").update({ claimed_at: new Date().toISOString(), submitted_score: score }).eq("id", run.id);
  return reply(origin, { ok: true });
});
