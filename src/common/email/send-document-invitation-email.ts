import { Resend } from 'resend';
import { RESEND_API_KEY, RESEND_FROM_EMAIL } from '../constants/app.constant';
import { buildDocumentInvitationEmailHtml } from './invitation-document-email.template';

const resend = new Resend(RESEND_API_KEY);

export interface SendDocumentInvitationEmailParams {
    to: string;
    documentName: string;
    inviterName: string;
    roleName: string;
    actionUrl: string;
}

export async function sendDocumentInvitationEmail(params: SendDocumentInvitationEmailParams): Promise<void> {
  const { documentName, inviterName, roleName, actionUrl, to } = params;

  const { error } = await resend.emails.send({
    from: `Folio <${RESEND_FROM_EMAIL}>`,
    to,
    subject: 'Verify your email address — Folio',
    html: buildDocumentInvitationEmailHtml({ documentName, inviterName, roleName, actionUrl }),
  });

  if (error) {
    throw new Error(`Failed to send verification email: ${error.message}`);
  }
}