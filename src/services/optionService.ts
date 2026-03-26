import Option from '../models/Option';
import ErrorResponse from '../utils/errorResponse';

export const getOptionsByType = async (type: string, activeOnly = true, parentId?: string) => {
  if (!type || !type.trim()) {
    throw new ErrorResponse('Option type is required', 400);
  }

  const query: any = { type: type.trim().toUpperCase() };
  if (activeOnly) {
    query.isActive = true;
  }
  if (parentId) {
    query.parent = parentId;
  }

  const options = await Option.find(query)
    .populate('parent', 'label value type')
    .sort({ sortOrder: 1, label: 1 });
  return options;
};

export const createOption = async (params: { 
  type: string; 
  label: string; 
  value?: string; 
  sortOrder?: number; 
  parent?: string;
  metadata?: Record<string, any>;
}) => {
  const { type, label, metadata } = params;
  let { value, sortOrder, parent } = params;

  if (!type || !type.trim()) throw new ErrorResponse('Option type is required', 400);
  if (!label || !label.trim()) throw new ErrorResponse('Option label is required', 400);

  const normalizedType = type.trim().toUpperCase();
  const normalizedLabel = label.trim();
  const normalizedValue = (value && value.trim()) || normalizedLabel.toUpperCase().replace(/\s+/g, '_');

  const existing = await Option.findOne({ type: normalizedType, value: normalizedValue, parent: parent || null });
  if (existing) {
    throw new ErrorResponse('Option with this type, value, and parent already exists', 409);
  }

  if (typeof sortOrder !== 'number') sortOrder = 0;

  if (sortOrder > 0) {
    // If creating a new item with a specific sort order, find any conflict and push it to 0
    const conflict = await Option.findOne({ type: normalizedType, parent: parent || null, sortOrder });
    if (conflict) {
      conflict.sortOrder = 0;
      await conflict.save();
    }
  }

  const option = await Option.create({
    type: normalizedType,
    label: normalizedLabel,
    value: normalizedValue,
    parent: parent || null,
    sortOrder,
    metadata: metadata || {},
  });

  return option;
};

export const updateOption = async (
  id: string,
  updates: Partial<{ label: string; value: string; isActive: boolean; sortOrder: number; parent: string; metadata: Record<string, any> }>
) => {
  const option = await Option.findById(id);
  if (!option) throw new ErrorResponse('Option not found', 404);

  const oldSortOrder = option.sortOrder || 0;

  if (updates.label !== undefined) option.label = updates.label.trim();
  if (updates.value !== undefined) option.value = updates.value.trim();
  if (updates.isActive !== undefined) option.isActive = updates.isActive;
  if (updates.parent !== undefined) option.parent = updates.parent as any;
  if (updates.metadata !== undefined) option.metadata = updates.metadata;

  if (updates.sortOrder !== undefined && updates.sortOrder !== oldSortOrder) {
    const newSortOrder = updates.sortOrder;
    
    if (newSortOrder > 0) {
      // Direct swap: find if another item already has this target sort order
      const conflict = await Option.findOne({ 
        type: option.type, 
        parent: option.parent || null, 
        sortOrder: newSortOrder, 
        _id: { $ne: option._id } 
      });
      
      if (conflict) {
        // Give the conflicting item the old sort order
        conflict.sortOrder = oldSortOrder;
        await conflict.save();
      }
    }
    
    option.sortOrder = newSortOrder;
  }

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
