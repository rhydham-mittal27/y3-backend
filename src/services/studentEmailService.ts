import { sendEmail } from '../utils/emailService';

interface StudentCredentialsEmailData {
  parentEmail: string;
  studentName: string;
  className: string;
  studentId: string;
  password: string;
}

export const sendStudentCredentialsEmail = async (data: StudentCredentialsEmailData) => {
  const { parentEmail, studentName, className, studentId, password } = data;

  const subject = 'Your Student Login Credentials - Your Shikshak';

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Student Login Credentials</title>
      <style>
        body {
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          line-height: 1.6;
          color: #333;
          max-width: 600px;
          margin: 0 auto;
          padding: 20px;
          background-color: #f4f4f4;
        }
        .container {
          background-color: white;
          padding: 30px;
          border-radius: 10px;
          box-shadow: 0 0 20px rgba(0,0,0,0.1);
        }
        .header {
          text-align: center;
          margin-bottom: 30px;
          border-bottom: 2px solid #001F54;
          padding-bottom: 20px;
        }
        .logo {
          font-size: 24px;
          font-weight: bold;
          color: #001F54;
        }
        .credentials {
          background-color: #f8f9fa;
          padding: 20px;
          border-radius: 8px;
          margin: 20px 0;
          border-left: 4px solid #001F54;
        }
        .credential-item {
          margin: 10px 0;
          display: flex;
          justify-content: space-between;
        }
        .label {
          font-weight: bold;
          color: #555;
        }
        .value {
          font-weight: bold;
          color: #001F54;
          font-size: 16px;
        }
        .instructions {
          background-color: #e7f3ff;
          padding: 20px;
          border-radius: 8px;
          margin: 20px 0;
          border-left: 4px solid #4589FF;
        }
        .footer {
          text-align: center;
          margin-top: 30px;
          padding-top: 20px;
          border-top: 1px solid #eee;
          color: #666;
          font-size: 14px;
        }
        .highlight {
          background-color: #fff3cd;
          padding: 15px;
          border-radius: 5px;
          margin: 15px 0;
          border-left: 4px solid #ffc107;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <div class="logo">Your Shikshak</div>
          <h2>Student Login Credentials</h2>
        </div>

        <p>Dear Parent,</p>
        
        <p>We are pleased to inform you that your child's account has been created successfully. Below are the login credentials for accessing the student portal:</p>

        <div class="credentials">
          <div class="credential-item">
            <span class="label">Student Name:</span>
            <span class="value">${studentName}</span>
          </div>
          <div class="credential-item">
            <span class="label">Class:</span>
            <span class="value">${className}</span>
          </div>
          <div class="credential-item">
            <span class="label">Student ID:</span>
            <span class="value">${studentId}</span>
          </div>
          <div class="credential-item">
            <span class="label">Password:</span>
            <span class="value">${password}</span>
          </div>
        </div>

        <div class="highlight">
          <strong>Important:</strong> Your child will be required to change this password on their first login for security reasons.
        </div>

        <div class="instructions">
          <h3>Login Instructions:</h3>
          <ol>
            <li>Visit the student login page</li>
            <li>Enter the Student ID: <strong>${studentId}</strong></li>
            <li>Enter the Password: <strong>${password}</strong></li>
            <li>Click on "Login"</li>
            <li>Follow the prompts to change the password on first login</li>
          </ol>
        </div>

        <div class="instructions">
          <h3>Important Notes:</h3>
          <ul>
            <li>Please keep these credentials safe and share them only with your child</li>
            <li>The password is case-sensitive</li>
            <li>Your child must change the password on first login</li>
            <li>If you face any issues, please contact our support team</li>
          </ul>
        </div>

        <p>Thank you for choosing Your Shikshak for your child's education journey.</p>

        <div class="footer">
          <p>Best regards,<br>
          Team Your Shikshak<br>
          <a href="mailto:support@yourshikshak.in">support@yourshikshak.in</a></p>
          <p><small>This is an automated message. Please do not reply to this email.</small></p>
        </div>
      </div>
    </body>
    </html>
  `;

  try {
    await sendEmail(parentEmail, subject, html);
    console.log(`Student credentials email sent to ${parentEmail} for student ${studentName}`);
  } catch (error) {
    console.error('Failed to send student credentials email:', error);
    throw new Error(`Failed to send credentials email to ${parentEmail}: ${error}`);
  }
};
