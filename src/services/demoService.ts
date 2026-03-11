import mongoose from 'mongoose';
import ClassLead from '../models/ClassLead';
import Tutor from '../models/Tutor';
import User from '../models/User';
import Announcement from '../models/Announcement';
import DemoHistory from '../models/DemoHistory';
import { createNotificationWithPreferences } from './notificationService';
import ErrorResponse from '../utils/errorResponse';
import { CLASS_LEAD_STATUS, DEMO_STATUS, MANAGER_ACTION_TYPE, USER_ROLES } from '../config/constants';
import { logManagerActivity } from './managerService';
import Manager from '../models/Manager';
import { convertLeadToFinalClass } from './finalClassService';

export const assignDemo = async (
  classLeadId: string,
  tutorUserId: string,
  demoDate: Date,
  demoTime: string,
  notes: string | undefined,
  assignedBy: string
) => {
  const lead = await ClassLead.findById(classLeadId);
  if (!lead) throw new ErrorResponse('Class lead not found', 404);
  if (lead.status !== CLASS_LEAD_STATUS.ANNOUNCED)
    throw new ErrorResponse('Lead is not in announced state', 400);

  const announcement = await Announcement.findOne({ classLead: classLeadId });
  if (!announcement) throw new ErrorResponse('Announcement not found for this lead', 404);
  const interestedIds = (announcement.interestedTutors || []).map(
    (t: any) => t.tutor?.toString?.() || t.toString()
  );
  if (!interestedIds.includes(tutorUserId))
    throw new ErrorResponse('Tutor has not expressed interest', 400);

  const tutorProfile = await Tutor.findOne({ user: tutorUserId });
  if (!tutorProfile) throw new ErrorResponse('Tutor profile not found', 404);

  lead.assignedTutor = new mongoose.Types.ObjectId(tutorUserId) as any;
  lead.demoDetails = {
    demoDate,
    demoTime,
    demoStatus: DEMO_STATUS.SCHEDULED,
    assignedAt: new Date(),
  } as any;
  lead.status = CLASS_LEAD_STATUS.DEMO_SCHEDULED;
  await lead.save();

  await Tutor.findByIdAndUpdate(tutorProfile._id, { $inc: { demosTaken: 1 } }, { new: true });

  await DemoHistory.create({
    classLead: lead._id,
    tutor: tutorUserId,
    demoDate,
    demoTime,
    status: DEMO_STATUS.SCHEDULED,
    assignedBy,
    assignedAt: new Date(),
    notes,
  });

  try {
    await Manager.findOneAndUpdate({ user: new mongoose.Types.ObjectId(assignedBy) }, { $inc: { demosScheduled: 1 } });
    const tutor = await User.findById(tutorUserId).select('name');
    await logManagerActivity(
      assignedBy,
      MANAGER_ACTION_TYPE.ASSIGN_DEMO,
      `Assigned demo to tutor ${tutor?.name || tutorUserId} for class lead ${lead.studentName}`,
      { entityType: 'Demo', entityId: String(lead._id), entityName: lead.studentName }
    );
  } catch {}

  try {
    await createNotificationWithPreferences({
      recipient: tutorUserId,
      type: 'DEMO_ASSIGNED',
      title: 'New demo assigned',
      message: `A demo has been scheduled on ${new Date(demoDate).toDateString()} at ${demoTime}.`,
      relatedClassLead: lead._id,
    });
  } catch {}

  return lead;
};

export const updateDemoStatus = async (
  classLeadId: string,
  newStatus: DEMO_STATUS,
  feedback: string | undefined,
  rejectionReason: string | undefined,
  updatedBy: string,
  updatedByRole: USER_ROLES | string,
  coordinatorUserId?: string,
  attendanceStatus?: 'PRESENT' | 'ABSENT',
  topicCovered?: string,
  duration?: string
) => {
  const lead = await ClassLead.findById(classLeadId);
  if (!lead) throw new ErrorResponse('Class lead not found', 404);
  if (!lead.assignedTutor || !lead.demoDetails) throw new ErrorResponse('No demo assigned to this lead', 400);

  const currentStatus = lead.demoDetails.demoStatus;
  if (!currentStatus) throw new ErrorResponse('Demo status not set', 400);

  const isTutor = String(updatedByRole) === USER_ROLES.TUTOR;
  // TODO: Use isManagerOrAdmin when implementing manager/admin specific logic
  // const isManagerOrAdmin = [USER_ROLES.MANAGER, USER_ROLES.ADMIN].includes(updatedByRole as USER_ROLES);

  if (isTutor) {
    const assignedId = (lead.assignedTutor as any)?._id?.toString() || lead.assignedTutor?.toString();
    if (assignedId !== String(updatedBy)) {
      throw new ErrorResponse('You are not the assigned tutor for this demo', 403);
    }
    if (!(currentStatus === DEMO_STATUS.SCHEDULED && newStatus === DEMO_STATUS.COMPLETED)) {
      throw new ErrorResponse('Tutors can only mark their own scheduled demos as completed', 403);
    }
  }

  // Validate that demo can only be marked after scheduled time
  if (newStatus === DEMO_STATUS.COMPLETED) {
    const demoDate = (lead.demoDetails as any)?.demoDate;
    const demoTime = (lead.demoDetails as any)?.demoTime;
    
    if (demoDate && demoTime) {
      const parsed = typeof demoTime === 'string' ? demoTime.split(':').map(Number) : [];
      const hours = parsed.length > 0 ? parsed[0] : NaN;
      const minutes = parsed.length > 1 ? parsed[1] : NaN;

      if (Number.isFinite(hours) && Number.isFinite(minutes)) {
        // IMPORTANT: build the scheduled datetime in local time using the demoDate's Y/M/D,
        // instead of mutating a Date parsed from ISO (which can shift days due to timezone).
        const d = new Date(demoDate);
        const scheduledStart = new Date(d.getFullYear(), d.getMonth(), d.getDate(), hours, minutes, 0, 0);

        const durationHours = (lead as any)?.classDurationHours;
        const durationMinutes = Number.isFinite(durationHours) && Number(durationHours) > 0
          ? Math.round(Number(durationHours) * 60)
          : 60;

        const scheduledEnd = new Date(scheduledStart.getTime() + durationMinutes * 60 * 1000);

        const now = new Date();
        if (now < scheduledEnd) {
          throw new ErrorResponse('Demo can only be marked after completion time', 400);
        }
      }
    }
  }

  if (currentStatus === DEMO_STATUS.SCHEDULED && newStatus !== DEMO_STATUS.COMPLETED)
    throw new ErrorResponse('Invalid status transition', 400);
  if (currentStatus === DEMO_STATUS.COMPLETED && ![DEMO_STATUS.APPROVED, DEMO_STATUS.REJECTED].includes(newStatus))
    throw new ErrorResponse('Invalid status transition', 400);

  lead.demoDetails.demoStatus = newStatus as any;
  if (newStatus === DEMO_STATUS.COMPLETED) {
    lead.status = CLASS_LEAD_STATUS.DEMO_COMPLETED;
    if (feedback) (lead.demoDetails as any).feedback = feedback;
    if (attendanceStatus) (lead.demoDetails as any).attendanceStatus = attendanceStatus;
    if (topicCovered) (lead.demoDetails as any).topicCovered = topicCovered;
    if (duration) (lead.demoDetails as any).duration = duration;
  }
  if (newStatus === DEMO_STATUS.APPROVED) {
    if (!coordinatorUserId) {
      throw new ErrorResponse('Coordinator is required to approve and convert the demo', 400);
    }
    const tutorProfile = await Tutor.findOne({ user: lead.assignedTutor });
    if (tutorProfile) await Tutor.findByIdAndUpdate(tutorProfile._id, { $inc: { demosApproved: 1 } });
    lead.status = CLASS_LEAD_STATUS.CONVERTED;
  }
  if (newStatus === DEMO_STATUS.REJECTED) {
    lead.status = CLASS_LEAD_STATUS.REJECTED as any;
  }
  await lead.save();

  const latestHistory = await DemoHistory.findOne({ classLead: lead._id, tutor: lead.assignedTutor })
    .sort({ createdAt: -1 });
  if (latestHistory) {
    latestHistory.status = newStatus;
    if (newStatus === DEMO_STATUS.COMPLETED) {
      latestHistory.completedAt = new Date();
      latestHistory.feedback = feedback;
      if (attendanceStatus) latestHistory.attendanceStatus = attendanceStatus;
      if (topicCovered) latestHistory.topicCovered = topicCovered;
      if (duration) latestHistory.duration = duration;
    } else if (newStatus === DEMO_STATUS.APPROVED || newStatus === DEMO_STATUS.REJECTED) {
      latestHistory.resultUpdatedAt = new Date();
      latestHistory.resultUpdatedBy = new mongoose.Types.ObjectId(updatedBy);
      if (newStatus === DEMO_STATUS.REJECTED) latestHistory.rejectionReason = rejectionReason;
    }
    await latestHistory.save();
  }
  // Auto-convert to final class when demo is approved and lead moved to CONVERTED
  if (newStatus === DEMO_STATUS.APPROVED) {
    const demoDate = (lead.demoDetails as any)?.demoDate as Date | undefined;
    const startDate = demoDate ? new Date(demoDate) : new Date();
    await convertLeadToFinalClass({
      classLeadId: String(lead._id),
      coordinatorUserId,
      startDate,
      convertedBy: updatedBy,
    });
  }
  try {
    await logManagerActivity(
      updatedBy,
      MANAGER_ACTION_TYPE.UPDATE_DEMO_STATUS,
      `Updated demo status for lead ${lead.studentName} to ${newStatus}`,
      { entityType: 'Demo', entityId: String(latestHistory?._id || lead._id), entityName: lead.studentName },
      { oldStatus: currentStatus, newStatus, feedback, rejectionReason }
    );
  } catch {}
  return lead;
};

export const editDemo = async (
  classLeadId: string,
  demoDate?: Date,
  demoTime?: string,
  notes?: string
) => {
  const lead = await ClassLead.findById(classLeadId);
  if (!lead) throw new ErrorResponse('Class lead not found', 404);
  if (!lead.assignedTutor || !lead.demoDetails) throw new ErrorResponse('No demo assigned to this lead', 400);
  if (lead.demoDetails.demoStatus !== DEMO_STATUS.SCHEDULED)
    throw new ErrorResponse('Cannot edit demo after completion', 400);

  if (demoDate) (lead.demoDetails as any).demoDate = demoDate;
  if (demoTime) (lead.demoDetails as any).demoTime = demoTime;
  await lead.save();

  const latestHistory = await DemoHistory.findOne({ classLead: lead._id, tutor: lead.assignedTutor })
    .sort({ createdAt: -1 });
  if (latestHistory) {
    if (demoDate) latestHistory.demoDate = demoDate;
    if (demoTime) latestHistory.demoTime = demoTime;
    if (notes) latestHistory.notes = notes;
    await latestHistory.save();
  }

  return lead;
};

export const reassignDemo = async (
  classLeadId: string,
  newTutorUserId: string,
  demoDate: Date,
  demoTime: string,
  notes: string | undefined,
  assignedBy: string
) => {
  const lead = await ClassLead.findById(classLeadId);
  if (!lead) throw new ErrorResponse('Class lead not found', 404);
  if (!lead.assignedTutor) throw new ErrorResponse('No demo assigned to this lead', 400);

  const oldTutorUserId = lead.assignedTutor.toString();
  if (oldTutorUserId === newTutorUserId) throw new ErrorResponse('New tutor must be different', 400);

  const announcement = await Announcement.findOne({ classLead: classLeadId });
  if (!announcement) throw new ErrorResponse('Announcement not found for this lead', 404);
  const interestedIds = (announcement.interestedTutors || []).map(
    (t: any) => t.tutor?.toString?.() || t.toString()
  );
  if (!interestedIds.includes(newTutorUserId))
    throw new ErrorResponse('Tutor has not expressed interest', 400);

  const oldTutorProfile = await Tutor.findOne({ user: oldTutorUserId });
  if (oldTutorProfile) await Tutor.findByIdAndUpdate(oldTutorProfile._id, { $inc: { demosTaken: -1 } });

  const newTutorProfile = await Tutor.findOne({ user: newTutorUserId });
  if (!newTutorProfile) throw new ErrorResponse('New tutor profile not found', 404);
  await Tutor.findByIdAndUpdate(newTutorProfile._id, { $inc: { demosTaken: 1 } });

  lead.assignedTutor = new mongoose.Types.ObjectId(newTutorUserId) as any;
  lead.demoDetails = {
    demoDate,
    demoTime,
    demoStatus: DEMO_STATUS.SCHEDULED,
    assignedAt: new Date(),
  } as any;
  await lead.save();

  const latestHistory = await DemoHistory.findOne({ classLead: lead._id, tutor: oldTutorUserId })
    .sort({ createdAt: -1 });
  if (latestHistory) {
    latestHistory.notes = `${latestHistory.notes ? latestHistory.notes + ' | ' : ''}Reassigned to another tutor`;
    await latestHistory.save();
  }

  await DemoHistory.create({
    classLead: lead._id,
    tutor: newTutorUserId,
    demoDate,
    demoTime,
    status: DEMO_STATUS.SCHEDULED,
    assignedBy,
    assignedAt: new Date(),
    notes,
  });

  try {
    await Manager.findOneAndUpdate({ user: new mongoose.Types.ObjectId(assignedBy) }, { $inc: { demosScheduled: 1 } });
    await logManagerActivity(
      assignedBy,
      MANAGER_ACTION_TYPE.REASSIGN_DEMO,
      `Reassigned demo to tutor ${newTutorUserId} for class lead ${lead.studentName}`,
      { entityType: 'Demo', entityId: String(lead._id), entityName: lead.studentName }
    );
  } catch {}

  try {
    await createNotificationWithPreferences({
      recipient: newTutorUserId,
      type: 'DEMO_ASSIGNED',
      title: 'New demo assigned',
      message: `A demo has been scheduled on ${new Date(demoDate).toDateString()} at ${demoTime}.`,
      relatedClassLead: lead._id,
    });
  } catch {}

  return lead;
};

export const getDemoHistory = async (classLeadId: string) => {
  const history = await DemoHistory.find({ classLead: classLeadId })
    .sort({ createdAt: -1 })
    .populate('tutor assignedBy resultUpdatedBy', 'name email');
  return history;
};

export const getTutorDemoHistory = async (tutorUserId: string, page = 1, limit = 10, status?: string) => {
  const safePage = Math.max(1, Number(page) || 1);
  const safeLimit = Math.max(1, Number(limit) || 10);
  const skip = (safePage - 1) * safeLimit;

  // Build filter object
  const filter: any = { tutor: tutorUserId };
  if (status) {
    filter.status = status;
  }

  const [history, total] = await Promise.all([
    DemoHistory.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(safeLimit)
      .populate('classLead'),
    DemoHistory.countDocuments(filter),
  ]);
  return { history, total, page: safePage, limit: safeLimit };
};
