import mongoose, { Schema, Types, Document } from 'mongoose';

export interface ITimelineEvent {
  event: string;
  description: string;
  eventDate: Date;
  type: 'status_change' | 'note' | 'reminder' | 'follow_up' | 'interview_schedule';
}

export interface IReminder {
  _id: Types.ObjectId;
  message: string;
  dueDate: Date;
  isCompleted: boolean;
  completedAt?: Date;
}

export interface IApplication extends Document {
  userId: Types.ObjectId;
  jobId: Types.ObjectId;
  resumeId: Types.ObjectId;
  status: 'saved' | 'applied' | 'screening' | 'interview' | 'offer' | 'rejected' | 'withdrawn';
  previousStatus: string[];
  timelineEvents: ITimelineEvent[];
  reminders: IReminder[];
  callbackReceived: boolean;
  rejectedReason?: string;
  offerAmount?: string;
  createdAt: Date;
  updatedAt: Date;
}

const timelineEventSchema = new Schema<ITimelineEvent>(
  {
    event: { type: String, required: true },
    description: { type: String, trim: true },
    eventDate: { type: Date, default: Date.now },
    type: {
      type: String,
      enum: ['status_change', 'note', 'reminder', 'follow_up', 'interview_schedule'],
      default: 'note',
    },
  },
  { _id: true }
);

const reminderSchema = new Schema<IReminder>(
  {
    message: { type: String, required: true, trim: true },
    dueDate: { type: Date, required: true },
    isCompleted: { type: Boolean, default: false },
    completedAt: Date,
  },
  { _id: true }
);

const applicationSchema = new Schema<IApplication>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true }, // index: true removed - compound index below covers this
    jobId: { type: Schema.Types.ObjectId, ref: 'Job', required: true, index: true },
    resumeId: { type: Schema.Types.ObjectId, ref: 'Resume', index: true },

    // Pipeline
    status: {
      type: String,
      enum: ['saved', 'applied', 'screening', 'interview', 'offer', 'rejected', 'withdrawn'],
      default: 'saved',
      index: true,
    },
    previousStatus: [{ type: String }],

    // Timeline & tracking
    timelineEvents: [timelineEventSchema],
    reminders: [reminderSchema],

    // Outcomes
    callbackReceived: { type: Boolean, default: false },
    rejectedReason: String,
    offerAmount: String,
  },
  {
    timestamps: true,
  }
);

// Compound indexes for efficient queries
applicationSchema.index({ userId: 1, status: 1 });
applicationSchema.index({ userId: 1, jobId: 1 }, { unique: true });

export const Application = mongoose.model<IApplication>('Application', applicationSchema);
