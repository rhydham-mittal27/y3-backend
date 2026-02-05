import mongoose from 'mongoose';
import Note from '../models/Note';
import Student from '../models/Student';
import ErrorResponse from '../utils/errorResponse';
import { uploadFileToS3 } from '../services/s3Service';
import { S3_CONFIG } from '../config/s3';

import Option from '../models/Option';

export const listNotes = async (ownerId: string, parentId?: string | null) => {
  // 1. Fetch Notes (Files & Custom Folders)
  const noteQuery: any = { owner: new mongoose.Types.ObjectId(ownerId) };
  if (parentId) {
    noteQuery.parent = new mongoose.Types.ObjectId(parentId);
  } else {
    noteQuery.parent = null;
  }
  const notes = await Note.find(noteQuery).sort({ type: -1, name: 1 }).lean();

  // 2. Fetch Dynamic Options (Virtual Folders)
  let optionQuery: any = { isActive: true };
  if (parentId) {
    optionQuery.parent = new mongoose.Types.ObjectId(parentId);
  } else {
    // At root, only show Boards to start the hierarchy
    optionQuery.parent = null;
    optionQuery.type = 'BOARD'; 
  }
  
  // Sort options by sortOrder or label
  const options = await Option.find(optionQuery).sort({ sortOrder: 1, label: 1 }).lean();

  // 3. Map Options to NoteItem format
  const virtualFolders = options.map((opt: any) => ({
    id: String(opt._id),
    name: opt.label, // Use label (e.g. "CBSE", "Class 10") as folder name
    type: 'FOLDER',
    mimeType: null,
    grade: opt.type === 'GRADE' ? opt.value : undefined, // Optional metadata
    url: null,
    isVirtual: true // Flag to indicate it's from Options (optional usage)
  }));

  const physicalNotes = notes.map((n: any) => ({
    id: String(n._id),
    name: n.name,
    type: n.type,
    mimeType: n.mimeType,
    grade: n.grade,
    url: n.url,
  }));

  // Return combined list (Folders first)
  return [...virtualFolders, ...physicalNotes];
};

// ----------------------------------------------------------------------
// Helper to get virtual folders (Options)
const getVirtualFolders = async (parentId?: string | null) => {
  let optionQuery: any = { isActive: true };
  if (parentId) {
    optionQuery.parent = new mongoose.Types.ObjectId(parentId);
  } else {
    // Root: Show Boards
    optionQuery.parent = null;
    optionQuery.type = 'BOARD';
  }
  const options = await Option.find(optionQuery).sort({ sortOrder: 1, label: 1 }).lean();
  return options.map((opt: any) => ({
    id: String(opt._id),
    name: opt.label,
    type: 'FOLDER',
    mimeType: null,
    grade: opt.type === 'GRADE' ? opt.value : undefined,
    url: null,
    isVirtual: true
  }));
};

export const listNotesForStudent = async (studentUserId: string, parentId?: string | null) => {
  if (!mongoose.isValidObjectId(studentUserId)) return [];

  // 1. Fetch Virtual Folders (Options) - Navigation
  const virtualFolders = await getVirtualFolders(parentId);

  // 2. Fetch Physical Notes
  // If we are inside an Option folder (parentId exists), we fetch notes linked to it
  // If we are at root, we assume no generic notes for students unless specific 'global' logic exists (skipping for now)
  
  const query: any = {};
  if (parentId) {
    query.parent = new mongoose.Types.ObjectId(parentId);
  } else {
    // At root, students usually shouldn't see loose files, only Boards
    query.parent = null;
    // We can add logic here if students have private root files, but for 'Curriculum' drive, root is empty of files
    // But let's allow it if they exist
  }

  // Optional: Restrict physical notes by Student Grade? 
  // If we navigate hierarchy, the hierarchy ensures correctness.
  // But if there are loose files, we might check.
  // For matching existing behavior:
  const student = await Student.findById(studentUserId).select('grade').lean();
  if (student?.grade) {
     // query.grade = student.grade; // Only if 'grade' field is populated on Notes
     // Since new hierarchy relies on 'parent', we might relax this for hierarchy nodes
     // BUT, for loose files (legacy), keep it? 
     // Let's rely on 'parent' for structure.
  }

  const notes = await Note.find(query).sort({ type: -1, name: 1 }).lean();

  const physicalNotes = notes.map((n: any) => ({
    id: String(n._id),
    name: n.name,
    type: n.type,
    mimeType: n.mimeType,
    grade: n.grade,
    url: n.url,
  }));

  return [...virtualFolders, ...physicalNotes];
};

export const listNotesForParent = async (_parentUserId: string, parentId?: string | null) => {
  // 1. Virtual Folders
  const virtualFolders = await getVirtualFolders(parentId);

  // 2. Physical Notes
  const query: any = {};
  if (parentId) {
    query.parent = new mongoose.Types.ObjectId(parentId);
  } else {
    query.parent = null;
  }

  const notes = await Note.find(query).sort({ type: -1, name: 1 }).lean();
  
  const physicalNotes = notes.map((n: any) => ({
    id: String(n._id),
    name: n.name,
    type: n.type,
    mimeType: n.mimeType,
    grade: n.grade,
    url: n.url,
  }));

  return [...virtualFolders, ...physicalNotes];
};

export const createFolder = async (ownerId: string, name: string, parentId?: string | null, grade?: string | null) => {
  const payload: any = {
    owner: new mongoose.Types.ObjectId(ownerId),
    name,
    type: 'FOLDER',
    parent: parentId ? new mongoose.Types.ObjectId(parentId) : null,
    grade: grade || undefined,
  };
  const folder = await Note.create(payload);
  return {
    id: String(folder._id),
    name: folder.name,
    type: folder.type,
    grade: folder.grade,
  };
};

export const uploadNoteFile = async (ownerId: string, file: any, parentId?: string | null, _grade?: string | null) => {
  if (!file || !file.buffer) {
    throw new ErrorResponse('Invalid file upload', 400);
  }

  const buffer: Buffer = file.buffer;
  const originalname: string = file.originalname || 'note';
  const mimetype: string = file.mimetype || 'application/octet-stream';

  let uploadResult: { key: string; url: string; bucket: string };
  try {
    uploadResult = await uploadFileToS3(
      buffer,
      originalname,
      mimetype,
      S3_CONFIG.FOLDERS.NOTES
    );
  } catch (err: any) {
    throw new ErrorResponse('Failed to upload note file to storage', 500);
  }

  const note = await Note.create({
    owner: new mongoose.Types.ObjectId(ownerId),
    name: originalname,
    type: 'FILE',
    parent: parentId ? new mongoose.Types.ObjectId(parentId) : null,
    mimeType: mimetype,
    url: uploadResult.url,
    s3Key: uploadResult.key,
  } as any);

  return {
    id: String(note._id),
    name: note.name,
    type: note.type,
    mimeType: note.mimeType,
    grade: note.grade,
    url: note.url,
  };
};
