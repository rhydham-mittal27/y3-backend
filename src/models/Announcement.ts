import mongoose, { Schema, Document, Model } from 'mongoose';

export interface ITutorInterestEmbedded {
  tutor: mongoose.Types.ObjectId;
  interestedAt: Date;
  notes?: string;
}

export interface IAnnouncementDocument extends Document {
  _id: mongoose.Types.ObjectId;
  classLead: mongoose.Types.ObjectId;
  postedBy: mongoose.Types.ObjectId;
  postedAt: Date;
  interestedTutors: ITutorInterestEmbedded[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  interestCount?: number;
}

const TutorInterestSchema = new Schema<ITutorInterestEmbedded>(
  {
    tutor: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    interestedAt: { type: Date, default: Date.now },
    notes: { type: String, trim: true },
  },
  { _id: false }
);

const AnnouncementSchema: Schema<IAnnouncementDocument> = new Schema<IAnnouncementDocument>(
  {
    classLead: { type: Schema.Types.ObjectId, ref: 'ClassLead', required: true, unique: true },
    postedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    postedAt: { type: Date, default: Date.now },
    interestedTutors: { type: [TutorInterestSchema], default: [] },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

// Virtuals
AnnouncementSchema.virtual('interestCount').get(function (this: IAnnouncementDocument) {
  return this.interestedTutors?.length || 0;
});

AnnouncementSchema.index({ 'interestedTutors.tutor': 1 });

const Announcement: Model<IAnnouncementDocument> =
  mongoose.models.Announcement || mongoose.model<IAnnouncementDocument>('Announcement', AnnouncementSchema);

export default Announcement;
