import { Goal } from "../models/Goal.js";
import { Todo } from "../models/Todo.js";

/**
 * Apply the progress delta to a goal when a todo's completion state changes.
 * Idempotent per "transition" (caller should pass wasCompleted vs isCompleted).
 */
export async function applyTodoCompletionToGoal({
  goalId,
  wasCompleted,
  isCompleted,
}) {
  if (!goalId) return null;
  if (wasCompleted === isCompleted) return null;

  const inc = isCompleted ? 1 : -1;
  const update = {
    $inc: { "progress.completedCount": inc },
  };
  if (isCompleted) {
    update.$set = { "progress.lastActivityAt": new Date() };
  }

  return Goal.findByIdAndUpdate(goalId, update, { new: true });
}

export async function appendGoalNote(goalId, text) {
  if (!text || !text.trim()) return null;
  return Goal.findByIdAndUpdate(
    goalId,
    {
      $push: { "progress.notes": { text: text.trim(), at: new Date() } },
      $set: { "progress.lastActivityAt": new Date() },
    },
    { new: true }
  );
}

export async function fetchRecentCompletions(goalId, limit = 5) {
  return Todo.find({ goalId, completed: true })
    .sort({ completedAt: -1 })
    .limit(limit)
    .select("title completedAt")
    .lean();
}

export async function fetchRecentCompletionsForGoals(goalIds, perGoalLimit = 5) {
  const docs = await Todo.find({
    goalId: { $in: goalIds },
    completed: true,
  })
    .sort({ completedAt: -1 })
    .select("title completedAt goalId")
    .lean();

  const byGoal = new Map();
  for (const t of docs) {
    const key = String(t.goalId);
    const arr = byGoal.get(key) || [];
    if (arr.length < perGoalLimit) {
      arr.push({ title: t.title, completedAt: t.completedAt });
      byGoal.set(key, arr);
    }
  }
  return byGoal;
}
