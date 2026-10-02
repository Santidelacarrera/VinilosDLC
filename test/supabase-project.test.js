"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { validateSupabaseProjectUrl } = require("../netlify/functions/_lib/supabase");

test("acepta únicamente el proyecto Supabase autorizado y sin credenciales en la URL", () => {
  assert.equal(validateSupabaseProjectUrl("https://ujswessaedegncxeoeio.supabase.co"),
    "https://ujswessaedegncxeoeio.supabase.co/");
  assert.throws(() => validateSupabaseProjectUrl("https://otro-proyecto.supabase.co"), /proyecto Supabase autorizado/);
  assert.throws(() => validateSupabaseProjectUrl("http://ujswessaedegncxeoeio.supabase.co"), /proyecto Supabase autorizado/);
  assert.throws(() => validateSupabaseProjectUrl("https://ujswessaedegncxeoeio.supabase.co.evil.example"), /proyecto Supabase autorizado/);
});
