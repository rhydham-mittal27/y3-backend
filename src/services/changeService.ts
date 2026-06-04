import mongoose from 'mongoose';
import Change from '../models/Change';
import { CHANGE_ACTION } from '../config/constants';

export interface LogChangeParams {
  /** Which MongoDB collection was mutated (e.g. 'ClassLead', 'Payment') */
  collection: string;
  /** _id of the document that was mutated */
  documentId: string;
  /** Human-readable identifier (e.g. student name, payment amount) */
  documentRef?: string;
  /** Type of mutation */
  action: CHANGE_ACTION;
  /** Snapshot of relevant fields BEFORE the change */
  before?: Record<string, any>;
  /** Snapshot of relevant fields AFTER the change */
  after?: Record<string, any>;
  /** userId of the actor */
  changedBy: string;
  /** Role of the actor */
  changedByRole?: string;
  /** Optional free-text reason (e.g. rejection reason) */
  reason?: string;
  /** Optional link to a parent/related entity */
  relatedTo?: { collection: string; documentId: string };
}

/**
 * Computes which top-level keys differ between two plain objects.
 * Returns an empty array when both are absent.
 */
export const diffFields = (
  before?: Record<string, any>,
  after?: Record<string, any>
): string[] => {
  const keys = new Set([
    ...Object.keys(before || {}),
    ...Object.keys(after || {}),
  ]);

  const changed: string[] = [];
  for (const key of keys) {
    const bVal = JSON.stringify((before || {})[key] ?? null);
    const aVal = JSON.stringify((after || {})[key] ?? null);
    if (bVal !== aVal) changed.push(key);
  }
  return changed;
};

/**
 * Logs a single change record to the Changes collection.
 *
 * Always fire-and-forget — wrapped in try/catch so it NEVER throws
 * and breaks the caller's main business logic.
 */
export const logChange = async (params: LogChangeParams): Promise<void> => {
  try {
    const {
      collection,
      documentId,
      documentRef,
      action,
      before,
      after,
      changedBy,
      changedByRole,
      reason,
      relatedTo,
    } = params;

    const changedFields = diffFields(before, after);

    await Change.create({
      collection,
      documentId: new mongoose.Types.ObjectId(documentId),
      documentRef,
      action,
      changedFields,
      before: before ?? undefined,
      after: after ?? undefined,
      changedBy: new mongoose.Types.ObjectId(changedBy),
      changedByRole,
      reason,
      relatedTo: relatedTo
        ? {
            collection: relatedTo.collection,
            documentId: new mongoose.Types.ObjectId(relatedTo.documentId),
          }
        : undefined,
      timestamp: new Date(),
    });
  } catch (err) {
    // Intentionally swallowed — audit logging must never disrupt business logic
    console.error('[changeService] Failed to log change:', err);
  }
};

// ---------------------------------------------------------------------------
// Query helpers (used by the read-only API)
// ---------------------------------------------------------------------------

export const getChanges = async (params: {
  page: number;
  limit: number;
  collection?: string;
  documentId?: string;
  changedBy?: string;
  action?: string;
  fromDate?: Date;
  toDate?: Date;
}) => {
  const { page, limit, collection, documentId, changedBy, action, fromDate, toDate } = params;

  const query: any = {};
  if (collection) query.collection = collection;
  if (documentId && mongoose.isValidObjectId(documentId))
    query.documentId = new mongoose.Types.ObjectId(documentId);
  if (changedBy && mongoose.isValidObjectId(changedBy))
    query.changedBy = new mongoose.Types.ObjectId(changedBy);
  if (action) query.action = action;
  if (fromDate || toDate) {
    query.timestamp = {};
    if (fromDate) query.timestamp.$gte = fromDate;
    if (toDate) query.timestamp.$lte = toDate;
  }

  const skip = (page - 1) * limit;

  const [changes, total] = await Promise.all([
    Change.find(query)
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(limit)
      .populate('changedBy', 'name email role'),
    Change.countDocuments(query),
  ]);

  return { changes, total, page, limit };
};

export const getChangeById = async (id: string) => {
  const change = await Change.findById(id).populate('changedBy', 'name email role');
  return change;
};

export const getDocumentHistory = async (collection: string, documentId: string) => {
  if (!mongoose.isValidObjectId(documentId)) return [];
  return Change.find({
    collection,
    documentId: new mongoose.Types.ObjectId(documentId),
  })
    .sort({ timestamp: -1 })
    .populate('changedBy', 'name email role');
};

export default {
  logChange,
  diffFields,
  getChanges,
  getChangeById,
  getDocumentHistory,
};
