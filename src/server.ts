import dotenv from 'dotenv';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const compression: any = require('compression');
import connectDB from './config/database';
import requestLogger from './middlewares/requestLogger';
import notFound from './middlewares/notFound';
import errorHandler from './middlewares/errorHandler';
import mongoose from 'mongoose';
import path from 'path';
import authRoutes from './routes/authRoutes';
import leadRoutes from './routes/leadRoutes';
import announcementRoutes from './routes/announcementRoutes';
import notificationRoutes from './routes/notificationRoutes';
import demoRoutes from './routes/demoRoutes';
import coordinatorRoutes from './routes/coordinatorRoutes';
import finalClassRoutes from './routes/finalClassRoutes';
import attendanceRoutes from './routes/attendanceRoutes';
import paymentRoutes from './routes/paymentRoutes';
import tutorRoutes from './routes/tutorRoutes';
import dashboardRoutes from './routes/dashboardRoutes';
import managerRoutes from './routes/managerRoutes';
import adminRoutes from './routes/adminRoutes';
import testRoutes from './routes/testRoutes';
import tutorLeadRoutes from './routes/tutorLeadRoutes';

dotenv.config();

const app = express();

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
app.use(requestLogger);
// Static file serving for uploads
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Health Check
app.get('/api/health', (_req, res) => {
  return res.json({ success: true, message: 'Server is running' });
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/leads', leadRoutes);
app.use('/api/announcements', announcementRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/demos', demoRoutes);
app.use('/api/coordinators', coordinatorRoutes);
app.use('/api/final-classes', finalClassRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/tutors', tutorRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/managers', managerRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/tests', testRoutes);
app.use('/api/v1/tutor-leads', tutorLeadRoutes);

// Not Found Middleware
app.use(notFound);

// Error Handler Middleware
app.use(errorHandler);

const PORT = process.env.PORT || 5000;
const server = app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Server running on port ${PORT}`);
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