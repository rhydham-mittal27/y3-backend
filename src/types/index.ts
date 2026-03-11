import { Request } from 'express';
import {
  USER_ROLES,
  CLASS_LEAD_STATUS,
  DEMO_STATUS,
  TEACHING_MODE,
  BOARD_TYPE,
  VERIFICATION_STATUS,
  FINAL_CLASS_STATUS,
  ATTENDANCE_STATUS,
  PAYMENT_STATUS,
  PAYMENT_METHOD,
} from '../config/constants';

export interface IUserPreferences {
  id: string;
  user: IUser;
  notificationPreferences: {
    ANNOUNCEMENT: boolean;
    DEMO_ASSIGNED: boolean;
    PAYMENT: boolean;
    VERIFICATION: boolean;
    GENERAL: boolean;
    ATTENDANCE: boolean;
  };
  themeMode: 'light' | 'dark' | 'system';
  language: 'en' | 'hi' | 'es' | 'fr';
  privacySettings: {
    profileVisibility: 'public' | 'private' | 'contacts';
    showEmail: boolean;
    showPhone: boolean;
  };
  createdAt: Date;
  updatedAt: Date;
}

export interface IUser {
  id: string;
  email: string;
  name: string;
  role: USER_ROLES | string;
  phone?: string;
  dob?: Date;
  isActive: boolean;
  acceptedTerms: boolean;
  preferredMode?: string;
  city?: string;
  permissions?: {
    canViewSiteLeads?: boolean;
    canVerifyTutors?: boolean;
    canCreateLeads?: boolean;

  };
  createdAt: Date;
  updatedAt: Date;
  preferences?: IUserPreferences;
  devices?: IDevice[];
  lastLoginAt?: Date;
  lastLoginDevice?: string;
}

export interface AuthRequest extends Request {
  user?: IUser;
}

export interface PaginationParams {
  page: number;
  limit: number;
  sort?: string;
  order?: 'asc' | 'desc';
}

export interface IMobilePaginationParams extends PaginationParams {
  cursor?: string;
  lastId?: string;
}

export type ApiResponse<T> = {
  success: boolean;
  data: T;
  message?: string;
};

export type PaginatedApiResponse<T> = ApiResponse<T> & {
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
};

export interface IDevice {
  deviceId: string;
  fcmToken: string;
  deviceType: 'ios' | 'android';
  deviceName?: string;
  lastActiveAt: Date;
  registeredAt: Date;
}

export interface IDeviceRegistration {
  deviceId: string;
  fcmToken: string;
  deviceType: 'ios' | 'android';
  deviceName?: string;
}

export interface IPushNotificationPayload {
  title: string;
  body: string;
  data?: Record<string, string>;
  imageUrl?: string;
}

// New model interfaces
export interface IDemoDetails {
  demoDate?: Date;
  demoTime?: string;
  demoStatus?: DEMO_STATUS;
  feedback?: string;
  assignedAt?: Date;
}

export interface IDocument {
  documentType: 'AADHAAR' | 'CERTIFICATE' | 'EXPERIENCE_PROOF' | 'DEGREE' | 'OTHER';
  documentUrl: string;
  uploadedAt: Date;
  verifiedAt?: Date;
}

export interface ITutorSettings {
  availabilityPreferences?: {
    daysAvailable?: string[];
    timeSlots?: string[];
    maxClassesPerWeek?: number;
  };
  teachingModePreference?: TEACHING_MODE | string;
  preferredSubjects?: string[];
  preferredLocations?: string[];
  notificationSettings?: {
    classAssignments?: boolean;
    demoRequests?: boolean;
    feedbackReceived?: boolean;
  };
}

export interface IClassLead {
  id: string;
  studentName: string;
  parentEmail?: string;
  grade: string;
  subject: string[];
  board: BOARD_TYPE;
  mode: TEACHING_MODE;
  location?: string;
  timing: string;
  status: CLASS_LEAD_STATUS;
  assignedTutor?: IUser;
  demoDetails?: IDemoDetails;
  createdBy: IUser;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ITutor {
  id: string;
  user: IUser;
  experienceHours: number;
  subjects: string[];
  qualifications?: string[];
  extracurricularActivities?: string[];
  ratings: number;
  totalRatings: number;
  classesAssigned: number;
  classesCompleted: number;
  demosTaken: number;
  demosApproved: number;
  approvalRatio: number;
  interestCount: number;
  verificationStatus: VERIFICATION_STATUS;
  documents: IDocument[];
  verificationNotes?: string;
  verifiedBy?: IUser;
  verifiedAt?: Date;
  isAvailable: boolean;
  preferredMode?: TEACHING_MODE;
  preferredLocations?: string[];
  createdAt: Date;
  updatedAt: Date;
  tier: string;
  tierUpdatedAt?: Date;
  tierUpdatedBy?: IUser;
  pendingTierChange?: IPendingTierChange;
  settings?: ITutorSettings;
}

export interface ICoordinatorSettings {
  classCapacitySettings?: {
    preferredMaxCapacity?: number;
    autoAcceptClasses?: boolean;
    capacityAlertThreshold?: number;
  };
  specializationAreas?: string[];
  notificationSettings?: {
    attendanceApprovals?: boolean;
    paymentReminders?: boolean;
    testScheduling?: boolean;
    parentComplaints?: boolean;
  };
  workingHours?: {
    startTime?: string;
    endTime?: string;
    workingDays?: string[];
  };
  attendanceControls?: {
    sameDayOnly?: boolean;
    allowTutorReschedule?: boolean;
  };
}

export interface ICoordinator {
  id: string;
  user: IUser;
  assignedClasses: string[];
  maxClassCapacity: number;
  activeClassesCount: number;
  totalClassesHandled: number;
  availableCapacity: number;
  specialization?: string[];
  joiningDate: Date;
  performanceScore: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  settings?: ICoordinatorSettings;
}

// Announcement and Notification types
export interface ITutorInterest {
  tutor: IUser;
  interestedAt: Date;
  notes?: string;
}

export interface IAnnouncement {
  id: string;
  classLead: IClassLead;
  postedBy: IUser;
  postedAt: Date;
  interestedTutors: ITutorInterest[];
  interestCount: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type NotificationType = 'ANNOUNCEMENT' | 'DEMO_ASSIGNED' | 'PAYMENT' | 'VERIFICATION' | 'GENERAL' | 'ATTENDANCE';

export interface INotification {
  id: string;
  recipient: IUser;
  type: NotificationType;
  title: string;
  message: string;
  relatedAnnouncement?: IAnnouncement;
  relatedClassLead?: IClassLead;
  isRead: boolean;
  readAt?: Date;
  createdAt: Date;
}

export interface IInterestedTutorComparison {
  user: IUser;
  experienceHours: number;
  subjects: string[];
  ratings: number;
  classesAssigned: number;
  demosTaken: number;
  demosApproved: number;
  approvalRatio: number;
  verificationStatus: string;
  interestCount: number;
  interestedAt: Date;
}

export interface IDemoHistory {
  id: string;
  classLead: IClassLead;
  tutor: IUser;
  demoDate: Date;
  demoTime: string;
  status: DEMO_STATUS;
  assignedBy: IUser;
  assignedAt: Date;
  completedAt?: Date;
  resultUpdatedAt?: Date;
  resultUpdatedBy?: IUser;
  feedback?: string;
  rejectionReason?: string;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ISchedule {
  startDate?: string | Date;
  daysOfWeek?: string[];
  timeSlot?: string;
}

export interface IFinalClass {
  id: string;
  classLead: IClassLead;
  tutor: IUser;
  coordinator: IUser;
  parent?: IUser;
  startDate: Date;
  endDate?: Date;
  actualEndDate?: Date;
  status: FINAL_CLASS_STATUS | string;
  schedule?: ISchedule;
  totalSessions: number;
  ratePerSession?: number;
  completedSessions: number;
  progressPercentage: number;
  studentName: string;
  subject: string[];
  grade: string;
  board: BOARD_TYPE | string;
  mode: TEACHING_MODE | string;
  location?: string;
  convertedBy: IUser;
  convertedAt: Date;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface IAttendance {
  id: string;
  finalClass: IFinalClass;
  sessionDate: Date;
  sessionNumber?: number;
  tutor: IUser;
  coordinator: IUser;
  parent?: IUser;
  status: ATTENDANCE_STATUS | string;
  submittedBy: IUser;
  submittedAt: Date;
  coordinatorApprovedBy?: IUser;
  coordinatorApprovedAt?: Date;
  parentApprovedBy?: IUser;
  parentApprovedAt?: Date;
  rejectedBy?: IUser;
  rejectedAt?: Date;
  rejectionReason?: string;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface IAttendanceStatistics {
  totalSessions: number;
  approvedCount: number;
  pendingCount: number;
  rejectedCount: number;
  approvalRate: number;
}

export interface IPayment {
  id: string;
  finalClass: IFinalClass;
  attendance: IAttendance;
  tutor: IUser;
  amount: number;
  currency: string;
  status: PAYMENT_STATUS | string;
  paymentMethod?: PAYMENT_METHOD | string;
  transactionId?: string;
  paymentDate?: Date;
  dueDate: Date;
  paidBy?: IUser;
  notes?: string;
  createdBy: IUser;
  createdAt: Date;
  updatedAt: Date;
}

export interface ITest {
  id: string;
  finalClass: IFinalClass;
  tutor: IUser;
  coordinator: IUser;
  testDate: Date;
  testTime: string;
  status: string;
  scheduledBy: IUser;
  scheduledAt: Date;
  completedAt?: Date;
  report?: {
    feedback: string;
    strengths: string;
    areasOfImprovement: string;
    studentPerformance: string;
    recommendations: string;
  };
  reportSubmittedBy?: IUser;
  reportSubmittedAt?: Date;
  cancellationReason?: string;
  cancelledBy?: IUser;
  cancelledAt?: Date;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ITutorFeedback {
  id: string;
  tutor: IUser;
  finalClass: IFinalClass;
  submittedBy: IUser;
  submitterRole: 'PARENT' | 'STUDENT';
  month: string;
  overallRating: number;
  teachingQuality: number;
  punctuality: number;
  communication: number;
  subjectKnowledge: number;
  comments?: string;
  strengths?: string;
  improvements?: string;
  wouldRecommend: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ITutorPerformanceMetrics {
  tutor: ITutor;
  classesAssigned: number;
  classesCompleted: number;
  totalClassHours: number;
  attendanceApprovalRate: number;
  averageTestScore: number;
  feedbackRatings: {
    overall: number;
    teachingQuality: number;
    punctuality: number;
    communication: number;
    subjectKnowledge: number;
  };
  recommendationRate: number;
  totalFeedback: number;
}

export interface IPendingTierChange {
  newTier: string;
  requestedAt: Date;
  requestedBy: IUser;
  reason?: string;
}

export interface ICoordinatorAnnouncement {
  id: string;
  coordinator: IUser;
  subject: string;
  message: string;
  recipientType: 'SPECIFIC_CLASS' | 'ALL_CLASSES' | 'SPECIFIC_TUTOR' | 'ALL_TUTORS' | 'STUDENTS_PARENTS';
  targetClass?: IFinalClass;
  targetTutor?: IUser;
  recipients: IUser[];
  recipientCount: number;
  sentAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface ICoordinatorAnnouncementStats {
  totalAnnouncements: number;
  totalRecipients: number;
  breakdown: Array<{ recipientType: string; count: number; totalRecipients: number }>;
}

export interface IPaymentStatistics {
  totalPayments: number;
  totalAmount: number;
  paidAmount: number;
  pendingAmount: number;
  overdueAmount: number;
  averagePaymentAmount: number;
  paymentsByStatus: Record<string, number>;
  paymentsByMethod: Record<string, number>;
}

export interface IDateWiseData {
  date: string;
  total: number;
  statusBreakdown: Record<string, number>;
}

export interface IStatusDistribution {
  status: string;
  count: number;
  percentage: number;
}

export interface IConversionFunnelStage {
  name: string;
  count: number;
  percentage: number;
}

export interface IConversionFunnel {
  stages: IConversionFunnelStage[];
  overallConversionRate: number;
}

export interface IClassProgress {
  totalClasses: number;
  activeClasses: number;
  completedClasses: number;
  pausedClasses: number;
  cancelledClasses: number;
  completionRate: number;
  averageProgress: number;
  statusDistribution: IStatusDistribution[];
}

export interface ITutorPerformance {
  tutor: ITutor;
  classesCompleted: number;
  totalRevenue: number;
  averageRating: number;
  demoApprovalRatio: number;
  attendanceApprovalRate: number;
}

export interface ICumulativeGrowth {
  date: string;
  newClasses: number;
  cumulativeClasses: number;
}

export interface IPendingApprovals {
  attendance: { coordinatorPending: number; parentPending: number; total: number };
  demos: { scheduledCount: number };
  totalPending: number;
}

export interface IRevenueAnalytics {
  totalRevenue: number;
  paidRevenue: number;
  pendingRevenue: number;
  overdueRevenue: number;
  revenueByDate: Array<{ date: string; revenue: number; paidRevenue: number }>;
  revenueByTutor: Array<{ tutor: IUser; totalRevenue: number }>;
  monthlyRevenue: Array<{ month: string; revenue: number }>;
  averageRevenuePerClass: number;
}

export interface IDashboardStatistics {
  classLeads: { total: number; new: number; converted: number };
  finalClasses: { total: number; active: number; completed: number };
  tutors: { total: number; verified: number; active: number };
  payments: { total: number; totalRevenue: number; paidRevenue: number; pendingRevenue: number; feesCollected: number; tutorPayout: number };
  conversionRate: number;
  averageRevenuePerClass: number;
  pendingApprovals: number;
}

// Manager related interfaces
export interface IManagerSettings {
  dashboardPreferences?: {
    defaultView?: string;
    defaultDateRange?: string;
    chartPreferences?: string[];
  };
  defaultFilters?: {
    leadStatus?: string[];
    classStatus?: string[];
    tutorVerificationStatus?: string;
  };
  notificationSettings?: {
    newLeads?: boolean;
    leadConversions?: boolean;
    demoScheduled?: boolean;
    paymentReceived?: boolean;
    tutorVerifications?: boolean;
  };
  reportPreferences?: {
    autoExportFrequency?: string;
    exportFormat?: string;
  };
}

export interface IManager {
  id: string;
  user: IUser;
  classLeadsCreated: number;
  demosScheduled: number;
  classesConverted: number;
  revenueGenerated: number;
  tutorsVerified: number;
  coordinatorsCreated: number;
  paymentsProcessed: number;
  conversionRate: number;
  averageRevenuePerClass: number;
  joiningDate: Date;
  department?: string;
  isActive: boolean;
  lastActivityAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  settings?: IManagerSettings;
}

export interface IAdminSettings {
  systemPreferences?: {
    maintenanceMode?: boolean;
    allowBulkOperations?: boolean;
    requireApprovalForDeletes?: boolean;
    sessionTimeout?: number;
  };
  dataExportSettings?: {
    autoBackupEnabled?: boolean;
    backupFrequency?: string;
    exportFormats?: string[];
    includeDeletedRecords?: boolean;
  };
  auditLogPreferences?: {
    logLevel?: string;
    retentionDays?: number;
    alertOnCriticalActions?: boolean;
    emailDigestFrequency?: string;
  };
  notificationSettings?: {
    systemAlerts?: boolean;
    userCreations?: boolean;
    bulkOperations?: boolean;
    securityEvents?: boolean;
  };
}

export interface IManagerMetrics {
  classLeadsCreated: number;
  demosScheduled: number;
  classesConverted: number;
  revenueGenerated: number;
  tutorsVerified: number;
  coordinatorsCreated: number;
  paymentsProcessed: number;
  conversionRate: number;
  averageRevenuePerClass: number;
  averageDemosPerLead: number;
  dateRange?: { from?: Date; to?: Date };
}

export interface IManagerPerformanceHistory {
  date: string;
  leadsCreated: number;
  classesConverted: number;
  revenue: number;
  conversionRate: number;
}

export interface IRelatedEntity {
  entityType: 'ClassLead' | 'FinalClass' | 'Demo' | 'Payment' | 'Tutor' | 'Coordinator' | 'Announcement';
  entityId: string;
  entityName?: string;
}

export interface IManagerActivityLog {
  id: string;
  manager: IUser;
  actionType: string;
  actionDescription: string;
  relatedEntity?: IRelatedEntity;
  metadata?: any;
  ipAddress?: string;
  userAgent?: string;
  timestamp: Date;
  createdAt: Date;
}

export interface IManagerContribution {
  managerMetrics: IManagerMetrics;
  overallMetrics: IDashboardStatistics;
  contributions: { leadsPercentage: number; conversionsPercentage: number; revenuePercentage: number };
  ranking: { position: number; totalManagers: number };
}
