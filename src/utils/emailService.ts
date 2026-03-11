import { config } from "dotenv";
import nodemailer from "nodemailer";
import brevoTransport from "nodemailer-brevo-transport";
config();

const getTransporterConfigs = () => {
  const configs = [];

  // Primary (Brevo API)
  if (process.env.BREVO_API_KEY) {
    configs.push({
      from: process.env.BREVO_FROM || "noreply@yourshikshak.in",
      label: "Brevo API",
    });
  }

  // Backup 1
  if (
    process.env.SMTP_BACKUP1_HOST &&
    process.env.SMTP_BACKUP1_USER &&
    process.env.SMTP_BACKUP1_PASS &&
    process.env.SMTP_BACKUP1_FROM
  ) {
    configs.push({
      host: process.env.SMTP_BACKUP1_HOST,
      port: Number(process.env.SMTP_BACKUP1_PORT || 587),
      user: process.env.SMTP_BACKUP1_USER,
      pass: process.env.SMTP_BACKUP1_PASS,
      from: process.env.SMTP_BACKUP1_FROM,
      label: "Backup 1",
    });
  }

  // Backup 2
  if (
    process.env.SMTP_BACKUP2_HOST &&
    process.env.SMTP_BACKUP2_USER &&
    process.env.SMTP_BACKUP2_PASS &&
    process.env.SMTP_BACKUP2_FROM
  ) {
    configs.push({
      host: process.env.SMTP_BACKUP2_HOST,
      port: Number(process.env.SMTP_BACKUP2_PORT || 587),
      user: process.env.SMTP_BACKUP2_USER,
      pass: process.env.SMTP_BACKUP2_PASS,
      from: process.env.SMTP_BACKUP2_FROM,
      label: "Backup 2",
    });
  }

  return configs;
};

const getResendOtpTransporterConfigs = () => {
  const configs = [];

  // Resend OTP Primary (Brevo API)
  if (process.env.BREVO_API_KEY) {
    configs.push({
      from: process.env.BREVO_FROM || "noreply@yourshikshak.in",
      label: "Brevo API (Resend)",
    });
  }

  // Resend OTP Backup
  if (
    process.env.SMTP_RESEND_BACKUP_HOST &&
    process.env.SMTP_RESEND_BACKUP_USER &&
    process.env.SMTP_RESEND_BACKUP_PASS &&
    process.env.SMTP_RESEND_BACKUP_FROM
  ) {
    configs.push({
      host: process.env.SMTP_RESEND_BACKUP_HOST,
      port: Number(process.env.SMTP_RESEND_BACKUP_PORT || 587),
      user: process.env.SMTP_RESEND_BACKUP_USER,
      pass: process.env.SMTP_RESEND_BACKUP_PASS,
      from: process.env.SMTP_RESEND_BACKUP_FROM,
      label: "Resend OTP Backup",
    });
  }

  // Fallback to normal configs if resend configs not available
  if (configs.length === 0) {
    return getTransporterConfigs();
  }

  return configs;
};

/**
 * Send email using normal OTP SMTP configuration
 * Used for: First-time OTP requests, general emails
 */
export const sendEmail = async (to: string, subject: string, html: string) => {
  const configs = getTransporterConfigs();

  if (configs.length === 0) {
    throw new Error(
      "SMTP is not configured. Please set SMTP_HOST, SMTP_USER, SMTP_PASS, SMTP_FROM",
    );
  }

  let lastError: any;

  for (const config of configs) {
    try {
      if (!process.env.BREVO_API_KEY) {
        throw new Error("BREVO_API_KEY is not defined in environment variables");
      }

      const transporter = nodemailer.createTransport(
        new brevoTransport({ apiKey: process.env.BREVO_API_KEY })
      );
      const info = await transporter.sendMail({
        from: config.from || process.env.BREVO_FROM,
        to,
        subject,
        html,
      });

      console.log(
        `[Email] Sent successfully using ${config.label} account (${config.from})`,
      );
      return info; // Success, exit function
    } catch (error: any) {
      console.warn(
        `[Email] Failed to send using ${config.label} account: ${error.message}`,
      );
      lastError = error;
      // Continue to next config in loop
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
      "SMTP is not configured. Please set SMTP_HOST or SMTP_RESEND_HOST",
    );
  }

  let lastError: any;

  for (const config of configs) {
    try {
      if (!process.env.BREVO_API_KEY) {
        throw new Error("BREVO_API_KEY is not defined in environment variables");
      }

      const transporter = nodemailer.createTransport(
        new brevoTransport({ apiKey: process.env.BREVO_API_KEY })
      );

      const info = await transporter.sendMail({
        from: config.from || process.env.BREVO_FROM,
        to,
        subject,
        html,
      });

      console.log(
        `[Resend OTP Email] Sent successfully using ${config.label} account (${config.from})`,
      );
      return info; // Success, exit function
    } catch (error: any) {
      console.warn(
        `[Resend OTP Email] Failed to send using ${config.label} account: ${error.message}`,
      );
      lastError = error;
      // Continue to next config in loop
    }
  }

  // If we reach here, all attempts failed
  console.error("[Resend OTP Email] All email providers failed.");
  throw lastError || new Error("All resend OTP email sending attempts failed");
};
