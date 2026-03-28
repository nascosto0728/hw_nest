import { Request, Response, NextFunction } from 'express';
import * as projectsService from '../services/projects.service';

export async function createProject(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user!.userId;
    const { name } = req.body;
    const result = await projectsService.createProject(userId, name);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
}

export async function getProjects(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user!.userId;
    const projects = await projectsService.getProjectsByOwner(userId);
    res.status(200).json(projects);
  } catch (err) {
    next(err);
  }
}
