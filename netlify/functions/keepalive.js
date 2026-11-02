"use strict";

/**
 * Función programada (ver `[functions.keepalive]` en netlify.toml).
 *
 * Supabase pausa los proyectos del plan gratuito tras 7 días sin actividad; cuando eso
 * ocurre, el host deja de resolver por DNS y todo el catálogo responde con error. Una
 * consulta mínima diaria mantiene el proyecto activo. No modifica datos.
 */
const { getSupabase } = require("./_lib/supabase");

async function handler() {
  try {
    const { error } = await getSupabase().from("albums").select("id", { head: true, count: "estimated" }).limit(1);
    if (error) throw error;
    console.log("Keepalive de Supabase correcto");
    return { statusCode: 200 };
  } catch (error) {
    console.error("Keepalive de Supabase falló", { name: error?.name, message: error?.message });
    return { statusCode: 503 };
  }
}

module.exports = { handler };
