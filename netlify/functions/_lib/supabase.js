"use strict";

const { createClient } = require("@supabase/supabase-js");

let client;
const PROJECT_HOST = "ujswessaedegncxeoeio.supabase.co";

function validateSupabaseProjectUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("SUPABASE_URL no es una URL válida.");
  }
  if (url.protocol !== "https:" || url.hostname !== PROJECT_HOST || url.username || url.password || url.port ||
    url.pathname !== "/" || url.search || url.hash) {
    throw new Error("SUPABASE_URL no corresponde al proyecto Supabase autorizado.");
  }
  return url.href;
}

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error("Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY.");
  }
  const verifiedUrl = validateSupabaseProjectUrl(url);
  if (!client) {
    client = createClient(verifiedUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { "X-Client-Info": "vinilos-netlify-functions" } },
    });
  }
  return client;
}

function storageHost() {
  try {
    return new URL(process.env.SUPABASE_URL || "").hostname;
  } catch {
    return "";
  }
}

module.exports = { getSupabase, storageHost, validateSupabaseProjectUrl };
