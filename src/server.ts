import dotenv from 'dotenv';
import express from 'express';

import helmet from 'helmet';
import cors from 'cors';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const compression: any = require('compression');
import connectDB from './config/database';
import { validateEnv } from './config/envValidator';
import requestLogger from './middlewares/requestLogger';
import correlationIdMiddleware from './middlewares/correlationId';
import sanitizeInput from './middlewares/sanitizeInput';
import monitoringMiddleware from './middlewares/monitoring';
import { generalLimiter, authLimiter, writeLimiter, readLimiter } from './middlewares/rateLimiter';
import notFound from './middlewares/notFound';
import errorHandler from './middlewares/errorHandler';
import mongoose from 'mongoose';
import path from 'path';
import { logInfo } from './utils/logger';
import { getHealthMetrics } from './utils/monitoring';
import swaggerUi from 'swagger-ui-express';
import { swaggerSpec } from './config/swagger';

import authRoutes from './routes/authRoutes';
import leadRoutes from './routes/leadRoutes';
import publicLeadRoutes from './routes/publicLeadRoutes';
import announcementRoutes from './routes/announcementRoutes';
import notificationRoutes from './routes/notificationRoutes';
import demoRoutes from './routes/demoRoutes';
import coordinatorRoutes from './routes/coordinatorRoutes';
import finalClassRoutes from './routes/finalClassRoutes';
import attendanceRoutes from './routes/attendanceRoutes';
import attendanceSheetRoutes from './routes/attendanceSheetRoutes';
import paymentRoutes from './routes/paymentRoutes';
import tutorRoutes from './routes/tutorRoutes';
import dashboardRoutes from './routes/dashboardRoutes';
import managerRoutes from './routes/managerRoutes';
import adminRoutes from './routes/adminRoutes';
import testRoutes from './routes/testRoutes';
import tutorLeadRoutes from './routes/tutorLeadRoutes';
import studentRoutes from './routes/studentRoutes';
import studentAuthRoutes from './routes/studentAuth';
import settingsRoutes from './routes/settingsRoutes';
import noteRoutes from './routes/noteRoutes';
import subjectRoutes from './routes/subjectRoutes';
import optionRoutes from './routes/optionRoutes';

// Load environment variables
dotenv.config();

// Validate environment variables before starting
try {
  validateEnv();
} catch (error) {
  console.error('Failed to validate environment variables:', error);
  process.exit(1);
}

const app = express();

const isRateLimitingEnabled = process.env.DISABLE_RATE_LIMITING !== 'true';

// Connect Database
connectDB();

// Middleware
app.use(helmet());
app.use(
  cors({
    origin: process.env.ALLOWED_ORIGIN || '*',
    credentials: true,
  })
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(compression());

// Correlation ID middleware (must be early in the chain)
app.use(correlationIdMiddleware);

// Request logging
app.use(requestLogger);

// Performance monitoring
app.use(monitoringMiddleware);

// Input sanitization
app.use(sanitizeInput);

// Rate limiting - apply general limiter to all routes
if (isRateLimitingEnabled) {
  app.use(generalLimiter);
}

// Static file serving for uploads
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Enhanced Health Check
app.get('/api/health', async (_req, res) => {
  const healthCheck = {
    success: true,
    message: 'Server is running',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
    version: process.env.npm_package_version || '1.0.0',
    services: {
      database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    },
  };

  // Check database connection
  try {
    const db = mongoose.connection.db;
    if (db && mongoose.connection.readyState === 1) {
      await db.admin().ping();
      healthCheck.services.database = 'connected';
    } else {
      healthCheck.services.database = 'disconnected';
      healthCheck.success = false;
      healthCheck.message = 'Server is running but database is disconnected';
    }
  } catch (error) {
    healthCheck.services.database = 'disconnected';
    healthCheck.success = false;
    healthCheck.message = 'Server is running but database is disconnected';
  }

  const statusCode = healthCheck.success ? 200 : 503;
  return res.status(statusCode).json(healthCheck);
});

// Monitoring metrics endpoint
app.get('/api/metrics', getHealthMetrics);

// Swagger API documentation
if (process.env.NODE_ENV !== 'production' || process.env.ENABLE_SWAGGER === 'true') {
  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
  app.get('/api/docs-json', async (_req, res) => {
    res.setHeader('Content-Type', 'application/json');
    return res.send(swaggerSpec);
  });
}

// Routes with rate limiting
// Authentication routes - strict rate limiting
if (isRateLimitingEnabled) {
  app.use('/api/auth', authLimiter, authRoutes);
} else {
  app.use('/api/auth', authRoutes);
}

// Write operations - moderate rate limiting
if (isRateLimitingEnabled) {
  app.use('/api/leads', writeLimiter, leadRoutes);
  app.use('/api/public/leads', writeLimiter, publicLeadRoutes);
  app.use('/api/announcements', writeLimiter, announcementRoutes);
  app.use('/api/notifications', writeLimiter, notificationRoutes);
  app.use('/api/demos', writeLimiter, demoRoutes);
  app.use('/api/coordinators', writeLimiter, coordinatorRoutes);
  app.use('/api/final-classes', writeLimiter, finalClassRoutes);
  app.use('/api/attendance', writeLimiter, attendanceRoutes);
  app.use('/api/attendance-sheets', writeLimiter, attendanceSheetRoutes);
  app.use('/api/payments', writeLimiter, paymentRoutes);
  app.use('/api/tutors', writeLimiter, tutorRoutes);
  app.use('/api/managers', writeLimiter, managerRoutes);
  app.use('/api/admin', writeLimiter, adminRoutes);
  app.use('/api/tests', writeLimiter, testRoutes);
  app.use('/api/v1/tutor-leads', writeLimiter, tutorLeadRoutes);
  app.use('/api/students', writeLimiter, studentRoutes);
  app.use('/api/student-auth', authLimiter, studentAuthRoutes);
  app.use('/api/settings', writeLimiter, settingsRoutes);
  app.use('/api/notes', writeLimiter, noteRoutes);
  app.use('/api/subjects', writeLimiter, subjectRoutes);
  app.use('/api/options', writeLimiter, optionRoutes);
} else {
  app.use('/api/leads', leadRoutes);
  app.use('/api/public/leads', publicLeadRoutes);
  app.use('/api/announcements', announcementRoutes);
  app.use('/api/notifications', notificationRoutes);
  app.use('/api/demos', demoRoutes);
  app.use('/api/coordinators', coordinatorRoutes);
  app.use('/api/final-classes', finalClassRoutes);
  app.use('/api/attendance', attendanceRoutes);
  app.use('/api/attendance-sheets', attendanceSheetRoutes);
  app.use('/api/payments', paymentRoutes);
  app.use('/api/tutors', tutorRoutes);
  app.use('/api/managers', managerRoutes);
  app.use('/api/admin', adminRoutes);
  app.use('/api/tests', testRoutes);
  app.use('/api/v1/tutor-leads', tutorLeadRoutes);
  app.use('/api/students', studentRoutes);
  app.use('/api/student-auth', studentAuthRoutes);
  app.use('/api/settings', settingsRoutes);
  app.use('/api/notes', noteRoutes);
  app.use('/api/subjects', subjectRoutes);
  app.use('/api/options', optionRoutes);
}

// Read operations - lenient rate limiting
if (isRateLimitingEnabled) {
  app.use('/api/dashboard', readLimiter, dashboardRoutes);
} else {
  app.use('/api/dashboard', dashboardRoutes);
}

// Not Found Middleware
app.use(notFound);

// Error Handler Middleware
app.use(errorHandler);

const PORT = process.env.PORT || 5000;
const server = app.listen(PORT, () => {
  logInfo(`Server running on port ${PORT} in ${process.env.NODE_ENV || 'development'} mode`);
});

// Graceful shutdown
const shutdown = async () => {
  server.close(async () => {
    await mongoose.connection.close();
    process.exit(0);
  });
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

export default app;