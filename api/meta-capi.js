const crypto = require("crypto");

const GRAPH_API_VERSION = "v20.0";

function sha256(value) {
  if (!value) return null;
  return crypto
    .createHash("sha256")
    .update(value.trim().toLowerCase())
    .digest("hex");
}

function normalizePhone(phone) {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) return "1" + digits;
  return digits;
}

const EVENT_MAP = {
  schedule: "Schedule",
  show_up: "ViewContent",
  qualified: "CompleteRegistration",
  purchase: "Purchase",
  page_view: "PageView",
  lead: "Lead",
};

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "POST only" });
  }

  const secret = req.query.secret || req.headers["x-webhook-secret"];
  if (!secret || secret !== process.env.WEBHOOK_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const {
    event_name,
    email,
    phone,
    first_name,
    last_name,
    value,
    currency,
    event_source_url,
    test_event_code,
    pixel_id: bodyPixelId,
    access_token: bodyAccessToken,
  } = req.body;

  if (!event_name) {
    return res.status(400).json({ error: "event_name is required" });
  }

  const metaEventName = EVENT_MAP[event_name.toLowerCase()] || event_name;

  const userData = {};
  if (email) userData.em = [sha256(email)];
  if (phone) userData.ph = [sha256(normalizePhone(phone))];
  if (first_name) userData.fn = [sha256(first_name)];
  if (last_name) userData.ln = [sha256(last_name)];

  const eventData = {
    event_name: metaEventName,
    event_time: Math.floor(Date.now() / 1000),
    action_source: "website",
    user_data: userData,
  };

  if (event_source_url) {
    eventData.event_source_url = event_source_url;
  }

  if (value) {
    eventData.custom_data = {
      value: parseFloat(value),
      currency: currency || "CAD",
    };
  }

  const pixelId = bodyPixelId || process.env.PIXEL_ID;
  const accessToken = bodyAccessToken || process.env.CAPI_ACCESS_TOKEN;

  if (!pixelId || !accessToken) {
    return res.status(500).json({ error: "Missing pixel_id or access_token" });
  }

  const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${pixelId}/events`;

  const payload = {
    data: [eventData],
    access_token: accessToken,
  };

  if (test_event_code) {
    payload.test_event_code = test_event_code;
  }

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const result = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({ error: result });
    }

    return res.status(200).json({
      success: true,
      event: metaEventName,
      meta_response: result,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
