import { Schema, Document, Query, Model } from 'mongoose';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SoftDeleteDocument extends Document {
  deletedAt: Date | null;
  isDeleted: boolean;
  softDelete(): Promise<this>;
  restore(): Promise<this>;
}

export interface SoftDeleteModel<T extends SoftDeleteDocument> extends Model<T> {
  findWithDeleted(filter?: Record<string, any>): ReturnType<Model<T>['find']>;
  findOneWithDeleted(filter?: Record<string, any>): ReturnType<Model<T>['findOne']>;
  countWithDeleted(filter?: Record<string, any>): ReturnType<Model<T>['countDocuments']>;
}

// ─── Plugin ───────────────────────────────────────────────────────────────────

export function softDeletePlugin(schema: Schema) {
  // ── Field ──────────────────────────────────────────────────────────────────
  schema.add({
    deletedAt: { type: Date, default: null, index: true },
  });

  // ── Virtual ────────────────────────────────────────────────────────────────
  schema.virtual('isDeleted').get(function (this: SoftDeleteDocument) {
    return this.deletedAt !== null && this.deletedAt !== undefined;
  });

  // ── Instance methods ───────────────────────────────────────────────────────
  schema.methods.softDelete = async function (this: SoftDeleteDocument) {
    this.deletedAt = new Date();
    return this.save();
  };

  schema.methods.restore = async function (this: SoftDeleteDocument) {
    this.deletedAt = null;
    return this.save();
  };

  // ── Auto-filter on all query methods ──────────────────────────────────────
  const FILTERED_METHODS = [
    'find',
    'findOne',
    'findOneAndUpdate',
    'findOneAndDelete',
    'findOneAndReplace',
    'count',
    'countDocuments',
    'exists',
    'updateOne',
    'updateMany',
    'deleteOne',
    'deleteMany',
  ] as const;

  for (const method of FILTERED_METHODS) {
    schema.pre(method as any, function (this: Query<any, any>) {
      const filter = this.getFilter();
      // Only inject if caller hasn't explicitly asked to include deleted docs
      if (!('deletedAt' in filter) && !('$or' in filter && (filter.$or as any[]).some((c: any) => 'deletedAt' in c))) {
        this.where({ deletedAt: null });
      }
    });
  }

  // ── Static helpers to bypass the filter ───────────────────────────────────
  schema.statics.findWithDeleted = function (filter: Record<string, any> = {}) {
    return this.find({ ...filter, deletedAt: { $ne: undefined } }).setOptions({ _skipSoftDelete: true });
  };

  schema.statics.findOneWithDeleted = function (filter: Record<string, any> = {}) {
    return this.findOne(filter).setOptions({ _skipSoftDelete: true });
  };

  schema.statics.countWithDeleted = function (filter: Record<string, any> = {}) {
    return this.countDocuments(filter).setOptions({ _skipSoftDelete: true });
  };
}
