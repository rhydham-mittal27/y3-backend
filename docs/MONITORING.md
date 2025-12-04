# Application Monitoring

This document outlines the monitoring and observability features implemented in the Your Shikshak application.

## Overview

The application includes comprehensive monitoring capabilities to track performance, errors, and system health in real-time.

## Features

### 1. Performance Monitoring

Tracks request performance metrics:
- Request duration
- Endpoint statistics
- Slow request detection (>1s)
- Average response times
- Request counts per endpoint

### 2. Error Tracking

Monitors application errors:
- Error frequency
- Error rates
- Most common errors
- Recent error logs
- Error correlation IDs

### 3. Health Metrics

Provides system health information:
- Server uptime
- Memory usage
- Database connection status
- Performance statistics
- Error statistics

## Endpoints

### Health Check
```
GET /api/health
```

Returns basic health status including:
- Server status
- Database connection
- Uptime
- Environment information

**Response:**
```json
{
  "success": true,
  "message": "Server is running",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "uptime": 3600,
  "environment": "production",
  "version": "1.0.0",
  "services": {
    "database": "connected"
  }
}
```

### Metrics Endpoint
```
GET /api/metrics
```

Returns detailed monitoring metrics:
- Performance statistics
- Error statistics
- Memory usage
- Request counts

**Response:**
```json
{
  "success": true,
  "data": {
    "uptime": 3600,
    "memory": {
      "rss": 52428800,
      "heapTotal": 20971520,
      "heapUsed": 15728640,
      "external": 1048576
    },
    "performance": {
      "totalRequests": 1000,
      "averageResponseTime": 150,
      "slowestEndpoints": [
        {
          "endpoint": "/api/dashboard",
          "method": "GET",
          "avgDuration": 500
        }
      ],
      "requestCounts": {
        "GET /api/health": 100,
        "POST /api/auth/login": 50
      }
    },
    "errors": {
      "totalErrors": 5,
      "errorRate": 0.5,
      "mostCommonErrors": [
        {
          "endpoint": "/api/users",
          "method": "POST",
          "count": 3
        }
      ],
      "recentErrors": [...]
    }
  }
}
```

## Integration

### Middleware

The monitoring middleware is automatically applied to all routes:

```typescript
import monitoringMiddleware from './middlewares/monitoring';

app.use(monitoringMiddleware);
```

### Manual Tracking

You can also track errors manually:

```typescript
import { monitoringService } from './utils/monitoring';

try {
  // Your code
} catch (error) {
  monitoringService.trackError(req, error, 500);
  throw error;
}
```

## Monitoring Best Practices

### 1. Alert Thresholds

Set up alerts for:
- **Error Rate**: > 1% of requests
- **Response Time**: > 1 second average
- **Memory Usage**: > 80% of available
- **Database Connection**: Disconnected

### 2. Logging

All monitoring events are logged:
- Performance metrics → `combined.log`
- Errors → `error.log`
- Slow requests → Warning level

### 3. Metrics Retention

- Performance metrics: Last 1000 requests
- Error metrics: Last 500 errors
- Automatically rotated to prevent memory issues

## External Monitoring Tools

### Recommended Tools

1. **APM (Application Performance Monitoring)**
   - New Relic
   - Datadog
   - AppDynamics

2. **Error Tracking**
   - Sentry
   - Rollbar
   - Bugsnag

3. **Log Aggregation**
   - ELK Stack (Elasticsearch, Logstash, Kibana)
   - Splunk
   - CloudWatch Logs

4. **Uptime Monitoring**
   - Pingdom
   - UptimeRobot
   - StatusCake

### Integration Example (Sentry)

```typescript
import * as Sentry from '@sentry/node';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
});

// In error handler
Sentry.captureException(error);
```

## Dashboard

### Metrics to Monitor

1. **Performance**
   - Average response time
   - P95/P99 response times
   - Request throughput
   - Slow endpoints

2. **Errors**
   - Error rate
   - Error types
   - Error trends
   - Failed requests

3. **System**
   - CPU usage
   - Memory usage
   - Database connections
   - Disk I/O

4. **Business Metrics**
   - Active users
   - API usage
   - Feature adoption
   - Conversion rates

## Alerts

### Critical Alerts

- Server down
- Database disconnected
- Error rate spike (>5%)
- Memory exhaustion
- Disk space low

### Warning Alerts

- Slow response times
- Elevated error rate (1-5%)
- High memory usage
- Unusual traffic patterns

## Troubleshooting

### High Response Times

1. Check slowest endpoints in metrics
2. Review database query performance
3. Check external API dependencies
4. Monitor memory usage

### High Error Rates

1. Review recent errors in metrics
2. Check application logs
3. Verify database connectivity
4. Review recent deployments

### Memory Issues

1. Check memory metrics
2. Review for memory leaks
3. Consider increasing server resources
4. Optimize data structures

---

**Last Updated**: 2024
**Version**: 1.0

