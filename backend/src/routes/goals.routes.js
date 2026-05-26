import { Router } from "express";
import { Goal, HORIZONS } from "../models/Goal.js";
import { runGoalAgent } from "../agents/goal/GoalAgent.js";
import {
  appendGoalNote,
  fetchRecentCompletionsForGoals,
} from "../services/progress.service.js";

const router = Router();

router.get("/", async (req, res) => {
  try {
    const goals = await Goal.find()
      .sort({ priority: 1, createdAt: -1 })
      .lean({ virtuals: true });

    const byGoal = await fetchRecentCompletionsForGoals(
      goals.map((g) => g._id),
      5
    );
    for (const g of goals) {
      g.recentCompletions = byGoal.get(String(g._id)) || [];
    }

    res.json({ goals, horizons: HORIZONS });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/", async (req, res) => {
  try {
    const { title, description, horizon, priority, category, targetDate, agentConfig } =
      req.body || {};

    if (!title || !horizon) {
      return res.status(400).json({ error: "title and horizon are required" });
    }
    if (!HORIZONS.includes(horizon)) {
      return res.status(400).json({ error: `horizon must be one of ${HORIZONS.join(", ")}` });
    }

    const goal = await Goal.create({
      title,
      description,
      horizon,
      priority,
      category,
      targetDate,
      agentConfig,
    });
    res.status(201).json({ goal });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const goal = await Goal.findById(req.params.id);
    if (!goal) return res.status(404).json({ error: "Goal not found" });
    res.json({ goal });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch("/:id", async (req, res) => {
  try {
    const allowed = [
      "title",
      "description",
      "horizon",
      "priority",
      "category",
      "status",
      "targetDate",
      "agentConfig",
    ];
    const update = {};
    for (const key of allowed) {
      if (req.body?.[key] !== undefined) update[key] = req.body[key];
    }

    const goal = await Goal.findByIdAndUpdate(req.params.id, update, {
      new: true,
      runValidators: true,
    });
    if (!goal) return res.status(404).json({ error: "Goal not found" });
    res.json({ goal });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const goal = await Goal.findByIdAndDelete(req.params.id);
    if (!goal) return res.status(404).json({ error: "Goal not found" });
    res.json({ deleted: true, id: req.params.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/:id/notes", async (req, res) => {
  try {
    const { text } = req.body || {};
    if (!text || !text.trim()) {
      return res.status(400).json({ error: "text is required" });
    }
    const goal = await appendGoalNote(req.params.id, text);
    if (!goal) return res.status(404).json({ error: "Goal not found" });
    res.json({ goal });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/:id/propose", async (req, res) => {
  try {
    const goal = await Goal.findById(req.params.id);
    if (!goal) return res.status(404).json({ error: "Goal not found" });

    const proposal = await runGoalAgent(goal, { today: new Date() });
    res.json({ proposal });
  } catch (err) {
    console.error("Goal agent error:", err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
