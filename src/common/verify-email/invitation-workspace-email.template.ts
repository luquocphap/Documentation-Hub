export function buildWorkspaceInvitationEmailHtml(params: {
  workspaceName: string;
  inviterName: string;
  roleName: string;
  actionUrl: string;
}): string {
  const { workspaceName, inviterName, roleName, actionUrl } = params;

  return `
  <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Lời mời tham gia Workspace</title>
        <style>
            body {
                font-family: Arial, sans-serif;
                background-color: #f4f6f8;
                margin: 0;
                padding: 0;
                color: #333333;
            }
            .container {
                max-width: 600px;
                margin: 40px auto;
                background: #ffffff;
                border-radius: 8px;
                overflow: hidden;
                box-shadow: 0 4px 12px rgba(0,0,0,0.05);
                border: 1px solid #e1e4e8;
            }
            .header {
                background-color: #1e293b;
                padding: 30px;
                text-align: center;
                color: #ffffff;
            }
            .header h1 {
                margin: 0;
                font-size: 22px;
                font-weight: 600;
            }
            .content {
                padding: 40px 30px;
                line-height: 1.6;
            }
            .content p {
                margin: 0 0 20px 0;
                font-size: 15px;
            }
            .highlight-box {
                background-color: #f8fafc;
                border-left: 4px solid #3b82f6;
                padding: 15px;
                margin-bottom: 30px;
                border-radius: 0 4px 4px 0;
            }
            .highlight-box ul {
                margin: 0;
                padding-left: 20px;
            }
            .highlight-box li {
                margin-bottom: 8px;
                font-size: 14px;
            }
            .button-wrapper {
                text-align: center;
                margin: 30px 0;
            }
            .btn-action {
                display: inline-block;
                background-color: #2563eb;
                color: #ffffff !important;
                text-decoration: none;
                padding: 12px 30px;
                font-size: 15px;
                font-weight: bold;
                border-radius: 6px;
                box-shadow: 0 2px 5px rgba(37,99,235,0.2);
            }
            .footer {
                background-color: #f8fafc;
                padding: 20px;
                text-align: center;
                font-size: 12px;
                color: #64748b;
                border-top: 1px solid #e2e8f0;
            }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>Team Documentation Hub</h1>
            </div>
            <div class="content">
                <p>Xin chào,</p>
                <p>Bạn vừa nhận được một lời mời tham gia vào không gian làm việc trực tuyến từ đồng nghiệp của mình. Dưới đây là thông tin chi tiết:</p>
                
                <div class="highlight-box">
                    <ul>
                        <li><strong>Workspace:</strong> ${workspaceName}</li>
                        <li><strong>Người mời:</strong> ${inviterName}</li>
                        <li><strong>Vai trò của bạn:</strong> ${roleName}</li>
                    </ul>
                </div>
                
                <p>Vui lòng nhấn vào liên kết bên dưới để xác nhận lời mời và truy cập không gian làm việc của nhóm:</p>
                
                <div class="button-wrapper">
                    <a href="${actionUrl}" class="btn-action" target="_blank">Chấp Nhận Lời Mời</a>
                </div>
                
                <p style="font-size: 13px; color: #64748b;">Lưu ý: Lời mời này có giá trị trong vòng 7 ngày kể từ ngày gửi. Nếu bạn không quen biết người mời, vui lòng bỏ qua email này.</p>
            </div>
            <div class="footer">
                &copy; 2026 Lumin Team. All rights reserved.
            </div>
        </div>
    </body>
    </html>
  `;
}