"use strict";

const {
  COOKIE_NAME,
  SESSION_SECONDS,
  createSessionToken,
  parseCookies,
  sessionTokenHash,
  verifySessionToken,
} = require("./security");
const { getSupabase } = require("./supabase");

function tokenFromEvent(event) {
  const cookies = parseCookies(event.headers?.cookie || event.headers?.Cookie || "");
  return cookies[COOKIE_NAME] || "";
}

async function createStoredSession() {
  const token = createSessionToken(process.env.SESSION_SECRET);
  const expiresAt = new Date(Date.now() + SESSION_SECONDS * 1000).toISOString();
  await getSupabase().from("admin_sessions").delete().lt("expires_at", new Date().toISOString());
  const { error } = await getSupabase().from("admin_sessions").insert({
    token_hash: sessionTokenHash(token),
    expires_at: expiresAt,
  });
  if (error) throw error;
  return token;
}

async function hasStoredSession(event) {
  const token = tokenFromEvent(event);
  if (!verifySessionToken(token, process.env.SESSION_SECRET)) return false;
  const { data, error } = await getSupabase()
    .from("admin_sessions")
    .select("token_hash")
    .eq("token_hash", sessionTokenHash(token))
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

async function revokeStoredSession(event) {
  const token = tokenFromEvent(event);
  if (!token) return;
  const { error } = await getSupabase().from("admin_sessions").delete().eq("token_hash", sessionTokenHash(token));
  if (error) throw error;
}

module.exports = { createStoredSession, hasStoredSession, revokeStoredSession, tokenFromEvent };
