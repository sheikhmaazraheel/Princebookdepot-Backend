const mongoose = require("mongoose");

const orderItemSchema = new mongoose.Schema(
  {
    productId: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 180,
    },
    quantity: {
      type: Number,
      required: true,
      min: 1,
      max: 100,
    },
    unitPrice: {
      type: Number,
      required: true,
      min: 0,
    },
    lineTotal: {
      type: Number,
      required: true,
      min: 0,
    },
  },
  { _id: false }
);

const orderSchema = new mongoose.Schema(
  {
    orderId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },
    customer: {
      name: { type: String, required: true, trim: true, maxlength: 120 },
      contact: { type: String, required: true, trim: true, maxlength: 40 },
      email: { type: String, trim: true, lowercase: true, maxlength: 180 },
    },
    delivery: {
      city: { type: String, required: true, trim: true, maxlength: 80 },
      area: { type: String, required: true, trim: true, maxlength: 120 },
      zone: { type: String, required: true, trim: true, maxlength: 40 },
      address: { type: String, required: true, trim: true, maxlength: 500 },
      landmark: { type: String, required: true, trim: true, maxlength: 180 },
    },
    paymentMethod: {
      type: String,
      required: true,
      enum: ["Cash on Delivery", "Online Payment"],
    },
    items: {
      type: [orderItemSchema],
      required: true,
      validate: {
        validator: (items) => items.length > 0,
        message: "At least one order item is required.",
      },
    },
    pricing: {
      subtotal: { type: Number, required: true, min: 0 },
      deliveryCharge: { type: Number, required: true, min: 0 },
      total: { type: Number, required: true, min: 0 },
    },
    location: {
      latitude: { type: Number, min: -90, max: 90 },
      longitude: { type: Number, min: -180, max: 180 },
      accuracy: { type: Number, min: 0 },
      capturedAt: { type: Date },
    },
    status: {
      type: String,
      enum: ["pending", "confirmed", "processing", "shipped", "delivered", "completed", "cancelled", "returned"],
      default: "pending",
      index: true,
    },
    statusUpdatedAt: {
      type: Date,
      default: Date.now,
    },
    whatsapp: {
      customerWaId: { type: String, trim: true },
      confirmationStatus: {
        type: String,
        enum: ["not_sent", "pending", "confirmed", "cancelled"],
        default: "not_sent",
      },
      confirmationMessageId: { type: String, trim: true },
      confirmationSentAt: { type: Date },
      confirmedAt: { type: Date },
      cancelledAt: { type: Date },
      lastError: { type: String, maxlength: 500 },
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

module.exports = mongoose.model("Order", orderSchema);
