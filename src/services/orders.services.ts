import { ObjectId } from 'mongodb'
import Order, { OrderItem, ShippingAddress } from '~/models/schemas/Order.schema'
import databaseService from './database.services'
import cartService from './carts.services'
import emailService from './email.services'
import paymentService from './payment.services'
import productsService from './products.services'
import { ghnService } from './ghn.services'
import { ErrorWithStatus } from '~/models/Error'
import HTTP_STATUS from '~/constants/httpStatus'
import { ORDERS_MESSAGES, CARTS_MESSAGES, PRODUCTS_MESSAGES } from '~/constants/message'
import { PaymentMethod, ShippingMethod } from '~/constants/enum'

class OrderService {
  // Create order from cart
  async createOrder(userId: ObjectId, payload: any) {
    const { shippingAddress, paymentMethod, notes, sessionId, req, selectedItems, isDirectBuy, shippingMethod } = payload
    let orderItems: any[] = []

    if (isDirectBuy && selectedItems && selectedItems.length > 0) {
      // Direct buy: fetch items directly from products
      for (const item of selectedItems) {
        const product = await productsService.getProductById(item.productId)
        if (!product) {
          throw new ErrorWithStatus({
            message: PRODUCTS_MESSAGES.PRODUCT_NOT_FOUND,
            status: HTTP_STATUS.NOT_FOUND
          })
        }

        // Validate stock
        if (product.stockQuantity < item.quantity) {
          throw new ErrorWithStatus({
            message: CARTS_MESSAGES.INSUFFICIENT_STOCK,
            status: HTTP_STATUS.BAD_REQUEST
          })
        }

        // Calc price based on unit
        let price = product.price || 0
        if (item.unit && product.priceVariants) {
          const v = product.priceVariants.find((v: any) => v.unit === item.unit)
          if (v) price = v.price
        }

        orderItems.push({
          productId: product._id,
          name: product.name,
          sku: product.sku,
          unit: item.unit || product.unit,
          quantity: item.quantity,
          unitPrice: price,
          totalPrice: price * item.quantity,
          prescriptionRequired: product.prescriptionRequired,
          image: product.image || (product.images && product.images.length > 0 ? product.images[0] : undefined)
        })
      }
    } else {
      // Normal checkout from cart
      const cartResult = await cartService.getCart(userId, sessionId)
      const cart = cartResult.cart

      if (!cart || cart.items.length === 0) {
        throw new ErrorWithStatus({
          message: ORDERS_MESSAGES.CART_EMPTY,
          status: HTTP_STATUS.BAD_REQUEST
        })
      }

      // Filter cart items based on selected items
      orderItems = cart.items
      if (selectedItems && selectedItems.length > 0) {
        orderItems = cart.items.filter(cartItem => {
          const cartItemId = cartItem.productId.toString()
          // Treat null/undefined/empty string as equivalent for unit comparison
          const cartItemUnit = cartItem.unit || undefined

          return selectedItems.some((selectedItem: any) => {
            const selectedId = selectedItem.productId
            const selectedUnit = selectedItem.unit || undefined

            // Compare ID
            if (selectedId !== cartItemId) return false

            // Compare Unit
            return selectedUnit === cartItemUnit
          })
        })

        if (orderItems.length === 0) {
          throw new ErrorWithStatus({
            message: ORDERS_MESSAGES.CART_EMPTY, // Use 'No valid items found' message ideally but stick to constants
            status: HTTP_STATUS.BAD_REQUEST
          })
        }
      }
    }

    // Recalculate totals based on orderItems (common for both flows)
    // Recalculate totals based on orderItems (common for both flows)
    const subtotal = orderItems.reduce((sum, item) => sum + item.totalPrice, 0)

    // Calculate Shipping Fee
    const method = shippingMethod || ShippingMethod.Standard
    let baseShippingFee = 30000

    if (method === ShippingMethod.Fast) {
      baseShippingFee = 45000
    } else if (method === ShippingMethod.Express) {
      baseShippingFee = 60000
    } else if (method === ShippingMethod.Standard && shippingAddress.districtId && shippingAddress.wardCode) {
      try {
        const feeData = await ghnService.calculateFee({
          to_district_id: shippingAddress.districtId,
          to_ward_code: shippingAddress.wardCode,
          weight: 2000, // Estimated 2kg
          service_type_id: 2 // Standard
        })
        if (feeData && feeData.total) {
          baseShippingFee = feeData.total
        }
      } catch (error) {
        console.error('GHN Fee Calculation Failed:', error)
        // Fallback to default 30000 is already set
      }
    }

    // Apply Freeship logic: >= 300k -> Discount 30k ship
    let shippingDiscount = 0
    if (subtotal >= 300000) {
      shippingDiscount = 30000
    }

    const shippingFee = Math.max(0, baseShippingFee - shippingDiscount)

    // Tax logic: Prices already include VAT, so no extra tax added
    const taxAmount = 0
    const discountAmount = 0
    const totalAmount = subtotal + taxAmount + shippingFee - discountAmount

    // Check prescription requirement logic if needed

    const orderNumber = `ORD-${Date.now()}-${Math.floor(Math.random() * 1000)}`

    const order = new Order({
      _id: new ObjectId(),
      userId,
      orderNumber,
      items: orderItems,
      itemCount: orderItems.length,
      shippingAddress,
      paymentMethod,
      paymentStatus: 'pending',
      orderStatus: 'pending',
      subtotal,
      taxAmount,
      shippingFee,
      discountAmount,
      totalAmount,
      notes
    })

    const result = await databaseService.orders.insertOne(order)

    // Clear cart or remove selected items ONLY if NOT direct buy
    if (!isDirectBuy) {
      if (selectedItems && selectedItems.length > 0) {
        // Remove only selected items from cart
        for (const item of selectedItems) {
          await cartService.removeItemFromCart(
            new ObjectId(item.productId),
            userId,
            sessionId,
            (item as any).unit
          )
        }
      } else {
        // Clear entire cart
        await cartService.clearCart(userId)
      }
    }

    // Send order confirmation email
    try {
      await emailService.sendOrderConfirmationEmail(shippingAddress.email, { ...order, _id: result.insertedId })
    } catch (error) {
      // ignore
    }

    // Generate Payment URL if applicable
    let paymentUrl = undefined
    if (paymentMethod !== PaymentMethod.COD && req) {
      try {
        paymentUrl = await paymentService.createPaymentUrl({ ...order, _id: result.insertedId } as any, req)
      } catch (error) {
        // error suppressed
      }
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
        message: ORDERS_MESSAGES.INVALID_PAYMENT_STATUS,
        status: HTTP_STATUS.BAD_REQUEST
      })
    }

    if (order.paymentMethod === PaymentMethod.COD) {
      throw new ErrorWithStatus({
        message: ORDERS_MESSAGES.INVALID_PAYMENT_METHOD,
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

      // Auto-update payment status for COD orders
      if (order.paymentMethod === PaymentMethod.COD && order.paymentStatus === 'pending') {
        updateData.paymentStatus = 'paid'
        updateData.paidAt = new Date()
      }
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
