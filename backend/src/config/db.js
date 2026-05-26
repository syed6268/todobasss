import mongoose from "mongoose";
import { config } from "./env.js";

let _connected = false;

export async function connectDB() {
  if (_connected) return mongoose.connection;

  mongoose.set("strictQuery", true);

  try {
    await mongoose.connect(config.mongoUri, {
      serverSelectionTimeoutMS: 5000,
    });
    _connected = true;
    console.log(`MongoDB connected: ${mongoose.connection.host}/${mongoose.connection.name}`);
    return mongoose.connection;
  } catch (err) {
    console.error("\n=================================================");
    console.error("MongoDB connection failed:", err.message);
    console.error(`Tried URI: ${config.mongoUri}`);
    console.error("Make sure MongoDB is running, or set MONGO_URI in backend/.env");
    console.error("Local install: https://www.mongodb.com/try/download/community");
    console.error("Atlas (cloud): https://www.mongodb.com/cloud/atlas/register");
    console.error("=================================================\n");
    throw err;
  }
}

export function isDbReady() {
  return mongoose.connection.readyState === 1;
}
