import mongoose, { Document, Schema } from 'mongoose';

export interface ITicketComment {
  author:     mongoose.Types.ObjectId;
  authorName: string;
  authorRole: string;
  message:    string;
  createdAt:  Date;
}

export interface ITicket extends Document {
  ticketNumber:   string;
  type:           'CONCERN' | 'COMPLAINT' | 'QUERY' | 'TECHNICAL' | 'OTHER';
  status:         'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';
  priority:       'LOW' | 'MEDIUM' | 'HIGH';

  raisedBy:       mongoose.Types.ObjectId;   // parent user
  raisedByName:   string;
  assignedTo?:    mongoose.Types.ObjectId;   // coordinator / admin user
  assignedToName?: string;

  finalClass?:    mongoose.Types.ObjectId;
  studentName?:   string;

  subject:        string;
  description:    string;

  comments:       ITicketComment[];

  resolvedAt?:    Date;
  resolvedBy?:    mongoose.Types.ObjectId;
  resolvedByName?: string;
  resolutionNote?: string;

  createdAt:      Date;
  updatedAt:      Date;
}

const commentSchema = new Schema<ITicketComment>(
  {
    author:     { type: Schema.Types.ObjectId, ref: 'User', required: true },
    authorName: { type: String, required: true },
    authorRole: { type: String, required: true },
    message:    { type: String, required: true, maxlength: 1000 },
    createdAt:  { type: Date, default: Date.now },
  },
  { _id: true },
);

const ticketSchema = new Schema<ITicket>(
  {
    ticketNumber:    { type: String, unique: true },
    type:            { type: String, enum: ['CONCERN', 'COMPLAINT', 'QUERY', 'TECHNICAL', 'OTHER'], default: 'CONCERN' },
    status:          { type: String, enum: ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'], default: 'OPEN' },
    priority:        { type: String, enum: ['LOW', 'MEDIUM', 'HIGH'], default: 'MEDIUM' },

    raisedBy:        { type: Schema.Types.ObjectId, ref: 'User', required: true },
    raisedByName:    { type: String, required: true },
    assignedTo:      { type: Schema.Types.ObjectId, ref: 'User' },
    assignedToName:  { type: String },

    finalClass:      { type: Schema.Types.ObjectId, ref: 'FinalClass' },
    studentName:     { type: String },

    subject:         { type: String, required: true, maxlength: 200 },
    description:     { type: String, required: true, maxlength: 2000 },

    comments:        { type: [commentSchema], default: [] },

    resolvedAt:      { type: Date },
    resolvedBy:      { type: Schema.Types.ObjectId, ref: 'User' },
    resolvedByName:  { type: String },
    resolutionNote:  { type: String, maxlength: 1000 },
  },
  { timestamps: true },
);

// Auto-generate ticket number before save
ticketSchema.pre('save', async function (next) {
  if (this.ticketNumber) return next();
  const count = await mongoose.model('Ticket').countDocuments();
  this.ticketNumber = `TKT-${String(count + 1).padStart(5, '0')}`;
  next();
});

ticketSchema.index({ raisedBy: 1, createdAt: -1 });
ticketSchema.index({ assignedTo: 1, status: 1 });
ticketSchema.index({ status: 1, createdAt: -1 });

export default mongoose.model<ITicket>('Ticket', ticketSchema);
