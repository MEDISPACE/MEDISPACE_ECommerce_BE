// Cart Request Types
export interface AddToCartReqBody {
  productId: string
  quantity: number
}

export interface UpdateCartItemReqBody {
  quantity: number
}

export interface CartParams {
  productId: string
}

export interface TokenPayload {
  userId: string
  tokenType: string
  verify: number
}
