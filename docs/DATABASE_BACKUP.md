# Database Backup Strategy

This document outlines the database backup strategy for the Your Shikshak application.

## Overview

Regular database backups are essential for data protection and disaster recovery. This strategy ensures automated, reliable backups with proper retention policies.

## Backup Methods

### 1. Automated Backups

Automated backups are performed using the `backupDatabase.ts` script, which:
- Creates MongoDB dumps using `mongodump`
- Compresses backups to save space
- Implements retention policies
- Logs all backup operations

### 2. Manual Backups

Manual backups can be created on-demand for:
- Before major deployments
- Before database migrations
- Before bulk data operations
- On-demand requirements

## Implementation

### Backup Script

Location: `backend/scripts/backupDatabase.ts`

**Features:**
- Uses `mongodump` for reliable backups
- Compresses backups (tar.gz)
- Automatic cleanup of old backups
- Comprehensive logging
- Error handling

### Usage

#### Manual Backup
```bash
cd backend
npm run backup:db
```

#### Automated Backup (for cron)
```bash
npm run backup:db -- --auto
```

#### Custom Retention Period
```bash
npm run backup:db -- --retention 14  # Keep backups for 14 days
```

## Backup Schedule

### Recommended Schedule

**Development:**
- Daily backups at 2:00 AM
- Retention: 7 days

**Production:**
- Hourly backups during business hours (9 AM - 6 PM)
- Daily backups at 2:00 AM
- Weekly full backups on Sundays
- Retention: 30 days for daily, 90 days for weekly

### Cron Configuration

#### Development
```bash
# Daily backup at 2 AM
0 2 * * * cd /path/to/backend && npm run backup:db -- --auto
```

#### Production
```bash
# Hourly backups (9 AM - 6 PM)
0 9-18 * * 1-5 cd /path/to/backend && npm run backup:db -- --auto

# Daily backup at 2 AM
0 2 * * * cd /path/to/backend && npm run backup:db -- --auto

# Weekly full backup on Sunday at 1 AM
0 1 * * 0 cd /path/to/backend && npm run backup:db -- --auto --retention 90
```

## Backup Storage

### Local Storage
- Location: `backend/backups/`
- Format: `{database-name}-backup-{timestamp}.tar.gz`
- Compression: tar.gz (reduces size by ~70%)

### Cloud Storage (Recommended for Production)

For production environments, backups should be uploaded to cloud storage:

#### AWS S3
```bash
# After backup, upload to S3
aws s3 cp backups/latest-backup.tar.gz s3://your-bucket/backups/
```

#### Google Cloud Storage
```bash
# After backup, upload to GCS
gsutil cp backups/latest-backup.tar.gz gs://your-bucket/backups/
```

## Restore Procedure

### From Local Backup

1. **Stop the application** (if running)

2. **Extract the backup:**
   ```bash
   tar -xzf backups/{database-name}-backup-{timestamp}.tar.gz
   ```

3. **Restore using mongorestore:**
   ```bash
   mongorestore --uri="mongodb://localhost:27017" \
     --db={database-name} \
     backups/{database-name}-backup-{timestamp}/{database-name}
   ```

### From Cloud Backup

1. **Download from cloud storage:**
   ```bash
   aws s3 cp s3://your-bucket/backups/{backup-file}.tar.gz backups/
   ```

2. **Follow local restore procedure**

## Backup Verification

### Automated Verification

The backup script includes:
- Size verification
- Integrity checks
- Success/failure logging

### Manual Verification

```bash
# List all backups
ls -lh backups/

# Check backup size
du -sh backups/*

# Verify backup integrity
tar -tzf backups/{backup-file}.tar.gz
```

## Monitoring

### Backup Status

Monitor backup success through:
- Application logs (`backend/logs/combined.log`)
- Cron job output
- Backup file timestamps
- Cloud storage upload confirmations

### Alerts

Set up alerts for:
- Backup failures
- Backup size anomalies
- Missing backups
- Storage quota warnings

## Best Practices

1. **Test Restores Regularly**
   - Monthly restore tests
   - Verify data integrity
   - Document restore procedures

2. **Multiple Backup Locations**
   - Local storage (fast restore)
   - Cloud storage (disaster recovery)
   - Off-site storage (catastrophic events)

3. **Encryption**
   - Encrypt backups at rest
   - Use secure transfer for cloud uploads
   - Protect backup credentials

4. **Documentation**
   - Maintain backup logs
   - Document restore procedures
   - Keep backup schedule updated

5. **Retention Policy**
   - Balance storage costs with recovery needs
   - Keep recent backups longer
   - Archive old backups to cheaper storage

## Troubleshooting

### Backup Fails

1. Check MongoDB connection
2. Verify disk space
3. Check file permissions
4. Review error logs

### Restore Fails

1. Verify backup file integrity
2. Check MongoDB version compatibility
3. Ensure sufficient disk space
4. Verify database permissions

## Security Considerations

- **Access Control**: Limit backup script access
- **Encryption**: Encrypt sensitive backups
- **Credentials**: Secure MongoDB connection strings
- **Audit**: Log all backup/restore operations

## Maintenance

### Weekly Tasks
- Review backup logs
- Verify backup sizes
- Check storage usage

### Monthly Tasks
- Test restore procedure
- Review retention policy
- Update documentation

---

**Last Updated**: 2024
**Version**: 1.0

