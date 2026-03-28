import { Request, Response, NextFunction } from 'express';
import * as boardsService from '../services/boards.service';

export async function getBoard(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user!.userId;
    const boardId = parseInt(req.params.id, 10);

    if (isNaN(boardId)) {
      res.status(400).json({ error: 'Invalid board ID' });
      return;
    }

    const board = await boardsService.getBoardNested(boardId, userId);
    res.status(200).json(board);
  } catch (err) {
    next(err);
  }
}
