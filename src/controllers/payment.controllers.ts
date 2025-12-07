import { Request, Response } from 'express'
import paymentService from '~/services/payment.services'
import orderService from '~/services/orders.services'
import { PaymentMethod } from '~/constants/enum'
import { ObjectId } from 'mongodb'

// Momo Return
export const momoReturnController = async (req: Request, res: Response) => {
    try {
        console.log('Momo Return Params:', req.query)
        const result = await paymentService.verifyReturn(PaymentMethod.Momo, req.query)
        const redirectUrl = `${process.env.CLIENT_URL}/order/success?orderId=${result.orderId}&paymentStatus=${result.isSuccess ? 'success' : 'failed'}`
        return res.redirect(redirectUrl)
    } catch (error) {
        console.error('Momo Return Error:', error)
        return res.redirect(`${process.env.CLIENT_URL}/order/success?paymentStatus=failed`)
    }
}

// VNPay Return
export const vnpayReturnController = async (req: Request, res: Response) => {
    try {
        console.log('VNPay Return Params:', req.query)
        const result = await paymentService.verifyReturn(PaymentMethod.VNPay, req.query)
        const redirectUrl = `${process.env.CLIENT_URL}/order/success?orderId=${result.orderId}&paymentStatus=${result.isSuccess ? 'success' : 'failed'}`
        return res.redirect(redirectUrl)
    } catch (error) {
        console.error('VNPay Return Error:', error)
        return res.redirect(`${process.env.CLIENT_URL}/order/success?paymentStatus=failed`)
    }
}

// Momo IPN
export const momoIpnController = async (req: Request, res: Response) => {
    try {
        console.log('Momo IPN Body:', req.body)
        const result = await paymentService.verifyIpn(PaymentMethod.Momo, req.body)

        if (result.isSuccess) {
            await orderService.updatePaymentStatus(new ObjectId(result.orderId), 'paid')
            return res.status(204).json({})
        }
        return res.status(400).json({ message: 'Signature verification failed' })
    } catch (error) {
        console.error('Momo IPN Error:', error)
        return res.status(500).json({ message: 'Internal Server Error' })
    }
}

// VNPay IPN
export const vnpayIpnController = async (req: Request, res: Response) => {
    try {
        console.log('VNPay IPN Params:', req.query)
        const result = await paymentService.verifyIpn(PaymentMethod.VNPay, req.query)

        if (result.isSuccess) {
            await orderService.updatePaymentStatus(new ObjectId(result.orderId), 'paid')
            return res.status(200).json({ RspCode: '00', Message: 'Confirm Success' })
        }
        return res.status(200).json({ RspCode: '97', Message: 'Fail checksum' })
    } catch (error) {
        console.error('VNPay IPN Error:', error)
        return res.status(200).json({ RspCode: '99', Message: 'Unknown error' })
    }
}

// PayOS IPN
export const payOSIpnController = async (req: Request, res: Response) => {
    try {
        console.log('PayOS IPN Body:', req.body)
        const result = await paymentService.verifyIpn(PaymentMethod.PayOS, req.body)

        if (result.isSuccess && result.transactionId) {
            const order = await orderService.getOrderByOrderNumber(result.transactionId)
            if (order && order._id) {
                await orderService.updatePaymentStatus(order._id, 'paid')
            }
            return res.json({ success: true })
        }
        return res.json({ success: false })
    } catch (error) {
        console.error('PayOS IPN Error:', error)
        return res.json({ success: false })
    }
}
