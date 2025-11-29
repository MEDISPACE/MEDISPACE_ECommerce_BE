import * as nodemailer from 'nodemailer'
import { config } from 'dotenv'
import { getEmailTemplate, getForgotPasswordContent, getVerifyEmailContent, getOrderConfirmationContent } from '~/templates/email-templates'

config()

class EmailService {
    private transporter

    constructor() {
        this.transporter = nodemailer.createTransport({
            host: process.env.EMAIL_HOST || 'smtp.gmail.com',
            port: Number(process.env.EMAIL_PORT) || 587,
            secure: false, // true for 465, false for other ports
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS,
            },
        })
    }

    private async sendEmail(to: string, subject: string, htmlContent: string) {
        const fullHtml = getEmailTemplate(htmlContent)

        try {
            const info = await this.transporter.sendMail({
                from: process.env.EMAIL_FROM_ADDRESS || '"MediSpace" <no-reply@medispace.com>',
                to: to,
                subject: subject,
                html: fullHtml,
            })
            console.log(`Email sent to ${to}: ${info.messageId}`)
            return info
        } catch (error) {
            console.error(`Error sending email to ${to}:`, error)
            // Log error but don't throw to prevent blocking the main flow
        }
    }

    async sendVerifyRegisterEmail(to: string, emailVerifyToken: string) {
        const clientUrl = process.env.CLIENT_URL || 'http://localhost:3000'
        const verifyUrl = `${clientUrl}/verify-email/${emailVerifyToken}`
        const content = getVerifyEmailContent(verifyUrl)
        return this.sendEmail(to, 'Xác thực tài khoản MediSpace', content)
    }

    async sendOrderConfirmationEmail(to: string, order: any) {
        const content = getOrderConfirmationContent(order)
        return this.sendEmail(to, `Xác nhận đơn hàng #${order.orderNumber}`, content)
    }

    async sendForgotPasswordEmail(to: string, forgotPasswordToken: string) {
        const clientUrl = process.env.CLIENT_URL || 'http://localhost:3000'
        const resetUrl = `${clientUrl}/reset-password/${forgotPasswordToken}`
        const content = getForgotPasswordContent(resetUrl)
        return this.sendEmail(to, 'Khôi phục mật khẩu MediSpace', content)
    }
}

const emailService = new EmailService()
export default emailService
