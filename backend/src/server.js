import express from "express";
import cors from "cors";
import { config } from "./config/env.js";
import { connectDB } from "./config/db.js";
import { seedIfEmpty } from "./data/seed.js";

import todosRouter from "./routes/todos.routes.js";
import goalsRouter from "./routes/goals.routes.js";
import authRouter from "./routes/auth.routes.js";
import gcalRouter from "./routes/gcal.routes.js";
import scheduleRouter from "./routes/schedule.routes.js";
import researchRouter from "./routes/research.routes.js";

const app = express();

app.use(cors());
app.use(express.json());

app.get("/api/health", (req, res) => {
  res.json({ ok: true, timestamp: new Date().toISOString() });
});

app.use("/api/todos", todosRouter);
app.use("/api/goals", goalsRouter);
app.use("/api/auth", authRouter);
app.use("/api/gcal", gcalRouter);
app.use("/api/schedule", scheduleRouter);
app.use("/api/research", researchRouter);

async function start() {
  try {
    await connectDB();
    const seedResult = await seedIfEmpty();
    if (seedResult.seeded) {
      console.log(
        `Seeded ${seedResult.dump} dump + ${seedResult.suggested} suggested todos`
      );
    }
  } catch (err) {
    console.error("Startup failed:", err.message);
    process.exit(1);
  }

  app.listen(config.port, () => {
    console.log(`Server started on PORT: ${config.port}`);
    console.log(`Google OAuth redirect URI: ${config.google.redirectUri}`);
  });
}

start();

export default app;
