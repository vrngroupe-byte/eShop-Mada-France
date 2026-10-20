
const crypto = require("crypto");

exports.handler = async (event) => {
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "https://eshop-mada-france.netlify.app",
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Cache-Control": "no-store",
  };

  const respond = (statusCode, data) => ({
    statusCode,
    headers,
    body: JSON.stringify(data),
  });

  if (event.httpMethod === "OPTIONS") return respond(204, {});
  if (event.httpMethod !== "GET") {
    return respond(405, { error: "Méthode non autorisée." });
  }

  try {
    const secret = process.env.ADMIN_SESSION_SECRET;
    const url = process.env.SUPABASE_URL?.replace(/\/+$/, "");
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!secret || !url || !key) {
      return respond(500, { error: "Configuration serveur incomplète." });
    }

    const cookieHeader =
      event.headers.cookie || event.headers.Cookie || "";

    const cookie = cookieHeader
      .split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith("admin_session="));

    if (!cookie) return respond(401, { error: "Connexion requise." });

    const token = decodeURIComponent(cookie.slice("admin_session=".length));
    const parts = token.split(".");
    if (parts.length !== 2) {
      return respond(401, { error: "Session invalide." });
    }

    const [payload, signature] = parts;
    const expected = crypto
      .createHmac("sha256", secret)
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

    const supabaseHeaders = {
      apikey: key,
      Authorization: `Bearer ${key}`,
    };

    const ordersResponse = await fetch(
      `${url}/rest/v1/orders?select=*&order=created_at.desc`,
      { headers: supabaseHeaders }
    );

    if (!ordersResponse.ok) {
      console.error("Lecture orders:", await ordersResponse.text());
      return respond(502, { error: "Impossible de lire les commandes." });
    }

    const orders = await ordersResponse.json();

    const itemsResponse = await fetch(
      `${url}/rest/v1/order_items?select=*`,
      { headers: supabaseHeaders }
    );

    if (!itemsResponse.ok) {
      console.error("Lecture order_items:", await itemsResponse.text());
      return respond(502, { error: "Impossible de lire les articles." });
    }

    const items = await itemsResponse.json();

    const result = orders.map((order) => ({
      ...order,
      items: items.filter((item) => item.order_id === order.id),
    }));

    return respond(200, { ok: true, orders: result });
  } catch (error) {
    console.error("Erreur admin-orders:", error.message);
    return respond(500, { error: "Erreur interne du serveur." });
  }
};
