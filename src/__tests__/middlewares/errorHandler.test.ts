/**
 * Error Handler Middleware Tests
 */

import { Request, Response, NextFunction } from 'express';
import errorHandler from '../../middlewares/errorHandler';
import ErrorResponse from '../../utils/errorResponse';
import mongoose from 'mongoose';

// Mock logger
jest.mock('../../utils/logger', () => ({
  logError: jest.fn(),
}));

// Mock correlation ID
jest.mock('../../middlewares/correlationId', () => ({
  getCorrelationIdFromRequest: jest.fn(() => 'test-correlation-id'),
}));

describe('Error Handler Middleware', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    mockRequest = {
      path: '/api/test',
      method: 'GET',
      ip: '127.0.0.1',
      get: jest.fn(() => 'test-user-agent'),
    };

    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };

    mockNext = jest.fn();
  });

  it('should handle ErrorResponse with status code', () => {
    const error = new ErrorResponse('Test error', 400);
    errorHandler(error, mockRequest as Request, mockResponse as Response, mockNext);

    expect(mockResponse.status).toHaveBeenCalledWith(400);
    expect(mockResponse.json).toHaveBeenCalled();
  });

  it('should handle mongoose CastError', () => {
    const error = new mongoose.Error.CastError('ObjectId', 'invalid-id', 'id');
    errorHandler(error, mockRequest as Request, mockResponse as Response, mockNext);

    expect(mockResponse.status).toHaveBeenCalledWith(400);
  });

  it('should handle mongoose ValidationError', () => {
    const error = new mongoose.Error.ValidationError();
    error.errors = {
      email: { message: 'Email is required' } as mongoose.Error.ValidatorError,
      name: { message: 'Name is required' } as mongoose.Error.ValidatorError,
    };
    errorHandler(error, mockRequest as Request, mockResponse as Response, mockNext);

    expect(mockResponse.status).toHaveBeenCalledWith(400);
  });

  it('should handle duplicate key error', () => {
    const error: any = { code: 11000 };
    errorHandler(error, mockRequest as Request, mockResponse as Response, mockNext);

    expect(mockResponse.status).toHaveBeenCalledWith(409);
  });

  it('should return 500 for unknown errors', () => {
    const error = new Error('Unknown error');
    errorHandler(error, mockRequest as Request, mockResponse as Response, mockNext);

    expect(mockResponse.status).toHaveBeenCalledWith(500);
  });

  it('should include stack trace in development mode', () => {
    process.env.NODE_ENV = 'development';
    const error = new Error('Test error');
    error.stack = 'test stack trace';
    errorHandler(error, mockRequest as Request, mockResponse as Response, mockNext);

    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        stack: 'test stack trace',
      })
    );
  });
});

