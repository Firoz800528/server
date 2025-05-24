import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI;
const client = new MongoClient(uri);

let db;

export async function connectDB() {
  if (!db) {
    await client.connect();
    db = client.db("freelance_marketplace");
    console.log("MongoDB connected");
  }
  return db;
}

export function getDB() {
  if (!db) throw new Error("Database not connected");
  return db;
}
