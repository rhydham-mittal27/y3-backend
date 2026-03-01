import mongoose from 'mongoose';
import Note from '../models/Note';
import Student from '../models/Student';
import ErrorResponse from '../utils/errorResponse';
import { uploadFileToS3 } from '../services/s3Service';
import { S3_CONFIG } from '../config/s3';

import Option from '../models/Option';
import FinalClass from '../models/FinalClass';

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
// Helper to extract curriculum context from an Option hierarchy
const extractCurriculumFromOption = async (optionId: string | null) => {
  const filter: { boards: string[], grades: string[], subjects: string[] } = { boards: [], grades: [], subjects: [] };
  if (!optionId) return filter;

  let currentId: string | null = optionId;
  while (currentId) {
    const opt: any = await Option.findById(currentId).lean();
    if (!opt) break;
    if (opt.type === 'BOARD') filter.boards.push(String(opt.value));
    if (opt.type === 'GRADE') filter.grades.push(String(opt.value));
    if (opt.type === 'SUBJECT') filter.subjects.push(String(opt.value));
    currentId = opt.parent ? String(opt.parent) : null;
  }
  return filter;
};

// Helper to get virtual folders (Options)
const getVirtualFolders = async (parentId?: string | null, filter?: { boards?: string[], grades?: string[], subjects?: string[] }) => {
  let optionQuery: any = { isActive: true };
  if (parentId) {
    const parentOpt = await Option.findById(parentId).lean();
    optionQuery.parent = new mongoose.Types.ObjectId(parentId);
    
    if (parentOpt) {
      if (parentOpt.type === 'BOARD') {
        optionQuery.value = { $in: filter?.grades || [] };
      } else if (parentOpt.type === 'GRADE') {
        optionQuery.value = { $in: filter?.subjects || [] };
      }
    }
  } else {
    // Root: Show Boards
    optionQuery.parent = null;
    optionQuery.type = 'BOARD';
    optionQuery.value = { $in: filter?.boards || [] };
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

// Helper: gather tutor's class metadata (boards, grades, subjects, classIds)
const getTutorClassMeta = async (tutorUserId: string) => {
  const classDocs = await FinalClass.find({ tutor: new mongoose.Types.ObjectId(tutorUserId) })
    .select('_id board grade subject')
    .lean();

  const classIds: any[] = [];
  const boards = new Set<string>();
  const grades = new Set<string>();
  const subjects = new Set<string>();

  classDocs.forEach((c: any) => {
    if (c._id) classIds.push(c._id);
    if (c.board) boards.add(String(c.board));
    if (c.grade) grades.add(String(c.grade));
    if (Array.isArray(c.subject)) c.subject.forEach((s: any) => subjects.add(String(s)));
    else if (c.subject) subjects.add(String(c.subject));
  });

  return {
    classIds,
    boards: Array.from(boards),
    grades: Array.from(grades),
    subjects: Array.from(subjects),
  };
};

// Tutor-aware virtual folders: restrict Options to the metadata available to tutor
const getVirtualFoldersForTutor = async (tutorUserId: string, parentId?: string | null) => {
  const meta = await getTutorClassMeta(tutorUserId);

  // If no classes, still return empty folders (but tutor-owned files will remain visible)
  let optionQuery: any = { isActive: true };

  if (parentId) {
    // Determine parent option type so we can restrict by tutor's metadata at child level
    const parentOpt = await Option.findById(parentId).lean();
    if (parentOpt) {
      if (parentOpt.type === 'BOARD') {
        optionQuery.value = { $in: meta.grades };
      } else if (parentOpt.type === 'GRADE') {
        optionQuery.value = { $in: meta.subjects };
      }
    }
    optionQuery.parent = new mongoose.Types.ObjectId(parentId);
  } else {
    // Root: Boards limited to tutor's boards
    optionQuery.parent = null;
    optionQuery.type = 'BOARD';
    optionQuery.value = { $in: meta.boards };
  }

  const options = await Option.find(optionQuery).sort({ sortOrder: 1, label: 1 }).lean();
  return options.map((opt: any) => ({
    id: String(opt._id),
    name: opt.label,
    type: 'FOLDER',
    mimeType: null,
    grade: opt.type === 'GRADE' ? opt.value : undefined,
    url: null,
    isVirtual: true,
  }));
};

export const listNotesForStudent = async (studentUserId: string, parentId?: string | null) => {
  if (!mongoose.isValidObjectId(studentUserId)) return [];

  // 1. Fetch Student Metadata (Grade, Board, Subjects from FinalClass)
  const student = await Student.findById(studentUserId).select('grade finalClass').lean();
  if (!student) return [];

  const studentFilter: { boards: string[], grades: string[], subjects: string[] } = {
    boards: [],
    grades: student.grade ? [student.grade] : [],
    subjects: []
  };

  if (student.finalClass) {
    const finalClass = await FinalClass.findById(student.finalClass).select('board subject').lean();
    if (finalClass) {
      if (finalClass.board) studentFilter.boards.push(String(finalClass.board));
      if (Array.isArray(finalClass.subject)) {
        finalClass.subject.forEach((s: any) => studentFilter.subjects.push(String(s)));
      } else if (finalClass.subject) {
        studentFilter.subjects.push(String(finalClass.subject));
      }
    }
  }

  // 2. Fetch Virtual Folders (Restricted Navigation)
  const virtualFolders = await getVirtualFolders(parentId, studentFilter);

  // 3. Fetch Physical Notes
  const query: any = {};
  
  // Check if parentId is a physical folder or virtual folder
  if (parentId) {
    const parentIsOption = await Option.exists({ _id: parentId });
    if (parentIsOption) {
      query.parent = null; 
      
      const pathFilter = await extractCurriculumFromOption(parentId);
      if (pathFilter.boards.length > 0) query.board = { $in: pathFilter.boards };
      if (pathFilter.grades.length > 0) query.grade = { $in: pathFilter.grades };
      if (pathFilter.subjects.length > 0) query.subject = { $in: pathFilter.subjects };
    } else {
      query.parent = new mongoose.Types.ObjectId(parentId);
    }
  } else {
    // Root level: students only see virtual Board folders.
    return [...virtualFolders];
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

export const listNotesForParent = async (parentUserId: string, parentId?: string | null) => {
  if (!mongoose.isValidObjectId(parentUserId)) return [];

  // 1. Fetch Metadata for all students linked to this Parent
  const User = mongoose.model('User');
  const ClassLead = mongoose.model('ClassLead');

  const user = await User.findById(parentUserId).select('phone email').lean() as any;
  if (!user) return [];

  const leadQuery: any = { $or: [] };
  if (user.phone) leadQuery.$or.push({ parentPhone: user.phone });
  if (user.email) leadQuery.$or.push({ parentEmail: user.email });
  
  if (leadQuery.$or.length === 0) return [];

  const leads = await ClassLead.find(leadQuery).select('_id').lean();
  const leadIds = leads.map((l: any) => l._id);

  const students = await Student.find({ classLead: { $in: leadIds } }).select('grade finalClass').lean();
  
  const boardsSet = new Set<string>();
  const gradesSet = new Set<string>();
  const subjectsSet = new Set<string>();

  for (const s of students) {
    if (s.grade) gradesSet.add(s.grade);
    if (s.finalClass) {
      const fc = await FinalClass.findById(s.finalClass).select('board subject').lean();
      if (fc) {
        if (fc.board) boardsSet.add(String(fc.board));
        if (Array.isArray(fc.subject)) fc.subject.forEach((sub: any) => subjectsSet.add(String(sub)));
        else if (fc.subject) subjectsSet.add(String(fc.subject));
      }
    }
  }

  const parentFilter = {
    boards: Array.from(boardsSet),
    grades: Array.from(gradesSet),
    subjects: Array.from(subjectsSet)
  };

  // 2. Virtual Folders
  const virtualFolders = await getVirtualFolders(parentId, parentFilter);

  // 3. Physical Notes
  const query: any = {};
  if (parentId) {
    const parentIsOption = await Option.exists({ _id: parentId });
    if (parentIsOption) {
      query.parent = null;
      const pathFilter = await extractCurriculumFromOption(parentId);
      if (pathFilter.boards.length > 0) query.board = { $in: pathFilter.boards };
      if (pathFilter.grades.length > 0) query.grade = { $in: pathFilter.grades };
      if (pathFilter.subjects.length > 0) query.subject = { $in: pathFilter.subjects };
    } else {
      query.parent = new mongoose.Types.ObjectId(parentId);
    }
  } else {
    // Root level: parents ONLY see virtual Board folders.
    return [...virtualFolders];
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

export const listNotesForTutor = async (tutorUserId: string, parentId?: string | null) => {
  if (!mongoose.isValidObjectId(tutorUserId)) return [];

  // 1. Tutor-aware Virtual Folders
  const virtualFolders = await getVirtualFoldersForTutor(tutorUserId, parentId);

  // 2. Physical Notes
  const query: any = {};
  
  if (parentId) {
    const parentIsOption = await Option.exists({ _id: parentId });
    if (parentIsOption) {
      // Inside a virtual folder (Board/Grade/Subject)
      // We show physical notes that match the current curriculum context
      query.parent = null; 
      const pathFilter = await extractCurriculumFromOption(parentId);
      
      // Notes MUST match the virtual folder's board, grade, or subject
      const conditions: any[] = [];
      if (pathFilter.boards.length > 0) conditions.push({ board: { $in: pathFilter.boards } });
      if (pathFilter.grades.length > 0) conditions.push({ grade: { $in: pathFilter.grades } });
      if (pathFilter.subjects.length > 0) conditions.push({ subject: { $in: pathFilter.subjects } });
      
      if (conditions.length > 0) {
        query.$or = conditions;
      } else {
        // If it's a virtual folder but has no curriculum tags somehow
        return [...virtualFolders];
      }
    } else {
      // Inside a physical folder created by the tutor
      query.parent = new mongoose.Types.ObjectId(parentId);
    }
  } else {
    // At root of "My Notes"
    // Tutors should only see notes they own and are at the root
    query.parent = null;
    query.owner = new mongoose.Types.ObjectId(tutorUserId);
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

export const uploadNoteFile = async (ownerId: string, file: any, metadata: { parentId?: string | null, grade?: string | null, board?: string | null, subject?: string | null }) => {
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
    parent: metadata.parentId ? new mongoose.Types.ObjectId(metadata.parentId) : null,
    grade: metadata.grade || undefined,
    board: metadata.board || undefined,
    subject: metadata.subject || undefined,
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
