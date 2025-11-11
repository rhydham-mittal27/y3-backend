import mongoose from 'mongoose';
import { logInfo, logError } from '../utils/logger';

mongoose.set('strictQuery', false);

export const connectDB = async (): Promise<void> => {
  const mongoURI = process.env.MONGODB_URI as string;

  try {
    if (!mongoURI) {
      throw new Error('MONGODB_URI is not defined in environment variables');
    }

    await mongoose.connect(mongoURI, {});

    mongoose.connection.on('connected', () => {
      logInfo('MongoDB connected successfully');
    });

    mongoose.connection.on('error', (err) => {
      logError(`MongoDB connection error: ${err}`);
    });

    mongoose.connection.on('disconnected', () => {
      logInfo('MongoDB disconnected');
    });
  } catch (error) {
    logError(`Failed to connect to MongoDB: ${(error as Error).message}`);
    process.exit(1);
  }
};

export default connectDB;
