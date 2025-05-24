import express from "express";
import {
  addTask,
  getTasks,
  updateBids,
  updateTask,
  getMyTasks,
  deleteTask,
  getTaskById, // 👈 Make sure this is implemented in controller
} from "../controllers/taskController.js";



const router = express.Router();

// POST /tasks - Add a new task
router.post("/", addTask);

// GET /tasks - Get all tasks
router.get("/", getTasks);

// GET /tasks/:id - Get task by ID (useful for TaskDetails)
router.get("/:id", getTaskById); // 👈 Add this route

// PATCH /tasks/:id/bids - Place a bid
router.patch("/:id/bids", updateBids);

app.post("/tasks", authMiddleware, async (req, res) => {
  const task = req.body;
  task.userEmail = req.userEmail;

  // Continue as usual...
});


// PUT /tasks/:id - Update task
router.put("/:id", updateTask);

// GET /tasks/my-tasks - Get tasks by user
router.get("/my-tasks", getMyTasks);

// DELETE /tasks/:id - Delete task
router.delete("/:id", deleteTask);

export default router;
