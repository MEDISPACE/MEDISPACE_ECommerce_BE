import { ObjectId } from 'mongodb'
import Cart, { CartItem } from '~/models/schemas/Cart.schema'
import databaseService from './database.services'
import productsService from './products.services'
import { ErrorWithStatus } from '~/models/Error'
import HTTP_STATUS from '~/constants/httpStatus'
import { generateSessionId } from '~/utils/crypto'
import { CARTS_MESSAGES } from '~/constants/message'

class CartService {
  // Helper method to build cart query
  private buildCartQuery(userId?: ObjectId, sessionId?: string) {
    if (userId) {
      return { userId }
    } else if (sessionId) {
      return { sessionId }
    }
    return null // For new guest users
  }

  // Get cart for user or guest
  async getCart(userId?: ObjectId, sessionId?: string) {
    let cart = null

    // 1. Try to find cart by userId first
    if (userId) {
      const userCart = await databaseService.carts.findOne({ userId })

      // If user cart exists and has items, return it
      if (userCart && userCart.items.length > 0) {
        return { cart: userCart, sessionId: userCart.sessionId }
      }

      // If user cart is empty or doesn't exist, check for session cart to merge
      if (sessionId) {
        const sessionCart = await databaseService.carts.findOne({ sessionId })

        // If session cart exists and has items
        if (sessionCart && sessionCart.items.length > 0) {
          // If userCart existed (but was empty), delete it to avoid duplicates
          if (userCart) {
            await databaseService.carts.deleteOne({ _id: userCart._id })
          }

          // Assign session cart to user
          await databaseService.carts.updateOne({ _id: sessionCart._id }, { $set: { userId, updatedAt: new Date() } })

          return { cart: { ...sessionCart, userId }, sessionId: sessionCart.sessionId }
        }
      }

      // If we found a user cart (even if empty) and no better session cart, use it
      if (userCart) {
        cart = userCart
      }
    }

    // 2. If no cart found yet, try by sessionId
    if (!cart && sessionId) {
      cart = await databaseService.carts.findOne({ sessionId })
    }

    if (!cart) {
      // Create new cart
      const newCart = new Cart({
        ...(userId && { userId }),
        ...(sessionId && { sessionId }),
        items: [],
        itemCount: 0,
        uniqueProductCount: 0,
        subtotal: 0,
        discountAmount: 0,
        taxAmount: 0,
        shippingFee: 0,
        loyaltyDiscount: 0,
        totalAmount: 0,
        requiresPrescription: false,
        status: 'active'
      })

      if (!userId && !sessionId) {
        // Generate sessionId for new guest user
        newCart.sessionId = generateSessionId()
      }

      // Convert to plain object and explicitly remove undefined/null fields
      const cartToInsert: any = {}
      Object.keys(newCart).forEach((key) => {
        const value = (newCart as any)[key]
        if (value !== undefined && value !== null) {
          cartToInsert[key] = value
        }
      })

      await databaseService.carts.insertOne(cartToInsert)
      return { cart: newCart, sessionId: newCart.sessionId }
    }

    const refreshed = await this.refreshCartPrices(cart)
    return { cart: refreshed, sessionId: cart.sessionId }
  }

  private async refreshCartPrices(cart: any) {
    if (!cart.items || cart.items.length === 0) return cart

    let hasChanges = false

    for (const item of cart.items) {
      try {
        const product = await productsService.getProductById(item.productId.toString())
        if (!product) continue

        const selectedVariant = product.priceVariants?.find((v: any) => v.unit === item.unit)
        const originalPrice = selectedVariant?.price || product.price || 0

        const newUnitPrice = originalPrice

        const prescriptionRequired = product.requiresPrescription || false
        if (
          item.unitPrice !== newUnitPrice ||
          item.originalUnitPrice !== originalPrice ||
          item.prescriptionRequired !== prescriptionRequired
        ) {
          item.unitPrice = newUnitPrice
          item.originalUnitPrice = originalPrice
          item.totalPrice = newUnitPrice * item.quantity
          delete item.campaignId
          item.prescriptionRequired = prescriptionRequired
          hasChanges = true
        }
      } catch {
        // Nếu lỗi fetch product, giữ nguyên giá cũ
      }
    }

    if (!hasChanges) return cart

    // Tính lại subtotal và totalAmount
    const newSubtotal = cart.items.reduce((sum: number, item: any) => sum + item.totalPrice, 0)
    const couponDiscount = (cart.appliedCoupons || [])
      .filter((c: any) => c.type !== 'free_shipping')
      .reduce((sum: number, c: any) => sum + (c.discountAmount || 0), 0)
    const newTotal = Math.max(0, newSubtotal - couponDiscount - (cart.loyaltyDiscount || 0) + (cart.taxAmount || 0) + (cart.shippingFee || 0))

    await databaseService.carts.updateOne(
      { _id: cart._id },
      {
        $set: {
          items: cart.items,
          subtotal: newSubtotal,
          totalAmount: newTotal,
          updatedAt: new Date()
        }
      }
    )

    return { ...cart, items: cart.items, subtotal: newSubtotal, totalAmount: newTotal }
  }

  // Legacy method for backward compatibility
  async getUserCart(userId: ObjectId) {
    const result = await this.getCart(userId)
    return result.cart
  }

  // Add item to cart
  async addItemToCart(
    productId: ObjectId,
    quantity: number,
    userId?: ObjectId,
    sessionId?: string,
    requestedUnit?: string,
    requestedPrice?: number
  ) {
    // Verify product exists and get details
    const product = await productsService.getProductById(productId.toString())
    if (!product) {
      throw new ErrorWithStatus({
        message: CARTS_MESSAGES.PRODUCT_NOT_FOUND,
        status: HTTP_STATUS.NOT_FOUND
      })
    }

    // Check stock availability with unit conversion
    const variant = product.priceVariants?.find((v: any) => v.unit === requestedUnit)
    const quantityPerUnit = variant?.quantityPerUnit || 1
    const requiredStock = quantity * quantityPerUnit

    if (product.stockQuantity < requiredStock) {
      throw new ErrorWithStatus({
        message: CARTS_MESSAGES.INSUFFICIENT_STOCK,
        status: HTTP_STATUS.BAD_REQUEST
      })
    }

    // Get or create cart
    const { cart } = await this.getCart(userId, sessionId)

    // Determine unit
    const unit: string = requestedUnit || product.priceVariants?.find((v: any) => v.isDefault)?.unit || product.priceVariants?.[0]?.unit || 'Sản phẩm'

    // Convert cart to Cart instance for methods
    const cartInstance = new Cart(cart)
    const existingItem = cartInstance.items.find(
      (item) => item.productId.toString() === productId.toString() && item.unit === unit
    )
    const newQuantity = (existingItem?.quantity || 0) + quantity
    if (newQuantity > (product.maxOrderQuantity || 10)) {
      throw new ErrorWithStatus({
        message: CARTS_MESSAGES.QUANTITY_MUST_BE_BETWEEN_1_AND_10,
        status: HTTP_STATUS.BAD_REQUEST
      })
    }
    if (product.stockQuantity < newQuantity * quantityPerUnit) {
      throw new ErrorWithStatus({
        message: CARTS_MESSAGES.INSUFFICIENT_STOCK,
        status: HTTP_STATUS.BAD_REQUEST
      })
    }

    // Determine original price based on unit
    const selectedVariant = product.priceVariants?.find((v: any) => v.unit === unit)
    const originalUnitPrice = selectedVariant?.price || product.priceVariants?.[0]?.price || product.price || 0

    const unitPrice = originalUnitPrice

    // Add item — ignoring requestedPrice from FE (price is authoritative from backend)
    cartInstance.addItem(
      productId,
      product.name,
      product.sku,
      unit,
      quantity,
      unitPrice,
      originalUnitPrice,
      product.requiresPrescription || false,
      product.featuredImage,
      product.priceVariants
    )

    // Update cart in database using _id
    await databaseService.carts.updateOne(
      { _id: cart._id },
      {
        $set: {
          items: cartInstance.items,
          itemCount: cartInstance.itemCount,
          uniqueProductCount: cartInstance.uniqueProductCount,
          subtotal: cartInstance.subtotal,
          totalAmount: cartInstance.totalAmount,
          requiresPrescription: cartInstance.requiresPrescription,
          updatedAt: new Date(),
          lastActivityAt: new Date()
        }
      }
    )

    return cartInstance
  }

  // Update item quantity
  async updateItemQuantity(
    productId: ObjectId,
    quantity: number,
    userId?: ObjectId,
    sessionId?: string,
    unit?: string
  ) {
    // Check stock availability
    const product = await productsService.getProductById(productId.toString())
    if (!product) {
      throw new ErrorWithStatus({
        message: CARTS_MESSAGES.PRODUCT_NOT_FOUND,
        status: HTTP_STATUS.NOT_FOUND
      })
    }
    if (quantity < 1 || quantity > (product.maxOrderQuantity || 10)) {
      throw new ErrorWithStatus({
        message: CARTS_MESSAGES.QUANTITY_MUST_BE_BETWEEN_1_AND_10,
        status: HTTP_STATUS.BAD_REQUEST
      })
    }

    // Check stock availability with unit conversion
    const variant = product.priceVariants?.find((v: any) => v.unit === unit)
    const quantityPerUnit = variant?.quantityPerUnit || 1
    const requiredStock = quantity * quantityPerUnit

    if (product.stockQuantity < requiredStock) {
      throw new ErrorWithStatus({
        message: CARTS_MESSAGES.INSUFFICIENT_STOCK,
        status: HTTP_STATUS.BAD_REQUEST
      })
    }

    // Get cart
    const { cart } = await this.getCart(userId, sessionId)

    // Check if item exists in cart
    const itemExists = cart.items.some((item: CartItem) => {
      if (unit) {
        return item.productId.toString() === productId.toString() && item.unit === unit
      }
      return item.productId.toString() === productId.toString()
    })

    if (!itemExists) {
      throw new ErrorWithStatus({
        message: CARTS_MESSAGES.ITEM_NOT_FOUND_IN_CART,
        status: HTTP_STATUS.NOT_FOUND
      })
    }

    // Convert to Cart instance and update
    const cartInstance = new Cart(cart)
    cartInstance.updateItemQuantity(productId, quantity, unit)

    // Update in database
    await databaseService.carts.updateOne(
      { _id: cart._id },
      {
        $set: {
          items: cartInstance.items,
          itemCount: cartInstance.itemCount,
          uniqueProductCount: cartInstance.uniqueProductCount,
          subtotal: cartInstance.subtotal,
          totalAmount: cartInstance.totalAmount,
          requiresPrescription: cartInstance.requiresPrescription,
          updatedAt: new Date(),
          lastActivityAt: new Date()
        }
      }
    )

    return cartInstance
  }

  // Update item unit (change unit and price)
  async updateItemUnit(productId: ObjectId, unit: string, userId?: ObjectId, sessionId?: string, currentUnit?: string) {
    // Get product to find the price for the selected unit
    const product = await productsService.getProductById(productId.toString())
    if (!product) {
      throw new ErrorWithStatus({
        message: CARTS_MESSAGES.PRODUCT_NOT_FOUND,
        status: HTTP_STATUS.NOT_FOUND
      })
    }

    // Find the price variant for the selected unit
    const variant = product.priceVariants?.find((v: any) => v.unit === unit)
    if (!variant) {
      throw new ErrorWithStatus({
        message: 'Đơn vị không hợp lệ',
        status: HTTP_STATUS.BAD_REQUEST
      })
    }

    // Get cart
    const { cart } = await this.getCart(userId, sessionId)

    // Check if item exists in cart
    const itemExists = cart.items.some((item: CartItem) => {
      if (currentUnit) {
        return item.productId.toString() === productId.toString() && item.unit === currentUnit
      }
      return item.productId.toString() === productId.toString()
    })

    if (!itemExists) {
      throw new ErrorWithStatus({
        message: CARTS_MESSAGES.ITEM_NOT_FOUND_IN_CART,
        status: HTTP_STATUS.NOT_FOUND
      })
    }

    // Calculate original price
    const originalUnitPrice = variant.price || product.price || 0

    const unitPrice = originalUnitPrice

    // Convert to Cart instance and update
    const cartInstance = new Cart(cart)
    cartInstance.updateItemUnit(productId, unit, unitPrice, originalUnitPrice, currentUnit)

    // Update in database
    await databaseService.carts.updateOne(
      { _id: cart._id },
      {
        $set: {
          items: cartInstance.items,
          itemCount: cartInstance.itemCount,
          uniqueProductCount: cartInstance.uniqueProductCount,
          subtotal: cartInstance.subtotal,
          totalAmount: cartInstance.totalAmount,
          requiresPrescription: cartInstance.requiresPrescription,
          updatedAt: new Date(),
          lastActivityAt: new Date()
        }
      }
    )

    return cartInstance
  }

  // Remove item from cart
  // Remove item from cart
  async removeItemFromCart(productId: ObjectId, userId?: ObjectId, sessionId?: string, unit?: string) {
    const { cart } = await this.getCart(userId, sessionId)

    // Convert to Cart instance and remove
    const cartInstance = new Cart(cart)
    cartInstance.removeItem(productId, unit)

    // Update in database
    await databaseService.carts.updateOne(
      { _id: cart._id },
      {
        $set: {
          items: cartInstance.items,
          itemCount: cartInstance.itemCount,
          uniqueProductCount: cartInstance.uniqueProductCount,
          subtotal: cartInstance.subtotal,
          totalAmount: cartInstance.totalAmount,
          requiresPrescription: cartInstance.requiresPrescription,
          updatedAt: new Date(),
          lastActivityAt: new Date()
        }
      }
    )

    return cartInstance
  }

  // Clear cart
  async clearCart(userId?: ObjectId, sessionId?: string) {
    const { cart } = await this.getCart(userId, sessionId)

    // Clear cart
    const cartInstance = new Cart(cart)
    cartInstance.clear()

    // Update in database
    await databaseService.carts.updateOne(
      { _id: cart._id },
      {
        $set: {
          items: cartInstance.items,
          itemCount: cartInstance.itemCount,
          uniqueProductCount: cartInstance.uniqueProductCount,
          subtotal: cartInstance.subtotal,
          totalAmount: cartInstance.totalAmount,
          requiresPrescription: cartInstance.requiresPrescription,
          appliedCoupons: [],   // Xóa coupons khi clear cart
          discountAmount: 0,
          loyaltyDiscount: 0,
          updatedAt: new Date(),
          lastActivityAt: new Date()
        }
      }
    )

    return cartInstance
  }

  // Verify stock availability for cart items
  async verifyStockAvailability(cartItems: CartItem[]) {
    for (const item of cartItems) {
      const product = await productsService.getProductById(item.productId.toString())
      if (!product) {
        throw new ErrorWithStatus({
          message: `Product ${item.name} not found`,
          status: HTTP_STATUS.BAD_REQUEST
        })
      }

      // Check stock with unit conversion
      const variant = product.priceVariants?.find((v: any) => v.unit === item.unit)
      const quantityPerUnit = variant?.quantityPerUnit || 1
      const requiredStock = item.quantity * quantityPerUnit

      if (product.stockQuantity < requiredStock) {
        throw new ErrorWithStatus({
          message: CARTS_MESSAGES.INSUFFICIENT_STOCK,
          status: HTTP_STATUS.BAD_REQUEST
        })
      }
    }
    return true
  }

  // Get checkout data
  async getCheckoutData(userId?: ObjectId, sessionId?: string) {
    const { cart } = await this.getCart(userId, sessionId)

    // Populate product details
    const populatedItems = await Promise.all(
      cart.items.map(async (item: CartItem) => {
        const product = await productsService.getProductById(item.productId.toString())
        return {
          ...item,
          product: product
            ? {
                _id: product._id,
                name: product.name,
                sku: product.sku,
                featuredImage: product.featuredImage,
                requiresPrescription: product.requiresPrescription
              }
            : null
        }
      })
    )

    return {
      ...cart,
      items: populatedItems
    }
  }
}

const cartService = new CartService()
export default cartService
