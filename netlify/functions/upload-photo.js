
exports.handler = async (event) => {
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "https://eshop-mada-france.netlify.app",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };

  const respond = (statusCode, data) => ({
    statusCode,
    headers,
    body: JSON.stringify(data),
  });

  if (event.httpMethod === "OPTIONS") {
    return respond(200, { ok: true });
  }

  if (event.httpMethod !== "POST") {
    return respond(405, { error: "Méthode non autorisée." });
  }

  try {
    const url = process.env.SUPABASE_URL?.replace(/\/+$/, "");
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !key) {
      return respond(500, { error: "Configuration serveur incomplète." });
    }

    const data = JSON.parse(event.body || "{}");
    const allowedTypes = {
      "image/jpeg": "jpg",
      "image/png": "png",
      "image/webp": "webp",
    };

    if (!allowedTypes[data.content_type] ||
        typeof data.image_base64 !== "string") {
      return respond(400, { error: "Image invalide." });
    }

    const image = Buffer.from(data.image_base64, "base64");

    if (!image.length || image.length > 3 * 1024 * 1024) {
      return respond(400, {
        error: "La photo doit faire 3 Mo maximum après compression.",
      });
    }

    const path = `${crypto.randomUUID()}.${allowedTypes[data.content_type]}`;

    const upload = await fetch(
      `${url}/storage/v1/object/product-photos/${path}`,
      {
        method: "POST",
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
          "Content-Type": data.content_type,
          "x-upsert": "false",
        },
        body: image,
      }
    );

    if (!upload.ok) {
      console.error("Échec stockage photo:", await upload.text());
      return respond(502, { error: "Impossible d'enregistrer la photo." });
    }

    return respond(200, { ok: true, photo_path: path });
  } catch (error) {
    console.error("Erreur photo:", error.message);
    return respond(400, { error: "Impossible de traiter cette photo." });
  }
};
