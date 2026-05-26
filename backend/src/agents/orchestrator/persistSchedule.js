import { Goal } from "../../models/Goal.js";
import { Todo } from "../../models/Todo.js";

/**
 * Walk the orchestrator's schedule and attach a `todoId` to every actionable slot.
 *
 * - "dump" slots: link to the existing pending dump Todo (matched by title).
 * - "suggested" slots: persist a NEW Todo (linked to the goal if goalTitle matches).
 * - "calendar" / "break" / "free": no todoId.
 *
 * This is what makes Phase 4 work: the user can mark these slots done,
 * and that flows back into Goal.progress on the next agent run.
 */
export async function persistAndEnrichSchedule(schedule) {
  if (!Array.isArray(schedule) || schedule.length === 0) return [];

  const activeGoals = await Goal.find({ status: "active" }).select("_id title");
  const goalsByTitle = new Map();
  for (const g of activeGoals) goalsByTitle.set(g.title.toLowerCase().trim(), g);

  const pendingDump = await Todo.find({ type: "dump", completed: false }).select(
    "_id title"
  );
  const dumpByTitle = new Map();
  for (const t of pendingDump) dumpByTitle.set(t.title.toLowerCase().trim(), t);

  const enriched = [];

  for (const slot of schedule) {
    const type = slot.type || "dump";
    let todoId = null;

    if (type === "dump") {
      const match = dumpByTitle.get((slot.task || "").toLowerCase().trim());
      if (match) todoId = match._id;
    } else if (type === "suggested") {
      const goalKey = (slot.goalTitle || "").toLowerCase().trim();
      const goal = goalKey ? goalsByTitle.get(goalKey) : null;

      const created = await Todo.create({
        title: slot.task,
        description: slot.reason || "",
        type: "suggested",
        goalId: goal?._id || null,
        source: "agent",
        category: goal?.title || "",
      });
      todoId = created._id;
    }

    enriched.push({ ...slot, todoId: todoId ? String(todoId) : null });
  }

  return enriched;
}
