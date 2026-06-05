import { Resend } from 'resend';
import { RESEND_API_KEY, RESEND_FROM_EMAIL } from '../constants/app.constant';
import { buildWorkspaceInvitationEmailHtml } from './invitation-workspace-email.template';

const resend = new Resend(RESEND_API_KEY);

export interface SendWorkspaceInvitationEmailParams {
    to: string;
    workspaceName: string;
    inviterName: string;
    roleName: string;
    actionUrl: string;
}

export async function sendWorkspaceInvitationEmail(params: SendWorkspaceInvitationEmailParams): Promise<void> {
  const { workspaceName, inviterName, roleName, actionUrl, to } = params;

  const { error } = await resend.emails.send({
    from: `Folio <${RESEND_FROM_EMAIL}>`,
    to,
    subject: 'Verify your email address — Folio',
    html: buildWorkspaceInvitationEmailHtml({ workspaceName, inviterName, roleName, actionUrl }),
  });

  if (error) {
    throw new Error(`Failed to send verification email: ${error.message}`);
  }
}