// Order Request Types
export interface CreateOrderReqBody {
  items?: {
    productId: string
    quantity: number
    unit?: string
  }[]
  isDirectBuy?: boolean
  shippingAddress: {
    firstName: string
    lastName: string
    phone: string
    email: string
    address: string
    ward: string
    district: string
    province: string
    postalCode?: string
    provinceId?: number
    districtId?: number
    wardCode?: string
  }
  paymentMethod: string // 'cod', 'bank_transfer', 'credit_card', 'e_wallet'
  shippingMethod?: string // 'standard', 'fast', 'express'
  notes?: string
  couponCodes?: string[] // For applying coupons to direct buy orders
  pointsToRedeem?: number // Số điểm loyalty muốn đổi
}

export interface UpdateOrderStatusReqBody {
  status: string
  trackingNumber?: string
}

export interface UpdatePaymentStatusReqBody {
  paymentStatus: string
}

export interface OrderParams {
  orderId: string
}

export interface GetOrdersQuery {
  page?: string
  limit?: string
  status?: string
}
