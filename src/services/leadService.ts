import mongoose from 'mongoose';
import ClassLead from '../models/ClassLead';
import GroupClass from '../models/GroupClass';
import ErrorResponse from '../utils/errorResponse';
import {
  BOARD_TYPE,
  CLASS_LEAD_STATUS,
  TEACHING_MODE,
  MANAGER_ACTION_TYPE,
  LEAD_SOURCE,
  PREFERRED_TUTOR_GENDER,
  PAYMENT_STATUS,
  USER_ROLES,
} from '../config/constants';
import Manager from '../models/Manager';
import Student from '../models/Student';
import Option from '../models/Option';
import { logManagerActivity } from './managerService';
import FinalClass from '../models/FinalClass';
import Payment from '../models/Payment';
import Announcement from '../models/Announcement';
import User from '../models/User';

export const generateLeadId = (
  studentName: string,
  type: 'SINGLE' | 'GROUP',
  mode: string
): string => {
  // 1. Initials: First letter of First Name + First letter of Last Name (or 'X')
  const nameParts = studentName.trim().toUpperCase().split(' ');
  const firstInitial = nameParts[0]?.[0] || 'X';
  const lastInitial = nameParts.length > 1 ? nameParts[nameParts.length - 1][0] : 'X';
  const initials = `${firstInitial}${lastInitial}`;

  // 2. Type: S or G
  const typeChar = type === 'SINGLE' ? 'S' : 'G';

  // 3. Mode: 0 for Online, 1 for Offline/Hybrid
  // Check if mode string contains 'ONLINE' (case insensitive)
  const isOnline = mode.toUpperCase().includes('ONLINE');
  const modeChar = isOnline ? '0' : '1';

  // 4. Random 4 Uppercase Letters
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let randomChars = '';
  for (let i = 0; i < 4; i++) {
    randomChars += chars.charAt(Math.floor(Math.random() * chars.length));
  }

  // 5. Random 3 Numbers
  const nums = '0123456789';
  let randomNums = '';
  for (let i = 0; i < 3; i++) {
    randomNums += nums.charAt(Math.floor(Math.random() * nums.length));
  }

  return `L${initials}${typeChar}${modeChar}${randomChars}${randomNums}`;
};

export const createClassLead = async (params: {
  studentType: 'SINGLE' | 'GROUP';
  studentName?: string;
  studentGender?: 'M' | 'F';
  parentName?: string;
  parentEmail?: string;
  parentPhone?: string;
  grade: string;
  subject: string[];
  board: BOARD_TYPE | string;
  mode: TEACHING_MODE | string;
  location?: string;
  city?: string;
  area?: string;
  address?: string;
  timing: string;
  classesPerMonth?: number;
  classDurationHours?: number;
  preferredTutorGender?: PREFERRED_TUTOR_GENDER | string;
  leadSource?: LEAD_SOURCE | string;
  paymentReceived?: boolean;
  paymentAmount?: number;
  tutorFees?: number;
  notes?: string;
  numberOfStudents?: number;
  studentDetails?: Array<{
    name: string;
    gender: 'M' | 'F';
    fees: number;
    tutorFees: number;
  }>;
  createdBy: string;
}) => {
  const { createdBy, ...rest } = params;

  // Generate unique ID with retry
  let leadId = '';
  let unique = false;
  let attempts = 0;
  
  // Basic retry loop to ensure uniqueness
  while (!unique && attempts < 5) {
    const sName = params.studentName || (params.studentDetails?.[0]?.name) || 'Unknown';
    leadId = generateLeadId(sName, params.studentType, params.mode);
    const existing = await ClassLead.findOne({ leadId });
    if (!existing) {
      unique = true;
    }
    attempts++;
  }
  
  if (!unique) {
      throw new ErrorResponse('Failed to generate unique Lead ID', 500);
  }

  const lead = new ClassLead({
    ...rest,
    leadId,
    createdBy: new mongoose.Types.ObjectId(createdBy),
    status: CLASS_LEAD_STATUS.NEW,
  });

  if (params.studentType === 'GROUP' && params.studentDetails) {
    const groupClass = new GroupClass({
      classLead: lead._id,
      students: params.studentDetails,
      grade: params.grade,
      board: params.board,
    });
    await groupClass.save();
    lead.groupClass = groupClass._id;
  }

  await lead.save();
  await lead.populate([
    { path: 'createdBy', select: 'name email role' },
    { path: 'assignedTutor', select: 'name email phone' },
  ]);

  try {
    await Manager.findOneAndUpdate({ user: new mongoose.Types.ObjectId(createdBy) }, { $inc: { classLeadsCreated: 1 } });
    await logManagerActivity(
      createdBy,
      MANAGER_ACTION_TYPE.CREATE_CLASS_LEAD,
      `Created class lead for student ${lead.studentName} (ID: ${leadId})`,
      { entityType: 'ClassLead', entityId: String(lead._id), entityName: lead.studentName },
      { grade: lead.grade, subject: lead.subject, board: lead.board, mode: lead.mode, leadId }
    );
  } catch {}
  return lead;
};

export const getAllClassLeads = async (args: {
  page: number;
  limit: number;
  status?: CLASS_LEAD_STATUS | string;
  createdBy?: string;
  createdByIds?: string[];
  search?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  studentName?: string;
  parentName?: string;
  grade?: string;
  subject?: string;
  board?: string;
  mode?: string;
  createdByName?: string;
  area?: string;
}) => {
  const { page, limit, status, createdBy, createdByIds, search, sortBy, sortOrder, studentName, parentName, grade, subject, board, mode, createdByName, area } = args;

  const query: any = {};
  if (status) query.status = status;
  
  if (createdByIds && createdByIds.length > 0) {
    query.createdBy = { $in: createdByIds.map(id => new mongoose.Types.ObjectId(id)) };
  } else if (createdBy) {
    query.createdBy = new mongoose.Types.ObjectId(createdBy);
  }

  if (createdByName) {
    const User = mongoose.model('User');
    const users = await User.find({ name: { $regex: createdByName, $options: 'i' } }).select('_id');
    if (users.length > 0) {
      query.createdBy = { $in: users.map(u => u._id) };
    } else {
      query.createdBy = new mongoose.Types.ObjectId(); // No matches
    }
  }
  
  if (studentName) query.studentName = { $regex: studentName, $options: 'i' };
  if (parentName) query.parentName = { $regex: parentName, $options: 'i' };
  if (grade) query.grade = { $regex: grade, $options: 'i' };
  if (subject) query.subject = { $regex: subject, $options: 'i' };
  if (board) query.board = board;
  if (board) query.board = board;
  if (mode) query.mode = mode;
  if (area) query.area = { $regex: area, $options: 'i' };

  if (search && !query.studentName) {
     query.$or = [
        { studentName: { $regex: search, $options: 'i' } },
        { parentName: { $regex: search, $options: 'i' } },
        { parentEmail: { $regex: search, $options: 'i' } },
        { parentPhone: { $regex: search, $options: 'i' } },
        { location: { $regex: search, $options: 'i' } },
        { area: { $regex: search, $options: 'i' } },
     ];
  }

  const skip = (page - 1) * limit;
  const sortField = sortBy || 'createdAt';
  const sortDir = sortOrder === 'asc' ? 1 : -1;
  const sort: Record<string, 1 | -1> = { [sortField]: sortDir } as any;

  const [leads, total] = await Promise.all([
    ClassLead.find(query)
      .skip(skip)
      .limit(limit)
      .sort(sort)
      .populate([
        { path: 'createdBy', select: 'name email role' },
        { path: 'assignedTutor', select: 'name email phone' },
        { path: 'groupClass' },
      ]),
    ClassLead.countDocuments(query),
  ]);

  // Enrich leads with student records from the Student collection
  const leadsWithStudents = await Promise.all(leads.map(async (lead) => {
    const students = await Student.find({ classLead: lead._id }).select('name studentId gender grade');
    return {
      ...lead.toObject(),
      associatedStudents: students
    };
  }));

  return { leads: leadsWithStudents, total, page, limit };
};

export const getClassLeadById = async (leadId: string) => {
  const lead = await ClassLead.findById(leadId).populate([
    { path: 'createdBy', select: 'name email role' },
    { path: 'assignedTutor', select: 'name email phone' },
    { path: 'groupClass' },
  ]);
  if (!lead) {
    throw new ErrorResponse('Class lead not found', 404);
  }
  const students = await Student.find({ classLead: lead._id }).select('name studentId gender grade');
  return {
    ...lead.toObject(),
    associatedStudents: students
  };
};

export const updateClassLead = async (
  leadId: string,
  updateData: Partial<{
    studentName: string;
    grade: string;
    subject: string[];
    board: BOARD_TYPE | string;
    mode: TEACHING_MODE | string;
    location?: string;
    timing: string;
    paymentAmount?: number;
    tutorFees?: number;
    notes?: string;
  }>
) => {
  if (Object.prototype.hasOwnProperty.call(updateData, 'status')) {
    throw new ErrorResponse('Status cannot be updated via this endpoint', 400);
  }

  const lead = await ClassLead.findById(leadId);
  if (!lead) {
    throw new ErrorResponse('Class lead not found', 404);
  }

  Object.assign(lead, updateData);
  await lead.save();
  await lead.populate([
    { path: 'createdBy', select: 'name email role' },
    { path: 'assignedTutor', select: 'name email phone' },
  ]);
  try {
    const createdBy = String((lead.createdBy as any)?._id || lead.createdBy);
    await logManagerActivity(
      createdBy,
      MANAGER_ACTION_TYPE.UPDATE_CLASS_LEAD,
      `Updated class lead for student ${lead.studentName}`,
      { entityType: 'ClassLead', entityId: String(lead._id), entityName: lead.studentName },
      updateData
    );
  } catch {}
  return lead;
};

export const updateClassLeadStatus = async (
  leadId: string,
  newStatus: CLASS_LEAD_STATUS | string,
  _userId: string
) => {
  const lead = await ClassLead.findById(leadId);
  if (!lead) {
    throw new ErrorResponse('Class lead not found', 404);
  }

  const current = lead.status as CLASS_LEAD_STATUS;
  const allowedTransitions: Partial<Record<CLASS_LEAD_STATUS, (CLASS_LEAD_STATUS | string)[]>> = {
    [CLASS_LEAD_STATUS.NEW]: [CLASS_LEAD_STATUS.ANNOUNCED],
    [CLASS_LEAD_STATUS.ANNOUNCED]: [CLASS_LEAD_STATUS.DEMO_SCHEDULED],
    [CLASS_LEAD_STATUS.DEMO_SCHEDULED]: [CLASS_LEAD_STATUS.DEMO_COMPLETED],
    // Allow correcting older leads from DEMO_COMPLETED back to ANNOUNCED, or moving to final outcome
    [CLASS_LEAD_STATUS.DEMO_COMPLETED]: [CLASS_LEAD_STATUS.ANNOUNCED, CLASS_LEAD_STATUS.CONVERTED, CLASS_LEAD_STATUS.REJECTED],
    // After a lead is converted, we may later mark that payment has been received
    [CLASS_LEAD_STATUS.CONVERTED]: [CLASS_LEAD_STATUS.PAYMENT_RECEIVED],
    [CLASS_LEAD_STATUS.REJECTED]: [],
  };

  // Special case: once a lead is converted, marking PAYMENT_RECEIVED should not
  // change the status away from CONVERTED. Instead, just flip the payment flag.
  if (current === CLASS_LEAD_STATUS.CONVERTED && newStatus === CLASS_LEAD_STATUS.PAYMENT_RECEIVED) {
    (lead as any).paymentReceived = true;
    await lead.save();

    // Also find associated FinalClass and its advance payment to mark as PAID
    try {
      const finalCls = await FinalClass.findOne({ classLead: lead._id });
      if (finalCls) {
        const payment = await Payment.findOne({ 
          finalClass: finalCls._id, 
          status: PAYMENT_STATUS.PENDING,
          attendance: { $exists: false } // Advance payments don't have attendance
        });
        
        if (payment) {
          payment.status = PAYMENT_STATUS.PAID;
          payment.paymentDate = new Date();
          payment.paidBy = new mongoose.Types.ObjectId(_userId) as any;
          payment.notes = (payment.notes || '') + ' | Payment received via Lead status update';
          await payment.save();
        }
      }
    } catch (err) {
      console.error('Failed to auto-update payment status:', err);
    }

    await lead.populate([
      { path: 'createdBy', select: 'name email role' },
      { path: 'assignedTutor', select: 'name email phone' },
    ]);
    return lead;
  }

  if (current === newStatus) {
    return lead; // no change
  }

  if (!allowedTransitions[current]?.includes(newStatus)) {
    throw new ErrorResponse('Invalid status transition', 400);
  }

  lead.status = newStatus as any;
  await lead.save();
  await lead.populate([
    { path: 'createdBy', select: 'name email role' },
    { path: 'assignedTutor', select: 'name email phone' },
  ]);
  return lead;
};

export const deleteClassLead = async (leadId: string) => {
  const existing = await ClassLead.findById(leadId);
  if (!existing) {
    throw new ErrorResponse('Class lead not found', 404);
  }
  await ClassLead.findByIdAndDelete(leadId);
  try {
    const createdBy = String((existing.createdBy as any)?._id || existing.createdBy);
    await logManagerActivity(
      createdBy,
      MANAGER_ACTION_TYPE.DELETE_CLASS_LEAD,
      `Deleted class lead for student ${existing.studentName}`,
      { entityType: 'ClassLead', entityId: String(existing._id), entityName: existing.studentName }
    );
  } catch {}
  return true;
};

export const getLeadsByManager = async (managerId: string) => {
  const leads = await ClassLead.find({ createdBy: managerId })
    .sort({ createdAt: -1 })
    .populate([
      { path: 'createdBy', select: 'name email role' },
      { path: 'assignedTutor', select: 'name email phone' },
    ]);
  return leads;
};

export const getLeadsByTutor = async (tutorUserId: string) => {
  const leads = await ClassLead.find({ assignedTutor: tutorUserId })
    .sort({ createdAt: -1 })
    .populate([
      { path: 'createdBy', select: 'name email role' },
      { path: 'assignedTutor', select: 'name email phone' },
    ]);
  return leads;
};

export const getDistinctFilterValues = async () => {
  const [allOptions, areaList, creatorIds] = await Promise.all([
    Option.find({ isActive: true }).select('type value label').sort({ sortOrder: 1, value: 1 }),
    ClassLead.distinct('area'),
    ClassLead.distinct('createdBy'),
  ]);

  // Group options by type
  const optionsMap = allOptions.reduce((acc, opt) => {
    if (!acc[opt.type]) acc[opt.type] = [];
    acc[opt.type].push({ value: opt.value, label: opt.label });
    return acc;
  }, {} as Record<string, { value: string; label: string }[]>);

  // Helper to get simple string array for backward compatibility if needed, 
  // or return full object if frontend is ready. 
  // For now, let's return simple values for existing fields to maintain compatibility,
  // and full objects for new ones if we want labels.
  // Actually, existing frontend expects string[].
  const getValues = (type: string) => optionsMap[type]?.map(o => o.value) || [];

  // Clean distinct list for areas
  const areas = areaList.filter(Boolean).sort();
  
  // Fetch creator names
  const creators = await User.find({ _id: { $in: creatorIds } }).select('name').lean();
  const creatorNames = creators.map((u: any) => u.name).filter(Boolean).sort();
  
  // Fetch ALL users with role MANAGER (for the 'managers' reassignment list)
  const allManagersList = await User.find({ 
    role: USER_ROLES.MANAGER 
  }).select('name role').lean();

  const managers = allManagersList.map((u: any) => ({
    id: String(u._id),
    name: u.name
  })).sort((a: any, b: any) => a.name.localeCompare(b.name));

  return {
    grades: getValues('GRADE'),
    subjects: getValues('SUBJECT'),
    boards: getValues('BOARD'),
    modes: getValues('TEACHING_MODE'),
    sources: getValues('LEAD_SOURCE'),
    genders: getValues('GENDER'),
    tiers: getValues('TUTOR_TIER'),
    areas: areas,
    cities: (await ClassLead.distinct('city')).filter(Boolean).sort(),
    creators: creatorNames,
    status: getValues('CLASS_LEAD_STATUS'),
    managers,
    // Return the raw map for advanced usage if needed
    _raw: optionsMap
  };
};

export const getCRMLeadsGrouped = async (managerId?: string) => {
  const match: any = {};
  if (managerId) match.createdBy = new mongoose.Types.ObjectId(managerId);

  // Define CRM statuses and their logic
  // 1. New: status = NEW
  // 2. Announced: status = ANNOUNCED, interestCount = 0
  // 3. Tutors Interested: status = ANNOUNCED, interestCount > 0
  // 4. Demo Scheduled: status = DEMO_SCHEDULED
  // 5. Demo Pending: status = DEMO_COMPLETED
  // 6. Converted: status = CONVERTED

  const pipeline = [
    { $match: match },
    {
      $lookup: {
        from: 'announcements',
        localField: '_id',
        foreignField: 'classLead',
        as: 'announcement'
      }
    },
    {
      $lookup: {
        from: 'users',
        localField: 'createdBy',
        foreignField: '_id',
        as: 'creator'
      }
    },
    {
      $project: {
        id: '$_id',
        studentName: 1,
        grade: 1,
        subject: 1,
        status: 1,
        leadId: 1,
        mode: 1,
        timing: 1,
        createdAt: 1,
        createdBy: {
          $let: {
            vars: { firstCreator: { $arrayElemAt: ['$creator', 0] } },
            in: {
              _id: '$$firstCreator._id',
              name: '$$firstCreator.name'
            }
          }
        },
        interestCount: {
          $cond: {
            if: { $gt: [{ $size: '$announcement' }, 0] },
            then: { $size: { $ifNull: [{ $arrayElemAt: ['$announcement.interestedTutors', 0] }, []] } },
            else: 0
          }
        }
      }
    }

  ];

  const leads = await ClassLead.aggregate(pipeline);

  const groups: Record<string, any[]> = {
    new: [],
    announced: [],
    interested: [],
    demoScheduled: [],
    demoPending: [],
    won: []
  };

  leads.forEach(lead => {
    const status = lead.status;
    const interests = lead.interestCount || 0;

    if (status === CLASS_LEAD_STATUS.NEW) {
      groups.new.push(lead);
    } else if (status === CLASS_LEAD_STATUS.ANNOUNCED) {
      if (interests > 0) {
        groups.interested.push(lead);
      } else {
        groups.announced.push(lead);
      }
    } else if (status === CLASS_LEAD_STATUS.DEMO_SCHEDULED) {
      groups.demoScheduled.push(lead);
    } else if (status === CLASS_LEAD_STATUS.DEMO_COMPLETED) {
      groups.demoPending.push(lead);
    } else if (status === CLASS_LEAD_STATUS.CONVERTED || status === CLASS_LEAD_STATUS.PAYMENT_RECEIVED) {
      groups.won.push(lead);
    }
  });

  return groups;
};

export const repostClassAsLead = async (params: {
  classId: string;
  createdBy: string;
}) => {
  const { classId, createdBy } = params;
  const session = await mongoose.startSession();
  try {
    session.startTransaction();

    const cls = await FinalClass.findById(classId).populate('classLead').session(session);
    if (!cls) throw new ErrorResponse('Final class not found', 404);

    const oldLead = cls.classLead as any;
    if (!oldLead) throw new ErrorResponse('Original class lead not found', 404);

    // Create a new ClassLead based on the old one
    const newLeadData = oldLead.toObject();
    delete newLeadData._id;
    delete newLeadData.leadId;
    delete newLeadData.createdAt;
    delete newLeadData.updatedAt;
    delete newLeadData.__v;
    delete newLeadData.assignedTutor;
    delete newLeadData.demoTutor;
    delete newLeadData.demoDetails;

    // Generate unique ID
    let leadId = '';
    let unique = false;
    let attempts = 0;
    const sName = newLeadData.studentName || (newLeadData.studentDetails?.[0]?.name) || 'Unknown';
    
    while (!unique && attempts < 5) {
      leadId = generateLeadId(sName, newLeadData.studentType, newLeadData.mode);
      const existing = await ClassLead.findOne({ leadId }).session(session);
      if (!existing) unique = true;
      attempts++;
    }

    if (!unique) throw new ErrorResponse('Failed to generate unique Lead ID', 500);

    const newLead = new ClassLead({
      ...newLeadData,
      leadId,
      createdBy: new mongoose.Types.ObjectId(createdBy),
      status: CLASS_LEAD_STATUS.ANNOUNCED, // Force to announced for visibility
      notes: `Reposted from class ${cls.className}. Reason: Tutor left. ${newLeadData.notes || ''}`,
    });

    await newLead.save({ session });

    // Automatically create an announcement
    const announcement = new Announcement({
      classLead: newLead._id,
      postedBy: new mongoose.Types.ObjectId(createdBy),
      postedAt: new Date(),
      isActive: true,
    });

    await announcement.save({ session });

    // Log activity
    await logManagerActivity(
      createdBy,
      MANAGER_ACTION_TYPE.REPOST_AS_LEAD,
      `Reposted class ${cls.className} as lead (ID: ${leadId})`,
      { entityType: 'ClassLead', entityId: String(newLead._id), entityName: newLead.studentName },
      { classId, leadId }
    );

    await session.commitTransaction();

    await newLead.populate([
      { path: 'createdBy', select: 'name email role' },
    ]);

    return newLead;
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
};

export const reassignClassLead = async (leadId: string, newManagerUserId: string) => {
  const lead = await ClassLead.findById(leadId);
  if (!lead) {
    throw new ErrorResponse('Class lead not found', 404);
  }

  const oldManagerUserId = String(lead.createdBy);
  const newManagerUserObjId = new mongoose.Types.ObjectId(newManagerUserId);

  if (oldManagerUserId === newManagerUserId) {
    return lead; // No change
  }

  // Update lead
  lead.createdBy = newManagerUserObjId;
  await lead.save();

  // Update associated FinalClass if it exists
  await FinalClass.findOneAndUpdate(
    { classLead: lead._id },
    { convertedBy: newManagerUserObjId }
  );

  // Update manager counts
  try {
    // Increment for new manager
    await Manager.findOneAndUpdate(
      { user: newManagerUserObjId },
      { $inc: { classLeadsCreated: 1 } }
    );
    // Decrement for old manager
    await Manager.findOneAndUpdate(
      { user: new mongoose.Types.ObjectId(oldManagerUserId) },
      { $inc: { classLeadsCreated: -1 } }
    );

    // Log activity
    await logManagerActivity(
      newManagerUserId,
      MANAGER_ACTION_TYPE.UPDATE_CLASS_LEAD,
      `Class lead (ID: ${lead.leadId}) reassigned to you from another manager`,
      { entityType: 'ClassLead', entityId: String(lead._id), entityName: lead.studentName }
    );
  } catch (err) {
    console.error('Failed to update manager counts or log activity during reassignment:', err);
  }

  await lead.populate([
    { path: 'createdBy', select: 'name email role' },
    { path: 'assignedTutor', select: 'name email phone' },
  ]);

  return lead;
};

export default {
  createClassLead,
  getAllClassLeads,
  getClassLeadById,
  updateClassLead,
  updateClassLeadStatus,
  deleteClassLead,
  getLeadsByManager,
  getLeadsByTutor,
  getDistinctFilterValues,
  getCRMLeadsGrouped,
  repostClassAsLead,
  reassignClassLead,
};
