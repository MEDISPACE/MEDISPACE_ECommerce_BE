import { Request, Response } from 'express'
import paymentService from '~/services/payment.services'
import orderService from '~/services/orders.services'
import cartService from '~/services/carts.services'
import databaseService from '~/services/database.services'
import emailService from '~/services/email.services'
import { PaymentMethod } from '~/constants/enum'
import { ObjectId } from 'mongodb'
import { PaymentResult } from '~/services/payment/payment.interface'

/**
 * Helper: After payment success — clear cart & send order confirmation email.
 * Shared by vnpayReturn, payosReturn, payosIpn.
 */
async function handlePostPaymentSuccess(orderId: ObjectId) {
  const order = await databaseService.orders.findOne({ _id: orderId })
  if (!order) return

  if (!order.cartClearedAt && order.items && order.items.length > 0) {
    try {
      for (const item of order.items) {
        await cartService.removeItemFromCart(
          new ObjectId(item.productId),
          order.userId,
          undefined,
          (item as any).unit
        )
      }
      await databaseService.orders.updateOne(
        { _id: orderId, cartClearedAt: { $exists: false } },
        { $set: { cartClearedAt: new Date(), updatedAt: new Date() } }
      )
    } catch (error) {
      console.error('Failed to clear cart after payment success:', error)
    }
  }

  if (!order.confirmationEmailSentAt && order.shippingAddress?.email) {
    try {
      await emailService.sendOrderConfirmationEmail(order.shippingAddress.email, order)
      await databaseService.orders.updateOne(
        { _id: orderId, confirmationEmailSentAt: { $exists: false } },
        { $set: { confirmationEmailSentAt: new Date(), updatedAt: new Date() } }
      )
    } catch (error) {
      console.error('Failed to send confirmation email after payment success:', error)
    }
  }
}

async function confirmVerifiedPayment(result: PaymentResult, allowedMethods: string[]) {
  if (!result.isSuccess || !result.orderId || !ObjectId.isValid(result.orderId)) return null

  const orderId = new ObjectId(result.orderId)
  const order = await databaseService.orders.findOne({ _id: orderId })
  if (!order || !allowedMethods.includes(order.paymentMethod)) return null
  if (!Number.isFinite(result.amount) || Math.round(result.amount) !== Math.round(order.totalAmount)) return null

  if (order.paymentStatus !== 'paid') await orderService.updatePaymentStatus(orderId, 'paid')
  await handlePostPaymentSuccess(orderId)
  return order
}

// VNPay Return
export const vnpayReturnController = async (req: Request, res: Response) => {
  try {
    const result = await paymentService.verifyReturn(PaymentMethod.VNPay, req.query)

    if (result.isSuccess && result.orderId) {
      const confirmedOrder = await confirmVerifiedPayment(result, [PaymentMethod.VNPay, PaymentMethod.BankTransfer])
      if (!confirmedOrder) result.isSuccess = false
    }

    const redirectOrderId = result.orderId || ''
    const redirectUrl = `${process.env.CLIENT_URL}/order/success?orderId=${redirectOrderId}&paymentStatus=${result.isSuccess ? 'success' : 'failed'}`
    return res.redirect(redirectUrl)
  } catch (error) {
    return res.redirect(`${process.env.CLIENT_URL}/order/success?paymentStatus=failed`)
  }
}

// VNPay IPN
export const vnpayIpnController = async (req: Request, res: Response) => {
  try {
    const result = await paymentService.verifyIpn(PaymentMethod.VNPay, req.query)

    if (result.isSuccess && result.orderId) {
      const confirmedOrder = await confirmVerifiedPayment(result, [PaymentMethod.VNPay, PaymentMethod.BankTransfer])
      if (confirmedOrder) return res.status(200).json({ RspCode: '00', Message: 'Confirm Success' })
      return res.status(200).json({ RspCode: '04', Message: 'Invalid amount or order' })
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
      // PayOS IPN returns transactionId = orderNumber, orderId may be empty
      let orderId = result.orderId
      let order = null

      if (orderId && ObjectId.isValid(orderId)) {
        order = await databaseService.orders.findOne({ _id: new ObjectId(orderId) })
      }

      // Fallback: lookup by orderNumber (stored in transactionId)
      if (!order && result.transactionId) {
        order = await orderService.getOrderByOrderNumber(result.transactionId)
        if (order) {
          orderId = order._id!.toString()
        }
      }

      const paymentMatches =
        order &&
        order.paymentMethod === PaymentMethod.PayOS &&
        Number.isFinite(result.amount) &&
        Math.round(result.amount) === Math.round(order.totalAmount)
      if (paymentMatches) {
        if (order.paymentStatus !== 'paid') await orderService.updatePaymentStatus(order._id as ObjectId, 'paid')
        await handlePostPaymentSuccess(order._id as ObjectId)
      }

      return res.status(200).json({ success: Boolean(paymentMatches) })
    }
    return res.status(200).json({ success: false, message: 'Invalid signature' })
  } catch (error) {
    console.error('PayOS webhook processing failed:', error)
    return res.status(500).json({ success: false, message: 'Temporary processing error' })
  }
}

// PayOS Return
export const payOSReturnController = async (req: Request, res: Response) => {
  try {
    const redirectOrderId = typeof req.query.orderId === 'string' && ObjectId.isValid(req.query.orderId) ? req.query.orderId : ''
    const order = redirectOrderId
      ? await databaseService.orders.findOne({ _id: new ObjectId(redirectOrderId), paymentMethod: PaymentMethod.PayOS })
      : null
    const paymentStatus = order?.paymentStatus === 'paid' ? 'success' : 'pending'
    const redirectUrl = `${process.env.CLIENT_URL}/order/success?orderId=${redirectOrderId}&paymentStatus=${paymentStatus}`
    return res.redirect(redirectUrl)
  } catch (error) {
    return res.redirect(`${process.env.CLIENT_URL}/order/success?paymentStatus=failed`)
  }
}
