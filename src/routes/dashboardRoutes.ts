import { Router } from 'express';
import {
  getDateWiseLeadsChart,
  getLeadStatusDistribution,
  getConversionFunnelData,
  getFinalClassProgressData,
  getTutorProgressReportData,
  getCumulativeGrowthChart,
  getPendingApprovalsData,
  getRevenueAnalyticsData,
  getOverallStats,
  exportDashboardCSV,
  exportDashboardPDF,
} from '../controllers/dashboardController';
import {
  dateRangeValidation,
  requiredDateRangeValidation,
  tutorReportValidation,
  exportValidation,
} from '../validators/dashboardValidator';
import protect from '../middlewares/auth';
import authorize from '../middlewares/authorize';
import { USER_ROLES } from '../config/constants';

const router = Router();

router.use(protect);

router.get('/stats', authorize(USER_ROLES.MANAGER, USER_ROLES.ADMIN), dateRangeValidation, getOverallStats);
router.get('/leads/date-wise', authorize(USER_ROLES.MANAGER, USER_ROLES.ADMIN), dateRangeValidation, getDateWiseLeadsChart);
router.get('/leads/status-distribution', authorize(USER_ROLES.MANAGER, USER_ROLES.ADMIN), dateRangeValidation, getLeadStatusDistribution);
router.get('/conversion-funnel', authorize(USER_ROLES.MANAGER, USER_ROLES.ADMIN), dateRangeValidation, getConversionFunnelData);
router.get('/classes/progress', authorize(USER_ROLES.MANAGER, USER_ROLES.ADMIN), dateRangeValidation, getFinalClassProgressData);
router.get('/classes/cumulative-growth', authorize(USER_ROLES.MANAGER, USER_ROLES.ADMIN), requiredDateRangeValidation, getCumulativeGrowthChart);
router.get('/tutors/progress-report', authorize(USER_ROLES.MANAGER, USER_ROLES.ADMIN), tutorReportValidation, getTutorProgressReportData);
router.get('/pending-approvals', authorize(USER_ROLES.MANAGER, USER_ROLES.ADMIN), getPendingApprovalsData);
router.get('/revenue/analytics', authorize(USER_ROLES.MANAGER, USER_ROLES.ADMIN), dateRangeValidation, getRevenueAnalyticsData);
router.get('/export/csv', authorize(USER_ROLES.MANAGER, USER_ROLES.ADMIN), exportValidation, exportDashboardCSV);
router.get('/export/pdf', authorize(USER_ROLES.MANAGER, USER_ROLES.ADMIN), exportValidation, exportDashboardPDF);

export default router;
