import { Request, Response, NextFunction } from 'express';
import asyncHandler from '../utils/asyncHandler';
import { createOption, deleteOption, getOptionsByType, updateOption, getDistinctOptionTypes } from '../services/optionService';

export const getOptionsController = asyncHandler(async (req: Request, res: Response) => {
  const { type } = req.params;
  const options = await getOptionsByType(String(type), true);
  return res.status(200).json({ success: true, data: options });
});

export const createOptionController = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
  const { type, label, value, sortOrder } = req.body || {};
  const option = await createOption({ type, label, value, sortOrder });
  return res.status(201).json({ success: true, data: option });
});

export const updateOptionController = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const option = await updateOption(String(id), req.body || {});
  return res.status(200).json({ success: true, data: option });
});

export const deleteOptionController = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const result = await deleteOption(String(id));
  return res.status(200).json(result);
});

export const getOptionTypesController = asyncHandler(async (_req: Request, res: Response) => {
  const types = await getDistinctOptionTypes();
  return res.status(200).json({ success: true, data: types });
});
