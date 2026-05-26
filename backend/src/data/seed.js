import { Todo } from "../models/Todo.js";
import { Goal } from "../models/Goal.js";

const SEED_DUMP = [
  { title: "Buy groceries" },
  { title: "Call mom" },
  { title: "Pay electricity bill", completed: true },
  { title: "Schedule dentist appointment" },
  { title: "Water plants" },
];

const SEED_SUGGESTED = [
  { title: "Read 30 minutes of a book", category: "Personal Growth" },
  { title: "Exercise for 45 minutes", category: "Health" },
  { title: "Learn a new programming concept", category: "Career" },
  { title: "Meditate for 15 minutes", category: "Wellness" },
  { title: "Network with one person", category: "Career" },
];

export async function seedIfEmpty() {
  const todoCount = await Todo.countDocuments();
  if (todoCount > 0) return { skipped: true, reason: "todos already present" };

  await Todo.insertMany([
    ...SEED_DUMP.map((t) => ({ ...t, type: "dump", source: "seed" })),
    ...SEED_SUGGESTED.map((t) => ({ ...t, type: "suggested", source: "seed" })),
  ]);

  return { seeded: true, dump: SEED_DUMP.length, suggested: SEED_SUGGESTED.length };
}
