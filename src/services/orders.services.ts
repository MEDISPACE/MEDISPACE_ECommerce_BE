import { ObjectId } from 'mongodb'
import Order, { OrderItem, ShippingAddress } from '~/models/schemas/Order.schema'
import databaseService from './database.services'
import cartService from './carts.services'
import emailService from './email.services'
import paymentService from './payment.services'
import { ErrorWithStatus } from '~/models/Error'
import HTTP_STATUS from '~/constants/httpStatus'
import { ORDERS_MESSAGES } from '~/constants/message'
import { PaymentMethod } from '~/constants/enum'

class OrderService {
  // Create order from cart
  async createOrder(
    userId: ObjectId,
    shippingAddress: ShippingAddress,
    paymentMethod: PaymentMethod,
    notes: string,
    sessionId?: string,
    req?: any
  ) {
    // Check if cart is empty
    const cartResult = await cartService.getCart(userId, sessionId)
    const cart = cartResult.cart

    if (!cart || cart.items.length === 0) {
      throw new ErrorWithStatus({
        message: ORDERS_MESSAGES.CART_EMPTY,
        status: HTTP_STATUS.BAD_REQUEST
      })
    }

    // Check prescription requirement
    const hasPrescriptionItem = cart.items.some((item) => item.prescriptionRequired)
    if (hasPrescriptionItem) {
      // Check if user has uploaded prescription
      // This logic depends on how we store prescriptions. 
      // For now, we assume frontend handles the upload and we might check a flag or recent upload here.
      // If we skip this check for now:
      // console.log('Order contains prescription items')
    }

    const orderNumber = `ORD-${Date.now()}-${Math.floor(Math.random() * 1000)}`

    const order = new Order({
      _id: new ObjectId(),
      userId,
      orderNumber,
      items: cart.items,
      itemCount: cart.itemCount,
      shippingAddress,
      paymentMethod,
      paymentStatus: 'pending',
      orderStatus: 'pending',
      subtotal: cart.subtotal,
      taxAmount: cart.taxAmount,
      shippingFee: cart.shippingFee,
      discountAmount: cart.discountAmount,
      totalAmount: cart.totalAmount,
      notes
    })

    const result = await databaseService.orders.insertOne(order)

    // Clear cart
    await cartService.clearCart(userId.toString())

    // Send order confirmation email
    try {
      await emailService.sendOrderConfirmationEmail(shippingAddress.email, { ...order, _id: result.insertedId })
    } catch (error) {
      console.error('Failed to send order confirmation email:', error)
    }

    // Generate Payment URL if applicable
    let paymentUrl = undefined
    if (paymentMethod !== PaymentMethod.COD && req) {
      try {
        console.log('Generating payment URL for method:', paymentMethod)
        paymentUrl = await paymentService.createPaymentUrl({ ...order, _id: result.insertedId } as any, req)
        console.log('Generated payment URL:', paymentUrl)
      } catch (error) {
        console.error('Failed to generate payment URL:', error)
      }
    } else {
      console.log('Skipping payment URL generation. Method:', paymentMethod, 'Req:', !!req)
    }

    return {
      order: { ...order, _id: result.insertedId },
      orderId: result.insertedId,
      paymentUrl
    }
  }

  // Get Payment URL for existing order
  async getPaymentUrl(orderId: ObjectId, userId: ObjectId, req: any) {
    const order = await databaseService.orders.findOne({ _id: orderId, userId })
    if (!order) {
      throw new ErrorWithStatus({
        message: ORDERS_MESSAGES.ORDER_NOT_FOUND,
        status: HTTP_STATUS.NOT_FOUND
      })
    }

    if (order.paymentStatus === 'paid') {
      throw new ErrorWithStatus({
        message: 'Order is already paid',
        status: HTTP_STATUS.BAD_REQUEST
      })
    }

    if (order.paymentMethod === PaymentMethod.COD) {
      throw new ErrorWithStatus({
        message: 'Cannot generate payment URL for COD order',
        status: HTTP_STATUS.BAD_REQUEST
      })
    }

    const paymentUrl = await paymentService.createPaymentUrl(order as any, req)
    return { paymentUrl }
  }

  // Get orders for user
  async getOrders(userId: ObjectId, page: number = 1, limit: number = 10) {
    const skip = (page - 1) * limit

    const [orders, total] = await Promise.all([
      databaseService.orders.find({ userId }).sort({ createdAt: -1 }).skip(skip).limit(limit).toArray(),
      databaseService.orders.countDocuments({ userId })
    ])

    return {
      orders,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    }
  }

  // Get order by ID
  async getOrderById(orderId: ObjectId, userId: ObjectId) {
    const order = await databaseService.orders.findOne({
      _id: orderId,
      userId
    })

    if (!order) {
      throw new ErrorWithStatus({
        message: ORDERS_MESSAGES.ORDER_NOT_FOUND,
        status: HTTP_STATUS.NOT_FOUND
      })
    }

    return order
  }

  // Get order by Order Number
  async getOrderByOrderNumber(orderNumber: string) {
    return await databaseService.orders.findOne({ orderNumber })
  }

  // Update order status (admin only)
  async updateOrderStatus(orderId: ObjectId, newStatus: string, trackingNumber?: string) {
    const order = await databaseService.orders.findOne({ _id: orderId })

    if (!order) {
      throw new ErrorWithStatus({
        message: ORDERS_MESSAGES.ORDER_NOT_FOUND,
        status: HTTP_STATUS.NOT_FOUND
      })
    }

    // Update order
    const updateData: any = {
      orderStatus: newStatus,
      updatedAt: new Date()
    }

    if (newStatus === 'shipped' && trackingNumber) {
      updateData.trackingNumber = trackingNumber
      updateData.shippedAt = new Date()
    }

    if (newStatus === 'delivered') {
      updateData.deliveredAt = new Date()
    }

    await databaseService.orders.updateOne({ _id: orderId }, { $set: updateData })

    return await databaseService.orders.findOne({ _id: orderId })
  }

  // Update payment status
  async updatePaymentStatus(orderId: ObjectId, newStatus: string) {
    const order = await databaseService.orders.findOne({ _id: orderId })

    if (!order) {
      throw new ErrorWithStatus({
        message: ORDERS_MESSAGES.ORDER_NOT_FOUND,
        status: HTTP_STATUS.NOT_FOUND
      })
    }

    const updateData: any = {
      paymentStatus: newStatus,
      updatedAt: new Date()
    }

    if (newStatus === 'paid') {
      updateData.paidAt = new Date()
    }

    await databaseService.orders.updateOne({ _id: orderId }, { $set: updateData })

    return await databaseService.orders.findOne({ _id: orderId })
  }

  // Get all orders (admin only)
  async getAllOrders(page: number = 1, limit: number = 20, status?: string) {
    const skip = (page - 1) * limit
    const query = status ? { orderStatus: status } : {}

    const [orders, total] = await Promise.all([
      databaseService.orders.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).toArray(),
      databaseService.orders.countDocuments(query)
    ])

    return {
      orders,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    }
  }

  // Get order statistics (admin only)
  async getOrderStats() {
    const [
      totalOrders,
      pendingOrders,
      processingOrders,
      shippedOrders,
      deliveredOrders,
      cancelledOrders,
      totalRevenue
    ] = await Promise.all([
      databaseService.orders.countDocuments({}),
      databaseService.orders.countDocuments({ orderStatus: 'pending' }),
      databaseService.orders.countDocuments({ orderStatus: 'processing' }),
      databaseService.orders.countDocuments({ orderStatus: 'shipped' }),
      databaseService.orders.countDocuments({ orderStatus: 'delivered' }),
      databaseService.orders.countDocuments({ orderStatus: 'cancelled' }),
      databaseService.orders
        .aggregate([{ $match: { paymentStatus: 'paid' } }, { $group: { _id: null, total: { $sum: '$totalAmount' } } }])
        .toArray()
    ])

    return {
      total: totalOrders,
      pending: pendingOrders,
      processing: processingOrders,
      shipped: shippedOrders,
      delivered: deliveredOrders,
      cancelled: cancelledOrders,
      revenue: totalRevenue[0]?.total || 0
    }
  }
}

const orderService = new OrderService()
export default orderService
