require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");
const multer = require("multer");
const cors = require("cors");
const helmet = require("helmet");
const path = require("path");
const fs = require("fs/promises");

const Product = require("./models/Product");

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const MONGODB_URI = process.env.MONGODB_URI;
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || true;
const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR || "./uploads");
const MAX_IMAGE_MB = Number(process.env.MAX_IMAGE_MB) || 5;

if (!MONGODB_URI) {
  console.error("❌ MONGODB_URI is missing");
  process.exit(1);
}

app.disable("x-powered-by");

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
  })
);

app.use(
  cors({
    origin: FRONTEND_ORIGIN,
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type"],
  })
);

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

app.use("/uploads", express.static(UPLOAD_DIR, { maxAge: "7d" }));
app.use(
  "/protected",
  express.static(path.join(__dirname, "protected"), {
    extensions: ["html"],
  })
);

mongoose.connection.on("connected", () =>
  console.log("✅ MongoDB connected")
);

mongoose.connection.on("error", (err) =>
  console.error("❌ MongoDB error:", err)
);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),

  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const base =
      path
        .basename(file.originalname, ext)
        .replace(/[^a-z0-9_-]/gi, "-")
        .replace(/-+/g, "-")
        .slice(0, 60) || "product";

    cb(
      null,
      `${base}-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`
    );
  },
});

const upload = multer({
  storage,
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith("image/")) {
      return cb(new Error("Only image files are allowed."));
    }
    cb(null, true);
  },
  limits: {
    fileSize: MAX_IMAGE_MB * 1024 * 1024,
    files: 1,
  },
});

function bool(value, fallback = false) {
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return fallback;

  const normalized = value.trim().toLowerCase();

  if (["true", "1", "yes", "on"].includes(normalized)) return true;
  if (["false", "0", "no", "off"].includes(normalized)) return false;

  return fallback;
}

function imageUrl(req, file) {
  if (!file) return null;
  return `${req.protocol}://${req.get("host")}/uploads/${encodeURIComponent(
    file
  )}`;
}

function serialize(req, product) {
  return {
    ...product,
    imageUrl: imageUrl(req, product.image),
    finalPrice: Math.round(
      product.price - (product.price * product.discount) / 100
    ),
  };
}

function parseProductBody(body) {
  const price = Number(body.price);
  const discount =
    body.discount === "" || body.discount === undefined
      ? 0
      : Number(body.discount);

  return {
    id: String(body.id || "").trim().toUpperCase(),
    name: String(body.name || "").trim(),
    price,
    discount,
    category: String(body.category || "").trim(),
    mostPopular: bool(body.mostPopular, false),
    thisWeekBest: bool(body.thisWeekBest, false),
    featured: bool(body.featured, false),
    available: bool(body.available, true),
  };
}

// ------------------------------------------------------------
// Health / root
// ------------------------------------------------------------
app.get("/", (_req, res) => {
  res.json({
    success: true,
    service: "Prince Book Depot API",
    status: "running",
  });
});

app.get("/api/health", (_req, res) => {
  res.json({
    success: true,
    database:
      mongoose.connection.readyState === 1 ? "connected" : "disconnected",
  });
});

// ------------------------------------------------------------
// GET PRODUCTS
// ------------------------------------------------------------
app.get("/api/products", async (req, res, next) => {
  try {
    const filter = {};

    if (req.query.category) {
      filter.category = String(req.query.category).trim();
    }

    if (req.query.available === "true") filter.available = true;
    if (req.query.available === "false") filter.available = false;

    if (req.query.mostPopular === "true") filter.mostPopular = true;
    if (req.query.thisWeekBest === "true") filter.thisWeekBest = true;
    if (req.query.featured === "true") filter.featured = true;

    const products = await Product.find(filter)
      .sort({ available: -1, createdAt: -1 })
      .lean();

    res.json({
      success: true,
      count: products.length,
      products: products.map((product) => serialize(req, product)),
    });
  } catch (error) {
    next(error);
  }
});

// ------------------------------------------------------------
// GET ONE PRODUCT
// ------------------------------------------------------------
app.get("/api/products/:id", async (req, res, next) => {
  try {
    const product = await Product.findOne({
      id: req.params.id.toUpperCase(),
    }).lean();

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found.",
      });
    }

    res.json({
      success: true,
      product: serialize(req, product),
    });
  } catch (error) {
    next(error);
  }
});

// ------------------------------------------------------------
// ADD PRODUCT
// ------------------------------------------------------------
// Authentication intentionally comes later.
app.post("/api/products", upload.single("image"), async (req, res, next) => {
  try {
    const data = parseProductBody(req.body);

    if (!data.id) throw new Error("Product ID is required.");
    if (!data.name) throw new Error("Product name is required.");
    if (!data.category) throw new Error("Category is required.");

    if (!Number.isFinite(data.price) || data.price < 0) {
      throw new Error("Price must be a valid non-negative number.");
    }

    if (
      !Number.isFinite(data.discount) ||
      data.discount < 0 ||
      data.discount > 100
    ) {
      throw new Error("Discount must be a number between 0 and 100.");
    }

    if (!req.file) throw new Error("Product image is required.");

    if (await Product.exists({ id: data.id })) {
      await fs.unlink(req.file.path).catch(() => {});

      return res.status(409).json({
        success: false,
        message: `Product ID ${data.id} already exists.`,
      });
    }

    const product = await Product.create({
      ...data,
      image: req.file.filename,
    });

    res.status(201).json({
      success: true,
      message: "Product created successfully.",
      product: serialize(req, product.toObject({ virtuals: true })),
    });
  } catch (error) {
    if (req.file?.path) {
      await fs.unlink(req.file.path).catch(() => {});
    }

    next(error);
  }
});

// ------------------------------------------------------------
// ERROR HANDLER
// ------------------------------------------------------------
app.use((err, _req, res, _next) => {
  console.error("❌ API error:", err);

  if (err instanceof multer.MulterError) {
    return res.status(400).json({
      success: false,
      message:
        err.code === "LIMIT_FILE_SIZE"
          ? `Image exceeds ${MAX_IMAGE_MB} MB.`
          : err.message,
    });
  }

  if (err.message === "Only image files are allowed.") {
    return res.status(400).json({
      success: false,
      message: err.message,
    });
  }

  if (err.code === 11000) {
    return res.status(409).json({
      success: false,
      message: "Product ID already exists.",
    });
  }

  if (
    err.message === "Product ID is required." ||
    err.message === "Product name is required." ||
    err.message === "Category is required." ||
    err.message === "Product image is required." ||
    err.message.startsWith("Price must be") ||
    err.message.startsWith("Discount must be")
  ) {
    return res.status(400).json({
      success: false,
      message: err.message,
    });
  }

  if (err.name === "ValidationError") {
    return res.status(400).json({
      success: false,
      message: Object.values(err.errors)
        .map((item) => item.message)
        .join(" "),
    });
  }

  res.status(500).json({
    success: false,
    message: "Internal server error.",
  });
});

async function start() {
  try {
    await fs.mkdir(UPLOAD_DIR, { recursive: true });
    await mongoose.connect(MONGODB_URI, {
      serverSelectionTimeoutMS: 10000,
    });

    app.listen(PORT, "0.0.0.0", () => {
      console.log(`🚀 Server listening on port ${PORT}`);
    });
  } catch (error) {
    console.error("❌ Startup failed:", error);
    process.exit(1);
  }
}

start();

async function shutdown(signal) {
  console.log(`${signal} received. Shutting down...`);
  await mongoose.connection.close();
  process.exit(0);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
