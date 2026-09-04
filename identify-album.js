// Netlify Function: identify-album
// Recibe una imagen (archivo subido en base64, o una URL de portada ya
// cargada) y le pide a Gemini que identifique el disco: título, artista,
// año y la lista completa de canciones. La clave de Gemini vive acá,
// del lado del servidor (variable de entorno GEMINI_API_KEY configurada
// en Netlify → Site settings → Environment variables), y nunca se manda
// al navegador.

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Método no permitido." }) };
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: "Falta configurar GEMINI_API_KEY en las variables de entorno de Netlify.",
      }),
    };
  }

  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch (err) {
    return { statusCode: 400, body: JSON.stringify({ error: "JSON inválido." }) };
  }

  let base64Data = payload.imageBase64 || null;
  let mimeType = payload.imageMimeType || "image/jpeg";

  // Si en vez de un archivo nos pasan la URL de una portada ya subida,
  // la descargamos acá (del lado del servidor no hay problema de CORS)
  // y la convertimos a base64 para mandarla a Gemini.
  if (!base64Data && payload.imageUrl) {
    try {
      const imgRes = await fetch(payload.imageUrl);
      if (!imgRes.ok) throw new Error("descarga no OK");
      const arrayBuffer = await imgRes.arrayBuffer();
      base64Data = Buffer.from(arrayBuffer).toString("base64");
      mimeType = imgRes.headers.get("content-type") || mimeType;
    } catch (err) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "No se pudo descargar la imagen de portada." }),
      };
    }
  }

  if (!base64Data) {
    return { statusCode: 400, body: JSON.stringify({ error: "Falta la imagen a analizar." }) };
  }

  const prompt = `Identificá este álbum de vinilo a partir de la portada. Respondé ÚNICAMENTE con un objeto JSON, sin texto adicional, sin markdown y sin explicaciones, con esta forma exacta:
{"title": string, "artist": string, "year": number o null, "tracklist": [string, ...]}
El campo "tracklist" debe ser la lista completa y real de canciones de esa edición del álbum, en orden, con los títulos oficiales exactos, en el idioma original de cada tema. Si no podés identificar el álbum con confianza, respondé exactamente {"title": null, "artist": null, "year": null, "tracklist": []}.`;

  try {
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [{ text: prompt }, { inline_data: { mime_type: mimeType, data: base64Data } }],
            },
          ],
          generationConfig: { temperature: 0.2 },
        }),
      }
    );

    const geminiJson = await geminiRes.json();

    if (!geminiRes.ok) {
      return {
        statusCode: 502,
        body: JSON.stringify({
          error: (geminiJson.error && geminiJson.error.message) || "Error consultando Gemini.",
        }),
      };
    }

    const text =
      geminiJson.candidates &&
      geminiJson.candidates[0] &&
      geminiJson.candidates[0].content &&
      geminiJson.candidates[0].content.parts &&
      geminiJson.candidates[0].content.parts[0] &&
      geminiJson.candidates[0].content.parts[0].text;

    if (!text) {
      return {
        statusCode: 502,
        body: JSON.stringify({ error: "Gemini no devolvió una respuesta utilizable." }),
      };
    }

    const cleaned = text.replace(/```json/gi, "").replace(/```/g, "").trim();

    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch (err) {
      return {
        statusCode: 502,
        body: JSON.stringify({ error: "No se pudo interpretar la respuesta de la IA." }),
      };
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: parsed.title || null,
        artist: parsed.artist || null,
        year: parsed.year || null,
        tracklist: Array.isArray(parsed.tracklist) ? parsed.tracklist.filter(Boolean) : [],
      }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Error interno al consultar la IA." }),
    };
  }
};
