import { config } from 'dotenv'
config()

const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:3000'

export const getEmailTemplate = (content: string) => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 5px; background-color: #ffffff; }
    .header { text-align: center; padding-bottom: 20px; border-bottom: 2px solid #007bff; margin-bottom: 20px; }
    .logo { font-size: 24px; font-weight: bold; color: #007bff; text-decoration: none; }
    .button { display: inline-block; padding: 12px 24px; background-color: #007bff; color: #ffffff !important; text-decoration: none; border-radius: 5px; margin-top: 20px; font-weight: bold; }
    .footer { margin-top: 30px; font-size: 12px; color: #999; text-align: center; border-top: 1px solid #eee; padding-top: 10px; }
    .content { padding: 0 10px; }
  </style>
</head>
<body style="background-color: #f9f9f9; padding: 20px;">
  <div class="container">
    <div class="header">
      <a href="${CLIENT_URL}" class="logo">MEDISPACE</a>
    </div>
    <div class="content">
      ${content}
    </div>
    <div class="footer">
      <p>&copy; ${new Date().getFullYear()} MediSpace. All rights reserved.</p>
      <p>Đây là email tự động, vui lòng không trả lời email này.</p>
      <p>Nếu bạn cần hỗ trợ, vui lòng liên hệ <a href="mailto:support@medispace.com">support@medispace.com</a></p>
    </div>
  </div>
</body>
</html>
`

export const getVerifyEmailContent = (verifyUrl: string) => `
  <h2>Xác thực tài khoản của bạn</h2>
  <p>Xin chào,</p>
  <p>Cảm ơn bạn đã đăng ký tài khoản tại <strong>MediSpace</strong>. Để hoàn tất quá trình đăng ký và bảo mật tài khoản, vui lòng xác thực địa chỉ email của bạn bằng cách nhấn vào nút bên dưới:</p>
  <div style="text-align: center;">
    <a href="${verifyUrl}" class="button">Xác thực Email</a>
  </div>
  <p style="margin-top: 30px;">Hoặc copy đường dẫn sau vào trình duyệt:</p>
  <p><a href="${verifyUrl}" style="color: #007bff; word-break: break-all;">${verifyUrl}</a></p>
  <p>Link này sẽ hết hạn sau <strong>7 ngày</strong>.</p>
`

export const getForgotPasswordContent = (resetUrl: string) => `
  <h2>Yêu cầu đặt lại mật khẩu</h2>
  <p>Xin chào,</p>
  <p>Chúng tôi vừa nhận được yêu cầu đặt lại mật khẩu cho tài khoản MediSpace của bạn.</p>
  <p>Nếu bạn không thực hiện yêu cầu này, vui lòng bỏ qua email này. Tài khoản của bạn vẫn an toàn.</p>
  <p>Để đặt lại mật khẩu, vui lòng nhấn vào nút bên dưới:</p>
  <div style="text-align: center;">
    <a href="${resetUrl}" class="button">Đặt lại mật khẩu</a>
  </div>
  <p style="margin-top: 30px;">Hoặc copy đường dẫn sau vào trình duyệt:</p>
  <p><a href="${resetUrl}" style="color: #007bff; word-break: break-all;">${resetUrl}</a></p>
  <p>Link này sẽ hết hạn sau <strong>15 phút</strong>.</p>
`
