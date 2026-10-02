"use strict";

const { createHmac } = require("node:crypto");
const { getSupabase } = require("./supabase");

function clientKey(event) {
  const ip = String(
    event.headers?.["x-nf-client-connection-ip"] || "unknown"
  )
    .split(",")[0]
    .trim();
  return createHmac("sha256", process.env.SESSION_SECRET || "").update(`login-ip:${ip}`).digest("hex");
}

async function consumeLoginAttempt(event) {
  const { data, error } = await getSupabase().rpc("consume_admin_login_attempt", { p_client_key: clientKey(event) });
  if (error) throw error;
  return Number(data) <= 5;
}

async function clearLoginAttempts(event) {
  const { error } = await getSupabase().rpc("clear_admin_login_attempts", { p_client_key: clientKey(event) });
  if (error) throw error;
}

module.exports = { clearLoginAttempts, clientKey, consumeLoginAttempt };
