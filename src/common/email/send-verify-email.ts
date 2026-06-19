import { Resend } from 'resend';
import { buildVerifyEmailHtml } from './verify-email.template';
import { APP_URL, RESEND_FROM_EMAIL } from '../constants/app.constant';

const resend = new Resend(process.env.RESEND_API_KEY);

export interface SendVerifyEmailParams {
  to: string;
  fullName: string;
  token: string;
  redirectTo?: string;
}

export async function sendVerifyEmail(
  params: SendVerifyEmailParams,
): Promise<void> {
  const { to, fullName, token, redirectTo } = params;

  const query = new URLSearchParams({ token });
  if (redirectTo) {
    query.set('redirectTo', redirectTo);
  }

  const verifyUrl = `${APP_URL}/auth/verify-email?${query.toString()}`;

  const { error } = await resend.emails.send({
    from: `Folio <${RESEND_FROM_EMAIL}>`,
    to,
    subject: 'Verify your email address — Folio',
    html: buildVerifyEmailHtml({ fullName, verifyUrl }),
  });

  if (error) {
    throw new Error(`Failed to send verification email: ${error.message}`);
  }
}
