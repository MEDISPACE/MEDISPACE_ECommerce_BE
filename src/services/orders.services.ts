import { ObjectId } from 'mongodb'
import Order, { OrderItem, ShippingAddress } from '~/models/schemas/Order.schema'
import databaseService from './database.services'
import cartService from './carts.services'
import { ErrorWithStatus } from '~/models/Error'
import HTTP_STATUS from '~/constants/httpStatus'
import { ORDERS_MESSAGES } from '~/constants/message'

class OrderService {
  // Create order from cart
  async createOrder(userId: ObjectId, shippingAddress: ShippingAddress, paymentMethod: string, notes?: string) {
    // Get user's cart
    const cartResult = await cartService.getCart(userId)
    const cart = cartResult.cart

    if (!cart || cart.items.length === 0) {
      throw new ErrorWithStatus({
        message: ORDERS_MESSAGES.CART_EMPTY,
        status: HTTP_STATUS.BAD_REQUEST
      })
    }

    // Check if cart requires prescription
    if (cart.requiresPrescription) {
      throw new ErrorWithStatus({
        message: ORDERS_MESSAGES.PRESCRIPTION_REQUIRED,
        status: HTTP_STATUS.BAD_REQUEST
      })
    }

    // Convert cart items to order items
    const orderItems: OrderItem[] = cart.items.map((item) => ({
      productId: item.productId,
      name: item.name,
      sku: item.sku,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      totalPrice: item.totalPrice,
      prescriptionRequired: item.prescriptionRequired,
      image: item.image
    }))

    // Create order
    const order = new Order({
      userId,
      orderNumber: Order.generateOrderNumber(),
      items: orderItems,
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

    // Save order to database
    const result = await databaseService.orders.insertOne(order)

    // Clear user's cart after successful order
    await cartService.clearCart(userId)

    return {
      order: { ...order, _id: result.insertedId },
      orderId: result.insertedId
    }
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
