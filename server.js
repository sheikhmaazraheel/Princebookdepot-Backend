require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const helmet = require("helmet");
const cloudinary = require("cloudinary").v2;

const Product = require("./models/Product");

const app = express();

app.set("trust proxy", 1);

const PORT = Number(process.env.PORT) || 3000;

const MONGODB_URI = process.env.MONGODB_URI;

const FRONTEND_ORIGIN =
  process.env.FRONTEND_ORIGIN ||
  "https://sheikhmaazraheel.github.io";

const MAX_IMAGE_MB =
  Number(process.env.MAX_IMAGE_MB) || 5;


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


// ============================================================
// CLOUDINARY
// ============================================================

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
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

    methods: [
      "GET",
      "POST",
      "OPTIONS",
    ],

    allowedHeaders: [
      "Content-Type",
    ],
  })
);


// IMPORTANT:
// Base64 images are larger than their original binary size.
// The limit therefore needs to be larger than MAX_IMAGE_MB.

const JSON_LIMIT_MB =
  Math.ceil(MAX_IMAGE_MB * 1.5) + 2;

app.use(
  express.json({
    limit: `${JSON_LIMIT_MB}mb`,
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


// ------------------------------------------------------------
// Parse product data
// ------------------------------------------------------------

function parseProductBody(body) {
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


  return {
    id: String(
      body.id || ""
    )
      .trim()
      .toUpperCase(),

    name: String(
      body.name || ""
    ).trim(),

    price,

    discount,

    category: String(
      body.category || ""
    ).trim(),

    mostPopular: parseBoolean(
      body.mostPopular,
      false
    ),

    thisWeekBest: parseBoolean(
      body.thisWeekBest,
      false
    ),

    featured: parseBoolean(
      body.featured,
      false
    ),

    available: parseBoolean(
      body.available,
      true
    ),
  };
}


// ------------------------------------------------------------
// Validate Cloudinary Data URI
// ------------------------------------------------------------

function validateImageDataUri(
  image
) {
  if (
    typeof image !== "string"
  ) {
    throw new Error(
      "Product image is required."
    );
  }


  if (
    !image.startsWith(
      "data:image/"
    )
  ) {
    throw new Error(
      "Invalid image format."
    );
  }


  // Rough safety check against
  // extremely large requests.
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


  return true;
}


// ------------------------------------------------------------
// Serialize product
// ------------------------------------------------------------

function serializeProduct(
  product
) {
  return {
    ...product,

    // Cloudinary URL is already
    // stored directly in MongoDB.
    imageUrl: product.image,

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


// ============================================================
// ROOT
// ============================================================

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
// GET ALL PRODUCTS
// ============================================================

app.get(
  "/api/products",
  async (req, res, next) => {

    try {

      const filter = {};


      // Category
      if (
        req.query.category
      ) {

        filter.category =
          String(
            req.query.category
          ).trim();

      }


      // Availability
      if (
        req.query.available ===
        "true"
      ) {

        filter.available = true;

      }


      if (
        req.query.available ===
        "false"
      ) {

        filter.available = false;

      }


      // Most Popular
      if (
        req.query.mostPopular ===
        "true"
      ) {

        filter.mostPopular =
          true;

      }


      // This Week's Best
      if (
        req.query.thisWeekBest ===
        "true"
      ) {

        filter.thisWeekBest =
          true;

      }


      // Featured
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

        success: true,

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
//
// IMPORTANT:
//
// The browser sends JSON:
//
// {
//   id,
//   name,
//   price,
//   discount,
//   category,
//   mostPopular,
//   thisWeekBest,
//   featured,
//   available,
//   image
// }
//
// The image is a Base64 Data URI.
//
// The server sends that image to Cloudinary.
// MongoDB stores only the Cloudinary URL + public ID.
//
// ============================================================

app.post(
  "/api/products",
  async (req, res, next) => {

    let uploadedAsset = null;


    try {

      // --------------------------------
      // Parse product information
      // --------------------------------

      const data =
        parseProductBody(
          req.body
        );


      // --------------------------------
      // Validate required fields
      // --------------------------------

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


      // --------------------------------
      // Validate image
      // --------------------------------

      const imageData =
        req.body.image;

      validateImageDataUri(
        imageData
      );


      // --------------------------------
      // Duplicate product ID
      // --------------------------------

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


      // --------------------------------
      // CLOUDINARY UPLOAD
      // --------------------------------

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
        `✅ Cloudinary upload successful: ${uploadedAsset.public_id}`
      );


      // --------------------------------
      // SAVE PRODUCT TO MONGODB
      // --------------------------------

      const product =
        await Product.create({

          ...data,

          image:
            uploadedAsset.secure_url,

          imagePublicId:
            uploadedAsset.public_id,

        });


      // --------------------------------
      // SUCCESS RESPONSE
      // --------------------------------

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

      // --------------------------------
      // CLEANUP CLOUDINARY
      // --------------------------------
      //
      // If Cloudinary uploaded the file
      // but MongoDB failed, remove the
      // orphaned Cloudinary asset.
      //

      if (
        uploadedAsset?.public_id
      ) {

        try {

          await cloudinary.uploader.destroy(
            uploadedAsset.public_id,
            {
              resource_type:
                "image",
            }
          );

          console.log(
            "🧹 Removed orphaned Cloudinary image."
          );

        } catch (
          cleanupError
        ) {

          console.error(
            "⚠️ Could not remove orphaned Cloudinary image:",
            cleanupError
          );

        }

      }


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


    if (
      error.message ===
      "Product ID is required."
    ) {

      return res.status(400).json({

        success:
          false,

        message:
          error.message,

      });

    }


    if (
      error.message ===
      "Product name is required."
    ) {

      return res.status(400).json({

        success:
          false,

        message:
          error.message,

      });

    }


    if (
      error.message ===
      "Category is required."
    ) {

      return res.status(400).json({

        success:
          false,

        message:
          error.message,

      });

    }


    if (
      error.message ===
      "Product image is required."
    ) {

      return res.status(400).json({

        success:
          false,

        message:
          error.message,

      });

    }


    if (
      error.message ===
      "Invalid image format."
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
        "Discount must be"
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


    if (
      error.http_code
    ) {

      return res.status(502).json({

        success:
          false,

        message:
          "Cloudinary upload failed.",

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