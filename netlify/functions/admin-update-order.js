
const crypto = require("crypto");

exports.handler = async (event) => {
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "https://eshop-mada-france.netlify.app",
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Cache-Control": "no-store",
  };

  const respond = (statusCode, data) => ({
    statusCode,
    headers,
    body: JSON.stringify(data),
  });

  if (event.httpMethod === "OPTIONS") return respond(204, {});
  if (event.httpMethod !== "POST") {
    return respond(405, { error: "Méthode non autorisée." });
  }

  try {
    const secret = process.env.ADMIN_SESSION_SECRET;
    const url = process.env.SUPABASE_URL?.replace(/\/+$/, "");
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!secret || !url || !key) {
      return respond(500, { error: "Configuration serveur incomplète." });
    }

    const cookieHeader = event.headers.cookie || event.headers.Cookie || "";
    const cookie = cookieHeader.split(";")
      .map(part => part.trim())
      .find(part => part.startsWith("admin_session="));

    if (!cookie) return respond(401, { error: "Connexion requise." });

    const token = decodeURIComponent(cookie.slice("admin_session=".length));
    const parts = token.split(".");
    if (parts.length !== 2) {
      return respond(401, { error: "Session invalide." });
    }

    const [payload, signature] = parts;
    const expected = crypto.createHmac("sha256", secret)
      .update(payload)
      .digest("base64url");

    const a = Buffer.from(signature);
    const b = Buffer.from(expected);

    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      return respond(401, { error: "Session invalide." });
    }

    const session = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8")
    );

    if (session.admin !== true || session.expires < Date.now() / 1000) {
      return respond(401, { error: "Session expirée." });
    }

    let body;
    try {
      body = JSON.parse(event.body || "{}");
    } catch {
      return respond(400, { error: "Données JSON invalides." });
    }

    const { order_id, action, comment = "" } = body;

    if (!order_id || !/^[0-9a-f-]{36}$/i.test(order_id)) {
      return respond(400, { error: "Identifiant de commande invalide." });
    }

    if (typeof comment !== "string" || comment.length > 2000) {
      return respond(400, { error: "Commentaire invalide (2000 caractères maximum)." });
    }

    const updates = {
      updated_at: new Date().toISOString(),
    };

    switch (action) {
      case "validate_item":
        updates.status = "awaiting_payment";
        updates.admin_comment = comment.trim();
        break;

      case "refuse_item":
        if (!comment.trim()) {
          return respond(400, { error: "Ajoute un motif de refus." });
        }
        updates.status = "refused";
        updates.admin_comment = comment.trim();
        break;

      case "payment_confirmed":
        updates.payment_status = "confirmed";
        updates.payment_verified_at = new Date().toISOString();
        updates.payment_comment = comment.trim();
        updates.status = "payment_confirmed";
        break;

      case "payment_refused":
        if (!comment.trim()) {
          return respond(400, { error: "Ajoute un motif de refus du paiement." });
        }
        updates.payment_status = "refused";
        updates.payment_comment = comment.trim();
        updates.status = "payment_refused";
        break;

      case "article_ordered":
        updates.status = "ordered";
        break;

      case "shipped":
        updates.status = "shipped";
        break;

      default:
        return respond(400, { error: "Action inconnue." });
    }

    const response = await fetch(
      `${url}/rest/v1/orders?id=eq.${encodeURIComponent(order_id)}`,
      {
        method: "PATCH",
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
          Prefer: "return=representation",
        },
        body: JSON.stringify(updates),
      }
    );

    if (!response.ok) {
      console.error("Mise à jour commande :", await response.text());
      return respond(502, { error: "Impossible de mettre à jour la commande." });
    }

    const updated = await response.json();

    if (!updated.length) {
      return respond(404, { error: "Commande introuvable." });
    }

    return respond(200, { ok: true, order: updated[0] });
  } catch (error) {
    console.error("Erreur admin-update-order:", error.message);
    return respond(500, { error: "Erreur interne du serveur." });
  }
};
