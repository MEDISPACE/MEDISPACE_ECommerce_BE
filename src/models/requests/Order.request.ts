// Order Request Types
export interface CreateOrderReqBody {
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
  }
  paymentMethod: string // 'cod', 'bank_transfer', 'credit_card', 'e_wallet'
  notes?: string
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
