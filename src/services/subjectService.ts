import Subject from '../models/Subject';
import ErrorResponse from '../utils/errorResponse';

export const getAllSubjects = async (activeOnly = true) => {
  const query: any = {};
  if (activeOnly) {
    query.isActive = true;
  }
  const subjects = await Subject.find(query).sort({ name: 1 });
  return subjects;
};

export const createSubject = async (params: { name: string; code?: string }) => {
  const { name, code } = params;
  if (!name || !name.trim()) {
    throw new ErrorResponse('Subject name is required', 400);
  }

  const existing = await Subject.findOne({ name: name.trim() });
  if (existing) {
    throw new ErrorResponse('Subject with this name already exists', 409);
  }

  const subject = await Subject.create({ name: name.trim(), code: code?.trim() || undefined });
  return subject;
};
