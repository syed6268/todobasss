import mongoose from "mongoose";

const { Schema } = mongoose;

const todoSchema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, default: "" },

    type: {
      type: String,
      enum: ["dump", "suggested"],
      required: true,
      default: "dump",
    },

    category: { type: String, default: "" },

    goalId: { type: Schema.Types.ObjectId, ref: "Goal", default: null },

    source: {
      type: String,
      enum: ["manual", "agent", "seed"],
      default: "manual",
    },

    priority: { type: Number, min: 1, max: 5, default: 3 },
    estimatedMinutes: { type: Number, default: 30 },
    energyCost: {
      type: String,
      enum: ["low", "medium", "high"],
      default: "medium",
    },

    completed: { type: Boolean, default: false },
    completedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

todoSchema.index({ type: 1, completed: 1 });
todoSchema.index({ goalId: 1 });

export const Todo = mongoose.model("Todo", todoSchema);
