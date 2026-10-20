
const crypto = require("crypto");

exports.handler = async (event) => {
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "https://eshop-mada-france.netlify.app",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Cache-Control": "no-store",
  };

  const respond = (statusCode, data, extra = {}) => ({
    statusCode,
    headers: { ...headers, ...extra },
    body: JSON.stringify(data),
  });

  if (event.httpMethod === "OPTIONS") {
    return respond(204, {});
  }

  if (event.httpMethod !== "POST") {
    return respond(405, { error: "Méthode non autorisée." });
  }

  const password = process.env.ADMIN_PASSWORD;
  const secret = process.env.ADMIN_SESSION_SECRET;

  if (!password || !secret) {
    return respond(500, { error: "Configuration serveur incomplète." });
  }

  try {
    const body = JSON.parse(event.body || "{}");

    if (
      typeof body.password !== "string" ||
      body.password.length > 256
    ) {
      return respond(400, { error: "Requête invalide." });
    }

    const supplied = crypto
      .createHash("sha256")
      .update(body.password)
      .digest();

    const expected = crypto
      .createHash("sha256")
      .update(password)
      .digest();

    if (!crypto.timingSafeEqual(supplied, expected)) {
      return respond(401, { error: "Mot de passe incorrect." });
    }

    const expires = Math.floor(Date.now() / 1000) + 8 * 60 * 60;
    const payload = Buffer.from(
      JSON.stringify({ admin: true, expires })
    ).toString("base64url");

    const signature = crypto
      .createHmac("sha256", secret)
      .update(payload)
      .digest("base64url");

    return respond(
      200,
      { ok: true },
      {
        "Set-Cookie":
          `admin_session=${payload}.${signature}; HttpOnly; Secure; SameSite=Strict; Path=/.netlify/functions/; Max-Age=28800`,
      }
    );
  } catch {
    return respond(400, { error: "Requête invalide." });
  }
};
