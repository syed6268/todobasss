import mongoose from "mongoose";

const { Schema } = mongoose;

const HORIZONS = ["1week", "1month", "3months", "6months", "1year", "5years"];

const goalSchema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    horizon: { type: String, enum: HORIZONS, required: true },
    priority: { type: Number, min: 1, max: 5, default: 3 },
    category: { type: String, default: "" },

    startDate: { type: Date, default: () => new Date() },
    targetDate: { type: Date },

    status: {
      type: String,
      enum: ["active", "paused", "done", "archived"],
      default: "active",
    },

    progress: {
      lastActivityAt: { type: Date },
      completedCount: { type: Number, default: 0 },
      notes: [
        {
          at: { type: Date, default: Date.now },
          text: String,
        },
      ],
    },

    agentConfig: {
      enabled: { type: Boolean, default: true },
      browseEnabled: { type: Boolean, default: false },
      customInstructions: { type: String, default: "" },
    },
  },
  { timestamps: true }
);

goalSchema.virtual("daysSinceLastActivity").get(function () {
  if (!this.progress?.lastActivityAt) return null;
  const ms = Date.now() - new Date(this.progress.lastActivityAt).getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
});

goalSchema.set("toJSON", { virtuals: true });
goalSchema.set("toObject", { virtuals: true });

export const Goal = mongoose.model("Goal", goalSchema);
export { HORIZONS };
