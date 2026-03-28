import { Request, Response, NextFunction } from 'express';
import * as tasksService from '../services/tasks.service';

export async function createTask(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user!.userId;
    const { columnId, title, description } = req.body;

    if (!columnId || isNaN(parseInt(columnId, 10))) {
      res.status(400).json({ error: 'columnId is required and must be a number' });
      return;
    }

    const task = await tasksService.createTask(
      parseInt(columnId, 10),
      title,
      description ?? '',
      userId
    );
    res.status(201).json(task);
  } catch (err) {
    next(err);
  }
}

export async function getTasksByBoard(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user!.userId;
    const boardIdStr = req.query.boardId as string;

    if (!boardIdStr || isNaN(parseInt(boardIdStr, 10))) {
      res.status(400).json({ error: 'boardId query parameter is required' });
      return;
    }

    const tasks = await tasksService.getTasksByBoard(parseInt(boardIdStr, 10), userId);
    res.status(200).json(tasks);
  } catch (err) {
    next(err);
  }
}

export async function updateTask(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user!.userId;
    const taskId = parseInt(req.params.id, 10);
    const { title, description } = req.body;

    if (isNaN(taskId)) {
      res.status(400).json({ error: 'Invalid task ID' });
      return;
    }

    const task = await tasksService.updateTask(taskId, title, description ?? '', userId);
    res.status(200).json(task);
  } catch (err) {
    next(err);
  }
}

export async function deleteTask(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user!.userId;
    const taskId = parseInt(req.params.id, 10);

    if (isNaN(taskId)) {
      res.status(400).json({ error: 'Invalid task ID' });
      return;
    }

    await tasksService.deleteTask(taskId, userId);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

export async function moveTask(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user!.userId;
    const taskId = parseInt(req.params.id, 10);
    const { toColumnId, newOrder } = req.body;

    if (isNaN(taskId)) {
      res.status(400).json({ error: 'Invalid task ID' });
      return;
    }

    if (!toColumnId || isNaN(parseInt(toColumnId, 10))) {
      res.status(400).json({ error: 'toColumnId is required and must be a number' });
      return;
    }

    if (newOrder === undefined || isNaN(parseInt(newOrder, 10))) {
      res.status(400).json({ error: 'newOrder is required and must be a number' });
      return;
    }

    const result = await tasksService.moveTask(
      taskId,
      parseInt(toColumnId, 10),
      parseInt(newOrder, 10),
      userId
    );
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}
