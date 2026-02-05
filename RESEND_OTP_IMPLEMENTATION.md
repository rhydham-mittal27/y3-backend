# Example: Implementing Resend OTP Endpoint

## 1. Update authService.ts

Add a new function for resending OTP:

```typescript
// In src/services/authService.ts

import { sendEmail, sendResendOtpEmail } from '../utils/emailService';

// Add this new function
export const resendLoginOtp = async (email: string) => {
  const normalizedEmail = String(email).toLowerCase().trim();
  
  // Check if user exists
  let user = await User.findOne({ email: normalizedEmail });
  
  if (!user) {
    // Same auto-creation logic as sendLoginOtp
    const matchingLead = await ClassLead.findOne({ parentEmail: normalizedEmail });
    
    if (matchingLead) {
      const parentName = (matchingLead as any).parentName || `Parent of ${(matchingLead as any).studentName || 'Student'}`;
      const randomPassword = crypto.randomBytes(16).toString('hex');
      user = new User({
        name: parentName,
        email: normalizedEmail,
        role: USER_ROLES.PARENT,
        password: randomPassword,
      } as any);
      await user.save();
      
      try {
        await FinalClass.updateMany(
          { classLead: (matchingLead as any)._id, parent: { $exists: false } },
          { $set: { parent: (user as any)._id } }
        );
      } catch (e) {
        console.error('[resendLoginOtp] Failed to link parent user to FinalClass documents', e);
      }
    } else {
      throw new ErrorResponse('User not found', 404);
    }
  }

  // Generate new OTP
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

  loginOtpStore.set(normalizedEmail, { otp, expiresAt });

  // Use sendResendOtpEmail instead of sendEmail
  try {
    await sendResendOtpEmail(
      normalizedEmail,
      'Your login OTP for Your Shikshak (Resent)',
      `<div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
         <h2 style="color: #2563eb;">Resent: Your Login OTP</h2>
         <p>You requested to resend your one-time password (OTP):</p>
         <div style="background-color: #f3f4f6; padding: 15px; border-radius: 8px; text-align: center; margin: 20px 0;">
           <span style="font-size: 32px; font-weight: bold; letter-spacing: 4px; color: #1f2937;">${otp}</span>
         </div>
         <p>This code will expire in 10 minutes.</p>
         <p style="color: #6b7280; font-size: 14px;">If you didn't request this, please ignore this email.</p>
       </div>`
    );
  } catch (e) {
    console.error('[resendLoginOtp] Failed to send OTP email, see error below. OTP will still be logged for development.', e);
  }

  console.log(`[resendLoginOtp] OTP for ${normalizedEmail}:`, otp);

  return { success: true, expiresAt };
};
```

## 2. Update authController.ts

Add a new controller:

```typescript
// In src/controllers/authController.ts

export const resendLoginOtpController = asyncHandler(async (req: Request, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new ErrorResponse(errors.array()[0].msg, 400);
  }

  const { email } = req.body;
  const result = await resendLoginOtp(email);
  
  return res.json(successResponse(result, 'OTP resent successfully'));
});
```

## 3. Update authRoutes.ts

Add the new route:

```typescript
// In src/routes/authRoutes.ts

import { 
  // ... existing imports
  resendLoginOtpController 
} from '../controllers/authController';

// Add this route
router.post(
  '/resend-login-otp',
  [body('email').isEmail().withMessage('Valid email is required')],
  resendLoginOtpController
);
```

## 4. Frontend Implementation

Update your OTP component to include a resend button:

```typescript
// In your OTP component

const [canResend, setCanResend] = useState(false);
const [resendTimer, setResendTimer] = useState(60);

useEffect(() => {
  if (resendTimer > 0) {
    const timer = setTimeout(() => setResendTimer(resendTimer - 1), 1000);
    return () => clearTimeout(timer);
  } else {
    setCanResend(true);
  }
}, [resendTimer]);

const handleResendOtp = async () => {
  try {
    await api.post('/api/auth/resend-login-otp', { email });
    setResendTimer(60);
    setCanResend(false);
    toast.success('OTP resent successfully!');
  } catch (error) {
    toast.error('Failed to resend OTP');
  }
};

// In your JSX
<Button
  onClick={handleResendOtp}
  disabled={!canResend}
>
  {canResend ? 'Resend OTP' : `Resend in ${resendTimer}s`}
</Button>
```

## 5. Environment Variables

Add to your `.env` file:

```env
# Resend OTP SMTP (separate account to avoid rate limits)
SMTP_RESEND_HOST=smtp.gmail.com
SMTP_RESEND_PORT=587
SMTP_RESEND_USER=resend-otp@gmail.com
SMTP_RESEND_PASS=your-app-password-here
SMTP_RESEND_FROM="Your Shikshak - Resend <resend-otp@gmail.com>"
```

## Benefits

1. **Separate Rate Limits**: Normal OTPs and resend OTPs use different Gmail accounts
2. **Better Tracking**: Easy to identify which emails are resends in logs
3. **Improved Deliverability**: Dedicated accounts for different purposes
4. **Fallback Support**: If resend account fails, falls back to normal SMTP

## Testing

```bash
# Test resend OTP
curl -X POST http://localhost:5000/api/auth/resend-login-otp \
  -H "Content-Type: application/json" \
  -d '{"email": "test@example.com"}'
```
