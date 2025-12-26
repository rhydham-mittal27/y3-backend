import { Request, Response, NextFunction } from 'express';
import asyncHandler from '../utils/asyncHandler';
import { createSubject, getAllSubjects } from '../services/subjectService';

export const getSubjectsController = asyncHandler(async (_req: Request, res: Response) => {
  const subjects = await getAllSubjects(true);
  return res.status(200).json({ success: true, data: subjects });
});

export const createSubjectController = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
  const { name, code } = req.body || {};
  const subject = await createSubject({ name, code });
  return res.status(201).json({ success: true, data: subject });
});
