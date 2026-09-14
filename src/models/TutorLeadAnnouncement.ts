import mongoose, { Schema, Document, Model } from 'mongoose';

// Renamed from Announcement.ts for clarity (audit/IMPLEMENTATION_ROADMAP.md P3
// item 12) — this model represents a Manager-posted lead that tutors express
// interest in (the tutor/demo-matching job board), as distinct from
// CoordinatorAnnouncement.ts, which is a coordinator broadcast to
// classes/tutors/parents. The two are unrelated despite the similar name.
//
// The underlying Mongoose model/collection name is intentionally left as
// 'Announcement' (unchanged) so this rename touches only the TypeScript
// identifier, not the database — every existing `ref: 'Announcement'` on
// other models (e.g. Notification.relatedAnnouncement) keeps working exactly
// as before, and no data migration is needed.

export interface ITutorInterestEmbedded {
  tutor: mongoose.Types.ObjectId;
  interestedAt: Date;
  notes?: string;
}

export interface ITutorLeadAnnouncementDocument extends Document {
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

const TutorLeadAnnouncementSchema: Schema<ITutorLeadAnnouncementDocument> = new Schema<ITutorLeadAnnouncementDocument>(
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
TutorLeadAnnouncementSchema.virtual('interestCount').get(function (this: ITutorLeadAnnouncementDocument) {
  return this.interestedTutors?.length || 0;
});

TutorLeadAnnouncementSchema.index({ 'interestedTutors.tutor': 1 });

const TutorLeadAnnouncement: Model<ITutorLeadAnnouncementDocument> =
  mongoose.models.Announcement || mongoose.model<ITutorLeadAnnouncementDocument>('Announcement', TutorLeadAnnouncementSchema);

export default TutorLeadAnnouncement;
