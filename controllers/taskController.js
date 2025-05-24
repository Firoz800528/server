import { ObjectId } from "mongodb";
import { getDB } from "../db.js";
import admin from "../firebaseAdmin.js";

export async function addTask(req, res) {
  try {
    const db = getDB();
    const tasksCollection = db.collection("tasks");
    const task = req.body;

    if (!task.title || !task.category || !task.userEmail) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    if (task.deadline) {
      task.deadline = new Date(task.deadline);
      if (isNaN(task.deadline.getTime())) {
        return res.status(400).json({ error: "Invalid deadline date" });
      }
    }

    if (typeof task.budget !== "number" || task.budget <= 0) {
      return res.status(400).json({ error: "Invalid budget" });
    }

    task.bidsCount = 0;
    task.bids = [];

    const result = await tasksCollection.insertOne(task);
    res.status(201).json({ insertedId: result.insertedId });
  } catch (error) {
    console.error("Error inserting task:", error);
    res.status(500).json({ error: "Failed to insert task" });
  }
}

app.get("/", (req, res) => {
  res.send("Backend server is running.");
});

export async function getTasks(req, res) {
  try {
    const db = getDB();
    const tasksCollection = db.collection("tasks");
    const limit = parseInt(req.query.limit) || 0;
    let cursor = tasksCollection.find({}).sort({ deadline: 1 });
    if (limit > 0) cursor = cursor.limit(limit);
    const tasks = await cursor.toArray();
    res.json(tasks);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch tasks" });
  }
}

export async function updateBids(req, res) {
  try {
    const db = getDB();
    const tasksCollection = db.collection("tasks");
    const { id } = req.params;
    const { amount } = req.body;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Invalid task ID" });
    }

    if (!amount || isNaN(amount)) {
      return res.status(400).json({ error: "Invalid or missing bid amount" });
    }

    const tokenHeader = req.headers.authorization;
    if (!tokenHeader || !tokenHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Missing or invalid Authorization header" });
    }

    const token = tokenHeader.split(" ")[1];
    const decodedToken = await admin.auth().verifyIdToken(token);
    const bidderEmail = decodedToken.email;
    const bidderName = decodedToken.name || decodedToken.displayName || "Anonymous";

    const newBid = {
      amount: parseFloat(amount),
      date: new Date(),
      bidderEmail,
      bidderName,
    };

    const result = await tasksCollection.findOneAndUpdate(
      { _id: new ObjectId(id) },
      {
        $push: { bids: newBid },
        $inc: { bidsCount: 1 },
      },
      { returnDocument: "after" }
    );

    if (!result.value) {
      return res.status(404).json({ error: "Task not found" });
    }

    res.status(200).json(result.value.bids);
  } catch (error) {
    console.error("Error updating bids:", error);
    res.status(500).json({ error: "Failed to update bids" });
  }
}

export async function updateTask(req, res) {
  try {
    const db = getDB();
    const tasksCollection = db.collection("tasks");
    const { id } = req.params;
    const { title, category, description, deadline, budget } = req.body;

    if (!title || !category || !description || !deadline || !budget) {
      return res.status(400).json({ error: "Missing fields" });
    }

    const deadlineDate = new Date(deadline);
    if (isNaN(deadlineDate.getTime())) {
      return res.status(400).json({ error: "Invalid deadline date" });
    }

    const result = await tasksCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: { title, category, description, deadline: deadlineDate, budget } }
    );

    if (result.modifiedCount === 1) {
      res.json({ message: "Task updated" });
    } else {
      res.status(404).json({ error: "Task not found" });
    }
  } catch (error) {
    res.status(500).json({ error: "Server error" });
  }
}

export async function getMyTasks(req, res) {
  try {
    const db = getDB();
    const tasksCollection = db.collection("tasks");
    const userEmail = req.query.userEmail;

    if (!userEmail) {
      return res.status(400).json({ error: "Missing userEmail" });
    }

    const tasks = await tasksCollection.find({ userEmail }).toArray();
    res.json(tasks);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch user tasks" });
  }
}

export async function deleteTask(req, res) {
  try {
    const db = getDB();
    const tasksCollection = db.collection("tasks");
    const { id } = req.params;

    const result = await tasksCollection.deleteOne({ _id: new ObjectId(id) });

    if (result.deletedCount === 1) {
      res.json({ message: "Task deleted" });
    } else {
      res.status(404).json({ error: "Task not found" });
    }
  } catch (error) {
    res.status(500).json({ error: "Server error" });
  }
}

taskRouter.delete("/", async (req, res) => {
  try {
    const db = getDB();
    const taskCollection = db.collection("tasks");
    const result = await taskCollection.deleteMany({});
    res.status(200).json({ message: "All tasks deleted", deletedCount: result.deletedCount });
  } catch (error) {
    res.status(500).json({ message: "Failed to delete tasks", error });
  }
});
