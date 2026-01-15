import { Request, Response } from 'express'
import paymentService from '~/services/payment.services'
import orderService from '~/services/orders.services'
import cartService from '~/services/carts.services'
import databaseService from '~/services/database.services'
import emailService from '~/services/email.services'
import { PaymentMethod } from '~/constants/enum'
import { ObjectId } from 'mongodb'

// VNPay Return
export const vnpayReturnController = async (req: Request, res: Response) => {
    try {

        const result = await paymentService.verifyReturn(PaymentMethod.VNPay, req.query)
        if (result.isSuccess) {
            await orderService.updatePaymentStatus(new ObjectId(result.orderId), 'paid')

            // Clear purchased items from cart after successful payment
            try {
                const order = await databaseService.orders.findOne({ _id: new ObjectId(result.orderId) })
                if (order && order.items && order.items.length > 0) {
                    for (const item of order.items) {
                        await cartService.removeItemFromCart(
                            new ObjectId(item.productId),
                            order.userId,
                            undefined,
                            (item as any).unit
                        )
                    }
                }

                // Send order confirmation email after successful payment
                if (order && order.shippingAddress?.email) {
                    await emailService.sendOrderConfirmationEmail(order.shippingAddress.email, order)
                }
            } catch (error) {
                console.error('Failed to clear cart or send email after payment success:', error)
            }
        }
        const redirectUrl = `${process.env.CLIENT_URL}/order/success?orderId=${result.orderId}&paymentStatus=${result.isSuccess ? 'success' : 'failed'}`
        return res.redirect(redirectUrl)
    } catch (error) {

        return res.redirect(`${process.env.CLIENT_URL}/order/success?paymentStatus=failed`)
    }
}

// VNPay IPN
export const vnpayIpnController = async (req: Request, res: Response) => {
    try {

        const result = await paymentService.verifyIpn(PaymentMethod.VNPay, req.query)

        if (result.isSuccess) {
            await orderService.updatePaymentStatus(new ObjectId(result.orderId), 'paid')
            return res.status(200).json({ RspCode: '00', Message: 'Confirm Success' })
        }
        return res.status(200).json({ RspCode: '97', Message: 'Fail checksum' })
    } catch (error) {

        return res.status(200).json({ RspCode: '99', Message: 'Unknown error' })
    }
}

// PayOS IPN
export const payOSIpnController = async (req: Request, res: Response) => {
    try {

        const result = await paymentService.verifyIpn(PaymentMethod.PayOS, req.body)

        if (result.isSuccess) {
            await orderService.updatePaymentStatus(new ObjectId(result.orderId), 'paid')
            return res.status(200).json({ success: true })
        }
        return res.status(400).json({ success: false, message: 'Invalid signature' })
    } catch (error) {

        return res.status(500).json({ success: false, message: 'Internal Server Error' })
    }
}

// PayOS Return
export const payOSReturnController = async (req: Request, res: Response) => {
    try {

        const result = await paymentService.verifyReturn(PaymentMethod.PayOS, req.query)
        if (result.isSuccess) {
            await orderService.updatePaymentStatus(new ObjectId(result.orderId), 'paid')

            // Clear purchased items from cart after successful payment
            try {
                const order = await databaseService.orders.findOne({ _id: new ObjectId(result.orderId) })
                if (order && order.items && order.items.length > 0) {
                    for (const item of order.items) {
                        await cartService.removeItemFromCart(
                            new ObjectId(item.productId),
                            order.userId,
                            undefined,
                            (item as any).unit
                        )
                    }
                }

                // Send order confirmation email after successful payment
                if (order && order.shippingAddress?.email) {
                    await emailService.sendOrderConfirmationEmail(order.shippingAddress.email, order)
                }
            } catch (error) {
                console.error('Failed to clear cart or send email after payment success:', error)
            }
        }
        const redirectUrl = `${process.env.CLIENT_URL}/order/success?orderId=${result.orderId}&paymentStatus=${result.isSuccess ? 'success' : 'failed'}`
        return res.redirect(redirectUrl)
    } catch (error) {

        return res.redirect(`${process.env.CLIENT_URL}/order/success?paymentStatus=failed`)
    }
}
