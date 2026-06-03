import { ObjectId } from 'mongodb'

export interface OrderItem {
  productId: ObjectId
  name: string
  sku: string
  unit: string // Đơn vị đã chọn: "Viên", "Vỉ", "Hộp"...
  quantity: number
  unitPrice: number      // Giá sau campaign hoặc giá gốc
  originalUnitPrice?: number // Giá gốc
  totalPrice: number     // quantity * unitPrice
  campaignId?: ObjectId  // Campaign ID
  prescriptionRequired: boolean
  image?: string
}

export interface ShippingAddress {
  firstName: string
  lastName: string
  phone: string
  email: string
  address: string
  ward: string
  district: string
  province: string
  postalCode?: string
}

export interface OrderAppliedCoupon {
  code: string
  name?: string
  type: string
  discountAmount: number
}

export interface OrderType {
  _id?: ObjectId
  userId: ObjectId
  orderNumber: string

  items: OrderItem[]
  itemCount: number

  shippingAddress: ShippingAddress
  paymentMethod: string // 'cod', 'bank_transfer', 'credit_card', 'e_wallet'
  paymentStatus: string // 'pending', 'paid', 'failed', 'refunded'
  orderStatus: string // 'pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'

  subtotal: number
  taxAmount: number
  shippingFee: number
  discountAmount: number
  totalAmount: number
  appliedCoupons?: OrderAppliedCoupon[]

  notes?: string
  trackingNumber?: string
  estimatedDeliveryDate?: string

  // Loyalty points
  pointsRedeemed?: number      // Số điểm đã đổi
  pointsRedeemAmount?: number  // Số tiền giảm từ điểm

  createdAt?: Date
  updatedAt?: Date
  paidAt?: Date
  shippedAt?: Date
  deliveredAt?: Date
}

export default class Order {
  _id?: ObjectId
  userId: ObjectId
  orderNumber: string

  items: OrderItem[]
  itemCount: number

  shippingAddress: ShippingAddress
  paymentMethod: string
  paymentStatus: string
  orderStatus: string

  subtotal: number
  taxAmount: number
  shippingFee: number
  discountAmount: number
  totalAmount: number
  appliedCoupons: OrderAppliedCoupon[]

  notes?: string
  trackingNumber?: string
  estimatedDeliveryDate?: string

  // Loyalty points
  pointsRedeemed?: number
  pointsRedeemAmount?: number

  createdAt?: Date
  updatedAt?: Date
  paidAt?: Date
  shippedAt?: Date
  deliveredAt?: Date

  constructor(order: OrderType) {
    const date = new Date()

    this._id = order._id
    this.userId = order.userId
    this.orderNumber = order.orderNumber

    this.items = order.items
    this.itemCount = order.itemCount || order.items.reduce((sum, item) => sum + item.quantity, 0)

    this.shippingAddress = order.shippingAddress
    this.paymentMethod = order.paymentMethod
    this.paymentStatus = order.paymentStatus || 'pending'
    this.orderStatus = order.orderStatus || 'pending'

    this.subtotal = order.subtotal
    this.taxAmount = order.taxAmount || 0
    this.shippingFee = order.shippingFee || 0
    this.discountAmount = order.discountAmount || 0
    this.totalAmount = order.totalAmount
    this.appliedCoupons = order.appliedCoupons || []

    this.notes = order.notes
    this.trackingNumber = order.trackingNumber
    this.estimatedDeliveryDate = order.estimatedDeliveryDate
    this.pointsRedeemed = order.pointsRedeemed || 0
    this.pointsRedeemAmount = order.pointsRedeemAmount || 0

    this.createdAt = order.createdAt || date
    this.updatedAt = order.updatedAt || date
    this.paidAt = order.paidAt
    this.shippedAt = order.shippedAt
    this.deliveredAt = order.deliveredAt
  }

  // Generate unique order number
  static generateOrderNumber(): string {
    const timestamp = Date.now()
    const random = Math.floor(Math.random() * 1000)
      .toString()
      .padStart(3, '0')
    return `ORD-${timestamp}-${random}`
  }

  // Calculate totals
  calculateTotals() {
    this.subtotal = this.items.reduce((sum, item) => sum + item.totalPrice, 0)
    this.totalAmount = this.subtotal + this.taxAmount + this.shippingFee - this.discountAmount
  }

  // Update order status
  updateStatus(newStatus: string, trackingNumber?: string) {
    this.orderStatus = newStatus
    this.updatedAt = new Date()

    if (newStatus === 'shipped' && trackingNumber) {
      this.trackingNumber = trackingNumber
      this.shippedAt = new Date()
    }

    if (newStatus === 'delivered') {
      this.deliveredAt = new Date()
    }
  }

  // Update payment status
  updatePaymentStatus(newStatus: string) {
    this.paymentStatus = newStatus
    this.updatedAt = new Date()

    if (newStatus === 'paid') {
      this.paidAt = new Date()
    }
  }
}
