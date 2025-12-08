/**
 * Application Monitoring Utilities
 * Provides monitoring and observability features
 */

import { Request, Response } from 'express';
import { logWarn } from './logger';
import { getCorrelationIdFromRequest } from '../middlewares/correlationId';

interface PerformanceMetrics {
  endpoint: string;
  method: string;
  duration: number;
  statusCode: number;
  timestamp: Date;
  correlationId?: string;
}

interface ErrorMetrics {
  error: string;
  endpoint: string;
  method: string;
  statusCode: number;
  timestamp: Date;
  correlationId?: string;
  stack?: string;
}

interface PerformanceStats {
  totalRequests: number;
  averageResponseTime: number;
  slowestEndpoints: Array<{ endpoint: string; method: string; avgDuration: number }>;
  requestCounts: Record<string, number>;
}

interface ErrorStats {
  totalErrors: number;
  errorRate: number;
  mostCommonErrors: Array<{ endpoint: string; method: string; count: number }>;
  recentErrors: ErrorMetrics[];
}

class MonitoringService {
  private performanceMetrics: PerformanceMetrics[] = [];
  private errorMetrics: ErrorMetrics[] = [];
  private requestCounts: Map<string, number> = new Map();
  private errorCounts: Map<string, number> = new Map();

  /**
   * Track request performance
   */
  trackPerformance(req: Request, res: Response, duration: number): void {
    const endpoint = req.path;
    const method = req.method;
    const statusCode = res.statusCode;
    const correlationId = getCorrelationIdFromRequest(req);

    const metric: PerformanceMetrics = {
      endpoint,
      method,
      duration,
      statusCode,
      timestamp: new Date(),
      correlationId,
    };

    this.performanceMetrics.push(metric);

    // Keep only last 1000 metrics in memory
    if (this.performanceMetrics.length > 1000) {
      this.performanceMetrics.shift();
    }

    // Track request counts
    const key = `${method} ${endpoint}`;
    this.requestCounts.set(key, (this.requestCounts.get(key) || 0) + 1);

    // Log slow requests
    if (duration > 1000) {
      logWarn(`Slow request detected: ${method} ${endpoint} took ${duration}ms`, correlationId);
    }
  }

  /**
   * Track errors
   */
  trackError(req: Request, error: Error, statusCode: number): void {
    const endpoint = req.path;
    const method = req.method;
    const correlationId = getCorrelationIdFromRequest(req);

    const metric: ErrorMetrics = {
      error: error.message,
      endpoint,
      method,
      statusCode,
      timestamp: new Date(),
      correlationId,
      stack: error.stack,
    };

    this.errorMetrics.push(metric);

    // Keep only last 500 error metrics in memory
    if (this.errorMetrics.length > 500) {
      this.errorMetrics.shift();
    }

    // Track error counts
    const key = `${method} ${endpoint}`;
    this.errorCounts.set(key, (this.errorCounts.get(key) || 0) + 1);
  }

  /**
   * Get performance statistics
   */
  getPerformanceStats(): PerformanceStats {
    if (this.performanceMetrics.length === 0) {
      return {
        totalRequests: 0,
        averageResponseTime: 0,
        slowestEndpoints: [],
        requestCounts: {},
      };
    }

    const totalRequests = this.performanceMetrics.length;
    const totalDuration = this.performanceMetrics.reduce((sum, m) => sum + m.duration, 0);
    const averageResponseTime = totalDuration / totalRequests;

    // Group by endpoint and calculate averages
    const endpointStats = new Map<string, { count: number; totalDuration: number }>();
    this.performanceMetrics.forEach((m) => {
      const key = `${m.method} ${m.endpoint}`;
      const stats = endpointStats.get(key) || { count: 0, totalDuration: 0 };
      stats.count++;
      stats.totalDuration += m.duration;
      endpointStats.set(key, stats);
    });

    const slowestEndpoints = Array.from(endpointStats.entries())
      .map(([key, stats]) => {
        const [method, endpoint] = key.split(' ', 2);
        return {
          endpoint,
          method,
          avgDuration: stats.totalDuration / stats.count,
        };
      })
      .sort((a, b) => b.avgDuration - a.avgDuration)
      .slice(0, 10);

    const requestCounts: Record<string, number> = {};
    this.requestCounts.forEach((count, key) => {
      requestCounts[key] = count;
    });

    return {
      totalRequests,
      averageResponseTime: Math.round(averageResponseTime),
      slowestEndpoints,
      requestCounts,
    };
  }

  /**
   * Get error statistics
   */
  getErrorStats(): ErrorStats {
    const totalRequests = this.performanceMetrics.length;
    const totalErrors = this.errorMetrics.length;
    const errorRate = totalRequests > 0 ? (totalErrors / totalRequests) * 100 : 0;

    const errorCounts = new Map<string, number>();
    this.errorMetrics.forEach((m) => {
      const key = `${m.method} ${m.endpoint}`;
      errorCounts.set(key, (errorCounts.get(key) || 0) + 1);
    });

    const mostCommonErrors = Array.from(errorCounts.entries())
      .map(([key, count]) => {
        const [method, endpoint] = key.split(' ', 2);
        return { endpoint, method, count };
      })
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    const recentErrors = this.errorMetrics.slice(-20).reverse();

    return {
      totalErrors,
      errorRate: Math.round(errorRate * 100) / 100,
      mostCommonErrors,
      recentErrors,
    };
  }

  /**
   * Get health metrics
   */
  getHealthMetrics(): {
    uptime: number;
    memory: NodeJS.MemoryUsage;
    performance: PerformanceStats;
    errors: ErrorStats;
  } {
    return {
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      performance: this.getPerformanceStats(),
      errors: this.getErrorStats(),
    };
  }

  /**
   * Reset metrics (useful for testing)
   */
  reset(): void {
    this.performanceMetrics = [];
    this.errorMetrics = [];
    this.requestCounts.clear();
    this.errorCounts.clear();
  }
}

// Singleton instance
export const monitoringService = new MonitoringService();

/**
 * Performance monitoring middleware
 */
export const performanceMonitor = (req: Request, res: Response, next: () => void): void => {
  const startTime = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - startTime;
    monitoringService.trackPerformance(req, res, duration);
  });

  next();
};

/**
 * Health check endpoint handler
 */
export const getHealthMetrics = (_req: Request, res: Response): void => {
  const metrics = monitoringService.getHealthMetrics();
  res.status(200).json({
    success: true,
    data: metrics,
  });
};

export default monitoringService;

