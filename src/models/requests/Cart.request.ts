// Cart Request Types
export interface AddToCartReqBody {
  productId: string
  quantity: number
  unit?: string    // Selected unit from priceVariants
  price?: number   // Unit price for the selected variant
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
