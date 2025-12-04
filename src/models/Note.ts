import mongoose, { Schema, Document, Model } from 'mongoose';

export type NoteType = 'FOLDER' | 'FILE';

export interface INoteDocument extends Document {
  _id: mongoose.Types.ObjectId;
  name: string;
  type: NoteType;
  parent?: mongoose.Types.ObjectId | null;
  owner: mongoose.Types.ObjectId; // user id
  grade?: string; // e.g. "Class 6" for class-based sharing
  mimeType?: string;
  url?: string;
  createdAt: Date;
  updatedAt: Date;
}

const NoteSchema: Schema<INoteDocument> = new Schema(
  {
    name: { type: String, required: true, trim: true },
    type: { type: String, required: true, enum: ['FOLDER', 'FILE'] },
    parent: { type: Schema.Types.ObjectId, ref: 'Note', default: null },
    owner: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    grade: { type: String, trim: true },
    mimeType: { type: String },
    url: { type: String },
  },
  { timestamps: true }
);

NoteSchema.index({ owner: 1, parent: 1, name: 1 });

const Note: Model<INoteDocument> =
  mongoose.models.Note || mongoose.model<INoteDocument>('Note', NoteSchema);

export default Note;
