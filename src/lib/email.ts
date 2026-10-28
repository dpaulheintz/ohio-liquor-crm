import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_APP_PASSWORD,
  },
});

export interface EmailOptions {
  to: string;
  subject: string;
  html: string;
}

export async function sendEmail({ to, subject, html }: EmailOptions) {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_APP_PASSWORD) {
    console.warn('Email not configured — skipping send');
    return;
  }

  try {
    await transporter.sendMail({
      from: `"High Bank EOS" <${process.env.EMAIL_USER}>`,
      to,
      subject,
      html,
    });
    console.log(`Email sent to ${to}: ${subject}`);
  } catch (error) {
    console.error('Failed to send email:', error);
    // Never throw — email failure must never break the main flow
  }
}

export interface StrictEmailOptions {
  to: string[];
  subject: string;
  html: string;
  text?: string;
  fromName?: string;
  attachments?: { filename: string; content: Buffer; contentType?: string }[];
}

/** Like sendEmail, but throws if email isn't configured or the send fails, so callers can report it. */
export async function sendEmailStrict({ to, subject, html, text, fromName = 'High Bank CRM', attachments }: StrictEmailOptions) {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_APP_PASSWORD) {
    throw new Error('Email isn’t configured on this server.');
  }
  await transporter.sendMail({
    from: `"${fromName}" <${process.env.EMAIL_USER}>`,
    to: to.join(', '),
    subject,
    html,
    text,
    attachments,
  });
}
