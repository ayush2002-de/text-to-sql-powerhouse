# Logging System Documentation

This document describes the comprehensive logging system implemented in the Text-to-SQL Powerhouse
project.

## Overview

The logging system uses Winston, a versatile logging library for Node.js, with structured logging,
multiple transports, and service-specific loggers.

## Features

- **Multiple Log Levels**: error, warn, info, debug
- **Structured Logging**: JSON format with metadata
- **Service-Specific Loggers**: Separate loggers for different components
- **File Rotation**: Daily log rotation with compression
- **Console Output**: Colored console logs for development
- **Express Integration**: Request/response logging middleware
- **Graceful Shutdown**: Proper log cleanup on application exit

## Log Levels

### Error (Level 0)

- **Purpose**: Critical errors that require immediate attention
- **Usage**: Database connection failures, API errors, validation failures
- **File**: `logs/error-YYYY-MM-DD.log`
- **Retention**: 14 days

### Warn (Level 1)

- **Purpose**: Warning conditions that should be monitored
- **Usage**: Deprecated API usage, missing optional parameters, performance warnings
- **File**: `logs/combined-YYYY-MM-DD.log`
- **Retention**: 30 days

### Info (Level 2)

- **Purpose**: General operational information
- **Usage**: Server startup, request completion, job completion
- **File**: `logs/combined-YYYY-MM-DD.log`
- **Retention**: 30 days

### Debug (Level 3)

- **Purpose**: Detailed information for debugging
- **Usage**: Function entry/exit, variable values, detailed flow
- **File**: `logs/debug-YYYY-MM-DD.log` (development only)
- **Retention**: 7 days

## Configuration

### Environment Variables

```env
LOG_LEVEL=info          # Minimum log level to output
NODE_ENV=development    # Environment (affects debug logging)
```

### Log Level Hierarchy

- `error`: Only error messages
- `warn`: Error and warning messages
- `info`: Error, warning, and info messages (default)
- `debug`: All messages including debug (verbose)

## Usage Examples

### Basic Logging

```javascript
import logger from './src/config/logger.js';

// Error logging
logger.error('Database connection failed', {
  error: error.message,
  host: 'localhost',
  port: 5432,
});

// Warning logging
logger.warn('API rate limit approaching', {
  currentRequests: 95,
  limit: 100,
});

// Info logging
logger.info('Server started successfully', {
  port: 3001,
  environment: 'development',
});

// Debug logging
logger.debug('Processing user request', {
  userId: 123,
  action: 'getData',
});
```

### Service-Specific Logging

```javascript
import { createServiceLogger } from './src/config/logger.js';

const sqlLogger = createServiceLogger('SQL_GENERATOR');

sqlLogger.info('Starting SQL generation', {
  questionLength: question.length,
});
```

### Helper Functions

```javascript
import { logHelpers } from './src/config/logger.js';

// Using helper functions
logHelpers.error('Operation failed', { userId: 123 }, 'USER_SERVICE');
logHelpers.info('Task completed', { duration: '2.5s' }, 'TASK_MANAGER');
```

## Express Middleware

### Request Logging

Automatically logs all incoming requests and responses:

```javascript
import { requestLogger } from './src/config/logger.js';

app.use(requestLogger);
```

**Logged Information:**

- Request method, URL, user agent, IP
- Response status code, duration
- Automatic service tagging as 'HTTP'

### Error Logging

Logs Express errors with context:

```javascript
import { errorLogger } from './src/config/logger.js';

app.use(errorLogger);
```

## Service Tags

Each log entry includes a service tag for easy filtering:

- **SYSTEM**: Server startup, shutdown, system events
- **HTTP**: HTTP requests and responses
- **API**: API-specific operations
- **SQL_GENERATOR**: SQL generation process
- **SCHEMA_SYNC**: Database schema synchronization
- **QueryLogSync**: Query log synchronization and analysis
- **DATABASE**: Database operations
- **CRON**: Scheduled job management

## File Structure

```
logs/
├── error-2025-01-31.log      # Error logs only
├── combined-2025-01-31.log   # All logs (info, warn, error)
├── debug-2025-01-31.log      # Debug logs (development only)
├── error-2025-01-30.log.gz   # Compressed older logs
└── combined-2025-01-30.log.gz
```

## Log Format

### Console Output (Development)

```
2025-01-31 18:22:15 info [API]: SQL generation request received {
  "question": "Show me all leads created in the last 30 days...",
  "service": "API"
}
```

### File Output (JSON)

```json
{
  "timestamp": "2025-01-31 18:22:15",
  "level": "info",
  "message": "SQL generation request received",
  "service": "API",
  "question": "Show me all leads created in the last 30 days...",
  "meta": {}
}
```

## Best Practices

### 1. Use Appropriate Log Levels

```javascript
// ✅ Good
logger.error('Database connection failed', { error: err.message });
logger.info('User logged in', { userId: user.id });
logger.debug('Processing step 1', { data: processedData });

// ❌ Avoid
logger.error('User clicked button'); // Not an error
logger.debug('Server started'); // Should be info
```

### 2. Include Relevant Context

```javascript
// ✅ Good
logger.info('SQL generation completed', {
  questionLength: question.length,
  sqlLength: result.length,
  duration: '1.2s',
  tablesUsed: ['users', 'orders'],
});

// ❌ Avoid
logger.info('SQL generation completed');
```

### 3. Use Service Tags

```javascript
// ✅ Good
logger.info('Processing payment', {
  amount: 100,
  service: 'PAYMENT_SERVICE',
});

// ✅ Also good
const paymentLogger = createServiceLogger('PAYMENT_SERVICE');
paymentLogger.info('Processing payment', { amount: 100 });
```

### 4. Sanitize Sensitive Data

```javascript
// ✅ Good
logger.info('User authentication', {
  userId: user.id,
  email: user.email.replace(/(.{2}).*(@.*)/, '$1***$2'),
});

// ❌ Avoid
logger.info('User authentication', {
  password: user.password, // Never log passwords
  creditCard: user.creditCard, // Never log sensitive data
});
```

## Monitoring and Alerts

### Log Analysis

- Use log aggregation tools (ELK Stack, Splunk, etc.)
- Set up alerts for error patterns
- Monitor log volume and patterns

### Key Metrics to Monitor

- Error rate by service
- Response time trends
- Failed SQL generations
- Database connection issues

## Troubleshooting

### Common Issues

1. **Logs not appearing**
   - Check LOG_LEVEL environment variable
   - Verify file permissions in logs directory
   - Check console for winston errors

2. **Log files growing too large**
   - Adjust maxSize in logger configuration
   - Reduce log retention period
   - Increase log level to reduce volume

3. **Performance impact**
   - Use async logging for high-volume applications
   - Reduce debug logging in production
   - Consider log sampling for very high traffic

### Debug Commands

```bash
# Check current log level
echo $LOG_LEVEL

# View recent errors
tail -f logs/error-$(date +%Y-%m-%d).log

# View all recent logs
tail -f logs/combined-$(date +%Y-%m-%d).log

# Search for specific service logs
grep "SQL_GENERATOR" logs/combined-$(date +%Y-%m-%d).log
```

## Production Considerations

### Recommended Settings

```env
LOG_LEVEL=warn          # Reduce log volume
NODE_ENV=production     # Disables debug file logging
```

### Security

- Ensure log files are not publicly accessible
- Implement log rotation to prevent disk space issues
- Consider encrypting sensitive log data
- Set up proper file permissions (600 or 640)

### Performance

- Monitor disk I/O impact
- Use log aggregation services for centralized logging
- Consider async logging for high-throughput applications

## Integration Examples

### Database Operations

```javascript
const dbLogger = createServiceLogger('DATABASE');

try {
  dbLogger.debug('Executing query', { sql: query.substring(0, 100) });
  const result = await db.query(query);
  dbLogger.info('Query executed successfully', {
    rowCount: result.rows.length,
    duration: '45ms',
  });
} catch (error) {
  dbLogger.error('Query execution failed', {
    error: error.message,
    sql: query.substring(0, 100),
  });
}
```

### API Endpoints

```javascript
router.post('/api/endpoint', async (req, res) => {
  const apiLogger = createServiceLogger('API');

  apiLogger.info('API request received', {
    endpoint: '/api/endpoint',
    bodySize: JSON.stringify(req.body).length,
  });

  try {
    const result = await processRequest(req.body);
    apiLogger.info('API request completed', {
      resultSize: JSON.stringify(result).length,
    });
    res.json(result);
  } catch (error) {
    apiLogger.error('API request failed', {
      error: error.message,
      endpoint: '/api/endpoint',
    });
    res.status(500).json({ error: 'Internal server error' });
  }
});
```

This logging system provides comprehensive observability into your application's behavior, making
debugging, monitoring, and maintenance much more effective.
