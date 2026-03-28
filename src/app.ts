import express from 'express';
import { authMiddleware } from './middleware/auth.middleware';
import { errorMiddleware } from './middleware/error.middleware';

// Controllers
import * as authController from './controllers/auth.controller';
import * as projectsController from './controllers/projects.controller';
import * as boardsController from './controllers/boards.controller';
import * as columnsController from './controllers/columns.controller';
import * as tasksController from './controllers/tasks.controller';

const app = express();

// ─── Global Middleware ─────────────────────────────────────────────────────────
app.use(express.json());

// ─── Auth Routes (no auth required) ───────────────────────────────────────────
app.post('/auth/register', authController.register);
app.post('/auth/login', authController.login);

// ─── Protected Routes ─────────────────────────────────────────────────────────
app.use(authMiddleware);

// Projects
app.post('/projects', projectsController.createProject);
app.get('/projects', projectsController.getProjects);

// Boards
app.get('/boards/:id', boardsController.getBoard);

// Columns
app.post('/columns', columnsController.createColumn);
app.put('/columns/:id', columnsController.updateColumn);
app.delete('/columns/:id', columnsController.deleteColumn);

// Tasks
app.post('/tasks', tasksController.createTask);
app.get('/tasks', tasksController.getTasksByBoard);
app.put('/tasks/:id', tasksController.updateTask);
app.delete('/tasks/:id', tasksController.deleteTask);
app.patch('/tasks/:id/move', tasksController.moveTask);

// ─── Error Handling ────────────────────────────────────────────────────────────
app.use(errorMiddleware);

export default app;
