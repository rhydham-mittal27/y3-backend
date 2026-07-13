import Groupleads from '../models/GroupClass';
import ErrorResponse from '../utils/errorResponse';
import { createCyclePayments } from './paymentService';
import AttendanceSheet from '../models/AttendanceSheet';

export const renewGroupClassForCoordinator = async (params: {
  groupClassId: string;
  coordinatorUserId: string;
  attendanceSheetId?: string;
  plan?: { sessionsPerMonth: number; tutorRatePerSession?: number };
}) => {
  const { groupClassId, coordinatorUserId, attendanceSheetId, plan } = params;

  const group = await Groupleads.findById(groupClassId);
  if (!group) throw new ErrorResponse('Group class not found', 404);

  if (String(group.createdBy) !== String(coordinatorUserId)) {
    throw new ErrorResponse('Not authorized to renew this group class', 403);
  }

  if (attendanceSheetId) {
    try {
      await AttendanceSheet.findByIdAndUpdate(attendanceSheetId, { renewedAt: new Date() });
    } catch (err) {
      console.error('Failed to update renewedAt on attendance sheet:', err);
    }
  }

  if (plan && typeof plan.sessionsPerMonth === 'number') {
    if (plan.sessionsPerMonth <= 0) throw new ErrorResponse('Sessions per month must be greater than 0', 400);
    group.sessionsPerMonth = plan.sessionsPerMonth;
    if (typeof plan.tutorRatePerSession === 'number') {
      if (plan.tutorRatePerSession < 0) throw new ErrorResponse('Tutor rate cannot be negative', 400);
      group.tutorRatePerSession = plan.tutorRatePerSession;
    }
  }

  group.completedSessions = 0;
  group.cycleStartPending = false;
  await group.save();

  if (attendanceSheetId) {
    try {
      await createCyclePayments(attendanceSheetId, coordinatorUserId);
    } catch (err) {
      console.error('Failed to create cycle payments on renewal:', err);
    }
  }

  await group.populate([
    { path: 'tutor', select: 'name email phone' },
    { path: 'classLead' },
  ]);

  return { group };
};
