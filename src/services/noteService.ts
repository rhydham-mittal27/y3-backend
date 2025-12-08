import mongoose from 'mongoose';
import Note from '../models/Note';
import FinalClass from '../models/FinalClass';
import Student from '../models/Student';
import ErrorResponse from '../utils/errorResponse';
import cloudinary, { CLOUDINARY_FOLDER } from '../config/cloudinary';

export const listNotes = async (ownerId: string, parentId?: string | null) => {
  const query: any = { owner: new mongoose.Types.ObjectId(ownerId) };
  if (parentId) {
    query.parent = new mongoose.Types.ObjectId(parentId);
  } else {
    query.parent = null;
  }

  const notes = await Note.find(query).sort({ type: -1, name: 1 }).lean();

  return notes.map((n: any) => ({
    id: String(n._id),
    name: n.name,
    type: n.type,
    mimeType: n.mimeType,
    grade: n.grade,
    url: n.url,
  }));
};

export const listNotesForStudent = async (studentUserId: string, parentId?: string | null) => {
  if (!mongoose.isValidObjectId(studentUserId)) {
    return [];
  }

  const student = await Student.findById(studentUserId).select('grade').lean();
  if (!student || !student.grade) {
    return [];
  }

  const query: any = {
    grade: student.grade,
  };

  if (parentId) {
    query.parent = new mongoose.Types.ObjectId(parentId);
  } else {
    query.parent = null;
  }

  const notes = await Note.find(query).sort({ type: -1, name: 1 }).lean();

  return notes.map((n: any) => ({
    id: String(n._id),
    name: n.name,
    type: n.type,
    mimeType: n.mimeType,
    grade: n.grade,
    url: n.url,
  }));
};

export const listNotesForParent = async (parentUserId: string, parentId?: string | null) => {
  // Find all final classes linked to this parent to derive allowed grades
  const classes = await FinalClass.find({ parent: new mongoose.Types.ObjectId(parentUserId) })
    .select('grade')
    .lean();

  const grades = Array.from(new Set(classes.map((c: any) => c.grade).filter(Boolean)));
  if (grades.length === 0) {
    return [];
  }

  const query: any = {
    grade: { $in: grades },
  };

  if (parentId) {
    query.parent = new mongoose.Types.ObjectId(parentId);
  } else {
    query.parent = null;
  }

  const notes = await Note.find(query).sort({ type: -1, name: 1 }).lean();

  return notes.map((n: any) => ({
    id: String(n._id),
    name: n.name,
    type: n.type,
    mimeType: n.mimeType,
    grade: n.grade,
    url: n.url,
  }));
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

  let uploadResult: any;
  try {
    uploadResult = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder: CLOUDINARY_FOLDER,
          resource_type: 'auto',
          filename_override: originalname,
          use_filename: true,
          unique_filename: true,
        },
        (error: any, result: any) => {
          if (error) return reject(error);
          return resolve(result);
        }
      );
      stream.end(buffer);
    });
  } catch (err: any) {
    throw new ErrorResponse('Failed to upload note file to storage', 500);
  }

  const note = await Note.create({
    owner: new mongoose.Types.ObjectId(ownerId),
    name: originalname,
    type: 'FILE',
    parent: parentId ? new mongoose.Types.ObjectId(parentId) : null,
    mimeType: uploadResult.resource_type === 'raw' ? file.mimetype : uploadResult.resource_type,
    url: uploadResult.secure_url,
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
