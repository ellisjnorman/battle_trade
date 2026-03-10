import { logger } from './logger';

interface EmailParams {
  to: string;
  subject: string;
  html: string;
}

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM_EMAIL = process.env.FROM_EMAIL || 'Battle Trade <noreply@battletrade.gg>';

export async function sendEmail(params: EmailParams): Promise<boolean> {
  if (!RESEND_API_KEY) {
    logger.debug(`[email] Would send to ${params.to}: ${params.subject}`);
    return true;
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: params.to,
        subject: params.subject,
        html: params.html,
      }),
    });
    if (!res.ok) {
      const err = await res.text();
      logger.warn('Email send failed', { to: params.to, subject: params.subject }, err);
      return false;
    }
    return true;
  } catch (err) {
    logger.warn('Email send error', { to: params.to }, err);
    return false;
  }
}

// Pre-built email templates
export function purchaseConfirmationEmail(credits: number, amount: string): string {
  return `
    <div style="font-family: 'Helvetica', sans-serif; max-width: 480px; margin: 0 auto; background: #0A0A0A; color: #FFF; padding: 32px;">
      <h1 style="font-size: 32px; margin: 0 0 16px; color: #F5A0D0;">BATTLE TRADE</h1>
      <p style="color: #999; font-size: 14px;">Purchase confirmed</p>
      <div style="background: #111; padding: 24px; margin: 16px 0; border-left: 4px solid #00FF88;">
        <div style="font-size: 36px; font-weight: 700; color: #00FF88;">${credits} CR</div>
        <div style="font-size: 14px; color: #888;">Credits added to your account</div>
      </div>
      <p style="color: #666; font-size: 12px;">Amount charged: ${amount}</p>
    </div>
  `;
}

export function lobbyInviteEmail(lobbyName: string, inviteCode: string, baseUrl: string): string {
  return `
    <div style="font-family: 'Helvetica', sans-serif; max-width: 480px; margin: 0 auto; background: #0A0A0A; color: #FFF; padding: 32px;">
      <h1 style="font-size: 32px; margin: 0 0 16px; color: #F5A0D0;">BATTLE TRADE</h1>
      <p style="color: #999; font-size: 14px;">You've been invited to</p>
      <div style="font-size: 28px; font-weight: 700; color: #FFF; margin: 8px 0;">${lobbyName}</div>
      <div style="background: #111; padding: 20px; margin: 16px 0; text-align: center; border: 2px solid #F5A0D0;">
        <div style="font-size: 14px; color: #888; margin-bottom: 8px;">YOUR LOBBY CODE</div>
        <div style="font-size: 36px; font-weight: 700; color: #F5A0D0; letter-spacing: 0.15em;">${inviteCode}</div>
      </div>
      <a href="${baseUrl}/register/${inviteCode}" style="display: block; text-align: center; background: #F5A0D0; color: #0A0A0A; padding: 16px; font-size: 18px; font-weight: 700; text-decoration: none;">JOIN NOW</a>
    </div>
  `;
}
