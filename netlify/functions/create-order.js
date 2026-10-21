const crypto = require("crypto");
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
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      console.error("Variables Supabase manquantes.");
      return respond(500, {
        error: "Configuration serveur incomplète.",
      });
    }

    const data = JSON.parse(event.body || "{}");

    const required = [
      "customer_name",
      "phone_whatsapp",
      "facebook_url",
      "city",
      "payment_method",
    ];

    for (const field of required) {
      if (
        typeof data[field] !== "string" ||
        !data[field].trim()
      ) {
        return respond(400, {
          error: `Champ obligatoire manquant : ${field}`,
        });
      }
    }

    if (
      !Array.isArray(data.items) ||
      data.items.length === 0 ||
      data.items.length > 30
    ) {
      return respond(400, {
        error: "Ajoute au moins un produit (30 maximum).",
      });
    }

    const items = data.items.map((item) => {
      const quantity = Number(item.quantity);
      const price = Number(item.price_eur);

      if (
        typeof item.product_url !== "string" ||
        !/^https?:\/\//i.test(item.product_url) ||
        typeof item.category !== "string" ||
        !item.category.trim() ||
        !Number.isInteger(quantity) ||
        quantity < 1 ||
        quantity > 100 ||
        !Number.isFinite(price) ||
        price < 0 ||
        price > 100000
      ) {
        throw new Error("Un produit contient des informations invalides.");
      }

      return {
        product_url: item.product_url.trim(),
        photo_path:
          typeof item.photo_path === "string"
            ? item.photo_path
            : null,
        category: item.category.trim().slice(0, 100),
        quantity,
        size_model:
          typeof item.size_model === "string"
            ? item.size_model.slice(0, 200)
            : null,
        price_eur: price,
        comment:
          typeof item.comment === "string"
            ? item.comment.slice(0, 1000)
            : null,
      };
    });

    const productsTotal = items.reduce(
      (sum, item) => sum + item.price_eur * item.quantity,
      0
    );

    const estimatedTotal = Math.round(
      (
        productsTotal * 4900 +
        items.reduce((sum, item) => sum + item.quantity, 0) *
          5 * 4900 +
        Math.max(
          productsTotal +
            items.reduce((sum, item) => sum + item.quantity, 0) * 5,
          20
        ) *
          0.15 *
          4900 +
        25000
      )
    );

    const orderPayload = {
      tracking_token: crypto.randomUUID(),
      customer_name: data.customer_name.trim().slice(0, 150),
      phone_whatsapp: data.phone_whatsapp.trim().slice(0, 50),
      facebook_url: data.facebook_url.trim().slice(0, 500),
      city: data.city.trim().slice(0, 100),
      payment_method: data.payment_method.trim().slice(0, 100),
      customer_comment:
        typeof data.customer_comment === "string"
          ? data.customer_comment.slice(0, 2000)
          : null,
      products_total_eur: Number(productsTotal.toFixed(2)),
      estimated_total_ariary: estimatedTotal,
      status: "received",
    };

    const baseUrl = supabaseUrl.replace(/\/+$/, "");
    const apiHeaders = {
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    };

    const orderResponse = await fetch(
      `${baseUrl}/rest/v1/orders`,
      {
        method: "POST",
        headers: apiHeaders,
        body: JSON.stringify(orderPayload),
      }
    );

    const orderResult = await orderResponse.json();

    if (!orderResponse.ok || !orderResult[0]?.id) {
      console.error("Erreur création commande:", orderResult);
      return respond(502, {
        error: "Impossible d'enregistrer la commande.",
      });
    }

    const order = orderResult[0];

    const itemResponse = await fetch(
      `${baseUrl}/rest/v1/order_items`,
      {
        method: "POST",
        headers: apiHeaders,
        body: JSON.stringify(
          items.map((item) => ({
            ...item,
            order_id: order.id,
          }))
        ),
      }
    );

    if (!itemResponse.ok) {
      console.error(
        "Erreur enregistrement produits:",
        await itemResponse.text()
      );

      await fetch(
        `${baseUrl}/rest/v1/orders?id=eq.${order.id}`,
        {
          method: "DELETE",
          headers: apiHeaders,
        }
      );

      return respond(502, {
        error: "Les produits n'ont pas pu être enregistrés.",
      });
    }

    return respond(201, {
      ok: true,
      message: "Commande enregistrée.",
      order_number: order.order_number,
      tracking_token: order.tracking_token,
      estimated_total_ariary: estimatedTotal,
    });
  } catch (error) {
    console.error("Erreur traitement commande:", error.message);

    return respond(400, {
      error: "Vérifie les informations de ta commande.",
    });
  }
};
