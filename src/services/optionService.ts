import Option from '../models/Option';
import ErrorResponse from '../utils/errorResponse';

export const getOptionsByType = async (type: string, activeOnly = true) => {
  if (!type || !type.trim()) {
    throw new ErrorResponse('Option type is required', 400);
  }

  const query: any = { type: type.trim().toUpperCase() };
  if (activeOnly) {
    query.isActive = true;
  }

  const options = await Option.find(query).sort({ sortOrder: 1, label: 1 });
  return options;
};

export const createOption = async (params: { type: string; label: string; value?: string; sortOrder?: number }) => {
  const { type, label } = params;
  let { value, sortOrder } = params;

  if (!type || !type.trim()) throw new ErrorResponse('Option type is required', 400);
  if (!label || !label.trim()) throw new ErrorResponse('Option label is required', 400);

  const normalizedType = type.trim().toUpperCase();
  const normalizedLabel = label.trim();
  const normalizedValue = (value && value.trim()) || normalizedLabel;

  const existing = await Option.findOne({ type: normalizedType, value: normalizedValue });
  if (existing) {
    throw new ErrorResponse('Option with this type and value already exists', 409);
  }

  if (typeof sortOrder !== 'number') sortOrder = 0;

  const option = await Option.create({
    type: normalizedType,
    label: normalizedLabel,
    value: normalizedValue,
    sortOrder,
  });

  return option;
};

export const updateOption = async (
  id: string,
  updates: Partial<{ label: string; value: string; isActive: boolean; sortOrder: number }>
) => {
  const option = await Option.findById(id);
  if (!option) throw new ErrorResponse('Option not found', 404);

  if (updates.label !== undefined) option.label = updates.label.trim();
  if (updates.value !== undefined) option.value = updates.value.trim();
  if (updates.isActive !== undefined) option.isActive = updates.isActive;
  if (updates.sortOrder !== undefined) option.sortOrder = updates.sortOrder;

  await option.save();
  return option;
};

export const deleteOption = async (id: string) => {
  const option = await Option.findById(id);
  if (!option) throw new ErrorResponse('Option not found', 404);

  await Option.findByIdAndDelete(id);
  return { success: true };
};

export const getDistinctOptionTypes = async (): Promise<string[]> => {
  const types = await Option.distinct('type');
  return types.map((t) => String(t));
};
