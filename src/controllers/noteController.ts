import { Response } from 'express';
import { validationResult } from 'express-validator';
import asyncHandler from '../utils/asyncHandler';
import ErrorResponse from '../utils/errorResponse';
import { successResponse } from '../utils/responseFormatter';
import { AuthRequest } from '../types';
import { listNotes, listNotesForParent, listNotesForTutor, createFolder, uploadNoteFile } from '../services/noteService';

export const getNotesController = asyncHandler(async (req: AuthRequest, res: Response) => {
  const ownerId = String(req.user!.id);
  const parentIdRaw = (req.query.parentId as string) || '';
  const parentId = parentIdRaw && parentIdRaw.trim().length > 0 ? parentIdRaw.trim() : null;
  const items = await listNotes(ownerId, parentId);
  return res.json(successResponse(items));
});

export const getTutorNotesController = asyncHandler(async (req: AuthRequest, res: Response) => {
  const ownerId = String(req.user!.id);
  const parentIdRaw = (req.query.parentId as string) || '';
  const parentId = parentIdRaw && parentIdRaw.trim().length > 0 ? parentIdRaw.trim() : null;
  const items = await listNotesForTutor(ownerId, parentId);
  return res.json(successResponse(items));
});


export const getParentNotesController = asyncHandler(async (req: AuthRequest, res: Response) => {
  const parentUserId = String(req.user!.id);
  const parentIdRaw = (req.query.parentId as string) || '';
  const parentId = parentIdRaw && parentIdRaw.trim().length > 0 ? parentIdRaw.trim() : null;
  const items = await listNotesForParent(parentUserId, parentId);
  return res.json(successResponse(items));
});

export const createFolderController = asyncHandler(async (req: AuthRequest, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) throw new ErrorResponse(errors.array()[0].msg, 400);

  const ownerId = String(req.user!.id);
  const { name, parentId, grade } = req.body as { name: string; parentId?: string | null; grade?: string | null };
  const folder = await createFolder(ownerId, name, parentId || null, grade ?? null);
  return res.status(201).json(successResponse(folder, 'Folder created'));
});

export const uploadNoteFileController = asyncHandler(async (req: AuthRequest, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) throw new ErrorResponse(errors.array()[0].msg, 400);

  const ownerId = String(req.user!.id);
  const parentId = (req.body.parentId as string) || null;
  const grade = (req.body.grade as string) || null;
  const board = (req.body.board as string) || null;
  const subject = (req.body.subject as string) || null;
  const file = (req as any).file as any | undefined;
  if (!file) throw new ErrorResponse('No file uploaded', 400);

  const note = await uploadNoteFile(ownerId, file, { parentId, grade, board, subject });
  return res.status(201).json(successResponse(note, 'File uploaded'));
});
