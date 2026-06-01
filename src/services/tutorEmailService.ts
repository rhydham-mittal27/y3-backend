import { sendEmail } from '../utils/emailService';

/**
 * Sends a welcome/registration confirmation email to a newly registered tutor.
 * Triggered on both registration paths (full form & OTP-later).
 */
export const sendTutorRegistrationEmail = async (
  to: string,
  name: string,
  teacherId?: string
): Promise<void> => {
  const subject = 'Welcome to Your Shikshak – Registration Successful 🎉';

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Welcome to Your Shikshak</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Inter', 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      background-color: #f0f4f8;
      color: #1a202c;
      padding: 32px 16px;
    }
    .wrapper { max-width: 620px; margin: 0 auto; }
    .card {
      background: #ffffff;
      border-radius: 16px;
      overflow: hidden;
      box-shadow: 0 4px 24px rgba(0, 0, 0, 0.08);
    }
    /* Header */
    .header {
      background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%);
      padding: 40px 40px 32px;
      text-align: center;
    }
    .header-badge {
      display: inline-block;
      background: rgba(255,255,255,0.15);
      border: 1px solid rgba(255,255,255,0.3);
      color: #fff;
      font-size: 12px;
      font-weight: 600;
      letter-spacing: 1.5px;
      text-transform: uppercase;
      padding: 6px 14px;
      border-radius: 20px;
      margin-bottom: 16px;
    }
    .header-logo {
      font-size: 28px;
      font-weight: 700;
      color: #ffffff;
      margin-bottom: 8px;
    }
    .header-tagline {
      font-size: 14px;
      color: rgba(255,255,255,0.8);
    }
    /* Body */
    .body { padding: 40px; }
    .greeting {
      font-size: 22px;
      font-weight: 700;
      color: #1a202c;
      margin-bottom: 12px;
    }
    .intro {
      font-size: 15px;
      color: #4a5568;
      line-height: 1.7;
      margin-bottom: 28px;
    }
    /* Teacher ID pill */
    .teacher-id-box {
      background: #f5f3ff;
      border: 1.5px dashed #7c3aed;
      border-radius: 12px;
      padding: 18px 24px;
      text-align: center;
      margin-bottom: 28px;
    }
    .teacher-id-label {
      font-size: 12px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 1px;
      color: #7c3aed;
      margin-bottom: 6px;
    }
    .teacher-id-value {
      font-size: 26px;
      font-weight: 700;
      color: #4f46e5;
      letter-spacing: 2px;
    }
    /* Steps */
    .steps-title {
      font-size: 16px;
      font-weight: 700;
      color: #1a202c;
      margin-bottom: 16px;
    }
    .steps-list { list-style: none; margin-bottom: 28px; }
    .step-item {
      display: flex;
      align-items: flex-start;
      gap: 14px;
      padding: 12px 0;
      border-bottom: 1px solid #f0f0f0;
    }
    .step-item:last-child { border-bottom: none; }
    .step-num {
      min-width: 28px;
      height: 28px;
      border-radius: 50%;
      background: linear-gradient(135deg, #4f46e5, #7c3aed);
      color: #fff;
      font-size: 13px;
      font-weight: 700;
      display: flex;
      align-items: center;
      justify-content: center;
      margin-top: 2px;
    }
    .step-text {
      font-size: 14px;
      color: #4a5568;
      line-height: 1.6;
    }
    .step-text strong { color: #1a202c; }
    /* CTA Button */
    .cta-wrap { text-align: center; margin-bottom: 32px; }
    .cta-btn {
      display: inline-block;
      background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%);
      color: #ffffff !important;
      text-decoration: none;
      font-size: 15px;
      font-weight: 600;
      padding: 14px 36px;
      border-radius: 10px;
      box-shadow: 0 4px 14px rgba(79, 70, 229, 0.35);
    }
    /* Info boxes */
    .info-box {
      border-radius: 10px;
      padding: 16px 20px;
      margin-bottom: 20px;
      font-size: 14px;
      line-height: 1.6;
    }
    .info-box.note {
      background: #fffbeb;
      border-left: 4px solid #f59e0b;
      color: #78350f;
    }
    .info-box.tip {
      background: #ecfdf5;
      border-left: 4px solid #10b981;
      color: #065f46;
    }
    /* Divider */
    .divider {
      height: 1px;
      background: #e2e8f0;
      margin: 28px 0;
    }
    /* Contact */
    .contact-grid {
      display: flex;
      gap: 16px;
      flex-wrap: wrap;
      margin-bottom: 8px;
    }
    .contact-item {
      font-size: 13px;
      color: #4a5568;
    }
    .contact-item a {
      color: #4f46e5;
      text-decoration: none;
      font-weight: 500;
    }
    /* Footer */
    .footer {
      background: #f8fafc;
      padding: 24px 40px;
      border-top: 1px solid #e2e8f0;
      text-align: center;
    }
    .footer p { font-size: 13px; color: #718096; line-height: 1.6; }
    .footer strong { color: #4a5568; }
    .footer .disclaimer {
      font-size: 11px;
      color: #a0aec0;
      margin-top: 8px;
    }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="card">
      <!-- Header -->
      <div class="header">
        <div class="header-badge">Registration Successful</div>
        <div class="header-logo">📚 Your Shikshak</div>
        <div class="header-tagline">Empowering Tutors. Connecting Students.</div>
      </div>

      <!-- Body -->
      <div class="body">
        <p class="greeting">Welcome aboard, ${name}! 🎉</p>
        <p class="intro">
          We're thrilled to have you join the <strong>Your Shikshak</strong> community.
          Your account has been created successfully. You're just a few steps away from
          connecting with students and growing your tutoring career.
        </p>

        ${teacherId ? `
        <div class="teacher-id-box">
          <div class="teacher-id-label">Your Unique Teacher ID</div>
          <div class="teacher-id-value">${teacherId}</div>
        </div>
        ` : ''}

        <p class="steps-title">🚀 Complete Your Profile in 4 Simple Steps</p>
        <ul class="steps-list">
          <li class="step-item">
            <div class="step-num">1</div>
            <div class="step-text"><strong>Log in</strong> using your registered email with OTP-based login at <a href="https://yourshikshak.in/login" style="color:#4f46e5;">yourshikshak.in</a></div>
          </li>
          <li class="step-item">
            <div class="step-num">2</div>
            <div class="step-text"><strong>Fill in</strong> your personal details — name, address, qualification, and bio</div>
          </li>
          <li class="step-item">
            <div class="step-num">3</div>
            <div class="step-text"><strong>Upload</strong> your verification documents (Aadhaar, degree certificate, etc.)</div>
          </li>
          <li class="step-item">
            <div class="step-num">4</div>
            <div class="step-text"><strong>Submit</strong> your profile for verification and wait for approval</div>
          </li>
        </ul>

        <div class="cta-wrap">
          <a href="https://yourshikshak.in/login" class="cta-btn">Complete Your Profile Now →</a>
        </div>

        <div class="info-box note">
          <strong>📌 Note:</strong> Only tutors with verified profiles are eligible to receive student leads and home tuition opportunities.
        </div>

        <div class="info-box tip">
          <strong>✅ What you get:</strong> Access to verified student leads &bull; Easy attendance tracking &bull; Earnings dashboard &bull; Professional tutor profile &bull; Home &amp; online tuition opportunities
        </div>

        <div class="divider"></div>

        <p class="steps-title">📞 Need Help?</p>
        <div class="contact-grid">
          <div class="contact-item">🌐 Website: <a href="https://yourshikshak.in">yourshikshak.in</a></div>
          <div class="contact-item">✉️ Email: <a href="mailto:contact@yourshikshak.in">contact@yourshikshak.in</a></div>
        </div>
      </div>

      <!-- Footer -->
      <div class="footer">
        <p><strong>Best regards,</strong><br>Team Your Shikshak<br><em>Empowering Tutors. Connecting Students.</em></p>
        <p class="disclaimer">This is an automated email. Please do not reply directly to this message.</p>
      </div>
    </div>
  </div>
</body>
</html>`;

  try {
    await sendEmail(to, subject, html);
    console.log(`[TutorEmail] Registration welcome email sent to ${to} (${name})`);
  } catch (error: any) {
    console.error(`[TutorEmail] Failed to send registration email to ${to}:`, error?.message || error);
    // Non-fatal: do not throw — registration should succeed even if email fails
  }
};

/**
 * Sends a verification-submitted acknowledgment email.
 * Triggered when the tutor submits their verification form (status → UNDER_REVIEW).
 */
export const sendTutorVerificationSubmittedEmail = async (
  to: string,
  name: string,
  teacherId?: string
): Promise<void> => {
  const subject = 'Verification Submitted – Your Shikshak 🔍';

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Verification Submitted – Your Shikshak</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Inter', 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      background-color: #f0f4f8;
      color: #1a202c;
      padding: 32px 16px;
    }
    .wrapper { max-width: 620px; margin: 0 auto; }
    .card {
      background: #ffffff;
      border-radius: 16px;
      overflow: hidden;
      box-shadow: 0 4px 24px rgba(0, 0, 0, 0.08);
    }
    .header {
      background: linear-gradient(135deg, #0f766e 0%, #0d9488 100%);
      padding: 40px 40px 32px;
      text-align: center;
    }
    .header-badge {
      display: inline-block;
      background: rgba(255,255,255,0.15);
      border: 1px solid rgba(255,255,255,0.3);
      color: #fff;
      font-size: 12px;
      font-weight: 600;
      letter-spacing: 1.5px;
      text-transform: uppercase;
      padding: 6px 14px;
      border-radius: 20px;
      margin-bottom: 16px;
    }
    .header-logo {
      font-size: 28px;
      font-weight: 700;
      color: #ffffff;
      margin-bottom: 8px;
    }
    .header-tagline {
      font-size: 14px;
      color: rgba(255,255,255,0.8);
    }
    .body { padding: 40px; }
    .greeting {
      font-size: 22px;
      font-weight: 700;
      color: #1a202c;
      margin-bottom: 12px;
    }
    .intro {
      font-size: 15px;
      color: #4a5568;
      line-height: 1.7;
      margin-bottom: 28px;
    }
    /* Status tracker */
    .status-tracker {
      background: #f8fafc;
      border-radius: 12px;
      padding: 24px;
      margin-bottom: 28px;
    }
    .status-title {
      font-size: 13px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 1px;
      color: #718096;
      margin-bottom: 16px;
    }
    .status-steps { display: flex; flex-direction: column; gap: 0; }
    .status-row {
      display: flex;
      align-items: center;
      gap: 14px;
      padding: 10px 0;
      position: relative;
    }
    .status-row:not(:last-child)::after {
      content: '';
      position: absolute;
      left: 13px;
      top: 36px;
      width: 2px;
      height: 20px;
      background: #e2e8f0;
    }
    .status-dot {
      min-width: 28px;
      height: 28px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 13px;
    }
    .status-dot.done { background: #10b981; color: #fff; }
    .status-dot.active { background: #f59e0b; color: #fff; }
    .status-dot.pending { background: #e2e8f0; color: #a0aec0; }
    .status-label { font-size: 14px; color: #4a5568; }
    .status-label strong { color: #1a202c; }
    .status-label.active strong { color: #d97706; }
    /* Teacher ID */
    .teacher-id-box {
      background: #f0fdfa;
      border: 1.5px dashed #0d9488;
      border-radius: 12px;
      padding: 14px 20px;
      text-align: center;
      margin-bottom: 24px;
    }
    .teacher-id-label {
      font-size: 12px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 1px;
      color: #0d9488;
      margin-bottom: 4px;
    }
    .teacher-id-value {
      font-size: 22px;
      font-weight: 700;
      color: #0f766e;
      letter-spacing: 2px;
    }
    /* Info boxes */
    .info-box {
      border-radius: 10px;
      padding: 16px 20px;
      margin-bottom: 20px;
      font-size: 14px;
      line-height: 1.6;
    }
    .info-box.timeline {
      background: #eff6ff;
      border-left: 4px solid #3b82f6;
      color: #1e40af;
    }
    .info-box.note {
      background: #fffbeb;
      border-left: 4px solid #f59e0b;
      color: #78350f;
    }
    .divider {
      height: 1px;
      background: #e2e8f0;
      margin: 28px 0;
    }
    .contact-grid { margin-bottom: 8px; }
    .contact-item { font-size: 13px; color: #4a5568; margin-bottom: 6px; }
    .contact-item a { color: #0d9488; text-decoration: none; font-weight: 500; }
    .footer {
      background: #f8fafc;
      padding: 24px 40px;
      border-top: 1px solid #e2e8f0;
      text-align: center;
    }
    .footer p { font-size: 13px; color: #718096; line-height: 1.6; }
    .footer strong { color: #4a5568; }
    .footer .disclaimer { font-size: 11px; color: #a0aec0; margin-top: 8px; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="card">
      <!-- Header -->
      <div class="header">
        <div class="header-badge">Verification Under Review</div>
        <div class="header-logo">📚 Your Shikshak</div>
        <div class="header-tagline">Empowering Tutors. Connecting Students.</div>
      </div>

      <!-- Body -->
      <div class="body">
        <p class="greeting">Great job, ${name}! 🎉</p>
        <p class="intro">
          Your verification documents and profile have been successfully submitted to our team.
          We'll review everything and get back to you shortly.
        </p>

        ${teacherId ? `
        <div class="teacher-id-box">
          <div class="teacher-id-label">Your Teacher ID</div>
          <div class="teacher-id-value">${teacherId}</div>
        </div>
        ` : ''}

        <!-- Status Tracker -->
        <div class="status-tracker">
          <div class="status-title">Verification Progress</div>
          <div class="status-steps">
            <div class="status-row">
              <div class="status-dot done">✓</div>
              <div class="status-label"><strong>Registration Complete</strong></div>
            </div>
            <div class="status-row">
              <div class="status-dot done">✓</div>
              <div class="status-label"><strong>Profile &amp; Documents Submitted</strong></div>
            </div>
            <div class="status-row">
              <div class="status-dot active">⏳</div>
              <div class="status-label active"><strong>Under Review</strong> — Our team is verifying your details</div>
            </div>
            <div class="status-row">
              <div class="status-dot pending">4</div>
              <div class="status-label"><strong>Verification Approved</strong> — Start receiving student leads!</div>
            </div>
          </div>
        </div>

        <div class="info-box timeline">
          <strong>⏱ Expected Timeline:</strong> Our team typically completes verification within
          <strong>1–3 business days</strong>. You'll receive an email notification once your profile
          has been reviewed.
        </div>

        <div class="info-box note">
          <strong>📌 What to do next?</strong> No action is required from your side right now.
          Make sure to keep an eye on your inbox for the verification result. If you need to
          update any documents, you can log in to your profile.
        </div>

        <div class="divider"></div>

        <p style="font-size:14px;color:#4a5568;margin-bottom:16px;font-weight:600;">📞 Questions? We're here to help!</p>
        <div class="contact-grid">
          <div class="contact-item">🌐 Website: <a href="https://yourshikshak.in">yourshikshak.in</a></div>
          <div class="contact-item">✉️ Email: <a href="mailto:contact@yourshikshak.in">contact@yourshikshak.in</a></div>
        </div>
      </div>

      <!-- Footer -->
      <div class="footer">
        <p><strong>Best regards,</strong><br>Team Your Shikshak<br><em>Empowering Tutors. Connecting Students.</em></p>
        <p class="disclaimer">This is an automated email. Please do not reply directly to this message.</p>
      </div>
    </div>
  </div>
</body>
</html>`;

  try {
    await sendEmail(to, subject, html);
    console.log(`[TutorEmail] Verification-submitted email sent to ${to} (${name})`);
  } catch (error: any) {
    console.error(`[TutorEmail] Failed to send verification email to ${to}:`, error?.message || error);
    // Non-fatal: do not throw
  }
};
