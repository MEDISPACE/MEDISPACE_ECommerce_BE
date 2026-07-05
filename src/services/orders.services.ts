import { ObjectId } from 'mongodb'
import Order, { OrderItem, ShippingAddress } from '~/models/schemas/Order.schema'
import databaseService from './database.services'
import cartService from './carts.services'
import emailService from './email.services'
import paymentService from './payment.services'
import productsService from './products.services'
import { ghnService } from './ghn.services'
import shippingService from './shipping.services'
import { ErrorWithStatus } from '~/models/Error'
import HTTP_STATUS from '~/constants/httpStatus'
import { ORDERS_MESSAGES, CARTS_MESSAGES, PRODUCTS_MESSAGES } from '~/constants/message'
import { PaymentMethod, ShippingMethod } from '~/constants/enum'
import couponService from './coupons.services'
import loyaltyService from './loyalty.services'
import notificationService from './notifications.services'
import { getIO } from '~/sockets/chat.socket'
import recommendationsService from './recommendations.services'

class OrderService {
  private readonly terminalOrderStatuses = new Set(['cancelled', 'delivered', 'returned'])

  private estimatePackageWeight(items: any[]) {
    return Math.max(
      500,
      items.reduce((sum, item) => sum + (item.quantity || 1) * 250, 0)
    )
  }

  private async quoteSelectedShippingMethod(
    shippingMethod: string | undefined,
    shippingAddress: any,
    orderItems: any[],
    subtotal: number
  ) {
    const method = shippingMethod || ShippingMethod.Standard

    if (/^(ghn|ghtk|ahamove):[A-Za-z0-9_-]+$/.test(method)) {
      const rate = await shippingService.calculateRate(
        {
          toAddress: shippingAddress.address,
          toWard: shippingAddress.ward,
          toDistrict: shippingAddress.district,
          toProvince: shippingAddress.province,
          toDistrictId: shippingAddress.districtId,
          toWardCode: shippingAddress.wardCode,
          weight: this.estimatePackageWeight(orderItems),
          orderValue: subtotal
        },
        method
      )

      if (rate) return rate.price
    }

    return null
  }

  private assertOrderStatusTransition(order: any, newStatus: string) {
    const currentStatus = order.orderStatus

    if (currentStatus === newStatus) return

    if (currentStatus === 'cancelled') {
      throw new ErrorWithStatus({
        message: 'Đơn hàng đã hủy, không thể chuyển trạng thái.',
        status: HTTP_STATUS.BAD_REQUEST
      })
    }

    if (currentStatus === 'returned') {
      throw new ErrorWithStatus({
        message: 'Đơn hàng đã hoàn trả, không thể chuyển trạng thái.',
        status: HTTP_STATUS.BAD_REQUEST
      })
    }

    if (currentStatus === 'delivered' && newStatus !== 'returned') {
      throw new ErrorWithStatus({
        message: 'Đơn hàng đã giao, không thể chuyển về trạng thái khác.',
        status: HTTP_STATUS.BAD_REQUEST
      })
    }

    if (newStatus === 'cancelled' && currentStatus === 'delivered') {
      throw new ErrorWithStatus({
        message: 'Không thể hủy đơn hàng đã giao.',
        status: HTTP_STATUS.BAD_REQUEST
      })
    }

    if (newStatus === 'delivered' && order.paymentStatus === 'failed') {
      throw new ErrorWithStatus({
        message: 'Không thể giao đơn hàng có thanh toán thất bại.',
        status: HTTP_STATUS.BAD_REQUEST
      })
    }
  }

  private shouldRestoreBenefitsOnCancel(order: any) {
    return order.orderStatus !== 'cancelled' && order.orderStatus !== 'delivered' && order.orderStatus !== 'returned'
  }

  private normalizeMedicationName(value: string) {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim()
  }

  private async validatePrescriptionForOrder(userId: ObjectId, orderItems: any[], prescriptionId?: string) {
    const prescriptionItems = orderItems.filter((item) => item.prescriptionRequired)
    if (prescriptionItems.length === 0) return undefined

    if (!prescriptionId || !ObjectId.isValid(prescriptionId)) {
      throw new ErrorWithStatus({
        message: 'Đơn hàng có thuốc kê đơn. Vui lòng chọn đơn thuốc đã được dược sĩ xác nhận.',
        status: HTTP_STATUS.BAD_REQUEST
      })
    }

    const prescription = await databaseService.prescriptions.findOne({
      _id: new ObjectId(prescriptionId),
      customerId: userId,
      status: 'verified',
      $or: [{ validUntil: { $exists: false } }, { validUntil: { $gte: new Date() } }]
    })
    if (!prescription) {
      throw new ErrorWithStatus({
        message: 'Đơn thuốc không hợp lệ, đã hết hạn hoặc chưa được xác nhận.',
        status: HTTP_STATUS.BAD_REQUEST
      })
    }

    for (const item of prescriptionItems) {
      const normalizedItemName = this.normalizeMedicationName(item.name)
      const medication = prescription.medications?.find((entry: any) => {
        if (entry.productId) return entry.productId.toString() === item.productId.toString()
        return this.normalizeMedicationName(entry.productName || '') === normalizedItemName
      })
      if (!medication || item.quantity > medication.quantity) {
        throw new ErrorWithStatus({
          message: `Đơn thuốc không cho phép mua sản phẩm "${item.name}" với số lượng đã chọn.`,
          status: HTTP_STATUS.BAD_REQUEST
        })
      }
    }

    return prescription._id
  }

  private allocateAmountAcrossItems(totalAmount: number, items: any[]) {
    const normalizedTotal = Math.max(0, Math.floor(totalAmount || 0))
    if (normalizedTotal <= 0 || items.length === 0) return items.map(() => 0)

    const subtotal = items.reduce((sum, item) => sum + Math.max(0, item.totalPrice || 0), 0)
    if (subtotal <= 0) return items.map(() => 0)

    const allocations = items.map((item) =>
      Math.floor((normalizedTotal * Math.max(0, item.totalPrice || 0)) / subtotal)
    )
    let remainder = normalizedTotal - allocations.reduce((sum, amount) => sum + amount, 0)

    for (let i = 0; i < allocations.length && remainder > 0; i += 1) {
      if ((items[i].totalPrice || 0) > 0) {
        allocations[i] += 1
        remainder -= 1
      }
    }

    return allocations
  }

  private getCouponEligibleItems(items: any[], coupon: any) {
    // applicableCategoryIds is the expanded category snapshot returned by validateCoupon.
    const productIds = new Set((coupon.applicableProductIds || []).map((id: any) => id.toString()))
    const categoryIds = new Set((coupon.applicableCategoryIds || []).map((id: any) => id.toString()))
    const hasProductTarget = productIds.size > 0
    const hasCategoryTarget = categoryIds.size > 0

    if (!hasProductTarget && !hasCategoryTarget) return items

    return items.filter((item) => {
      const productMatches = hasProductTarget && productIds.has(item.productId?.toString())
      const categoryMatches = hasCategoryTarget && item.categoryId && categoryIds.has(item.categoryId.toString())
      return productMatches || categoryMatches
    })
  }

  private attachBenefitAllocations(items: any[], appliedCoupons: any[], pointsRedeemAmount: number) {
    const couponAllocationsByItem = items.map(() => [] as any[])
    const discountTotals = items.map(() => 0)

    for (const coupon of appliedCoupons.filter((c: any) => c.type !== 'free_shipping' && c.discountAmount > 0)) {
      const eligibleItems = this.getCouponEligibleItems(items, coupon)
      const allocations = this.allocateAmountAcrossItems(coupon.discountAmount, eligibleItems)
      eligibleItems.forEach((eligibleItem, eligibleIndex) => {
        const amount = allocations[eligibleIndex]
        if (amount <= 0) return
        const index = items.findIndex(
          (item) => item.productId?.toString() === eligibleItem.productId?.toString() && item.unit === eligibleItem.unit
        )
        if (index < 0) return
        couponAllocationsByItem[index].push({
          code: coupon.code,
          type: coupon.type,
          amount
        })
        discountTotals[index] += amount
      })
    }

    const pointAllocations = this.allocateAmountAcrossItems(pointsRedeemAmount, items)

    return items.map((item, index) => ({
      ...item,
      couponAllocations: couponAllocationsByItem[index],
      discountAllocation: discountTotals[index],
      pointsAllocation: pointAllocations[index]
    }))
  }

  private async restoreStockForOrder(order: any) {
    const claimed = await databaseService.orders.findOneAndUpdate(
      { _id: order._id, stockRestored: { $ne: true } },
      { $set: { stockRestored: true, updatedAt: new Date() } },
      { returnDocument: 'before' }
    )
    if (!claimed) return
    await this.restoreStockForItems(order.items || [])
  }

  private async restoreStockForItems(items: any[]) {
    for (const item of items) {
      const product = await databaseService.products.findOne({ _id: new ObjectId(item.productId) })
      if (product) {
        const variant = product.priceVariants?.find((v: any) => v.unit === item.unit)
        const quantityPerUnit = variant?.quantityPerUnit || 1
        const stockToRestore = item.quantity * quantityPerUnit
        await databaseService.products.updateOne(
          { _id: new ObjectId(item.productId) },
          { $inc: { stockQuantity: stockToRestore } }
        )
      }
    }
  }

  private async releaseOrderBenefits(order: any) {
    if (!order?._id || !order?.userId) return

    await Promise.all([
      couponService.releaseCouponRedemptionsForOrder(order._id as ObjectId),
      loyaltyService.refundRedeemedPointsForOrder(order.userId, order._id as ObjectId, order.orderNumber)
    ])
  }

  // Create order from cart
  async createOrder(userId: ObjectId, payload: any) {
    const {
      shippingAddress,
      paymentMethod,
      notes,
      sessionId,
      req,
      selectedItems,
      isDirectBuy,
      shippingMethod,
      estimatedDeliveryDate
    } = payload
    if (payload.idempotencyKey) {
      const existing = await this.getOrderByIdempotencyKey(userId, payload.idempotencyKey)
      if (existing) {
        const paymentUrl =
          existing.paymentMethod !== PaymentMethod.COD && req
            ? await paymentService.createPaymentUrl(existing as any, req)
            : undefined
        return { order: existing, orderId: existing._id, paymentUrl }
      }
    }
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

        // Validate stock with unit conversion
        const variant = product.priceVariants?.find((v: any) => v.unit === item.unit)
        const quantityPerUnit = variant?.quantityPerUnit || 1
        const requiredStock = item.quantity * quantityPerUnit

        if (product.stockQuantity < requiredStock) {
          throw new ErrorWithStatus({
            message: CARTS_MESSAGES.INSUFFICIENT_STOCK,
            status: HTTP_STATUS.BAD_REQUEST
          })
        }
        if (item.quantity > (product.maxOrderQuantity || 10)) {
          throw new ErrorWithStatus({
            message: `Số lượng đặt mua vượt quá giới hạn cho sản phẩm "${product.name}".`,
            status: HTTP_STATUS.BAD_REQUEST
          })
        }

        // Calc original price based on unit
        let originalPrice = product.price || 0
        if (item.unit && product.priceVariants) {
          const v = product.priceVariants.find((v: any) => v.unit === item.unit)
          if (v) originalPrice = v.price
        }

        const unitPrice = originalPrice

        orderItems.push({
          productId: product._id,
          categoryId: product.categoryId,
          name: product.name,
          sku: product.sku,
          unit: item.unit || product.unit,
          quantity: item.quantity,
          unitPrice,
          originalUnitPrice: originalPrice,
          totalPrice: unitPrice * item.quantity,
          prescriptionRequired: product.requiresPrescription,
          image:
            product.featuredImage ||
            product.image ||
            (product.images && product.images.length > 0 ? product.images[0] : undefined)
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
      let filteredCartItems = cart.items
      if (selectedItems && selectedItems.length > 0) {
        filteredCartItems = cart.items.filter((cartItem: any) => {
          const cartItemId = cartItem.productId.toString()
          const cartItemUnit = cartItem.unit || undefined

          return selectedItems.some((selectedItem: any) => {
            const selectedId = selectedItem.productId
            const selectedUnit = selectedItem.unit || undefined
            if (selectedId !== cartItemId) return false
            return selectedUnit === cartItemUnit
          })
        })

        if (filteredCartItems.length === 0) {
          throw new ErrorWithStatus({
            message: ORDERS_MESSAGES.CART_EMPTY,
            status: HTTP_STATUS.BAD_REQUEST
          })
        }
      }

      for (const cartItem of filteredCartItems) {
        const product = await productsService.getProductById(cartItem.productId.toString())
        if (!product) {
          orderItems.push(cartItem)
          continue
        }

        const selectedVariant = product.priceVariants?.find((v: any) => v.unit === cartItem.unit)
        const originalPrice = selectedVariant?.price || product.price || 0

        const unitPrice = originalPrice
        if (cartItem.quantity > (product.maxOrderQuantity || 10)) {
          throw new ErrorWithStatus({
            message: `Số lượng đặt mua vượt quá giới hạn cho sản phẩm "${product.name}".`,
            status: HTTP_STATUS.BAD_REQUEST
          })
        }

        orderItems.push({
          ...cartItem,
          categoryId: product.categoryId,
          unitPrice,
          originalUnitPrice: originalPrice,
          totalPrice: unitPrice * cartItem.quantity,
          prescriptionRequired: product.requiresPrescription || false
        })
      }
    }

    // Recalculate totals based on orderItems (common for both flows)
    const subtotal = orderItems.reduce((sum, item) => sum + item.totalPrice, 0)

    // Calculate Shipping Fee
    const method = shippingMethod || ShippingMethod.Standard
    let baseShippingFee = await this.quoteSelectedShippingMethod(method, shippingAddress, orderItems, subtotal)
    if (baseShippingFee === null) baseShippingFee = 30000

    if (method === ShippingMethod.Fast) {
      baseShippingFee = 45000
    } else if (method === ShippingMethod.Express) {
      baseShippingFee = 60000
    } else if (method === ShippingMethod.Standard && shippingAddress.districtId && shippingAddress.wardCode) {
      try {
        const feeData = await ghnService.calculateFee({
          to_district_id: shippingAddress.districtId,
          to_ward_code: shippingAddress.wardCode,
          weight: 2000,
          service_type_id: 2
        })
        if (feeData && feeData.total) {
          baseShippingFee = feeData.total
        }
      } catch (error) {
        console.error('GHN Fee Calculation Failed:', error)
      }
    }

    let shippingFee = Math.max(0, baseShippingFee)
    if (subtotal >= 300000) {
      shippingFee = 0
    }

    // Tax logic: Prices already include VAT, so no extra tax added
    const taxAmount = 0

    // ─── Coupon: Re-validate tại thời điểm tạo order (tránh dùng mã đã hết hạn) ───
    let couponDiscountAmount = 0
    let appliedCoupons: any[] = []
    let freeShippingApplied = false
    const hasPrescriptionItems = !!orderItems.find((i) => i.prescriptionRequired)

    if (!isDirectBuy) {
      // Lấy danh sách coupon từ cart
      const cartDoc = await databaseService.carts.findOne(userId ? { userId } : { sessionId })
      const cartCoupons = cartDoc?.appliedCoupons || []

      // Re-validate từng coupon — loại bỏ mã hết hạn / không còn hợp lệ
      for (const cartCoupon of cartCoupons) {
        const validation = await couponService.validateCoupon(
          cartCoupon.code,
          userId,
          subtotal,
          hasPrescriptionItems,
          orderItems
        )
        if (validation.isValid) {
          // Tính lại discountAmount theo subtotal hiện tại (trường hợp items thay đổi)
          appliedCoupons.push({
            code: cartCoupon.code,
            discountAmount: validation.discountAmount,
            eligibleSubtotal: validation.eligibleSubtotal,
            type: cartCoupon.type,
            name: (cartCoupon as any).name || validation.coupon?.name || cartCoupon.code,
            applicableProductIds: validation.coupon?.applicableProductIds || [],
            applicableCategoryIds: validation.applicableCategoryIds || validation.coupon?.applicableCategoryIds || []
          })
        } else {
          throw new ErrorWithStatus({
            message: `Mã giảm giá ${cartCoupon.code} không còn hợp lệ: ${validation.message}`,
            status: HTTP_STATUS.CONFLICT
          })
        }
      }
    } else if (payload.couponCodes && payload.couponCodes.length > 0) {
      // Direct buy: validate coupon codes được gửi lên
      for (const code of payload.couponCodes) {
        const validation = await couponService.validateCoupon(code, userId, subtotal, hasPrescriptionItems, orderItems)
        if (validation.isValid && validation.coupon) {
          appliedCoupons.push({
            code: validation.coupon.code,
            discountAmount: validation.discountAmount,
            eligibleSubtotal: validation.eligibleSubtotal,
            type: validation.coupon.type,
            name: validation.coupon.name,
            applicableProductIds: validation.coupon.applicableProductIds || [],
            applicableCategoryIds: validation.applicableCategoryIds || validation.coupon.applicableCategoryIds || []
          })
        }
      }
    }

    // Tính coupon discount (không tính freeship vào discountAmount)
    couponDiscountAmount = appliedCoupons
      .filter((c: any) => c.type !== 'free_shipping')
      .reduce((sum: number, c: any) => sum + (c.discountAmount || 0), 0)

    // Kiểm tra có freeship coupon không
    freeShippingApplied = appliedCoupons.some((c: any) => c.type === 'free_shipping')

    // Apply freeship coupon
    let shippingDiscountAmount = 0
    if (freeShippingApplied) {
      shippingDiscountAmount = shippingFee
      appliedCoupons = appliedCoupons.map((coupon: any) =>
        coupon.type === 'free_shipping' ? { ...coupon, discountAmount: shippingDiscountAmount } : coupon
      )
      shippingFee = 0
    }

    const discountAmount = couponDiscountAmount

    const orderId = new ObjectId()
    const orderNumber = `ORD-${orderId.toHexString().slice(-18)}`

    // Loyalty points redemption
    let pointsRedeemed = 0
    let pointsRedeemAmount = 0

    if (payload.pointsToRedeem && payload.pointsToRedeem > 0 && userId) {
      // Cap điểm: loyalty + coupon không được vượt subtotal
      const remainingAfterCoupon = Math.max(0, subtotal - discountAmount)
      const maxPointsVnd = Math.min(payload.pointsToRedeem, remainingAfterCoupon)
      if (maxPointsVnd > 0) {
        pointsRedeemAmount = await loyaltyService.redeemPoints(
          userId,
          orderId,
          maxPointsVnd, // điểm = VNĐ (1:1)
          remainingAfterCoupon,
          orderNumber
        )
        pointsRedeemed = maxPointsVnd
      }
    }

    orderItems = this.attachBenefitAllocations(orderItems, appliedCoupons, pointsRedeemAmount)

    const totalAmount = Math.max(0, subtotal + taxAmount + shippingFee - discountAmount - pointsRedeemAmount)

    const prescriptionId = await this.validatePrescriptionForOrder(userId, orderItems, payload.prescriptionId)

    const order = new Order({
      _id: orderId,
      userId,
      orderNumber,
      items: orderItems,
      itemCount: orderItems.length,
      shippingAddress,
      paymentMethod,
      paymentStatus: 'pending',
      orderStatus: 'pending',
      shippingMethod: method,
      subtotal,
      taxAmount,
      shippingFee,
      discountAmount,
      totalAmount,
      appliedCoupons,
      shippingDiscountAmount,
      notes,
      estimatedDeliveryDate,
      pointsRedeemed,
      pointsRedeemAmount,
      stockRestored: false,
      idempotencyKey: payload.idempotencyKey,
      prescriptionId
    })

    const result = await databaseService.orders.insertOne(order)

    // Giữ chỗ lượt dùng coupon trước khi trừ stock.
    // Nếu các bước sau fail, releaseOrderBenefits sẽ hoàn lại lượt dùng và điểm.
    try {
      if (appliedCoupons && appliedCoupons.length > 0) {
        for (const coupon of appliedCoupons) {
          await couponService.recordCouponRedemption(coupon.code, userId, result.insertedId, coupon.discountAmount || 0)
        }
      }
    } catch (error) {
      await databaseService.orders.deleteOne({ _id: result.insertedId })
      await loyaltyService.refundRedeemedPointsForOrder(userId, orderId, orderNumber)
      throw error
    }

    // Deduct stock for each order item (atomic update to prevent race condition / stock going negative)
    const deductedItems: any[] = []
    for (const item of orderItems) {
      const product = await databaseService.products.findOne({ _id: new ObjectId(item.productId) })
      if (product) {
        const variant = product.priceVariants?.find((v: any) => v.unit === item.unit)
        const quantityPerUnit = variant?.quantityPerUnit || 1
        const stockToDeduct = item.quantity * quantityPerUnit

        // Atomic: chỉ trừ khi tồn kho >= stockToDeduct (tránh stock âm do race condition)
        const deductResult = await databaseService.products.updateOne(
          { _id: new ObjectId(item.productId), stockQuantity: { $gte: stockToDeduct } },
          { $inc: { stockQuantity: -stockToDeduct } }
        )

        if (deductResult.modifiedCount === 0) {
          // Stock không đủ (do concurrent order) — roll back đơn hàng và thông báo
          await this.restoreStockForItems(deductedItems)
          await databaseService.orders.deleteOne({ _id: result.insertedId })
          await this.releaseOrderBenefits({ ...order, _id: result.insertedId })
          throw new ErrorWithStatus({
            message: `Sản phẩm "${item.name}" vừa hết hàng. Vui lòng kiểm tra lại giỏ hàng.`,
            status: HTTP_STATUS.CONFLICT
          })
        }
        deductedItems.push(item)

        // Low-stock alert: check tồn kho sau khi trừ, cảnh báo nếu ≤ 30 (fire-and-forget)
        const LOW_STOCK_THRESHOLD = 30
        const updatedProduct = await databaseService.products.findOne(
          { _id: new ObjectId(item.productId) },
          { projection: { _id: 1, name: 1, stockQuantity: 1 } }
        )
        if (updatedProduct && updatedProduct.stockQuantity <= LOW_STOCK_THRESHOLD) {
          let io
          try { io = getIO() } catch { io = undefined }
          Promise.resolve((notificationService as any).notifyLowStock?.(updatedProduct._id!, updatedProduct.name, updatedProduct.stockQuantity, io)).catch(() => {})
        }
      }
    }

    // Clear cart or remove selected items ONLY if NOT direct buy
    // AND payment method is COD. For online payment, we clear items ONLY after successful payment (in return controller)
    if (!isDirectBuy && paymentMethod === PaymentMethod.COD) {
      if (selectedItems && selectedItems.length > 0) {
        // Remove only selected items from cart
        for (const item of selectedItems) {
          await cartService.removeItemFromCart(new ObjectId(item.productId), userId, sessionId, (item as any).unit)
        }
        // Xóa applied coupons sau khi đặt hàng (chỉ coupons đã dùng)
        await databaseService.carts.updateOne(userId ? { userId } : { sessionId }, {
          $set: { appliedCoupons: [], discountAmount: 0, updatedAt: new Date() }
        })
      } else {
        // Clear entire cart
        await cartService.clearCart(userId)
      }
    }

    // Send order confirmation email only for COD orders immediately
    // For online payment, email will be sent after payment success (in return controller)
    if (paymentMethod === PaymentMethod.COD) {
      try {
        await emailService.sendOrderConfirmationEmail(shippingAddress.email, { ...order, _id: result.insertedId })
      } catch (error) {
        // ignore
      }
    }

    // Generate Payment URL if applicable
    let paymentUrl = undefined
    let paymentUrlError = false
    if (paymentMethod !== PaymentMethod.COD && req) {
      try {
        paymentUrl = await paymentService.createPaymentUrl({ ...order, _id: result.insertedId } as any, req)
      } catch (error) {
        paymentUrlError = true
      }
    }

    // Notify all admins about new order (fire-and-forget)
    let orderNotificationIO
    try { orderNotificationIO = getIO() } catch { orderNotificationIO = undefined }
    Promise.resolve((notificationService as any).notifyNewOrderToAdmin?.(orderNumber, totalAmount, orderNotificationIO)).catch(() => {})

    // Notify customer that their order was placed successfully (fire-and-forget)
    const formattedAmount = totalAmount.toLocaleString('vi-VN') + 'đ'
    Promise.resolve((notificationService as any).createAndPush?.(
        {
          userId,
          type: 'order',
          title: 'Đặt hàng thành công',
          message: `Đơn hàng ${orderNumber} (${formattedAmount}) đã được tiếp nhận. Chúng tôi sẽ xử lý sớm nhất có thể.`,
          actionUrl: '/account/orders',
          metadata: { orderNumber, totalAmount },
          targetRole: 'customer',
          eventKey: `order:${result.insertedId.toString()}:placed`
        },
        orderNotificationIO
      )).catch(() => {})

    // Notify all pharmacists about new order to prepare (fire-and-forget)
    Promise.resolve((notificationService as any).broadcastToRole?.(
        'pharmacist',
        {
          type: 'order',
          title: 'Đơn hàng mới cần chuẩn bị',
          message: `Đơn hàng ${orderNumber} (${formattedAmount}) vừa được đặt và cần chuẩn bị thuốc.`,
          actionUrl: '/pharmacist/orders',
          metadata: { orderNumber, totalAmount },
          eventKey: `order:${result.insertedId.toString()}:pharmacist:new`
        },
        orderNotificationIO
      )).catch(() => {})

    return {
      order: { ...order, _id: result.insertedId },
      orderId: result.insertedId,
      paymentUrl,
      paymentUrlError
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

    if (this.terminalOrderStatuses.has(order.orderStatus)) {
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

  async getOrderByIdempotencyKey(userId: ObjectId, idempotencyKey: string) {
    return databaseService.orders.findOne({ userId, idempotencyKey })
  }

  // Update order status (admin only)
  async updateOrderStatus(orderId: ObjectId, newStatus: string, trackingNumber?: string, notes?: string) {
    const order = await databaseService.orders.findOne({ _id: orderId })

    if (!order) {
      throw new ErrorWithStatus({
        message: ORDERS_MESSAGES.ORDER_NOT_FOUND,
        status: HTTP_STATUS.NOT_FOUND
      })
    }

    this.assertOrderStatusTransition(order, newStatus)

    if (order.orderStatus === newStatus) {
      return order
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

    if (notes) {
      updateData.notes = notes
    }

    if (newStatus === 'delivered') {
      updateData.deliveredAt = new Date()

      // Auto-update payment status for COD orders
      if (order.paymentMethod === PaymentMethod.COD && order.paymentStatus === 'pending') {
        updateData.paymentStatus = 'paid'
        updateData.paidAt = new Date()
      }

      // Loyalty: tích điểm khi giao thành công
      try {
        await loyaltyService.earnPointsFromOrder(order.userId, orderId, order.totalAmount, order.orderNumber)
      } catch (err) {
        console.error('Loyalty earn points error:', err)
      }
    }

    // Restore stock when order is cancelled
    if (newStatus === 'cancelled' && this.shouldRestoreBenefitsOnCancel(order)) {
      await this.restoreStockForOrder(order)
      await this.releaseOrderBenefits(order)
    }

    await databaseService.orders.updateOne({ _id: orderId }, { $set: updateData })
    if (newStatus === 'delivered' && order.userId) {
      void recommendationsService.recordRealtimeEvent(order.userId.toString())
    }

    const updatedOrder = await databaseService.orders.findOne({ _id: orderId })

    // Notify customer about order status change (fire-and-forget)
    if (updatedOrder && order.userId) {
      let io
      try { io = getIO() } catch { io = undefined }
      Promise.resolve((notificationService as any).notifyOrderStatusChange?.(order.userId, orderId, order.orderNumber, newStatus, io)).catch(() => {})
      if (newStatus === 'shipped') {
        Promise.resolve((notificationService as any).notifyShippingStatusChange?.(order.userId, orderId, order.orderNumber, 'shipped', trackingNumber, io)).catch(() => {})
      }
    }

    return updatedOrder
  }

  async cancelOwnOrder(orderId: ObjectId, userId: ObjectId) {
    const order = await databaseService.orders.findOne({ _id: orderId, userId })
    if (!order) {
      throw new ErrorWithStatus({ message: ORDERS_MESSAGES.ORDER_NOT_FOUND, status: HTTP_STATUS.NOT_FOUND })
    }
    if (order.orderStatus !== 'pending') {
      throw new ErrorWithStatus({
        message: 'Chỉ có thể hủy đơn hàng đang chờ xử lý.',
        status: HTTP_STATUS.BAD_REQUEST
      })
    }
    return this.updateOrderStatus(orderId, 'cancelled')
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

    if (order.paymentStatus === newStatus) {
      return order
    }

    if (newStatus === 'paid' && this.terminalOrderStatuses.has(order.orderStatus)) {
      throw new ErrorWithStatus({
        message: 'Không thể ghi nhận thanh toán cho đơn hàng đã kết thúc.',
        status: HTTP_STATUS.BAD_REQUEST
      })
    }

    if (
      newStatus === 'failed' &&
      (order.paymentStatus === 'paid' || order.orderStatus === 'delivered' || order.orderStatus === 'returned')
    ) {
      throw new ErrorWithStatus({
        message: 'Không thể đánh dấu thất bại cho đơn hàng đã thanh toán/giao/hoàn tất.',
        status: HTTP_STATUS.BAD_REQUEST
      })
    }

    const updateData: any = {
      paymentStatus: newStatus,
      updatedAt: new Date()
    }

    if (newStatus === 'paid') {
      updateData.paidAt = new Date()
      // Also confirm the order when payment is successful
      // Only update if order is still in pending/pending_payment status
      if (order.orderStatus === 'pending' || order.orderStatus === 'pending_payment') {
        updateData.orderStatus = 'confirmed'
      }
    }

    if (newStatus === 'failed' && order.paymentStatus !== 'failed') {
      updateData.orderStatus = 'cancelled'
      updateData.cancelledAt = new Date()
      updateData.cancelReason = 'Thanh toán không thành công'

      if (this.shouldRestoreBenefitsOnCancel(order)) {
        await this.restoreStockForOrder(order)
      }
      await this.releaseOrderBenefits(order)
    }

    await databaseService.orders.updateOne({ _id: orderId }, { $set: updateData })

    let io
    try { io = getIO() } catch { io = undefined }
    if (order.userId && (newStatus === 'paid' || newStatus === 'failed')) {
      Promise.resolve((notificationService as any).notifyPaymentStatusChange?.(order.userId, orderId, order.orderNumber, newStatus, io)).catch(() => {})
    }

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
