import { Request, Response, NextFunction } from 'express';
import * as columnsService from '../services/columns.service';

export async function createColumn(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user!.userId;
    const { boardId, name } = req.body;

    if (!boardId || isNaN(parseInt(boardId, 10))) {
      res.status(400).json({ error: 'boardId is required and must be a number' });
      return;
    }

    const column = await columnsService.createColumn(parseInt(boardId, 10), name, userId);
    res.status(201).json(column);
  } catch (err) {
    next(err);
  }
}

export async function updateColumn(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user!.userId;
    const columnId = parseInt(req.params.id, 10);
    const { name } = req.body;

    if (isNaN(columnId)) {
      res.status(400).json({ error: 'Invalid column ID' });
      return;
    }

    const column = await columnsService.updateColumn(columnId, name, userId);
    res.status(200).json(column);
  } catch (err) {
    next(err);
  }
}

export async function deleteColumn(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user!.userId;
    const columnId = parseInt(req.params.id, 10);

    if (isNaN(columnId)) {
      res.status(400).json({ error: 'Invalid column ID' });
      return;
    }

    await columnsService.deleteColumn(columnId, userId);
    res.status(200).json({ message: 'Column deleted' });
  } catch (err) {
    next(err);
  }
}
