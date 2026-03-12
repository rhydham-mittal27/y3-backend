import * as dotenv from "dotenv";
dotenv.config();

const getTransporterConfigs = () => {
  const configs = [];

  if (process.env.BREVO_API_KEY) {
    configs.push({
      from: process.env.BREVO_FROM || "noreply@yourshikshak.in",
      label: "Brevo API",
    });
  }

  return configs;
};

const getResendOtpTransporterConfigs = () => {
  return getTransporterConfigs();
};

const sendViaBrevoApi = async (params: { to: string; subject: string; html: string; from: string }) => {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) {
    throw new Error('BREVO_API_KEY is not defined in environment variables');
  }

  const fromName = String(process.env.BREVO_FROM_NAME || '').trim();

  const resp = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'api-key': apiKey,
      Accept: 'application/json',
    },
    body: JSON.stringify({
      sender: fromName ? { email: params.from, name: fromName } : { email: params.from },
      to: [{ email: params.to }],
      subject: params.subject,
      htmlContent: params.html,
    }),
  });

  const text = await resp.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }

  if (!resp.ok) {
    const msg = data?.message || data?.error || `Brevo API error (${resp.status})`;
    throw new Error(`${msg}`);
  }

  return data;
};

/**
 * Send email using normal OTP SMTP configuration
 * Used for: First-time OTP requests, general emails
 */
export const sendEmail = async (to: string, subject: string, html: string) => {
  const configs = getTransporterConfigs();

  if (configs.length === 0) {
    throw new Error(
      "Email is not configured. Set BREVO_API_KEY or configure one of the SMTP_BACKUP* providers.",
    );
  }

  let lastError: any;

  for (const emailConfig of configs) {
    try {
      console.log('[Email] Attempting provider', {
        label: (emailConfig as any).label,
        from: (emailConfig as any).from,
        to,
      });

      const info = await sendViaBrevoApi({
        to,
        subject,
        html,
        from: (emailConfig as any).from || process.env.BREVO_FROM,
      });

      console.log(
        `[Email] Sent successfully using ${emailConfig.label} account (${(emailConfig as any).from})`,
      );
      console.log('[Email] Provider response info:', info);
      return info; // Success, exit function
    } catch (error: any) {
      console.warn(
        `[Email] Failed to send using ${emailConfig.label} account: ${error.message}`,
      );
      console.warn('[Email] Provider error details:', {
        code: error?.code,
        command: error?.command,
        response: error?.response,
      });
      lastError = error;
      // Continue to next emailConfig in loop
    }
  }

  // If we reach here, all attempts failed
  console.error("[Email] All email providers failed.");
  throw lastError || new Error("All email sending attempts failed");
};

/**
 * Send email using resend OTP SMTP configuration
 * Used for: Resend OTP requests to avoid rate limits on primary account
 */
export const sendResendOtpEmail = async (
  to: string,
  subject: string,
  html: string,
) => {
  const configs = getResendOtpTransporterConfigs();

  if (configs.length === 0) {
    throw new Error(
      "Email is not configured. Set BREVO_API_KEY.",
    );
  }

  let lastError: any;

  for (const emailConfig of configs) {
    try {
      console.log('[Resend OTP Email] Attempting provider', {
        label: (emailConfig as any).label,
        from: (emailConfig as any).from,
        to,
      });

      const info = await sendViaBrevoApi({
        to,
        subject,
        html,
        from: (emailConfig as any).from || process.env.BREVO_FROM,
      });

      console.log(
        `[Resend OTP Email] Sent successfully using ${emailConfig.label} account (${(emailConfig as any).from})`,
      );
      console.log('[Resend OTP Email] Provider response info:', info);
      return info; // Success, exit function
    } catch (error: any) {
      console.warn(
        `[Resend OTP Email] Failed to send using ${emailConfig.label} account: ${error.message}`,
      );
      console.warn('[Resend OTP Email] Provider error details:', {
        code: error?.code,
        command: error?.command,
        response: error?.response,
      });
      lastError = error;
      // Continue to next emailConfig in loop
    }
  }

  // If we reach here, all attempts failed
  console.error("[Resend OTP Email] All email providers failed.");
  throw lastError || new Error("All resend OTP email sending attempts failed");
};
