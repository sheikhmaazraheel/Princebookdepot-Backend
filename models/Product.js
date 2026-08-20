const mongoose = require("mongoose");

const productSchema = new mongoose.Schema(
  {
    id: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
      index: true,
    },

    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 180,
    },

    price: {
      type: Number,
      required: true,
      min: 0,
    },

    discount: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },

    category: {
      type: String,
      required: true,
      trim: true,
      enum: [
        "English-novels",
        "Urdu-novels",
        "Poetry",
        "Academic-books",
        "Bundle",
      ],
      index: true,
    },

    mostPopular: {
      type: Boolean,
      default: false,
      index: true,
    },

    thisWeekBest: {
      type: Boolean,
      default: false,
      index: true,
    },

    featured: {
      type: Boolean,
      default: false,
      index: true,
    },

    available: {
      type: Boolean,
      default: true,
      index: true,
    },

    // Full Cloudinary HTTPS URL
    image: {
      type: String,
      required: true,
    },

    // Cloudinary public_id used later for
    // replacing/deleting images.
    imagePublicId: {
      type: String,
      required: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

productSchema.virtual("finalPrice").get(function () {
  return Math.round(
    this.price - (this.price * this.discount) / 100
  );
});

productSchema.set("toJSON", {
  virtuals: true,
});

module.exports = mongoose.model("Product", productSchema);