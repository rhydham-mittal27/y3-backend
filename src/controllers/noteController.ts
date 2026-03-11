import { Response } from 'express';
import { validationResult } from 'express-validator';
import asyncHandler from '../utils/asyncHandler';
import ErrorResponse from '../utils/errorResponse';
import { successResponse } from '../utils/responseFormatter';
import { AuthRequest } from '../types';
import { listNotes, listNotesForParent, listNotesForTutor, createFolder, uploadNoteFile } from '../services/noteService';
import Note from '../models/Note';
import { getObjectFromS3 } from '../services/s3Service';

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

export const downloadNoteFileController = asyncHandler(async (req: AuthRequest, res: Response) => {
  const noteId = String(req.params.id);
  const note: any = await Note.findById(noteId).lean();
  if (!note) throw new ErrorResponse('Note not found', 404);
  if (note.type !== 'FILE') throw new ErrorResponse('Not a file', 400);

  const key = (note.s3Key || note.url || '').toString();
  if (!key) throw new ErrorResponse('File key missing', 400);

  const obj: any = await getObjectFromS3(key);
  const contentType = obj?.ContentType || note.mimeType || 'application/octet-stream';
  const filename = note.name || 'file';

  res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(filename)}"`);

  const body: any = obj?.Body;
  if (body && typeof body.pipe === 'function') {
    body.pipe(res);
    return;
  }

  // Fallback for non-stream body types
  const chunks: Buffer[] = [];
  for await (const chunk of body as AsyncIterable<Buffer>) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  res.send(Buffer.concat(chunks));
});
