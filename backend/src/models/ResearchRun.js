import mongoose from "mongoose";

const { Schema } = mongoose;

const eventSchema = new Schema(
  {
    ts: { type: Date, default: Date.now },
    type: {
      type: String,
      enum: ["thought", "tool_call", "tool_result", "proposals", "done", "error", "needs_reconnect"],
      required: true,
    },
    data: { type: Schema.Types.Mixed, default: {} },
  },
  { _id: false }
);

const proposalSchema = new Schema(
  {
    title: { type: String, required: true },
    rationale: { type: String, default: "" },
    estimatedMinutes: { type: Number, default: 30 },
    energyCost: { type: String, enum: ["low", "medium", "high"], default: "medium" },
    priority: { type: Number, min: 1, max: 5, default: 3 },
    sources: [{ type: String }],
  },
  { _id: false }
);

const researchRunSchema = new Schema(
  {
    goalId: { type: Schema.Types.ObjectId, ref: "Goal", required: true },
    goalTitle: { type: String, default: "" },
    status: {
      type: String,
      enum: ["running", "awaiting_approval", "approved", "declined", "error"],
      default: "running",
    },
    events: [eventSchema],
    proposals: [proposalSchema],
    summary: { type: String, default: "" },
    createdTodoIds: [{ type: Schema.Types.ObjectId, ref: "Todo" }],
  },
  { timestamps: true }
);

researchRunSchema.index({ goalId: 1, createdAt: -1 });

export const ResearchRun = mongoose.model("ResearchRun", researchRunSchema);
