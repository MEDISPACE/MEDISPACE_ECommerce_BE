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

export const getOrderConfirmationContent = (order: any) => {
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount)
  }

  const appliedCoupons = order.appliedCoupons || []
  const pointsRedeemed = order.pointsRedeemed || 0
  const pointsRedeemAmount = order.pointsRedeemAmount || 0

  const shippingAddress = order.shippingAddress || {}
  const lastName = shippingAddress.lastName || ''
  const firstName = shippingAddress.firstName || 'Khách hàng'
  const phone = shippingAddress.phone || ''
  const address = shippingAddress.address || 'Không có địa chỉ'
  const ward = shippingAddress.ward || ''
  const district = shippingAddress.district || ''
  const province = shippingAddress.province || ''

  const itemsHtml = order.items
    .map(
      (item: any) => `
    <tr>
      <td style="padding: 10px; border-bottom: 1px solid #eee;">
        <div style="font-weight: bold;">${item.name}</div>
        <div style="font-size: 12px; color: #666;">SKU: ${item.sku}</div>
      </td>
      <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: center;">${item.quantity}</td>
      <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: right;">${formatCurrency(item.unitPrice)}</td>
      <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: right; font-weight: bold;">${formatCurrency(item.totalPrice)}</td>
    </tr>
  `
    )
    .join('')

  return `
    <h2>Xác nhận đơn hàng #${order.orderNumber}</h2>
    <p>Xin chào <strong>${lastName} ${firstName}</strong>,</p>
    <p>Cảm ơn bạn đã đặt hàng tại <strong>MediSpace</strong>. Đơn hàng của bạn đã được tiếp nhận và đang được xử lý.</p>
    
    <div style="background-color: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0;">
      <h3 style="margin-top: 0; border-bottom: 1px solid #ddd; padding-bottom: 10px;">Thông tin đơn hàng</h3>
      <table style="width: 100%; font-size: 14px;">
        <tr>
          <td style="padding: 5px 0;"><strong>Mã đơn hàng:</strong></td>
          <td style="text-align: right;">${order.orderNumber}</td>
        </tr>
        <tr>
          <td style="padding: 5px 0;"><strong>Ngày đặt:</strong></td>
          <td style="text-align: right;">${new Date(order.createdAt).toLocaleDateString('vi-VN')}</td>
        </tr>
        <tr>
          <td style="padding: 5px 0;"><strong>Trạng thái thanh toán:</strong></td>
          <td style="text-align: right;">${
            order.paymentStatus === 'paid'
              ? '<span style="color: green;">Đã thanh toán</span>'
              : '<span style="color: orange;">Chưa thanh toán</span>'
          }</td>
        </tr>
        <tr>
          <td style="padding: 5px 0;"><strong>Phương thức thanh toán:</strong></td>
          <td style="text-align: right;">${
            order.paymentMethod === 'cod'
              ? 'Thanh toán khi nhận hàng (COD)'
              : order.paymentMethod === 'bank_transfer'
                ? 'Chuyển khoản ngân hàng'
                : order.paymentMethod
          }</td>
        </tr>
      </table>
    </div>

    <h3 style="border-bottom: 1px solid #ddd; padding-bottom: 10px;">Chi tiết sản phẩm</h3>
    <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
      <thead>
        <tr style="background-color: #f9f9f9;">
          <th style="padding: 10px; text-align: left;">Sản phẩm</th>
          <th style="padding: 10px; text-align: center;">SL</th>
          <th style="padding: 10px; text-align: right;">Đơn giá</th>
          <th style="padding: 10px; text-align: right;">Thành tiền</th>
        </tr>
      </thead>
      <tbody>
        ${itemsHtml}
      </tbody>
      <tfoot>
        <tr>
          <td colspan="3" style="padding: 10px; text-align: right; border-top: 2px solid #eee;"><strong>Tạm tính:</strong></td>
          <td style="padding: 10px; text-align: right; border-top: 2px solid #eee;">${formatCurrency(order.subtotal)}</td>
        </tr>
        <tr>
          <td colspan="3" style="padding: 5px 10px; text-align: right;">Phí vận chuyển:</td>
          <td style="padding: 5px 10px; text-align: right;">${formatCurrency(order.shippingFee)}</td>
        </tr>
        ${
          order.discountAmount > 0 || appliedCoupons.length > 0
            ? `
        <tr>
          <td colspan="3" style="padding: 5px 10px; text-align: right; color: green;">Giảm giá:</td>
          <td style="padding: 5px 10px; text-align: right; color: green;">-${formatCurrency(order.discountAmount || 0)}</td>
        </tr>
        ${appliedCoupons
          .map(
            (coupon: any) => `
        <tr>
          <td colspan="3" style="padding: 3px 10px; text-align: right; color: #4b5563; font-size: 12px;">
            Mã ${coupon.code}${coupon.name ? ` - ${coupon.name}` : ''}:
          </td>
          <td style="padding: 3px 10px; text-align: right; color: green; font-size: 12px;">
            ${
              coupon.type === 'free_shipping'
                ? coupon.discountAmount > 0
                  ? `-${formatCurrency(coupon.discountAmount)}`
                  : 'Freeship'
                : `-${formatCurrency(coupon.discountAmount || 0)}`
            }
          </td>
        </tr>
        `
          )
          .join('')}
        `
            : ''
        }
        ${
          pointsRedeemAmount > 0
            ? `
        <tr>
          <td colspan="3" style="padding: 5px 10px; text-align: right; color: #7c3aed;">
            Điểm thưởng (${pointsRedeemed.toLocaleString('vi-VN')} điểm):
          </td>
          <td style="padding: 5px 10px; text-align: right; color: #7c3aed;">-${formatCurrency(pointsRedeemAmount)}</td>
        </tr>
        `
            : ''
        }
        <tr>
          <td colspan="3" style="padding: 10px; text-align: right; font-size: 16px; border-top: 1px solid #ddd;"><strong>Tổng cộng:</strong></td>
          <td style="padding: 10px; text-align: right; font-size: 16px; font-weight: bold; color: #007bff; border-top: 1px solid #ddd;">${formatCurrency(
            order.totalAmount
          )}</td>
        </tr>
      </tfoot>
    </table>

    <div style="margin-top: 30px;">
      <h3 style="border-bottom: 1px solid #ddd; padding-bottom: 10px;">Địa chỉ giao hàng</h3>
      <p>
        <strong>${lastName} ${firstName}</strong><br>
        ${phone}<br>
        ${address}<br>
        ${ward ? ward + ', ' : ''}${district ? district + ', ' : ''}${province}
      </p>
    </div>

    <div style="text-align: center; margin-top: 30px;">
      <a href="${CLIENT_URL}/account/orders/${order._id}" class="button">Xem chi tiết đơn hàng</a>
    </div>
  `
}
