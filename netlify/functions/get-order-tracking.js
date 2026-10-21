
exports.handler = async (event) => {
  const headers = {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "https://eshop-mada-france.netlify.app",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  const respond = (statusCode, data) => ({
    statusCode,
    headers,
    body: JSON.stringify(data),
  });

  if (event.httpMethod === "OPTIONS") {
    return respond(204, {});
  }

  if (event.httpMethod !== "GET") {
    return respond(405, { error: "Méthode non autorisée." });
  }

  try {
    const url = process.env.SUPABASE_URL?.replace(/\/+$/, "");
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const token = event.queryStringParameters?.token;

    if (!url || !key) {
      return respond(500, { error: "Configuration serveur incomplète." });
    }

    if (!token || !/^[0-9a-f-]{36}$/i.test(token)) {
      return respond(400, { error: "Lien de suivi invalide." });
    }

    const result = await fetch(
      `${url}/rest/v1/orders?tracking_token=eq.${encodeURIComponent(token)}&select=order_number,status,admin_comment,payment_status,payment_comment,estimated_total_ariary,created_at`,
      {
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
        },
      }
    );

    if (!result.ok) {
      console.error("Erreur suivi commande :", await result.text());
      return respond(502, { error: "Impossible de consulter la commande." });
    }

    const orders = await result.json();

    if (!orders.length) {
      return respond(404, { error: "Commande introuvable." });
    }

    return respond(200, { ok: true, order: orders[0] });
  } catch (error) {
    console.error("Erreur get-order-tracking :", error.message);
    return respond(500, { error: "Erreur interne du serveur." });
  }
};
