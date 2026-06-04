import { Request, Response, NextFunction } from 'express';
import { getChanges, getChangeById, getDocumentHistory } from '../services/changeService';
import ErrorResponse from '../utils/errorResponse';

/**
 * GET /api/changes
 * Query params: collection, documentId, changedBy, action, fromDate, toDate, page, limit
 */
export const listChanges = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = Math.max(1, parseInt(String(req.query.page || '1')));
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit || '20'))));

    const fromDate = req.query.fromDate ? new Date(String(req.query.fromDate)) : undefined;
    const toDate = req.query.toDate ? new Date(String(req.query.toDate)) : undefined;

    const result = await getChanges({
      page,
      limit,
      collection: req.query.collection ? String(req.query.collection) : undefined,
      documentId: req.query.documentId ? String(req.query.documentId) : undefined,
      changedBy: req.query.changedBy ? String(req.query.changedBy) : undefined,
      action: req.query.action ? String(req.query.action) : undefined,
      fromDate,
      toDate,
    });

    return res.status(200).json({
      success: true,
      ...result,
    });
  } catch (err) {
    return next(err);
  }
};

/**
 * GET /api/changes/:id
 */
export const getChange = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const change = await getChangeById(req.params.id);
    if (!change) return next(new ErrorResponse('Change record not found', 404));
    return res.status(200).json({ success: true, data: change });
  } catch (err) {
    return next(err);
  }
};

/**
 * GET /api/changes/document/:collection/:documentId
 * Returns full history for a specific document
 */
export const getDocumentChangeHistory = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { collection, documentId } = req.params;
    const history = await getDocumentHistory(collection, documentId);
    return res.status(200).json({ success: true, data: history, total: history.length });
  } catch (err) {
    return next(err);
  }
};

export default { listChanges, getChange, getDocumentChangeHistory };
