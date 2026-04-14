import { ObjectId } from 'mongodb'

export interface CartItem {
  productId: ObjectId
  name: string
  sku: string
  unit: string // Đơn vị đã chọn: "Viên", "Vỉ", "Hộp"...
  quantity: number
  unitPrice: number      // Giá sau campaign (salePrice) hoặc giá gốc
  originalUnitPrice: number  // Giá gốc (trước campaign)
  totalPrice: number     // quantity * unitPrice
  campaignId?: ObjectId  // Campaign đã áp dụng (nếu có)
  prescriptionRequired: boolean
  image?: string
  priceVariants?: Array<{
    unit: string
    price: number
    originalPrice?: number
    isDefault?: boolean
  }>
}

export interface AppliedCoupon {
  code: string
  discountAmount: number
  type: string
}

export interface CartType {
  _id?: ObjectId
  userId?: ObjectId
  sessionId?: string

  items: CartItem[]
  itemCount: number
  uniqueProductCount: number

  subtotal: number
  discountAmount: number
  taxAmount: number
  shippingFee: number
  loyaltyDiscount: number
  totalAmount: number

  appliedCoupons?: AppliedCoupon[]
  loyaltyPointsUsed?: number

  requiresPrescription: boolean

  status: string
  abandonmentReason?: string

  createdAt?: Date
  updatedAt?: Date
  lastActivityAt?: Date
  expiresAt?: Date
}

export default class Cart {
  _id?: ObjectId
  userId?: ObjectId
  sessionId?: string

  items: CartItem[]
  itemCount: number
  uniqueProductCount: number

  subtotal: number
  discountAmount: number
  taxAmount: number
  shippingFee: number
  loyaltyDiscount: number
  totalAmount: number

  appliedCoupons?: AppliedCoupon[]
  loyaltyPointsUsed?: number

  requiresPrescription: boolean

  status: string
  abandonmentReason?: string

  createdAt?: Date
  updatedAt?: Date
  lastActivityAt?: Date
  expiresAt?: Date

  constructor(cart: CartType) {
    const date = new Date()
    this._id = cart._id
    this.userId = cart.userId
    this.sessionId = cart.sessionId

    this.items = cart.items || []
    this.itemCount = cart.itemCount || 0
    this.uniqueProductCount = cart.uniqueProductCount || 0

    this.subtotal = cart.subtotal || 0
    this.discountAmount = cart.discountAmount || 0
    this.taxAmount = cart.taxAmount || 0
    this.shippingFee = cart.shippingFee || 0
    this.loyaltyDiscount = cart.loyaltyDiscount || 0
    this.totalAmount = cart.totalAmount || 0

    this.appliedCoupons = cart.appliedCoupons || []
    this.loyaltyPointsUsed = cart.loyaltyPointsUsed || 0

    this.requiresPrescription = cart.requiresPrescription || false

    this.status = cart.status || 'active'
    this.abandonmentReason = cart.abandonmentReason

    this.createdAt = cart.createdAt || date
    this.updatedAt = cart.updatedAt || date
    this.lastActivityAt = cart.lastActivityAt || date
    this.expiresAt = cart.expiresAt || new Date(date.getTime() + 7 * 24 * 60 * 60 * 1000) // 7 days
  }

  // Calculate totals
  calculateTotals() {
    this.itemCount = this.items.reduce((sum, item) => sum + item.quantity, 0)
    this.uniqueProductCount = this.items.length
    this.subtotal = this.items.reduce((sum, item) => sum + item.totalPrice, 0)
    this.totalAmount = this.subtotal - this.discountAmount - this.loyaltyDiscount + this.taxAmount + this.shippingFee
    this.requiresPrescription = this.items.some((item) => item.prescriptionRequired)
  }

  // Add item to cart
  addItem(
    productId: ObjectId,
    name: string,
    sku: string,
    unit: string,
    quantity: number,
    unitPrice: number,
    originalUnitPrice: number,
    prescriptionRequired: boolean,
    image?: string,
    priceVariants?: Array<{ unit: string; price: number; originalPrice?: number; isDefault?: boolean }>,
    campaignId?: ObjectId
  ) {
    // Check if same product with same unit already exists
    const existingItem = this.items.find(
      (item) => item.productId.toString() === productId.toString() && item.unit === unit
    )

    if (existingItem) {
      existingItem.quantity += quantity
      existingItem.unitPrice = unitPrice
      existingItem.originalUnitPrice = originalUnitPrice
      existingItem.totalPrice = existingItem.quantity * existingItem.unitPrice
      existingItem.campaignId = campaignId
      // Update priceVariants if provided
      if (priceVariants) {
        existingItem.priceVariants = priceVariants
      }
    } else {
      this.items.push({
        productId,
        name,
        sku,
        unit,
        quantity,
        unitPrice,
        originalUnitPrice,
        totalPrice: quantity * unitPrice,
        prescriptionRequired,
        image,
        priceVariants,
        campaignId
      })
    }

    this.calculateTotals()
  }

  // Update item quantity
  updateItemQuantity(productId: ObjectId, quantity: number, unit?: string) {
    const item = this.items.find((item) => {
      if (unit) {
        return item.productId.toString() === productId.toString() && item.unit === unit
      }
      return item.productId.toString() === productId.toString()
    })

    if (item) {
      item.quantity = quantity
      item.totalPrice = quantity * item.unitPrice
      this.calculateTotals()
    }
  }

  // Update item unit and price
  // When updating unit, we might merge with existing item if target unit already exists
  updateItemUnit(productId: ObjectId, unit: string, unitPrice: number, originalUnitPrice: number, currentUnit?: string, campaignId?: ObjectId) {
    // If currentUnit provided, find exact item to update
    const itemIndex = this.items.findIndex((item) => {
      if (currentUnit) {
        return item.productId.toString() === productId.toString() && item.unit === currentUnit
      }
      return item.productId.toString() === productId.toString()
    })

    if (itemIndex !== -1) {
      const item = this.items[itemIndex]

      // Check if another item with target unit already exists
      const existingTargetItemIndex = this.items.findIndex(
        (i, idx) => idx !== itemIndex && i.productId.toString() === productId.toString() && i.unit === unit
      )

      if (existingTargetItemIndex !== -1) {
        // Merge with existing item
        const targetItem = this.items[existingTargetItemIndex]
        targetItem.quantity += item.quantity
        // Keep the target item's prices
        targetItem.totalPrice = targetItem.quantity * targetItem.unitPrice
        // Remove the old item
        this.items.splice(itemIndex, 1)
      } else {
        // Just update the unit and price
        item.unit = unit
        item.unitPrice = unitPrice
        item.originalUnitPrice = originalUnitPrice
        item.totalPrice = item.quantity * unitPrice
        item.campaignId = campaignId
      }

      this.calculateTotals()
    }
  }

  // Remove item from cart
  removeItem(productId: ObjectId, unit?: string) {
    this.items = this.items.filter((item) => {
      if (unit) {
        // Remove only if both productId and unit match
        return !(item.productId.toString() === productId.toString() && item.unit === unit)
      } else {
        // Fallback: remove all items with productId
        return item.productId.toString() !== productId.toString()
      }
    })
    this.calculateTotals()
  }

  // Clear cart
  clear() {
    this.items = []
    this.itemCount = 0
    this.uniqueProductCount = 0
    this.subtotal = 0
    this.totalAmount = 0
    this.requiresPrescription = false
  }
}
