import * as dotenv from "dotenv";
import nodemailer from "nodemailer";
const brevoTransport = require("nodemailer-brevo-transport");
dotenv.config();

const getTransporterConfigs = () => {
  const configs = [];

  // Primary (Brevo API)
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

      if (!process.env.BREVO_API_KEY) {
        throw new Error('BREVO_API_KEY is not defined in environment variables');
      }

      const transporter = nodemailer.createTransport(new brevoTransport({ apiKey: process.env.BREVO_API_KEY }));

      const info = await transporter.sendMail({
        from: (emailConfig as any).from || process.env.BREVO_FROM,
        to,
        subject,
        html,
      });

      const rejected = (info as any)?.rejected;
      if (Array.isArray(rejected) && rejected.length > 0) {
        throw new Error(`Email provider rejected recipients: ${rejected.join(', ')}`);
      }

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

      if (!process.env.BREVO_API_KEY) {
        throw new Error('BREVO_API_KEY is not defined in environment variables');
      }

      const transporter = nodemailer.createTransport(new brevoTransport({ apiKey: process.env.BREVO_API_KEY }));

      const info = await transporter.sendMail({
        from: (emailConfig as any).from || process.env.BREVO_FROM,
        to,
        subject,
        html,
      });

      const rejected = (info as any)?.rejected;
      if (Array.isArray(rejected) && rejected.length > 0) {
        throw new Error(`Email provider rejected recipients: ${rejected.join(', ')}`);
      }

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
