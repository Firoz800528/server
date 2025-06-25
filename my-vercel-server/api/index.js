import express from "express";
import cors from "cors";
import { MongoClient, ObjectId } from "mongodb";
import dotenv from "dotenv";
export const handler = serverless(app);

//-----------------------//

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const port = process.env.PORT || 5000;
const uri = process.env.MONGODB_URI;
const client = new MongoClient(uri);

function decodeEmailFromJWT(token) {
  try {
    const payload = token.split(".")[1];
    const decoded = JSON.parse(Buffer.from(payload, "base64").toString());
    return decoded.email;
  } catch (err) {
    console.error("JWT decoding failed:", err);
    return null;
  }
}

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.split(" ")[1];
  if (!token) {
    return res.status(401).json({ error: "Unauthorized: Missing token" });
  }

  const email = decodeEmailFromJWT(token);
  if (!email) {
    return res.status(401).json({ error: "Unauthorized: Invalid token" });
  }

  req.userEmail = email;
  next();
}

function isValidObjectId(id) {
  return ObjectId.isValid(id) && new ObjectId(id).toString() === id;
}

async function run() {
  try {
    await client.connect();
    const db = client.db("freelance_marketplace");
    const tasksCollection = db.collection("tasks");
    const bidsCollection = db.collection("bids");

    app.get("/", (req, res) => {
      res.send("Backend server is running.");
    });
    

    app.get("/bids", async (req, res) => {
      try {
        const bids = await bidsCollection.find({}).toArray();
        res.json(bids);
      } catch (error) {
        res.status(500).json({ error: "Failed to fetch bids" });
      }
    });

    app.post("/tasks", async (req, res) => {
      const task = req.body;

      if (
        !task.title ||
        !task.category ||
        !task.description ||
        !task.deadline ||
        !task.budget ||
        !task.userEmail ||
        !task.userName
      ) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      const deadlineDate = new Date(task.deadline);
      if (isNaN(deadlineDate.getTime())) {
        return res.status(400).json({ error: "Invalid deadline date" });
      }

      if (typeof task.budget !== "number" || task.budget <= 0) {
        return res.status(400).json({ error: "Invalid budget" });
      }

      task.deadline = deadlineDate;
      task.bidsCount = 0;

      try {
        const result = await tasksCollection.insertOne(task);
        res.status(201).json({ insertedId: result.insertedId });
      } catch (error) {
        res.status(500).json({ error: "Failed to insert task" });
      }
    });

    app.get("/tasks", async (req, res) => {
      try {
        const limit = parseInt(req.query.limit) || 0;
        let cursor = tasksCollection.find({}).sort({ deadline: 1 });
        if (limit > 0) cursor = cursor.limit(limit);
        const tasks = await cursor.toArray();
        res.json(tasks);
      } catch (error) {
        res.status(500).json({ error: "Failed to fetch tasks" });
      }
    });

    app.get("/tasks/:id", async (req, res) => {
      const { id } = req.params;

      if (!isValidObjectId(id)) {
        return res.status(400).json({ error: "Invalid task ID" });
      }

      try {
        const task = await tasksCollection.findOne({ _id: new ObjectId(id) });
        if (!task) {
          return res.status(404).json({ error: "Task not found" });
        }

        res.json({ ...task, userEmail: task.userEmail });
      } catch (error) {
        res.status(500).json({ error: "Server error" });
      }
    });

    app.patch("/tasks/:id/bids", async (req, res) => {
      const { id } = req.params;

      if (!isValidObjectId(id)) {
        return res.status(400).json({ error: "Invalid task ID" });
      }

      try {
        const result = await tasksCollection.updateOne(
          { _id: new ObjectId(id) },
          { $inc: { bidsCount: 1 } }
        );

        if (result.modifiedCount === 0) {
          return res.status(404).json({ error: "Task not found or already updated" });
        }

        res.json({ success: true });
      } catch (err) {
        res.status(500).json({ error: "Failed to place bid" });
      }
    });

    app.get("/tasks/:id/bids", async (req, res) => {
      const { id } = req.params;

      if (!isValidObjectId(id)) {
        return res.status(400).json({ error: "Invalid task ID" });
      }

      try {
        const bids = await bidsCollection
          .find({ taskId: new ObjectId(id) })
          .sort({ date: -1 })
          .toArray();

        res.json(bids);
      } catch (error) {
        res.status(500).json({ error: "Failed to fetch bids" });
      }
    });

    app.post("/tasks/:id/bids", async (req, res) => {
      const { id } = req.params;
      const { amount, message, userEmail } = req.body;

      if (!isValidObjectId(id)) {
        return res.status(400).json({ error: "Invalid task ID" });
      }

      if (!amount || typeof amount !== "number" || amount <= 0) {
        return res.status(400).json({ error: "Invalid bid amount" });
      }

      if (!userEmail || typeof userEmail !== "string") {
        return res.status(400).json({ error: "Missing or invalid user email" });
      }

      const bid = {
        taskId: new ObjectId(id),
        userEmail,
        amount,
        message,
        date: new Date(),
      };

      try {
        const result = await bidsCollection.insertOne(bid);
        await tasksCollection.updateOne(
          { _id: new ObjectId(id) },
          { $inc: { bidsCount: 1 } }
        );

        res.status(201).json({ insertedId: result.insertedId });
      } catch (error) {
        res.status(500).json({ error: "Failed to submit bid" });
      }
    });

    app.delete("/bids/:bidId", authMiddleware, async (req, res) => {
      const { bidId } = req.params;

      if (!isValidObjectId(bidId)) {
        return res.status(400).json({ error: "Invalid bid ID" });
      }

      try {
        const bid = await bidsCollection.findOne({ _id: new ObjectId(bidId) });

        if (!bid) {
          return res.status(404).json({ error: "Bid not found" });
        }

        const task = await tasksCollection.findOne({ _id: bid.taskId });
        const isBidder = bid.userEmail === req.userEmail;
        const isTaskOwner = task && task.userEmail === req.userEmail;

        if (!isBidder && !isTaskOwner) {
          return res.status(403).json({ error: "Unauthorized to delete this bid" });
        }

        const result = await bidsCollection.deleteOne({ _id: new ObjectId(bidId) });

        if (result.deletedCount === 1) {
          await tasksCollection.updateOne(
            { _id: bid.taskId },
            { $inc: { bidsCount: -1 } }
          );
          res.json({ message: "Bid deleted" });
        } else {
          res.status(500).json({ error: "Failed to delete bid" });
        }
      } catch (error) {
        res.status(500).json({ error: "Server error while deleting bid" });
      }
    });

    app.put("/tasks/:id", authMiddleware, async (req, res) => {
      const { id } = req.params;
      const { title, category, description, deadline, budget } = req.body;

      if (!isValidObjectId(id)) {
        return res.status(400).json({ error: "Invalid task ID" });
      }

      if (!title || !category || !description || !deadline || typeof budget !== "number") {
        return res.status(400).json({ error: "Missing or invalid fields" });
      }

      const deadlineDate = new Date(deadline);
      if (isNaN(deadlineDate.getTime())) {
        return res.status(400).json({ error: "Invalid deadline date" });
      }

      try {
        const existingTask = await tasksCollection.findOne({ _id: new ObjectId(id) });

        if (!existingTask) {
          return res.status(404).json({ error: "Task not found" });
        }

        if (existingTask.userEmail !== req.userEmail) {
          return res.status(403).json({ error: "Unauthorized to update this task" });
        }

        const updateDoc = {
          $set: {
            title,
            category,
            description,
            deadline: deadlineDate,
            budget,
          },
        };

        const result = await tasksCollection.updateOne({ _id: new ObjectId(id) }, updateDoc);

        if (result.modifiedCount === 1) {
          const updatedTask = await tasksCollection.findOne({ _id: new ObjectId(id) });
          return res.status(200).json({
            message: "Task successfully updated",
            updatedTask,
          });
        } else {
          return res.status(500).json({ error: "Task update failed" });
        }
      } catch (error) {
        res.status(500).json({ error: "Server error during update" });
      }
    });

    app.get("/my-tasks", authMiddleware, async (req, res) => {
      try {
        const tasks = await tasksCollection.find({ userEmail: req.userEmail }).toArray();
        res.json(tasks);
      } catch (error) {
        res.status(500).json({ error: "Failed to fetch user tasks" });
      }
    });

    app.delete("/tasks/:id", authMiddleware, async (req, res) => {
      const { id } = req.params;

      if (!isValidObjectId(id)) {
        return res.status(400).json({ error: "Invalid task ID" });
      }

      try {
        const task = await tasksCollection.findOne({ _id: new ObjectId(id) });

        if (!task) {
          return res.status(404).json({ error: "Task not found" });
        }

        if (task.userEmail !== req.userEmail) {
          return res.status(403).json({ error: "Unauthorized: You cannot delete this task" });
        }

        const result = await tasksCollection.deleteOne({ _id: new ObjectId(id) });
        if (result.deletedCount === 1) {
          res.json({ message: "Task deleted" });
        } else {
          res.status(500).json({ error: "Failed to delete task" });
        }
      } catch (err) {
        res.status(500).json({ error: "Server error" });
      }
    });

    app.delete("/tasks", async (req, res) => {
      try {
        const result = await tasksCollection.deleteMany({});
        res.status(200).json({
          message: "All tasks deleted",
          deletedCount: result.deletedCount,
        });
      } catch (error) {
        res.status(500).json({ message: "Failed to delete tasks" });
      }
    });

    app.listen(port, () => {
      console.log(`Server running on port ${port}`);
    });
  } catch (err) {
    console.error("MongoDB connection error:", err);
  }
}

run();
