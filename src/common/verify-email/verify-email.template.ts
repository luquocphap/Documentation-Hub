export function buildVerifyEmailHtml(params: {
  fullName: string;
  verifyUrl: string;
}): string {
  const { fullName, verifyUrl } = params;

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
      <title>Verify your email</title>
    </head>
    <body style="margin:0;padding:0;background:#f4f4f5;font-family:'Inter',sans-serif;">
      <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 16px;">
        <tr>
          <td align="center">
            <table width="480" cellpadding="0" cellspacing="0"
              style="background:#ffffff;border-radius:12px;padding:40px;border:1px solid #e4e4e7;">

              <!-- Logo -->
              <tr>
                <td style="padding-bottom:32px;">
                  <span style="font-size:18px;font-weight:700;color:#0a0a0a;letter-spacing:-0.03em;">
                    Folio
                  </span>
                </td>
              </tr>

              <!-- Heading -->
              <tr>
                <td style="padding-bottom:12px;">
                  <h1 style="margin:0;font-size:22px;font-weight:600;color:#0a0a0a;letter-spacing:-0.03em;">
                    Verify your email address
                  </h1>
                </td>
              </tr>

              <!-- Body -->
              <tr>
                <td style="padding-bottom:28px;font-size:14px;color:#737373;line-height:1.7;">
                  Hi <strong style="color:#0a0a0a;">${fullName}</strong>, thanks for signing up!
                  <br/>
                  Click the button below to verify your email address.
                  The link expires in <strong style="color:#0a0a0a;">24 hours</strong>.
                </td>
              </tr>

              <!-- CTA Button -->
              <tr>
                <td style="padding-bottom:32px;">
                  <a href="${verifyUrl}"
                    style="display:inline-block;background:#0a0a0a;color:#ffffff;
                           font-size:14px;font-weight:500;padding:10px 24px;
                           border-radius:8px;text-decoration:none;letter-spacing:-0.01em;">
                    Verify email address
                  </a>
                </td>
              </tr>

              <!-- Fallback URL -->
              <tr>
                <td style="padding-bottom:32px;font-size:12px;color:#a1a1aa;">
                  Or copy this link into your browser:<br/>
                  <a href="${verifyUrl}" style="color:#737373;word-break:break-all;">${verifyUrl}</a>
                </td>
              </tr>

              <!-- Divider -->
              <tr>
                <td style="border-top:1px solid #e4e4e7;padding-top:24px;
                           font-size:12px;color:#a1a1aa;line-height:1.6;">
                  If you didn't create an account, you can safely ignore this email.
                </td>
              </tr>

            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;
}