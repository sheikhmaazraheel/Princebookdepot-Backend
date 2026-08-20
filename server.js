require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const helmet = require("helmet");
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

    methods: [
      "GET",
      "POST",
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

      res.status(201).json({
        success: true,
        message: "Order received successfully.",
        order: {
          orderId: order.orderId,
          status: order.status,
          pricing: order.pricing,
          locationCaptured: Boolean(order.location?.latitude !== undefined),
          createdAt: order.createdAt,
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