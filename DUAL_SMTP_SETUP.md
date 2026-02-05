# Dual SMTP Configuration Guide

## Overview
Your application now supports **two separate SMTP configurations**:
1. **Normal OTP SMTP** - Used for first-time OTP requests and general emails
2. **Resend OTP SMTP** - Used specifically for resend OTP requests

This separation helps:
- **Avoid rate limits** by distributing email load across multiple accounts
- **Improve deliverability** by using dedicated accounts for different purposes
- **Better tracking** of which emails are initial vs resend requests

## Environment Variables

### Normal OTP Configuration (Required)

```env
# Primary SMTP (for normal OTPs)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
SMTP_FROM="Your Shikshak <your-email@gmail.com>"

# Backup 1 (optional fallback)
SMTP_BACKUP1_HOST=smtp.gmail.com
SMTP_BACKUP1_PORT=587
SMTP_BACKUP1_USER=backup1@gmail.com
SMTP_BACKUP1_PASS=backup1-app-password
SMTP_BACKUP1_FROM="Your Shikshak <backup1@gmail.com>"

# Backup 2 (optional fallback)
SMTP_BACKUP2_HOST=smtp.gmail.com
SMTP_BACKUP2_PORT=587
SMTP_BACKUP2_USER=backup2@gmail.com
SMTP_BACKUP2_PASS=backup2-app-password
SMTP_BACKUP2_FROM="Your Shikshak <backup2@gmail.com>"
```

### Resend OTP Configuration (Optional but Recommended)

```env
# Resend OTP Primary
SMTP_RESEND_HOST=smtp.gmail.com
SMTP_RESEND_PORT=587
SMTP_RESEND_USER=resend-otp@gmail.com
SMTP_RESEND_PASS=resend-app-password
SMTP_RESEND_FROM="Your Shikshak - Resend <resend-otp@gmail.com>"

# Resend OTP Backup (optional)
SMTP_RESEND_BACKUP_HOST=smtp.gmail.com
SMTP_RESEND_BACKUP_PORT=587
SMTP_RESEND_BACKUP_USER=resend-backup@gmail.com
SMTP_RESEND_BACKUP_PASS=resend-backup-app-password
SMTP_RESEND_BACKUP_FROM="Your Shikshak - Resend <resend-backup@gmail.com>"
```

## How It Works

### Normal OTP Flow
```typescript
import { sendEmail } from './utils/emailService';

// First-time OTP request
await sendEmail(
  userEmail,
  'Your Login OTP',
  `<p>Your OTP is: <strong>${otp}</strong></p>`
);
```

### Resend OTP Flow
```typescript
import { sendResendOtpEmail } from './utils/emailService';

// Resend OTP request
await sendResendOtpEmail(
  userEmail,
  'Your Login OTP (Resent)',
  `<p>Your OTP is: <strong>${otp}</strong></p>`
);
```

## Fallback Behavior

- If **Resend OTP SMTP** is not configured, it automatically falls back to **Normal OTP SMTP**
- Each configuration tries all available accounts (Primary → Backup 1 → Backup 2) until one succeeds
- If all accounts fail, an error is thrown

## Setting Up Gmail App Passwords

1. **Enable 2-Factor Authentication** on your Gmail account
2. Go to **Google Account Settings** → **Security**
3. Under "Signing in to Google", select **App passwords**
4. Generate a new app password for "Mail"
5. Copy the 16-character password (remove spaces)
6. Use this password in your `.env` file

## Recommended Setup

### For Development
- Use 1 Gmail account for both normal and resend OTPs
- Set only `SMTP_*` variables (resend will fallback)

### For Production
- Use 2 separate Gmail accounts:
  - Account 1: Normal OTPs (`SMTP_*`)
  - Account 2: Resend OTPs (`SMTP_RESEND_*`)
- Add backup accounts for high availability

## Testing

```bash
# Test normal OTP email
curl -X POST http://localhost:5000/api/auth/send-login-otp \
  -H "Content-Type: application/json" \
  -d '{"email": "test@example.com"}'

# Test resend OTP email (implement resend endpoint first)
curl -X POST http://localhost:5000/api/auth/resend-login-otp \
  -H "Content-Type: application/json" \
  -d '{"email": "test@example.com"}'
```

## Next Steps

To use the resend OTP functionality, you need to:

1. **Add environment variables** for resend SMTP to your `.env` file
2. **Create a resend OTP endpoint** in your auth routes
3. **Update frontend** to call the resend endpoint when user clicks "Resend OTP"

Example resend endpoint implementation is shown below.
