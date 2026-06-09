import dotenv from 'dotenv';
import express, { RequestHandler } from 'express';

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
import parentLeadRoutes from './routes/parentLeadRoutes';
import parentRoutes from './routes/parentRoutes';
import studentRoutes from './routes/studentRoutes';
import studentAuthRoutes from './routes/studentAuth';
import settingsRoutes from './routes/settingsRoutes';
import noteRoutes from './routes/noteRoutes';
import subjectRoutes from './routes/subjectRoutes';
import optionRoutes from './routes/optionRoutes';
import classPlanRoutes from './routes/classPlanRoutes';
import publicLandingRoutes from './routes/publicLandingRoutes';
import classSessionRoutes from './routes/classSessionRoutes';
import shiftRequestRoutes from './routes/shiftRequestRoutes';
import changeRoutes from './routes/changeRoutes';

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

const registerRoute = (
  path: string,
  router: express.Router,
  limiter?: RequestHandler
) => {
  if (isRateLimitingEnabled && limiter) {
    app.use(path, limiter, router);
    return;
  }
  app.use(path, router);
};

// Connect Database
connectDB();

// Middleware
app.use(helmet());

const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const normalizeOrigin = (o: string) => o.replace(/\/+$/, '');

app.use(
  cors({
    origin: function (origin, callback) {
      // Allow requests with no origin (like mobile apps or curl requests)
      if (!origin) return callback(null, true);

      if (allowedOrigins.includes('*')) {
        return callback(null, true);
      }

      const normalized = normalizeOrigin(origin);
      if (allowedOrigins.some((o) => normalizeOrigin(o) === normalized)) {
        return callback(null, true);
      } else {
        return callback(new Error('Not allowed by CORS'), false);
      }
    },

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
registerRoute('/api/auth', authRoutes, authLimiter);

// Write operations - moderate rate limiting
registerRoute('/api/leads', leadRoutes, writeLimiter);
registerRoute('/api/public/leads', publicLeadRoutes, writeLimiter);
registerRoute('/api/public/landing', publicLandingRoutes, writeLimiter);
registerRoute('/api/announcements', announcementRoutes, writeLimiter);
registerRoute('/api/notifications', notificationRoutes, writeLimiter);
registerRoute('/api/demos', demoRoutes, writeLimiter);
registerRoute('/api/coordinators', coordinatorRoutes, writeLimiter);
registerRoute('/api/final-classes', finalClassRoutes, writeLimiter);
registerRoute('/api/attendance', attendanceRoutes, writeLimiter);
registerRoute('/api/attendance-sheets', attendanceSheetRoutes, writeLimiter);
registerRoute('/api/payments', paymentRoutes, writeLimiter);
registerRoute('/api/tutors', tutorRoutes, writeLimiter);
registerRoute('/api/managers', managerRoutes, writeLimiter);
registerRoute('/api/admin', adminRoutes, writeLimiter);
registerRoute('/api/tests', testRoutes, writeLimiter);
registerRoute('/api/v1/tutor-leads', tutorLeadRoutes, writeLimiter);
registerRoute('/api/v1/parent-leads', parentLeadRoutes, writeLimiter);
registerRoute('/api/v1/parents', parentRoutes, writeLimiter);
registerRoute('/api/students', studentRoutes, writeLimiter);
registerRoute('/api/student-auth', studentAuthRoutes, authLimiter);
registerRoute('/api/settings', settingsRoutes, writeLimiter);
registerRoute('/api/notes', noteRoutes, writeLimiter);
registerRoute('/api/subjects', subjectRoutes, writeLimiter);
registerRoute('/api/options', optionRoutes, writeLimiter);
registerRoute('/api/class-plans', classPlanRoutes, writeLimiter);
registerRoute('/api/class-sessions', classSessionRoutes, writeLimiter);
registerRoute('/api/shift-requests', shiftRequestRoutes, writeLimiter);

// Read operations - lenient rate limiting
registerRoute('/api/dashboard', dashboardRoutes, readLimiter);
registerRoute('/api/changes', changeRoutes, readLimiter);

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
