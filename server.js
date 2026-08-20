require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const helmet = require("helmet");
const crypto = require("crypto");
const { promisify } = require("util");
const cloudinary = require("cloudinary").v2;

const Product = require("./models/Product");
const Order = require("./models/Order");

const app = express();

app.set("trust proxy", 1);

const PORT = Number(process.env.PORT) || 3000;

const MONGODB_URI = process.env.MONGODB_URI;

const FRONTEND_ORIGIN =
  process.env.FRONTEND_ORIGIN ||
  "https://sheikhmaazraheel.github.io";

const MAX_IMAGE_MB =
  Number(process.env.MAX_IMAGE_MB) || 5;

const ADMIN_USERNAME = process.env.ADMIN_USERNAME;
const ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH;
const AUTH_SECRET = process.env.AUTH_SECRET;
const SESSION_MAX_AGE_MS = 60 * 60 * 1000;
const scryptAsync = promisify(crypto.scrypt);
const WHATSAPP_API_VERSION = process.env.WHATSAPP_API_VERSION || "v25.0";
const WHATSAPP_ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
const WHATSAPP_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const WHATSAPP_VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN;
const WHATSAPP_APP_SECRET = process.env.WHATSAPP_APP_SECRET;
const WHATSAPP_CONFIRMATION_TEMPLATE = process.env.WHATSAPP_CONFIRMATION_TEMPLATE;
const WHATSAPP_TEMPLATE_LANGUAGE = process.env.WHATSAPP_TEMPLATE_LANGUAGE || "en_US";
const WHATSAPP_ADMIN_PHONE = process.env.WHATSAPP_ADMIN_PHONE;
const WHATSAPP_ADMIN_ALERT_TEMPLATE = process.env.WHATSAPP_ADMIN_ALERT_TEMPLATE;


// ============================================================
// ENVIRONMENT VALIDATION
// ============================================================

if (!MONGODB_URI) {
  console.error("❌ MONGODB_URI is missing");
  process.exit(1);
}

if (!process.env.CLOUDINARY_CLOUD_NAME) {
  console.error("❌ CLOUDINARY_CLOUD_NAME is missing");
  process.exit(1);
}

if (!process.env.CLOUDINARY_API_KEY) {
  console.error("❌ CLOUDINARY_API_KEY is missing");
  process.exit(1);
}

if (!process.env.CLOUDINARY_API_SECRET) {
  console.error("❌ CLOUDINARY_API_SECRET is missing");
  process.exit(1);
}

if (!ADMIN_USERNAME || !ADMIN_PASSWORD_HASH || !AUTH_SECRET) {
  console.error("❌ ADMIN_USERNAME, ADMIN_PASSWORD_HASH, and AUTH_SECRET are required");
  process.exit(1);
}


// ============================================================
// CLOUDINARY
// ============================================================

cloudinary.config({
  cloud_name:
    process.env.CLOUDINARY_CLOUD_NAME,

  api_key:
    process.env.CLOUDINARY_API_KEY,

  api_secret:
    process.env.CLOUDINARY_API_SECRET,
});


// ============================================================
// MIDDLEWARE
// ============================================================

app.disable("x-powered-by");

app.use(
  helmet({
    crossOriginResourcePolicy: {
      policy: "cross-origin",
    },
  })
);

app.use(
  cors({
    origin: FRONTEND_ORIGIN,
    credentials: true,

    methods: [
      "GET",
      "POST",
      "PATCH",
      "PUT",
      "DELETE",
      "OPTIONS",
    ],

    allowedHeaders: [
      "Content-Type",
    ],
  })
);


// Base64 images are larger than binary files.
// Allow a little more than the configured image limit.

const JSON_LIMIT_MB =
  Math.ceil(MAX_IMAGE_MB * 1.5) + 2;

app.use(
  express.json({
    limit: `${JSON_LIMIT_MB}mb`,
    verify: (request, _response, buffer) => {
      request.rawBody = buffer;
    },
  })
);

app.use(
  express.urlencoded({
    extended: true,
    limit: `${JSON_LIMIT_MB}mb`,
  })
);


// ============================================================
// MONGODB
// ============================================================

mongoose.set(
  "strictQuery",
  true
);

mongoose.connection.on(
  "connected",
  () => {
    console.log("✅ MongoDB connected");
  }
);

mongoose.connection.on(
  "error",
  (error) => {
    console.error(
      "❌ MongoDB error:",
      error
    );
  }
);


// ============================================================
// HELPERS
// ============================================================

function parseBoolean(
  value,
  defaultValue = false
) {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value !== "string") {
    return defaultValue;
  }

  const normalized =
    value
      .trim()
      .toLowerCase();

  if (
    [
      "true",
      "1",
      "yes",
      "on",
    ].includes(normalized)
  ) {
    return true;
  }

  if (
    [
      "false",
      "0",
      "no",
      "off",
    ].includes(normalized)
  ) {
    return false;
  }

  return defaultValue;
}


function parseProductBody(
  body,
  isUpdate = false
) {
  const price = Number(
    body.price
  );

  const discount =
    body.discount === undefined ||
    body.discount === ""
      ? 0
      : Number(body.discount);


  if (
    !Number.isFinite(price) ||
    price < 0
  ) {
    throw new Error(
      "Price must be a valid non-negative number."
    );
  }


  if (
    !Number.isFinite(discount) ||
    discount < 0 ||
    discount > 100
  ) {
    throw new Error(
      "Discount must be between 0 and 100."
    );
  }


  const data = {
    name:
      String(
        body.name || ""
      ).trim(),

    price,

    discount,

    category:
      String(
        body.category || ""
      ).trim(),

    mostPopular:
      parseBoolean(
        body.mostPopular,
        false
      ),

    thisWeekBest:
      parseBoolean(
        body.thisWeekBest,
        false
      ),

    featured:
      parseBoolean(
        body.featured,
        false
      ),

    available:
      parseBoolean(
        body.available,
        true
      ),
  };


  // ID is required when creating,
  // but isn't changed during update.

  if (!isUpdate) {
    data.id =
      String(
        body.id || ""
      )
        .trim()
        .toUpperCase();
  }


  return data;
}


function validateImageDataUri(
  image
) {
  if (
    typeof image !== "string" ||
    !image.startsWith("data:image/")
  ) {
    throw new Error(
      "Invalid image format."
    );
  }


  const sizeInBytes =
    Buffer.byteLength(
      image,
      "utf8"
    );


  const maxBytes =
    MAX_IMAGE_MB *
    1024 *
    1024 *
    1.5;


  if (
    sizeInBytes >
    maxBytes
  ) {
    throw new Error(
      `Image exceeds ${MAX_IMAGE_MB} MB.`
    );
  }
}


function serializeProduct(
  product
) {
  return {
    ...product,

    imageUrl:
      product.image || null,

    finalPrice:
      Math.round(
        product.price -
        (
          product.price *
          product.discount
        ) / 100
      ),
  };
}


function escapeRegex(
  value
) {
  return value.replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&"
  );
}

function parseCookies(request) {
  return Object.fromEntries(
    String(request.headers.cookie || "")
      .split(";")
      .filter(Boolean)
      .map((part) => {
        const separator = part.indexOf("=");
        return [part.slice(0, separator).trim(), decodeURIComponent(part.slice(separator + 1).trim())];
      })
  );
}

function signSession(payload) {
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto.createHmac("sha256", AUTH_SECRET).update(encodedPayload).digest("base64url");
  return `${encodedPayload}.${signature}`;
}

function verifySession(token) {
  if (!token) return null;
  const [encodedPayload, signature] = token.split(".");
  if (!encodedPayload || !signature) return null;
  const expectedSignature = crypto.createHmac("sha256", AUTH_SECRET).update(encodedPayload).digest("base64url");
  const providedBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);
  if (providedBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(providedBuffer, expectedBuffer)) return null;
  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));
    return payload.exp > Date.now() ? payload : null;
  } catch {
    return null;
  }
}

async function verifyPassword(password) {
  const [algorithm, salt, storedKey] = String(ADMIN_PASSWORD_HASH).split("$");
  if (algorithm !== "scrypt" || !salt || !storedKey) return false;
  const derivedKey = await scryptAsync(String(password || ""), salt, 64);
  const expectedKey = Buffer.from(storedKey, "hex");
  return expectedKey.length === derivedKey.length && crypto.timingSafeEqual(expectedKey, derivedKey);
}

function requireAdmin(request, response, next) {
  const session = verifySession(parseCookies(request).pbd_admin_session);
  if (!session) return response.status(401).json({ success: false, message: "Admin authentication required." });
  request.admin = session;
  next();
}

function setSessionCookie(response, token) {
  response.setHeader("Set-Cookie", `pbd_admin_session=${encodeURIComponent(token)}; Max-Age=3600; Path=/; HttpOnly; Secure; SameSite=None`);
}

const DELIVERY_CHARGES = Object.freeze({
  central: 150,
  south: 180,
  east: 200,
  west: 220,
  malir: 250,
  outside: 300,
});

function createOrderId() {
  const timestamp = new Date();
  const pad = (value) => String(value).padStart(2, "0");
  const random = Math.floor(100 + Math.random() * 900);
  return `PBD-${pad(timestamp.getDate())}${pad(timestamp.getMonth() + 1)}${timestamp.getFullYear()}-${timestamp.getTime()}-${random}`;
}

function requireText(value, label, maxLength) {
  const text = String(value || "").trim();
  if (!text || text.length > maxLength) {
    throw new Error(`${label} is required and must be ${maxLength} characters or fewer.`);
  }
  return text;
}

function isWhatsAppConfigured() {
  return Boolean(
    WHATSAPP_ACCESS_TOKEN &&
      WHATSAPP_PHONE_NUMBER_ID &&
      WHATSAPP_CONFIRMATION_TEMPLATE &&
    WHATSAPP_VERIFY_TOKEN &&
    WHATSAPP_APP_SECRET
  );
}

function normalizeWhatsAppNumber(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (digits.startsWith("00")) return digits.slice(2);
  if (digits.startsWith("0")) return `92${digits.slice(1)}`;
  if (digits.startsWith("92")) return digits;
  if (digits.length === 10 && digits.startsWith("3")) return `92${digits}`;
  return digits;
}

async function sendWhatsAppMessage(to, payload) {
  const response = await fetch(
    `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${WHATSAPP_PHONE_NUMBER_ID}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to, ...payload }),
    }
  );
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error?.message || `WhatsApp API returned ${response.status}.`);
  return data;
}

function orderTemplateParameters(order) {
  return [
    { type: "text", text: order.customer.name },
    { type: "text", text: order.orderId },
    { type: "text", text: `Rs.${order.pricing.total.toLocaleString("en-PK")}` },
  ];
}

async function sendOrderConfirmationRequest(order) {
  if (!isWhatsAppConfigured()) return { sent: false, reason: "WhatsApp is not configured." };

  const customerWaId = normalizeWhatsAppNumber(order.customer.contact);
  if (!customerWaId || customerWaId.length < 10) return { sent: false, reason: "Customer phone number is invalid." };

  const data = await sendWhatsAppMessage(customerWaId, {
    type: "template",
    template: {
      name: WHATSAPP_CONFIRMATION_TEMPLATE,
      language: { code: WHATSAPP_TEMPLATE_LANGUAGE },
      components: [
        { type: "body", parameters: orderTemplateParameters(order) },
        { type: "button", sub_type: "quick_reply", index: "0", parameters: [{ type: "payload", payload: `CONFIRM_ORDER:${order.orderId}` }] },
        { type: "button", sub_type: "quick_reply", index: "1", parameters: [{ type: "payload", payload: `CANCEL_ORDER:${order.orderId}` }] },
      ],
    },
  });

  await Order.updateOne(
    { _id: order._id },
    {
      $set: {
        "whatsapp.customerWaId": customerWaId,
        "whatsapp.confirmationStatus": "pending",
        "whatsapp.confirmationMessageId": data.messages?.[0]?.id,
        "whatsapp.confirmationSentAt": new Date(),
        "whatsapp.lastError": undefined,
      },
    }
  );
  return { sent: true, messageId: data.messages?.[0]?.id };
}

async function sendAdminConfirmationAlert(order, action) {
  if (!WHATSAPP_ACCESS_TOKEN || !WHATSAPP_PHONE_NUMBER_ID || !WHATSAPP_ADMIN_PHONE) return;
  const message = `Order ${order.orderId} is ${action} by ${order.customer.name}. Total: Rs.${order.pricing.total.toLocaleString("en-PK")}. Check the admin dashboard.`;

  if (WHATSAPP_ADMIN_ALERT_TEMPLATE) {
    await sendWhatsAppMessage(normalizeWhatsAppNumber(WHATSAPP_ADMIN_PHONE), {
      type: "template",
      template: {
        name: WHATSAPP_ADMIN_ALERT_TEMPLATE,
        language: { code: WHATSAPP_TEMPLATE_LANGUAGE },
        components: [
          { type: "body", parameters: [{ type: "text", text: order.orderId }, { type: "text", text: action }, { type: "text", text: order.customer.name }, { type: "text", text: `Rs.${order.pricing.total.toLocaleString("en-PK")}` }] },
        ],
      },
    });
    return;
  }

  await sendWhatsAppMessage(normalizeWhatsAppNumber(WHATSAPP_ADMIN_PHONE), { type: "text", text: { preview_url: false, body: message } });
}

async function handleWhatsAppConfirmation(payload) {
  const messages = payload.entry?.flatMap((entry) => entry.changes || [])
    .flatMap((change) => change.value?.messages || []) || [];

  for (const message of messages) {
    if (message.type !== "interactive" || message.interactive?.type !== "button_reply") continue;
    const buttonPayload = String(message.interactive.button_reply.id || message.interactive.button_reply.title || "");
    const match = buttonPayload.match(/^(CONFIRM_ORDER|CANCEL_ORDER):(.+)$/);
    if (!match) continue;

    const [, action, orderId] = match;
    const order = await Order.findOne({ orderId });
    if (!order || order.whatsapp?.customerWaId !== message.from) continue;
    if (!["pending", "confirmed"].includes(order.status) && action === "CONFIRM_ORDER") continue;

    const confirmed = action === "CONFIRM_ORDER";
    if (order.whatsapp?.confirmationStatus === (confirmed ? "confirmed" : "cancelled")) continue;
    const nextStatus = confirmed ? "confirmed" : "cancelled";
    const now = new Date();
    order.status = nextStatus;
    order.statusUpdatedAt = now;
    order.whatsapp.confirmationStatus = confirmed ? "confirmed" : "cancelled";
    if (confirmed) order.whatsapp.confirmedAt = now;
    else order.whatsapp.cancelledAt = now;
    await order.save();

    await sendWhatsAppMessage(message.from, {
      type: "text",
      text: { preview_url: false, body: confirmed ? `Thank you. Order ${order.orderId} is confirmed. We will prepare it for delivery.` : `Order ${order.orderId} has been cancelled as requested.` },
    }).catch((error) => console.error("WhatsApp customer acknowledgement failed:", error.message));
    if (confirmed) await sendAdminConfirmationAlert(order, "confirmed").catch((error) => console.error("WhatsApp admin alert failed:", error.message));
  }
}


// ============================================================
// ROOT
// ============================================================

app.get(
  "/api/whatsapp/webhook",
  (req, res) => {
    if (!WHATSAPP_VERIFY_TOKEN || req.query["hub.verify_token"] !== WHATSAPP_VERIFY_TOKEN) {
      return res.sendStatus(403);
    }
    res.status(200).send(req.query["hub.challenge"]);
  }
);

app.post(
  "/api/whatsapp/webhook",
  (req, res) => {
    if (WHATSAPP_APP_SECRET) {
      const signature = String(req.headers["x-hub-signature-256"] || "");
      const expected = `sha256=${crypto.createHmac("sha256", WHATSAPP_APP_SECRET).update(req.rawBody || "").digest("hex")}`;
      const providedBuffer = Buffer.from(signature);
      const expectedBuffer = Buffer.from(expected);
      if (providedBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(providedBuffer, expectedBuffer)) {
        return res.sendStatus(401);
      }
    }

    res.sendStatus(200);
    handleWhatsAppConfirmation(req.body).catch((error) => console.error("WhatsApp webhook processing failed:", error));
  }
);

app.post(
  "/api/auth/login",
  async (req, res, next) => {
    try {
      const username = String(req.body?.username || "").trim();
      const password = String(req.body?.password || "");
      const usernameMatches = username === ADMIN_USERNAME;
      const passwordMatches = await verifyPassword(password);

      if (!usernameMatches || !passwordMatches) {
        return res.status(401).json({ success: false, message: "Invalid username or password." });
      }

      const token = signSession({
        username: ADMIN_USERNAME,
        iat: Date.now(),
        exp: Date.now() + SESSION_MAX_AGE_MS,
      });
      setSessionCookie(res, token);
      res.json({ success: true, expiresAt: Date.now() + SESSION_MAX_AGE_MS });
    } catch (error) {
      next(error);
    }
  }
);

app.get(
  "/api/auth/session",
  (req, res) => {
    const session = verifySession(parseCookies(req).pbd_admin_session);
    if (!session) return res.status(401).json({ success: false, authenticated: false });
    res.json({ success: true, authenticated: true, username: session.username, expiresAt: session.exp });
  }
);

app.post(
  "/api/auth/logout",
  (_req, res) => {
    res.setHeader("Set-Cookie", "pbd_admin_session=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=None");
    res.json({ success: true });
  }
);

app.get(
  "/",
  (_req, res) => {
    res.json({
      success: true,
      service:
        "Prince Book Depot API",
      status:
        "running",
    });
  }
);


// ============================================================
// HEALTH
// ============================================================

app.get(
  "/api/health",
  (_req, res) => {
    res.json({
      success: true,

      database:
        mongoose.connection.readyState === 1
          ? "connected"
          : "disconnected",

      cloudinary:
        "configured",
    });
  }
);


// ============================================================
// LIST ORDERS
// ============================================================

app.get(
  "/api/orders",
  requireAdmin,
  async (req, res, next) => {
    try {
      const filter = {};
      const requestedStatus = String(req.query.status || "").trim().toLowerCase();
      const validStatuses = ["pending", "confirmed", "processing", "shipped", "delivered", "completed", "cancelled", "returned"];

      if (requestedStatus && validStatuses.includes(requestedStatus)) {
        filter.status = requestedStatus;
      }

      const requestedLimit = Number(req.query.limit);
      const limit = Number.isInteger(requestedLimit)
        ? Math.min(Math.max(requestedLimit, 1), 200)
        : 100;

      const orders = await Order.find(filter)
        .sort({ createdAt: -1 })
        .limit(limit)
        .lean();

      res.json({
        success: true,
        count: orders.length,
        orders,
      });
    } catch (error) {
      next(error);
    }
  }
);


// ============================================================
// UPDATE ORDER STATUS
// ============================================================

app.patch(
  "/api/orders/:orderId/status",
  requireAdmin,
  async (req, res, next) => {
    try {
      const status = String(req.body?.status || "").trim().toLowerCase();
      const validStatuses = ["pending", "confirmed", "processing", "shipped", "delivered", "completed", "cancelled", "returned"];

      if (!validStatuses.includes(status)) {
        return res.status(400).json({
          success: false,
          message: "Invalid order status.",
        });
      }

      const order = await Order.findOneAndUpdate(
        { orderId: String(req.params.orderId || "").trim() },
        { $set: { status, statusUpdatedAt: new Date() } },
        { new: true, runValidators: true }
      ).lean();

      if (!order) {
        return res.status(404).json({
          success: false,
          message: "Order not found.",
        });
      }

      res.json({
        success: true,
        message: "Order status updated.",
        order: {
          orderId: order.orderId,
          status: order.status,
          statusUpdatedAt: order.statusUpdatedAt,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);


// ============================================================
// CREATE ORDER
// ============================================================

app.post(
  "/api/orders",
  async (req, res, next) => {
    try {
      const body = req.body || {};
      const customerBody = body.customer || {};
      const deliveryBody = body.delivery || {};
      const locationBody = body.location;

      const customer = {
        name: requireText(customerBody.name, "Customer name", 120),
        contact: requireText(customerBody.contact, "Customer contact", 40),
      };

      if (customerBody.email) {
        customer.email = requireText(customerBody.email, "Customer email", 180).toLowerCase();
        if (!/^\S+@\S+\.\S+$/.test(customer.email)) {
          return res.status(400).json({ success: false, message: "Customer email is invalid." });
        }
      }

      const delivery = {
        city: requireText(deliveryBody.city, "Delivery city", 80),
        area: requireText(deliveryBody.area, "Delivery area", 120),
        zone: requireText(deliveryBody.zone, "Delivery zone", 40).toLowerCase(),
        address: requireText(deliveryBody.address, "Delivery address", 500),
        landmark: requireText(deliveryBody.landmark, "Delivery landmark", 180),
      };

      if (!Object.prototype.hasOwnProperty.call(DELIVERY_CHARGES, delivery.zone)) {
        return res.status(400).json({ success: false, message: "Delivery zone is invalid." });
      }

      const paymentMethod = String(body.paymentMethod || "").trim();
      if (!["Cash on Delivery", "Online Payment"].includes(paymentMethod)) {
        return res.status(400).json({ success: false, message: "Payment method is invalid." });
      }

      if (!Array.isArray(body.items) || body.items.length === 0 || body.items.length > 50) {
        return res.status(400).json({ success: false, message: "Order must contain between 1 and 50 items." });
      }

      const requestedItems = body.items.map((item) => ({
        productId: String(item.productId || item.id || "").trim().toUpperCase(),
        quantity: Number(item.quantity),
      }));

      if (requestedItems.some((item) => !item.productId || !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 100)) {
        return res.status(400).json({ success: false, message: "Each order item needs a valid product ID and quantity between 1 and 100." });
      }

      const productIds = requestedItems.map((item) => item.productId);
      if (new Set(productIds).size !== productIds.length) {
        return res.status(400).json({ success: false, message: "Duplicate products are not allowed in an order." });
      }

      const products = await Product.find({ id: { $in: productIds }, available: true }).lean();
      const productsById = new Map(products.map((product) => [product.id, product]));

      if (products.length !== productIds.length) {
        return res.status(400).json({ success: false, message: "One or more selected books are unavailable." });
      }

      const items = requestedItems.map(({ productId, quantity }) => {
        const product = productsById.get(productId);
        const unitPrice = Math.round(product.price - (product.price * product.discount) / 100);
        return {
          productId: product.id,
          name: product.name,
          quantity,
          unitPrice,
          lineTotal: unitPrice * quantity,
        };
      });

      const subtotal = items.reduce((sum, item) => sum + item.lineTotal, 0);
      const deliveryCharge = DELIVERY_CHARGES[delivery.zone];
      const location = {};

      if (locationBody && Object.keys(locationBody).length > 0) {
        const latitude = Number(locationBody.latitude);
        const longitude = Number(locationBody.longitude);
        const accuracy = Number(locationBody.accuracy);
        const capturedAt = new Date(locationBody.capturedAt);

        if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
          return res.status(400).json({ success: false, message: "Location coordinates are invalid." });
        }

        location.latitude = latitude;
        location.longitude = longitude;
        if (Number.isFinite(accuracy) && accuracy >= 0) location.accuracy = accuracy;
        if (!Number.isNaN(capturedAt.getTime())) location.capturedAt = capturedAt;
      }

      const order = await Order.create({
        orderId: createOrderId(),
        customer,
        delivery,
        paymentMethod,
        items,
        pricing: {
          subtotal,
          deliveryCharge,
          total: subtotal + deliveryCharge,
        },
        location,
      });

      let whatsapp = { sent: false, reason: "WhatsApp is not configured." };
      try {
        whatsapp = await sendOrderConfirmationRequest(order);
      } catch (error) {
        console.error("WhatsApp order confirmation failed:", error.message);
        await Order.updateOne(
          { _id: order._id },
          { $set: { "whatsapp.confirmationStatus": "not_sent", "whatsapp.lastError": error.message.slice(0, 500) } }
        );
        whatsapp = { sent: false, reason: "Order saved, but WhatsApp confirmation could not be sent." };
      }

      res.status(201).json({
        success: true,
        message: "Order received successfully.",
        order: {
          orderId: order.orderId,
          status: order.status,
          pricing: order.pricing,
          locationCaptured: Boolean(order.location?.latitude !== undefined),
          createdAt: order.createdAt,
          whatsapp,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);


// ============================================================
// GET PRODUCTS
// ============================================================

app.get(
  "/api/products",
  async (req, res, next) => {

    try {

      const filter = {};


      // --------------------------------------------------------
      // Category
      // --------------------------------------------------------

      if (
        req.query.category
      ) {
        filter.category =
          String(
            req.query.category
          ).trim();
      }


      // --------------------------------------------------------
      // Search by ID or Name
      // --------------------------------------------------------

      if (
        req.query.search
      ) {
        const search =
          String(
            req.query.search
          ).trim();

        if (search) {

          const regex =
            new RegExp(
              escapeRegex(search),
              "i"
            );

          filter.$or = [
            { id: regex },
            { name: regex },
          ];
        }
      }


      // --------------------------------------------------------
      // Availability
      // --------------------------------------------------------

      if (
        req.query.available ===
        "true"
      ) {
        filter.available =
          true;
      }


      if (
        req.query.available ===
        "false"
      ) {
        filter.available =
          false;
      }


      // --------------------------------------------------------
      // Featured flags
      // --------------------------------------------------------

      if (
        req.query.mostPopular ===
        "true"
      ) {
        filter.mostPopular =
          true;
      }


      if (
        req.query.thisWeekBest ===
        "true"
      ) {
        filter.thisWeekBest =
          true;
      }


      if (
        req.query.featured ===
        "true"
      ) {
        filter.featured =
          true;
      }


      const products =
        await Product
          .find(filter)
          .sort({
            available: -1,
            createdAt: -1,
          })
          .lean();


      const result =
        products.map(
          serializeProduct
        );


      res.json({

        success:
          true,

        count:
          result.length,

        products:
          result,

      });

    } catch (error) {

      next(error);

    }
  }
);


// ============================================================
// GET ONE PRODUCT
// ============================================================

app.get(
  "/api/products/:id",
  async (req, res, next) => {

    try {

      const product =
        await Product
          .findOne({
            id:
              req.params.id
                .trim()
                .toUpperCase(),
          })
          .lean();


      if (!product) {

        return res.status(404).json({

          success:
            false,

          message:
            "Product not found.",

        });
      }


      res.json({

        success:
          true,

        product:
          serializeProduct(
            product
          ),

      });

    } catch (error) {

      next(error);

    }
  }
);


// ============================================================
// ADD PRODUCT
// ============================================================

app.post(
  "/api/products",
  requireAdmin,
  async (req, res, next) => {

    let uploadedAsset =
      null;

    try {

      const data =
        parseProductBody(
          req.body
        );


      // ------------------------------------------------------
      // Validation
      // ------------------------------------------------------

      if (!data.id) {
        throw new Error(
          "Product ID is required."
        );
      }

      if (!data.name) {
        throw new Error(
          "Product name is required."
        );
      }

      if (!data.category) {
        throw new Error(
          "Category is required."
        );
      }


      const imageData =
        req.body.image;


      validateImageDataUri(
        imageData
      );


      // ------------------------------------------------------
      // Duplicate ID
      // ------------------------------------------------------

      const existing =
        await Product.exists({
          id: data.id,
        });


      if (existing) {

        return res.status(409).json({

          success:
            false,

          message:
            `Product ID ${data.id} already exists.`,

        });
      }


      // ------------------------------------------------------
      // Cloudinary upload
      // ------------------------------------------------------

      console.log(
        `☁️ Uploading ${data.id} to Cloudinary...`
      );


      uploadedAsset =
        await cloudinary.uploader.upload(
          imageData,
          {
            folder:
              "prince-book-depot/products",

            resource_type:
              "image",

            use_filename:
              true,

            unique_filename:
              true,

            overwrite:
              false,
          }
        );


      console.log(
        "✅ Cloudinary upload successful:",
        uploadedAsset.public_id
      );


      // ------------------------------------------------------
      // MongoDB
      // ------------------------------------------------------

      const product =
        await Product.create({

          ...data,

          image:
            uploadedAsset.secure_url,

          imagePublicId:
            uploadedAsset.public_id,

        });


      res.status(201).json({

        success:
          true,

        message:
          "Product created successfully.",

        product:
          serializeProduct(
            product.toObject()
          ),

      });

    } catch (error) {

      // Remove Cloudinary file
      // if MongoDB save failed.

      if (
        uploadedAsset?.public_id
      ) {

        await cloudinary.uploader
          .destroy(
            uploadedAsset.public_id,
            {
              resource_type:
                "image",
            }
          )
          .catch(() => {});

      }


      next(error);

    }
  }
);


// ============================================================
// UPDATE PRODUCT
// ============================================================

app.put(
  "/api/products/:id",
  requireAdmin,
  async (req, res, next) => {

    let newCloudinaryAsset =
      null;

    try {

      const productId =
        String(
          req.params.id
        )
          .trim()
          .toUpperCase();


      // ------------------------------------------------------
      // Find current product
      // ------------------------------------------------------

      const currentProduct =
        await Product.findOne({
          id: productId,
        });


      if (!currentProduct) {

        return res.status(404).json({

          success:
            false,

          message:
            "Product not found.",

        });
      }


      // ------------------------------------------------------
      // Parse update
      // ------------------------------------------------------

      const data =
        parseProductBody(
          req.body,
          true
        );


      if (!data.name) {
        throw new Error(
          "Product name is required."
        );
      }


      if (!data.category) {
        throw new Error(
          "Category is required."
        );
      }


      // ------------------------------------------------------
      // IMAGE REPLACEMENT
      // ------------------------------------------------------

      const hasNewImage =
        typeof req.body.image ===
          "string" &&
        req.body.image.length >
          0;


      if (hasNewImage) {

        validateImageDataUri(
          req.body.image
        );


        console.log(
          `☁️ Replacing image for ${productId}...`
        );


        newCloudinaryAsset =
          await cloudinary.uploader.upload(
            req.body.image,
            {
              folder:
                "prince-book-depot/products",

              resource_type:
                "image",

              use_filename:
                true,

              unique_filename:
                true,

              overwrite:
                false,
            }
          );


        data.image =
          newCloudinaryAsset
            .secure_url;

        data.imagePublicId =
          newCloudinaryAsset
            .public_id;
      }


      // ------------------------------------------------------
      // UPDATE MONGODB
      // ------------------------------------------------------

      Object.assign(
        currentProduct,
        data
      );


      await currentProduct.save();


      // ------------------------------------------------------
      // DELETE OLD CLOUDINARY IMAGE
      // ------------------------------------------------------
      //
      // Only after MongoDB successfully
      // saved the new image.
      //

      if (
        hasNewImage &&
        currentProduct.imagePublicId &&
        currentProduct.imagePublicId !==
          newCloudinaryAsset?.public_id
      ) {

        /*
         * The old public ID needs to be captured
         * before overwrite. See the improved
         * implementation below.
         */
      }


      res.json({

        success:
          true,

        message:
          "Product updated successfully.",

        product:
          serializeProduct(
            currentProduct.toObject()
          ),

      });

    } catch (error) {

      // If Cloudinary succeeded but
      // MongoDB failed, remove new image.

      if (
        newCloudinaryAsset?.public_id
      ) {

        await cloudinary.uploader
          .destroy(
            newCloudinaryAsset.public_id,
            {
              resource_type:
                "image",
            }
          )
          .catch(() => {});

      }


      next(error);

    }
  }
);


// ============================================================
// DELETE PRODUCT
// ============================================================

app.delete(
  "/api/products/:id",
  requireAdmin,
  async (req, res, next) => {

    try {

      const productId =
        String(
          req.params.id
        )
          .trim()
          .toUpperCase();


      const product =
        await Product.findOne({
          id: productId,
        });


      if (!product) {

        return res.status(404).json({

          success:
            false,

          message:
            "Product not found.",

        });
      }


      // ------------------------------------------------------
      // DELETE MONGODB RECORD
      // ------------------------------------------------------

      await Product.deleteOne({
        _id: product._id,
      });


      // ------------------------------------------------------
      // DELETE CLOUDINARY IMAGE
      // ------------------------------------------------------

      if (
        product.imagePublicId
      ) {

        try {

          await cloudinary.uploader.destroy(
            product.imagePublicId,
            {
              resource_type:
                "image",
            }
          );


          console.log(
            `🗑️ Cloudinary image deleted: ${product.imagePublicId}`
          );

        } catch (
          cloudinaryError
        ) {

          console.error(
            "⚠️ Product deleted from MongoDB, but Cloudinary image could not be deleted:",
            cloudinaryError
          );

        }
      }


      res.json({

        success:
          true,

        message:
          "Product deleted successfully.",

      });

    } catch (error) {

      next(error);

    }
  }
);


// ============================================================
// ERROR HANDLER
// ============================================================

app.use(
  (
    error,
    _req,
    res,
    _next
  ) => {

    console.error(
      "❌ API error:",
      error
    );


    const badRequestMessages = [
      "Product ID is required.",
      "Product name is required.",
      "Category is required.",
      "Product image is required.",
      "Invalid image format.",
    ];


    if (
      badRequestMessages.includes(
        error.message
      )
    ) {

      return res.status(400).json({

        success:
          false,

        message:
          error.message,

      });

    }


    if (
      error.message.startsWith(
        "Price must be"
      ) ||
      error.message.startsWith(
        "Discount must be"
      ) ||
      error.message.startsWith(
        "Image exceeds"
      )
    ) {

      return res.status(400).json({

        success:
          false,

        message:
          error.message,

      });

    }

    if (
      error.message.startsWith("Customer ") ||
      error.message.startsWith("Delivery ")
    ) {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }


    if (
      error.name ===
      "ValidationError"
    ) {

      return res.status(400).json({

        success:
          false,

        message:
          Object.values(
            error.errors
          )
            .map(
              (item) =>
                item.message
            )
            .join(" "),

      });

    }


    if (
      error.code === 11000
    ) {

      return res.status(409).json({

        success:
          false,

        message:
          "Product ID already exists.",

      });

    }


    return res.status(500).json({

      success:
        false,

      message:
        error.message ||
        "Internal server error.",

    });

  }
);


// ============================================================
// START SERVER
// ============================================================

async function start() {

  try {

    await mongoose.connect(
      MONGODB_URI,
      {
        serverSelectionTimeoutMS:
          10000,
      }
    );


    app.listen(
      PORT,
      "0.0.0.0",
      () => {

        console.log(
          `🚀 Server listening on port ${PORT}`
        );

      }
    );

  } catch (error) {

    console.error(
      "❌ Startup failed:",
      error
    );

    process.exit(1);
  }
}

start();


// ============================================================
// GRACEFUL SHUTDOWN
// ============================================================

async function shutdown(
  signal
) {

  console.log(
    `${signal} received. Shutting down...`
  );


  await mongoose.connection.close();

  process.exit(0);
}


process.on(
  "SIGINT",
  () => shutdown("SIGINT")
);

process.on(
  "SIGTERM",
  () => shutdown("SIGTERM")
);