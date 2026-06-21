# Tài liệu Kỹ thuật: Hệ thống Cart, Checkout & Payment — MediSpace

> **Phạm vi:** Tài liệu này được tạo ra từ việc đọc toàn bộ mã nguồn thực tế, từng dòng, từng hàm, từng file liên quan đến giỏ hàng, thanh toán và giao dịch trong hệ thống MediSpace E-Commerce.
>
> **Mục đích:** Đủ chi tiết để một developer mới có thể hiểu, maintain và extend các module này mà không cần hỏi ai.

---

## Mục lục

1. [Tổng quan Module](#1-tổng-quan-module)
2. [Kiến trúc Database](#2-kiến-trúc-database)
3. [Backend — Business Logic Chi tiết](#3-backend--business-logic-chi-tiết)
4. [API Layer — Endpoints & Validation](#4-api-layer--endpoints--validation)
5. [Frontend — State Management & UI Flow](#5-frontend--state-management--ui-flow)
6. [Tích hợp Thanh toán](#6-tích-hợp-thanh-toán)
7. [Tóm tắt Business Rules](#7-tóm-tắt-business-rules)
8. [Issues / Code Smells / Rủi ro](#8-issues--code-smells--rủi-ro)

---

## 1. Tổng quan Module

### 1.1. Mục đích & Phạm vi

MediSpace là nền tảng thương mại điện tử dược phẩm. Module Cart/Checkout/Payment xử lý toàn bộ luồng từ khi user thêm sản phẩm vào giỏ cho đến khi đơn hàng được xác nhận thanh toán. Điểm đặc thù so với e-commerce thông thường:

- **Sản phẩm có nhiều đơn vị** (Viên, Vỉ, Hộp, Chai...) — mỗi đơn vị có giá khác nhau và quy đổi kho khác nhau.
- **Thuốc kê đơn** (`requiresPrescription`) — có thể bị từ chối bởi một số mã Coupon.
- **Campaign giá động** — giá sản phẩm thay đổi theo chiến dịch khuyến mãi đang chạy, được refresh realtime khi getCart.
- **Loyalty Points** — hệ thống điểm thưởng tích hợp vào checkout.

### 1.2. High-level Flow Diagram

```
[User]
  │
  ├─ Browse Products ──► addToCart ──────────────────────────────────┐
  │                                                                    │
  │                                                          [CartContext / Redux]
  │                                                          (React useReducer)
  │                                                                    │
  ├─ View Cart (/cart) ──────────────────────────────────────────────►│
  │    │  - Select items (checkbox)                                    │
  │    │  - Change qty / unit                                         │
  │    │  - Apply Coupon                                              │
  │    └─ [handleCheckout] ───────────────────────────────────────────┘
  │              │
  │         (Requires login)
  │              │
  ├─ Checkout (/cart/checkout)
  │    │  - Select Address (GHN địa chỉ tỉnh/huyện/xã)
  │    │  - Select Shipping Method (GHN fee API)
  │    │  - Select Payment Method (COD / VNPay / PayOS)
  │    │  - Apply/Remove Coupon (lại)
  │    │  - Apply Loyalty Points
  │    │  - [handlePlaceOrder]
  │    │         │
  │    │    POST /orders
  │    │         │
  │    │    ┌────┴─────────────────────────────────────────────┐
  │    │    │ OrderService.createOrder()                        │
  │    │    │  1. Validate cart / direct-buy items              │
  │    │    │  2. Re-verify campaign prices                     │
  │    │    │  3. Calculate shipping fee                        │
  │    │    │  4. Re-validate coupons                          │
  │    │    │  5. Redeem loyalty points (atomic)               │
  │    │    │  6. Attach discount allocations per item         │
  │    │    │  7. Create Order document                        │
  │    │    │  8. Record coupon redemptions (atomic)           │
  │    │    │  9. Deduct stock (atomic, race-condition safe)   │
  │    │    │  10. Clear cart (COD only)                       │
  │    │    │  11. Send email (COD only)                       │
  │    │    │  12. Create payment URL (online payment)         │
  │    │    │  13. Fire Socket.IO notifications                │
  │    │    └────────────────────────────────────────────────────┘
  │    │         │
  │    │    Response: { order, paymentUrl? }
  │    │         │
  │    │    ┌────┴──────────────────────────────────┐
  │    │    │ paymentUrl?                           │
  │    │    │  YES ─► window.location.href          │
  │    │    │         = paymentUrl (VNPay/PayOS)    │
  │    │    │                                       │
  │    │    │  NO  ─► navigate(/order/success)      │
  │    │    └───────────────────────────────────────┘
  │
  ├─ [Nếu Online Payment]
  │    │
  │    ├─ VNPay: User ──► VNPay ──► GET /payment/vnpay-return?...
  │    │                        └──► GET /payment/vnpay-ipn?... (Server-to-Server)
  │    │
  │    └─ PayOS: User ──► PayOS ──► GET /payment/payos/return?...
  │                             └──► POST /payment/payos/ipn (Webhook)
  │
  ├─ Payment Return Handler
  │    │  - Verify signature
  │    │  - updatePaymentStatus('paid' / 'failed') — Idempotent
  │    │  - If success: remove items from cart + send email
  │    │  - Redirect → /order/success?orderId=...&paymentStatus=...
  │
  └─ Order Success / Failure page
```

---

## 2. Kiến trúc Database

MediSpace dùng **MongoDB** với các collection liên quan đến Cart/Order/Payment sau đây.

### 2.1. Collection `carts`

**Schema:** `Cart.schema.ts`

```typescript
interface CartItem {
  productId: ObjectId
  name: string
  sku: string
  unit: string // Viên | Vỉ | Hộp | Tuýp | Chai ...
  quantity: number
  unitPrice: number // Giá SAU campaign (authoritative từ backend)
  originalUnitPrice: number // Giá gốc (trước campaign) — để hiển thị gạch chân
  totalPrice: number // quantity * unitPrice
  campaignId?: ObjectId // Campaign đã áp dụng
  prescriptionRequired: boolean
  image?: string
  priceVariants?: Array<{
    // Bản copy của priceVariants từ Product — dùng cho UI dropdown unit
    unit: string
    price: number
    originalPrice?: number
    isDefault?: boolean
  }>
}

interface AppliedCoupon {
  code: string
  discountAmount: number
  type: string // 'percentage' | 'fixed_amount' | 'fixed' | 'free_shipping'
}

interface Cart {
  _id: ObjectId
  userId?: ObjectId // Nếu đã login
  sessionId?: string // Nếu Guest

  items: CartItem[]
  itemCount: number // Tổng số lượng (sum of quantities)
  uniqueProductCount: number // Số loại sản phẩm (items.length)

  subtotal: number // Sum of items[].totalPrice
  discountAmount: number // Sum of coupon discounts (trừ free_shipping)
  taxAmount: number // Luôn = 0 (VAT đã gộp vào giá)
  shippingFee: number // Dùng cho preview, không phải finalShipping
  loyaltyDiscount: number // Luôn = 0 (loyalty xử lý tại checkout, không lưu trong cart)
  totalAmount: number // subtotal - discountAmount - loyaltyDiscount + taxAmount + shippingFee

  appliedCoupons?: AppliedCoupon[]
  loyaltyPointsUsed?: number // Luôn = 0 trong cart (chỉ ghi vào order)

  requiresPrescription: boolean // any(items.prescriptionRequired)

  status: string // 'active' (duy nhất 1 trạng thái được dùng)
  abandonmentReason?: string

  createdAt: Date
  updatedAt: Date
  lastActivityAt: Date
  expiresAt: Date // createdAt + 7 ngày
}
```

**Indexes:** Không thấy index explicit trong code. Cần có `userId` index và `sessionId` index để query nhanh.

**Lưu ý quan trọng:**

- 1 user chỉ có 1 Cart document (tìm bằng userId hoặc sessionId).
- Cart không bị xóa khi checkout — chỉ bị xóa items hoặc xóa coupons.
- Cart **không bao giờ** có `loyaltyDiscount` thực sự (field tồn tại nhưng = 0). Loyalty áp dụng chỉ tại lúc tạo Order.

---

### 2.2. Collection `orders`

**Schema:** `Order.schema.ts`

```typescript
interface OrderItem {
  productId: ObjectId
  categoryId?: ObjectId
  name: string
  sku: string
  unit: string
  quantity: number
  unitPrice: number // Snapshot giá tại thời điểm đặt hàng
  originalUnitPrice?: number
  totalPrice: number
  campaignId?: ObjectId
  prescriptionRequired: boolean
  image?: string
  // Phân bổ chiết khấu (phục vụ báo cáo & refund một phần)
  discountAllocation?: number // Tổng tiền giảm coupon phân bổ cho item này
  pointsAllocation?: number // Tiền giảm từ điểm phân bổ cho item này
  couponAllocations?: {
    // Chi tiết từng coupon
    code: string
    type: string
    amount: number
  }[]
}

interface Order {
  _id: ObjectId
  userId: ObjectId
  orderNumber: string // "ORD-{timestamp}-{random3digits}"

  items: OrderItem[]
  itemCount: number

  shippingAddress: {
    firstName
    lastName
    phone
    email
    address
    ward
    district
    province
    postalCode?
  }

  paymentMethod: string // 'cod' | 'bank_transfer' | 'vnpay' | 'payos' ...
  paymentStatus: string // 'pending' | 'paid' | 'failed' | 'refunded'
  orderStatus: string // 'pending' → 'confirmed' → 'processing' → 'shipped' → 'delivered' → 'cancelled' | 'returned'

  subtotal: number
  taxAmount: number // = 0
  shippingFee: number
  discountAmount: number // Tổng coupon discount (trừ free_shipping)
  totalAmount: number // = subtotal + shippingFee - discountAmount - pointsRedeemAmount
  appliedCoupons: OrderAppliedCoupon[]
  shippingDiscountAmount: number // Số tiền freeship coupon đã giảm

  notes?: string
  trackingNumber?: string
  estimatedDeliveryDate?: string

  pointsRedeemed?: number // Số điểm đã đổi
  pointsRedeemAmount?: number // Số tiền giảm từ điểm (= pointsRedeemed * 1VNĐ)

  createdAt
  updatedAt
  paidAt?
  shippedAt?
  deliveredAt?: Date
}
```

**Order Status Lifecycle:**

```
pending ──► confirmed ──► processing ──► shipped ──► delivered
   │                                                      │
   └──────────────────── cancelled ◄────────────────────┘
                                                          │
                                               returned (từ delivered)
```

**Ràng buộc chuyển trạng thái** (xem `assertOrderStatusTransition`):

- Đơn đã `cancelled` → không chuyển trạng thái nào khác.
- Đơn đã `returned` → không chuyển trạng thái nào khác.
- Đơn đã `delivered` → chỉ có thể chuyển sang `returned`.
- Không thể `delivered` nếu `paymentStatus === 'failed'`.
- Khi `paymentStatus = 'failed'` → tự động `orderStatus = 'cancelled'`.

---

### 2.3. Collection `coupons`

**Schema:** `Coupon.schema.ts`

```typescript
interface Coupon {
  _id: ObjectId
  code: string // Uppercase, unique. VD: "SAVE10"
  name: string
  type: 'percentage' | 'fixed_amount' | 'fixed' | 'free_shipping'
  value: number // % (0-100) hoặc số VNĐ

  maxDiscountAmount?: number // Chỉ dùng khi type=percentage

  minOrderAmount: number // Giá trị đơn tối thiểu (tính trên eligible items)
  applicableProductIds?: ObjectId[] // Nếu có → chỉ áp cho sản phẩm trong list
  applicableCategoryIds?: ObjectId[] // Hỗ trợ subcategory (path-based matching)
  excludePrescriptionItems?: boolean // Không áp cho thuốc kê đơn

  totalUsageLimit?: number // null = không giới hạn
  perUserLimit: number // Default = 1
  currentUsageCount: number // Counter tổng
  userUsageCounts: Record<string, number> // Counter per-user (atomically managed)

  isPublic: boolean
  targetUserIds?: ObjectId[] // Coupon riêng cho một số user

  startDate
  endDate: Date
  isActive: boolean
  createdBy: ObjectId
}
```

---

### 2.4. Collection `couponRedemptions`

**Schema:** `CouponRedemption.schema.ts`

Audit trail mỗi lần dùng coupon — dùng để rollback khi hủy đơn.

```typescript
interface CouponRedemption {
  _id: ObjectId
  couponId: ObjectId
  couponCode: string
  userId: ObjectId
  orderId: ObjectId
  discountAmount: number
  createdAt: Date
}
```

---

### 2.5. Collections `loyaltyAccounts` & `loyaltyTransactions`

**`loyaltyAccounts`** — 1-1 với User:

```typescript
interface LoyaltyAccount {
  userId: ObjectId
  pointsBalance: number // Số điểm hiện có
  totalPointsEarned: number
  totalPointsRedeemed: number
  totalPointsExpired: number
  tier: 'member' | 'silver' | 'gold' | 'platinum'
  totalSpent: number // Tổng tiền đã chi (VNĐ) — xét hạng
}

// Tier thresholds (totalSpent):
// member: 0đ | silver: ≥2M | gold: ≥10M | platinum: ≥50M

// Tier multipliers (điểm tích):
// member: 1x | silver: 1.2x | gold: 1.5x | platinum: 2x
```

**`loyaltyTransactions`** — Event log mọi thay đổi điểm:

```typescript
interface LoyaltyTransaction {
  userId: ObjectId
  type: 'earn' | 'redeem' | 'expire' | 'revoke' | 'adjust'
  points: number // Dương = cộng, âm = trừ
  balanceAfter: number // Balance sau transaction
  orderId?: ObjectId
  description: string
  expiresAt?: Date // Chỉ cho type='earn'
  isExpired: boolean
}
```

**Quy tắc tích điểm:**

- Công thức: `earnedPoints = floor(orderTotal / POINTS_PER_VND) * tierMultiplier`
- `POINTS_PER_VND` mặc định = 1000 (cấu hình ENV)
- Ví dụ: Order 500,000đ, tier Gold (1.5x) → `floor(500000/1000) * 1.5 = 750 điểm`
- **Chỉ tích khi order chuyển sang `delivered`** (không phải khi đặt hàng)
- Điểm hết hạn sau 365 ngày (cấu hình ENV)

**Quy đổi điểm:**

- 1 điểm = 1 VNĐ (khi đổi)
- Tối đa được đổi: `min(pointsBalance, floor(subtotal * maxRedeemRatio))` (default ratio = 0.3 = 30%)
- Tối thiểu để đổi: `POINTS_MIN_REDEEM` = 10,000 điểm

---

### 2.6. ERD — Entity Relationship Description

```
User (users)
  │  1:1
  ├──── LoyaltyAccount (loyaltyAccounts)
  │       │ 1:N
  │       └── LoyaltyTransaction (loyaltyTransactions)
  │
  │  1:1
  ├──── Cart (carts) ──── CartItem[] (embedded)
  │                           │
  │                     FK: productId → Product
  │
  │  1:N
  └──── Order (orders) ─── OrderItem[] (embedded)
          │                    │ FK: productId → Product
          │                    │ FK: categoryId → Category
          │
          │  1:N
          └── CouponRedemption (couponRedemptions)
                    │
                    └─ FK: couponId → Coupon
                    └─ FK: orderId → Order

Product (products)
  ├── priceVariants[] (embedded)
  └── FK: categoryId, brandId

Campaign (campaigns)
  └── Ảnh hưởng price tại runtime (không FK cứng)
```

---

## 3. Backend — Business Logic Chi tiết

### 3.1. CartService (`src/services/carts.services.ts`)

#### `buildCartQuery(userId?, sessionId?)`

- **Input:** userId hoặc sessionId
- **Output:** MongoDB query object `{userId}` hoặc `{sessionId}`
- **Logic:** Helper nội bộ, ưu tiên userId.

---

#### `getCart(userId?, sessionId?)`

- **Input:** userId (optional), sessionId (optional)
- **Output:** `{ cart: CartDocument, sessionId: string }`
- **Business Rules:**
  1. **Tìm theo userId trước:** Nếu user có cart và cart có items → return ngay.
  2. **Cart merge:** Nếu user cart rỗng hoặc không tồn tại, tìm session cart. Nếu session cart có items → gán `userId` vào session cart (merge), xóa user cart cũ nếu có.
  3. **Guest cart:** Nếu không có userId, tìm theo sessionId. Nếu không có cart → tạo mới với `sessionId` mới (random).
  4. **refreshCampaignPrices:** Sau khi lấy được cart, gọi `refreshCampaignPrices` để sync giá campaign.
- **Side Effects:**
  - DB write: Có thể update `userId` trên session cart (merge).
  - DB write: Có thể insert Cart mới.
  - Gọi `refreshCampaignPrices` (có thể update DB).
- **Error Cases:** Không throw — luôn return (tạo mới nếu cần).

---

#### `refreshCampaignPrices(cart)` — **Private**

- **Input:** Cart document
- **Output:** Cart document với giá đã refresh
- **Logic:**
  1. Duyệt từng item trong cart.
  2. Fetch product từ DB → lấy `originalPrice` theo unit.
  3. Fetch active campaign cho product từ `campaignsService`.
  4. Tính `newUnitPrice = applyDiscountToPrice(originalPrice, campaign)`.
  5. Nếu `unitPrice` hoặc `originalUnitPrice` thay đổi → cập nhật item, set `hasChanges = true`.
  6. Nếu có changes → recalculate `subtotal`, `totalAmount` (trừ coupon discount, loyalty), persist lên DB.
- **Khi nào refresh:** Mỗi lần `getCart()` được gọi — nghĩa là mỗi khi user mở trang giỏ hàng.
- **Ý nghĩa Business:** Đảm bảo user luôn thấy giá chính xác nhất. Nếu campaign hết hạn/bắt đầu mới → giá tự cập nhật.
- **Error Handling:** Lỗi fetch product cá biệt → `catch` im lặng, giữ nguyên giá cũ.

---

#### `addItemToCart(productId, quantity, userId?, sessionId?, requestedUnit?, requestedPrice?)`

- **Input:** productId, quantity, userId (opt), sessionId (opt), requestedUnit (opt), requestedPrice (bị ignore)
- **Output:** Updated `Cart` instance
- **Business Rules:**
  1. Fetch product từ DB — throw `404` nếu không tồn tại.
  2. **Stock check với unit conversion:** `requiredStock = quantity * quantityPerUnit`. Throw `400 INSUFFICIENT_STOCK` nếu không đủ.
  3. Xác định `unit`: requestedUnit → default variant → first variant → 'Sản phẩm'.
  4. Lấy `originalUnitPrice` theo unit từ `priceVariants`.
  5. **Fetch campaign price (authoritative):** `unitPrice = campaignsService.applyDiscountToPrice(originalUnitPrice, campaign)`. **Giá từ FE bị bỏ qua hoàn toàn.**
  6. Nếu item (cùng productId + unit) đã có → cộng quantity, cập nhật giá.
  7. Update DB (chỉ update fields thay đổi, không replace cả document).
- **Side Effects:**
  - DB read: product, cart, campaign.
  - DB write: cart.
  - Gọi `recommendationsService.recordRealtimeEvent()` từ controller.
- **Key Security Design:** Backend tính giá authoritative, không tin price từ FE.

---

#### `updateItemQuantity(productId, quantity, userId?, sessionId?, unit?)`

- **Input:** productId, quantity (1-10), userId/sessionId, unit (optional để xác định đúng item)
- **Output:** Updated `Cart` instance
- **Validation:**
  - `quantity < 1 || quantity > 10` → throw `400`.
  - Stock check (tương tự addItem).
  - Item không tồn tại trong cart → throw `404`.
- **Logic:** Cập nhật quantity và tính lại `totalPrice = quantity * unitPrice`.

---

#### `updateItemUnit(productId, unit, userId?, sessionId?, currentUnit?)`

- **Input:** productId, unit mới, userId/sessionId, currentUnit (đơn vị hiện tại để xác định item)
- **Business Rules:**
  1. Kiểm tra `unit` có trong `product.priceVariants` không → throw `400` nếu không hợp lệ.
  2. Fetch campaign, tính giá mới cho unit mới.
  3. **Merge logic:** Nếu cart đã có item với (productId + unit mới) → merge quantity vào item đó, xóa item cũ.
  4. Nếu không → cập nhật unit/price trực tiếp.

---

#### `removeItemFromCart(productId, userId?, sessionId?, unit?)`

- **Logic:**
  - Nếu `unit` được truyền → xóa item có `(productId, unit)`.
  - Nếu không có `unit` → xóa tất cả items có `productId` đó.
  - Tính lại totals.

---

#### `clearCart(userId?, sessionId?)`

- **Logic:** Reset `items = []`, `itemCount = 0`, `subtotal = 0`, `totalAmount = 0`, xóa `appliedCoupons`, reset `discountAmount = 0`, `loyaltyDiscount = 0`.

---

#### `verifyStockAvailability(cartItems)`

- **Logic:** Duyệt từng item, kiểm tra `product.stockQuantity >= item.quantity * quantityPerUnit`. Throw `400` nếu không đủ.

---

#### `getCheckoutData(userId?, sessionId?)`

- **Output:** Cart với `items` được populate thêm thông tin product (`name`, `sku`, `featuredImage`, `requiresPrescription`).

---

### 3.2. OrderService (`src/services/orders.services.ts`)

#### `createOrder(userId, payload)` — Hàm Quan Trọng Nhất

**Input:**

```typescript
{
  shippingAddress,           // Địa chỉ giao hàng đầy đủ
  paymentMethod,             // 'cod' | 'vnpay' | 'payos' ...
  notes?,
  sessionId?,
  req,                       // Express request object (cần cho VNPay IP)
  selectedItems?,            // Chỉ checkout các item được tick
  isDirectBuy?,              // true = Mua ngay, false = từ cart
  shippingMethod?,           // 'standard' | 'fast' | 'express' | 'ghn:<serviceId>' | 'ghtk:<transport>'
  shippingFee?,              // FE có thể preview, backend luôn tự quote lại và không trust field này
  estimatedDeliveryDate?,
  couponCodes?,              // Cho direct buy
  pointsToRedeem?            // Số điểm muốn đổi
}
```

**Luồng xử lý step-by-step:**

**Step 1: Chuẩn bị Order Items**

- **Nếu `isDirectBuy = true`:** Fetch từng product trực tiếp từ DB. Validate stock. Tính giá từ priceVariants + campaign.
- **Nếu `isDirectBuy = false` (từ cart):**
  1. Fetch cart (getCart).
  2. Filter theo `selectedItems` (productId + unit matching).
  3. **Re-verify campaign price tại thời điểm checkout** — quan trọng! Campaign có thể đã thay đổi kể từ khi item được thêm vào cart.

**Step 2: Tính Shipping Fee**

- Nếu FE truyền `shippingFee >= 0` → dùng luôn.
- Nếu không → backend tự tính:
  - `standard` với đủ `districtId` + `wardCode` → gọi GHN API thực.
  - `fast` = 45,000đ
  - `express` = 60,000đ
  - `standard` fallback = 30,000đ
- **Freeship rule:** `subtotal >= 300,000đ → shippingFee = 0` (áp trước khi check coupon)

**Step 3: Re-validate Coupons**

- Từ cart (`appliedCoupons`) hoặc `payload.couponCodes` (direct buy).
- Gọi `couponService.validateCoupon()` cho từng mã.
- Coupon không hợp lệ → bị bỏ qua (không throw — đơn vẫn tiếp tục được tạo). Chỉ log cảnh báo.
- `type === 'free_shipping'` → `shippingFee = 0`, `shippingDiscountAmount = shippingFee_original`.

**Step 4: Redeem Loyalty Points** (nếu `pointsToRedeem > 0`)

- Cap: `maxPointsVnd = min(pointsToRedeem, subtotal - couponDiscount)` — không được đổi quá phần còn lại sau coupon.
- Gọi `loyaltyService.redeemPoints()` — **atomic** (MongoDB findOneAndUpdate với `$gte: pointsToRedeem`).

**Step 5: Attach Benefit Allocations**

- Gọi `attachBenefitAllocations()` — phân bổ coupon discount và loyalty discount xuống từng item theo tỷ lệ `item.totalPrice / subtotal`.

**Step 6: Tạo Order Document & Insert vào DB**

**Step 7: Record Coupon Redemptions (Atomic)**

- Dùng `findOneAndUpdate` với điều kiện `currentUsageCount < totalUsageLimit AND userUsageCounts[userId] < perUserLimit` → increment cả hai counters.
- **Rollback nếu thất bại:** Xóa order, hoàn điểm loyalty.

**Step 8: Deduct Stock (Atomic, Race-condition Safe)**

```typescript
await db.products.updateOne(
  { _id: productId, stockQuantity: { $gte: stockToDeduct } },
  { $inc: { stockQuantity: -stockToDeduct } }
)
```

- Nếu `modifiedCount === 0` → sản phẩm vừa hết → **Rollback toàn bộ**:
  - Restore stock items đã trừ trước đó (`deductedItems`).
  - Xóa order.
  - Release coupon redemptions + loyalty points.
  - Throw `409 CONFLICT`.

**Step 9: Low Stock Alert (Fire-and-forget)**

- Nếu `stockQuantity <= 30` sau khi trừ → Socket.IO `notifyLowStock` cho Admin/Pharmacist.

**Step 10: Clear Cart / Send Email (COD)**

- Chỉ xóa items khỏi cart nếu `paymentMethod === 'cod'` VÀ `isDirectBuy === false`.
- Gửi email confirmation ngay cho COD.

**Step 11: Generate Payment URL (Online Payment)**

- Gọi `paymentService.createPaymentUrl(order, req)` nếu không phải COD.

**Step 12: Socket.IO Notifications (Fire-and-forget)**

- Notify Admin: Đơn hàng mới.
- Notify Customer: Đặt hàng thành công.
- Notify Pharmacists: Chuẩn bị thuốc.

**Output:**

```typescript
{ order: Order, orderId: ObjectId, paymentUrl?: string }
```

---

#### `updateOrderStatus(orderId, newStatus, trackingNumber?, notes?)`

**Business Rules:**

1. Validate transition (xem `assertOrderStatusTransition`).
2. `newStatus === 'shipped'` → ghi `trackingNumber`, `shippedAt`.
3. `newStatus === 'delivered'`:
   - Ghi `deliveredAt`.
   - Nếu COD + paymentStatus = 'pending' → auto set `paymentStatus = 'paid'`.
   - Gọi `loyaltyService.earnPointsFromOrder()` — tích điểm cho user.
   - Gọi `recommendationsService.recordRealtimeEvent()`.
4. `newStatus === 'cancelled'`:
   - Restore stock.
   - Release coupon redemptions + loyalty points.
5. Fire Socket.IO `notifyOrderStatusChange` cho customer.

---

#### `updatePaymentStatus(orderId, newStatus)`

**Business Rules:**

1. Không update nếu status không thay đổi (idempotency).
2. Không `paid` nếu order đã terminal.
3. Không `failed` nếu đã paid/delivered/returned.
4. `newStatus === 'paid'`:
   - Ghi `paidAt`.
   - Nếu `orderStatus === 'pending'` → auto set `orderStatus = 'confirmed'`.
5. **`newStatus === 'failed'`:**
   - Set `orderStatus = 'cancelled'`, ghi `cancelledAt`, `cancelReason`.
   - Restore stock.
   - Release coupon + loyalty points.

---

### 3.3. CouponService (`src/services/coupons.services.ts`)

#### `validateCoupon(code, userId, cartSubtotal, hasPrescriptionItems, items?)`

**Các bước validation theo thứ tự:**

1. Tìm coupon (`isActive: true`).
2. Kiểm tra thời gian (`startDate <= now <= endDate`).
3. Tính `eligibleSubtotal` — subtotal chỉ từ items thuộc `applicableProductIds` hoặc `applicableCategoryIds` (bao gồm subcategories theo path). Nếu coupon không có target → áp toàn bộ cart.
4. `eligibleSubtotal < minOrderAmount` → reject.
5. `currentUsageCount >= totalUsageLimit` → reject.
6. `userUsageCounts[userId] >= perUserLimit` → reject. (**Source of truth là `userUsageCounts`, không phải count từ couponRedemptions**).
7. `targetUserIds` → check user có trong list không.
8. `excludePrescriptionItems && hasPrescriptionItems` → reject.
9. Tính discount:
   - `percentage`: `floor(eligibleSubtotal * value/100)`, cap bởi `maxDiscountAmount`.
   - `fixed_amount` / `fixed`: `min(value, eligibleSubtotal)`.
   - `free_shipping`: discount = 0 (shipping xử lý riêng trong OrderService).

**Category Matching:** Hỗ trợ **subcategory** via path-based regex. Nếu coupon target category A, thì tất cả sản phẩm thuộc A và sub-categories của A đều eligible.

---

#### `applyCouponToCart(code, userId, sessionId?, selectedSubtotal?, selectedItems?)`

**Stacking Rules:**

- Tối đa **1 discount coupon** (percentage/fixed) + **1 freeship coupon** — không thể stack 2 discount.
- Nếu đã có freeship + thêm freeship khác → reject.
- Nếu đã có discount + thêm discount khác → reject.

---

#### `recordCouponRedemption(couponCode, userId, orderId, discountAmount)` — **Atomic**

- Kiểm tra idempotency (đã có redemption cho orderId chưa → skip).
- `findOneAndUpdate` với condition kiểm tra `totalUsageLimit` và `perUserLimit` → increment `currentUsageCount` và `userUsageCounts[userId]`.
- Nếu condition fail (`null` returned) → throw `409 CONFLICT` (coupon vừa hết trong lúc race).
- Insert `CouponRedemption` record (audit trail).
- Rollback nếu insert fail (trừ `code 11000` = duplicate key = already recorded).

---

#### `releaseCouponRedemptionsForOrder(orderId)` — **Idempotent**

- Tìm tất cả redemptions của orderId → decrement counters (dùng `$max([0, ...])` để không âm) → xóa redemption records.

---

### 3.4. LoyaltyService (`src/services/loyalty.services.ts`)

#### `redeemPoints(userId, orderId, pointsToRedeem, orderSubtotal, orderNumber)` — **Atomic**

- Kiểm tra idempotency theo (userId, orderId, type='redeem').
- Validate: `pointsToRedeem >= minRedeem` (default 10,000).
- Validate: `redeemAmount <= floor(orderSubtotal * maxRedeemRatio)` (default 30%).
- **Atomic deduction:** `findOneAndUpdate` với `pointsBalance: { $gte: pointsToRedeem }`.
- Insert `LoyaltyTransaction` (type='redeem').
- Nếu insert fail → compensate (hoàn lại balance).

#### `earnPointsFromOrder(userId, orderId, orderTotal, orderNumber)`

- Idempotency: check đã có earn transaction cho orderId chưa.
- Tính điểm: `floor(orderTotal / pointsPerVnd) * tierMultiplier`.
- Cập nhật `totalSpent`, recalculate tier.
- Insert `LoyaltyTransaction` (type='earn', expiresAt = +365 ngày).

#### `refundRedeemedPointsForOrder(userId, orderId, orderNumber)` — **Idempotent**

- Tìm transaction redeem cho orderId → hoàn điểm.
- Kiểm tra không hoàn 2 lần (check type='adjust' với description 'Hoàn điểm đã đổi').

---

### 3.5. PaymentService & Providers (`src/services/payment/`)

**Design Pattern:** Provider Pattern với interface chung.

```typescript
interface PaymentProvider {
  createPaymentUrl(order: Order, req?: any): Promise<string>
  verifyReturn(params: any): Promise<PaymentResult>
  verifyIpn(params: any): Promise<PaymentResult>
}
```

**Registered Providers:**

- `vnpay` → `VNPayProvider`
- `bank_transfer` → `VNPayProvider` (alias)
- `payos` → `PayOSProvider`

---

#### `VNPayProvider`

**`createPaymentUrl(order, req)`:**

- Params: `vnp_TxnRef = order._id.toString()` (dùng MongoID làm transaction reference).
- `vnp_Amount = order.totalAmount * 100` (VNPay dùng đơn vị 1/100 VNĐ).
- Ký HMAC-SHA512 với `VNP_HASH_SECRET`.
- IP từ `X-Forwarded-For` header hoặc `req.connection.remoteAddress`.

**`verifyReturn(params)` / `verifyIpn(params)`:**

- Xóa `vnp_SecureHash` + `vnp_SecureHashType` → sort params → tính lại HMAC-SHA512 → so sánh.
- `vnp_ResponseCode === '00'` → success.
- `orderId` = `vnp_TxnRef` = MongoDB ObjectId.

---

#### `PayOSProvider`

**`createPaymentUrl(order, req)`:**

- `orderCode = Number(lastSixDigitsOfTimestamp + random3)` — unique numeric ID (PayOS yêu cầu số).
- `description = "DH {order.orderNumber}"` (cắt tối đa 25 ký tự).
- `returnUrl/cancelUrl` trỏ về **backend** trước (`/payment/payos/return?orderId=...`), không trỏ thẳng về FE.
- Dùng `@payos/node` SDK: `payOS.createPaymentLink(paymentData)`.

**`verifyReturn(params)`:**

- Đọc `status === 'PAID' || code === '00'` từ PayOS redirect params.
- `orderId` lấy từ custom query param `orderId` mà backend tự append vào returnUrl.

**`verifyIpn(body)`:**

- Dùng `payOS.verifyPaymentWebhookData(body)` của SDK → verify signature.
- Extract orderNumber từ `description` ("DH {orderNumber}") → trả về qua `transactionId`.
- `orderId` = '' (rỗng) — controller phải lookup bằng `transactionId` (orderNumber).

---

### 3.6. Payment Controllers (`src/controllers/payment.controllers.ts`)

#### `handlePostPaymentSuccess(orderId)` — **Private Helper**

Gọi khi thanh toán thành công (dùng bởi cả VNPay lẫn PayOS):

1. Fetch order.
2. Remove purchased items từ cart (item by item theo unit).
3. Send order confirmation email.

#### `vnpayReturnController` / `payOSReturnController` — **Return URL**

- Dùng cho user redirect (browser).
- **Idempotency check:** `existingOrder.paymentStatus !== 'paid'` trước khi update.
- Nếu success → `updatePaymentStatus('paid')` + `handlePostPaymentSuccess()`.
- Nếu fail + pending → `updatePaymentStatus('failed')` (trigger cancel + stock restore).
- Redirect về `CLIENT_URL/order/success?orderId=...&paymentStatus=success|failed`.

#### `vnpayIpnController` — **Server-to-Server IPN**

- VNPay gọi server-to-server. Trả về JSON `{ RspCode: '00' }` để confirm.
- Idempotency check.
- Không gọi `handlePostPaymentSuccess` ở đây (email/cart clear sẽ do Return URL xử lý).

#### `payOSIpnController` — **Webhook**

- PayOS POST webhook.
- Lookup order bằng `result.transactionId` (= orderNumber) nếu `orderId` rỗng.
- Gọi `handlePostPaymentSuccess()`.

---

## 4. API Layer — Endpoints & Validation

### 4.1. Cart Endpoints

| Method | Path                           | Auth     | Mô tả             |
| ------ | ------------------------------ | -------- | ----------------- |
| GET    | `/cart`                        | Optional | Lấy giỏ hàng      |
| POST   | `/cart/add`                    | Optional | Thêm sản phẩm     |
| PUT    | `/cart/update/:productId`      | Optional | Cập nhật số lượng |
| PUT    | `/cart/update-unit/:productId` | Optional | Đổi đơn vị        |
| DELETE | `/cart/remove/:productId`      | Optional | Xóa sản phẩm      |
| DELETE | `/cart/clear`                  | Optional | Xóa toàn bộ giỏ   |
| GET    | `/cart/checkout`               | Optional | Lấy checkout data |

**Auth "Optional":** Nếu có Bearer token hợp lệ → set `req.decoded_authorization`. Token sai/không có → guest mode (dùng `req.cookies.sessionId` hoặc `x-session-id` header).

**Response Pattern:**

```json
{
  "message": "...",
  "result": {
    /* Cart object */
  }
}
```

**Validation Chi tiết:**

| Field                    | Rule                   |
| ------------------------ | ---------------------- |
| `productId` (body/param) | Valid MongoDB ObjectId |
| `quantity`               | Integer, min=1, max=10 |

---

### 4.2. Order Endpoints

| Method | Path                           | Auth                    | Mô tả                   |
| ------ | ------------------------------ | ----------------------- | ----------------------- |
| POST   | `/orders`                      | **Required + Verified** | Tạo đơn hàng            |
| GET    | `/orders`                      | Required + Verified     | Danh sách đơn của user  |
| GET    | `/orders/:orderId`             | Required + Verified     | Chi tiết đơn            |
| PUT    | `/orders/:orderId/status`      | Required + Verified     | Cập nhật trạng thái     |
| PUT    | `/orders/:orderId/payment`     | Required + Verified     | Cập nhật payment status |
| POST   | `/orders/:orderId/payment-url` | Required + Verified     | Lấy payment URL (retry) |
| GET    | `/orders/admin/all`            | Required + Verified     | Tất cả đơn (Admin)      |
| GET    | `/orders/admin/stats`          | Required + Verified     | Thống kê đơn (Admin)    |

> **⚠️ Lưu ý:** Route `/orders/admin/all` và `/orders/admin/stats` không có middleware kiểm tra role Admin thêm — chỉ cần verified user token. Đây là **security risk** (xem mục 8).

**Validation `createOrderValidator`:**

| Field             | Rule                                                                                                     |
| ----------------- | -------------------------------------------------------------------------------------------------------- |
| `items`           | Optional array (nếu checkout từ cart)                                                                    |
| `isDirectBuy`     | Optional boolean                                                                                         |
| `shippingAddress` | Object với: `firstName*`, `lastName*`, `phone*`, `email*`, `address*`, `ward*`, `district*`, `province*` |
| `paymentMethod`   | Bắt buộc, phải thuộc: `cod`, `bank_transfer`, `vnpay`, `payos`, `cash`, `credit_card_pos`                |
| `shippingMethod`  | Optional string: enum cũ hoặc carrier method dạng `ghn:<serviceId>`, `ghtk:<transport>`                  |
| `notes`           | Optional string, max 500 chars                                                                           |

---

### 4.3. Payment Endpoints

| Method | Path                    | Auth | Mô tả                       |
| ------ | ----------------------- | ---- | --------------------------- |
| GET    | `/payment/vnpay-return` | None | VNPay Return URL            |
| GET    | `/payment/vnpay-ipn`    | None | VNPay IPN (Server callback) |
| GET    | `/payment/payos/return` | None | PayOS Return URL            |
| POST   | `/payment/payos/ipn`    | None | PayOS Webhook               |

**Không có auth** — các endpoint này cần public để payment gateway gọi vào.

---

### 4.4. Error Codes

| HTTP Status | Tình huống                                                                                                              |
| ----------- | ----------------------------------------------------------------------------------------------------------------------- |
| 400         | Số lượng ngoài 1-10, stock không đủ, đơn vị không hợp lệ, coupon hết hạn/không đủ điều kiện, điểm không đủ/chưa đến min |
| 404         | Product/Cart/Order không tồn tại                                                                                        |
| 409         | Race condition — stock vừa hết hoặc coupon vừa hết lượt                                                                 |
| 401/403     | Token thiếu/hết hạn/không verified                                                                                      |

---

## 5. Frontend — State Management & UI Flow

### 5.1. CartContext (`src/contexts/CartContext.tsx`)

**Pattern:** React `useReducer` + Context API (không dùng Redux).

**State:**

```typescript
{
  cart: Cart | null,
  selectedItems: Set<string>,  // "productId-unit" or "productId"
  wishlist: Set<string>,
  isLoading: boolean
}
```

**Selection Key:** `createSelectionKey(productId, unit?) = unit ? "${productId}-${unit}" : productId`

- Cho phép cùng product với unit khác nhau được xử lý độc lập.

**Persistence:**

- `selectedItems` → `sessionStorage.medispace_selected_items` (mảng JSON)
- `wishlist` → `localStorage.medispace_wishlist` (mảng JSON)
- `cart` → fetched từ API, không persist local

**Auth-aware Loading:**

- Khi mount: Check `localStorage.medispace_access_token`. Nếu không có → `cart = null`.
- Lắng nghe `storage` event (cross-tab) và custom `auth-changed` event → reload cart.

**Exported Actions:**
| Hàm | Mô tả |
|-----|-------|
| `addToCart(product, qty, unit?)` | POST `/cart/add`, auto-select item mới |
| `updateQuantity(productId, qty)` | PUT `/cart/update/:id` |
| `updateUnit(productId, unit)` | PUT `/cart/update-unit/:id` |
| `removeFromCart(productId, unit?)` | DELETE `/cart/remove/:id?unit=...` |
| `clearCart()` | DELETE `/cart/clear` |
| `refreshCart()` | GET `/cart` — không auto-select |
| `toggleItemSelection(productId, unit?)` | Dispatch + persist sessionStorage |
| `selectAllItems(bool)` | Select/deselect all |
| `buyNow(product, qty, unit?)` | Navigate to `/cart/checkout?mode=buy_now&...` |

---

### 5.2. ShoppingCartPage (`src/components/cart/ShoppingCartPage.tsx`)

**Features:**

- Checkbox select per item và select-all.
- Quantity +/- buttons (min=1, max=10 hard-coded UI).
- Unit dropdown (chỉ hiện nếu product có > 1 priceVariant).
- Delete selected items sequentially (tránh race condition với backend).
- Add selected to wishlist.
- `CouponInput` component — apply/remove coupon.
- Order Summary: subtotal, discount, shipping (preview), total.
- **Freeship preview:** `subtotal >= 300,000đ || freeShippingFromCoupon → shippingFee = 0`.
- Cross-sell Recommendations carousel.

**Guard:** Validate `selectedItems` khi cart thay đổi — loại bỏ selections không còn trong cart.

**Checkout Button:**

- Nếu chưa login → toast + redirect `/login?returnUrl=/cart/checkout`.
- Nếu đã login → navigate `/cart/checkout`.

---

### 5.3. CheckoutPage (`src/components/cart/CheckoutPage.tsx`)

**Modes:**

1. **Normal mode** — checkout từ cart với `selectedItems`.
2. **Buy Now mode** — `?mode=buy_now&productId=...&quantity=...&unit=...`.

**Data Loading:**

- `authService.getMe()` → thông tin user.
- `addressService.getAddresses()` → danh sách địa chỉ.

**Shipping:**

- Multi-carrier integration: FE gọi `POST /shipping/rates` để lấy phí thật từ các provider đang bật.
- Provider hiện hỗ trợ: `ghn:<serviceId>`, `ghtk:road`, `ghtk:fly`.
- Fallback: 3 options mặc định (30k/45k/60k) nếu carrier API không trả option.
- Auto-select option rẻ nhất từ danh sách rate đã sort.
- **Freeship:** `subtotal >= 300,000đ || freeShippingFromCoupon → shippingFee = 0`.

**Pricing:**

```
total = max(0, subtotal - couponDiscount - pointsDiscount + shippingFee)
pointsRedeemBaseAmount = max(0, subtotal - couponDiscount)
```

**Guard:**

- `useEffect` redirect về `/cart` nếu không có selectedItems (trong normal mode).
- Guard bị tắt ngay khi `orderPlaced = true` (sau khi đặt hàng thành công).

**`handlePlaceOrder()`:**

1. Validate user, selectedItems, selectedAddress.
2. Map payment method: `vnpay → 'vnpay'`, `payos → 'payos'`, `cod → 'cod'`.
3. Gọi `orderService.createOrder()`.
4. `await refreshCart()` để sync.
5. Nếu `paymentUrl` → `window.location.href = paymentUrl`.
6. Nếu không → disable guard, `navigate(/order/success?orderId=...)`.

---

### 5.4. OrderService FE (`src/services/orderService.ts`)

**Key design:** `transformOrderFromBackend(backendOrder)` — map Backend schema → FE type.

- `_id` → `id`
- `orderStatus` → `status`
- `discountAmount` → `discount`
- `taxAmount` → `tax`
- Items được expand thành partial Product objects.

---

### 5.5. Order Pages (`src/components/order/`)

| Component          | Route                                          | Mô tả                         |
| ------------------ | ---------------------------------------------- | ----------------------------- |
| `OrdersPage`       | `/account/orders`                              | Danh sách đơn hàng với tabs   |
| `OrderDetailPage`  | `/order/:id`                                   | Chi tiết đơn, timeline status |
| `OrderSuccessPage` | `/order/success?orderId=...&paymentStatus=...` | Thành công / Thất bại         |
| `OrderFailurePage` | `/order/failure`                               | Trang thất bại riêng          |

`OrderSuccessPage` đọc `paymentStatus` từ query params (backend redirect về).

---

## 6. Tích hợp Thanh toán

### 6.0. Vận chuyển đa nhà cung cấp

Checkout dùng endpoint tổng hợp `POST /shipping/rates`. Backend gọi song song provider vận chuyển thật và chuẩn hóa kết quả về cùng format. Khi tạo order, backend quote lại phí theo `shippingMethod` đã chọn để không tin giá từ frontend.

**Provider đang hỗ trợ:**

- `ghn:<serviceId>` — GHN real-time rate.
- `ghtk:road` — Giao Hàng Tiết Kiệm đường bộ.
- `ghtk:fly` — Giao Hàng Tiết Kiệm tuyến bay.
- `ahamove:<serviceId>` — Ahamove real-time estimate, ví dụ `ahamove:BIKE` hoặc `ahamove:ECO`.

**Biến môi trường GHTK:**

```env
GHTK_API_URL=https://services.giaohangtietkiem.vn
GHTK_TOKEN=your_ghtk_token
GHTK_CLIENT_SOURCE=MediSpace
GHTK_PICK_ADDRESS=...
GHTK_PICK_WARD=...
GHTK_PICK_DISTRICT=...
GHTK_PICK_PROVINCE=...
```

Nếu `GHTK_TOKEN` hoặc địa chỉ lấy hàng chưa cấu hình, provider GHTK tự bỏ qua và không hiển thị option.

**Biến môi trường Ahamove:**

```env
AHAMOVE_API_URL=https://partner-apistg.ahamove.com
AHAMOVE_TOKEN=your_ahamove_api_key
AHAMOVE_SERVICES=BIKE,ECO
AHAMOVE_SAME_PROVINCE_ONLY=true
AHAMOVE_PICK_NAME=MediSpace
AHAMOVE_PICK_MOBILE=your_pickup_phone
AHAMOVE_PICK_ADDRESS=...
AHAMOVE_PICK_WARD=...
AHAMOVE_PICK_DISTRICT=...
AHAMOVE_PICK_PROVINCE=...
```

`AHAMOVE_TOKEN`/`AHAMOVE_TOKENS` là API key/server key từ AhaMove. Provider tự gọi `/v3/accounts/token` bằng API key và số điện thoại lấy hàng để lấy bearer token trước khi gọi estimate.
Nếu `AHAMOVE_TOKEN` hoặc địa chỉ lấy hàng chưa cấu hình, provider Ahamove tự bỏ qua và không hiển thị option.
Mặc định Ahamove chỉ hiển thị khi địa chỉ giao cùng tỉnh/thành với kho, để tránh hiện các quote liên tỉnh quá cao trong checkout.

### 6.1. VNPay

**Luồng:**

```
User → Checkout → POST /orders → createPaymentUrl() → VNPay URL
  ↓                                                        ↓
Browser redirect ─────────────────────────────────► VNPay payment page
                                                          │
                            ┌─────────────────────────────┤
                            │                             │
                     (IPN server call)         (Return URL redirect)
                            │                             │
                    GET /payment/vnpay-ipn     GET /payment/vnpay-return
                            │                             │
                    verifyIpn()              verifyReturn()
                            │                             │
                    updatePaymentStatus()    updatePaymentStatus()
                                             + handlePostPaymentSuccess()
                                             + redirect → /order/success
```

**Verification:** HMAC-SHA512 với `VNP_HASH_SECRET`. Sort tất cả params trước khi ký.

**Transaction Reference:** `vnp_TxnRef = order._id.toString()` (MongoID).

---

### 6.2. PayOS

**Luồng:**

```
User → Checkout → POST /orders → createPaymentLink() → PayOS URL
  ↓                                                        ↓
Browser redirect ─────────────────────────────────► PayOS payment page
                                                          │
                            ┌─────────────────────────────┤
                            │                             │
                     (Webhook POST)           (Return URL redirect)
                            │                             │
                POST /payment/payos/ipn     GET /payment/payos/return
                            │                             │
                    verifyIpn()              verifyReturn()
                    (SDK verify)             (trust params)
                            │                             │
                   Lookup by orderNumber   Lookup by orderId (custom param)
                            │                             │
                   updatePaymentStatus()  updatePaymentStatus()
                   + handlePostPaymentSuccess()  + handlePostPaymentSuccess()
                                                 + redirect → /order/success
```

**Key Difference vs VNPay:**

- PayOS không embed orderId trong webhook — phải lookup bằng orderNumber từ description.
- Return URL trỏ về **backend** trước (không trỏ thẳng FE) → backend xử lý rồi redirect.
- `verifyReturn` không verify signature — chỉ trust params (`status === 'PAID'`).

---

### 6.3. Idempotency

Cả Return URL và IPN đều check `order.paymentStatus !== 'paid'` trước khi update. Điều này đảm bảo:

- VNPay gọi IPN nhiều lần → chỉ xử lý lần đầu.
- Return URL và IPN cùng kích hoạt → chỉ một lần update.

---

## 7. Tóm tắt Business Rules

### 7.1. Pricing Rules

| Rule                      | Chi tiết                                                            |
| ------------------------- | ------------------------------------------------------------------- |
| **Backend authoritative** | Backend luôn tính giá từ DB + Campaign. Giá từ FE bị bỏ qua.        |
| **Campaign refresh**      | Mỗi lần getCart → refresh giá theo campaign đang active.            |
| **Multi-unit pricing**    | Mỗi unit (Viên/Vỉ/Hộp) có giá và `quantityPerUnit` riêng.           |
| **VAT**                   | Đã gộp vào giá bán (`taxAmount = 0` trong order).                   |
| **Freeship**              | `subtotal >= 300,000đ → shippingFee = 0`.                           |
| **Coupon stacking**       | Tối đa 1 discount coupon + 1 freeship coupon.                       |
| **Coupon precedence**     | Coupon discount tính trước Loyalty points.                          |
| **Max points**            | `pointsToRedeem <= subtotal - couponDiscount` và `<= 30% subtotal`. |

### 7.2. Inventory/Stock

| Rule                   | Chi tiết                                                                   |
| ---------------------- | -------------------------------------------------------------------------- |
| **Unit conversion**    | `stockToDeduct = quantity * quantityPerUnit`                               |
| **Stock check timing** | Khi thêm vào cart + khi tạo order.                                         |
| **Atomic deduction**   | `$gte` query trong MongoDB để tránh race condition.                        |
| **Rollback**           | Nếu stock deduction fail → cancel order + restore coupon + restore points. |
| **Low stock alert**    | `stockQuantity <= 30` sau deduction → notify qua Socket.IO.                |
| **Restore on cancel**  | Cancel order (admin) hoặc payment fail → restore stock + coupon + points.  |

### 7.3. Order Status Lifecycle

```
pending → confirmed → processing → shipped → delivered
  ↓                                              ↓
cancelled                                    returned
```

| Transition            | Điều kiện                                          |
| --------------------- | -------------------------------------------------- |
| `* → cancelled`       | Không thể từ `delivered`                           |
| `* → returned`        | Chỉ từ `delivered`                                 |
| `cancelled → *`       | Không thể                                          |
| `returned → *`        | Không thể                                          |
| `delivered → *`       | Chỉ → `returned`                                   |
| `pending → confirmed` | Auto khi `paymentStatus = 'paid'` (online payment) |
| COD `delivered`       | Auto `paymentStatus = 'paid'`                      |

### 7.4. Đặc thù Domain Dược phẩm

| Rule                        | Chi tiết                                                                            |
| --------------------------- | ----------------------------------------------------------------------------------- |
| **Thuốc kê đơn**            | `requiresPrescription = true` → Coupon có `excludePrescriptionItems` sẽ bị từ chối. |
| **Giỏ hàng ghi nhận**       | `cart.requiresPrescription = any(items.prescriptionRequired)`.                      |
| **Pharmacist notification** | Mọi đơn hàng mới → notify pharmacists chuẩn bị thuốc qua Socket.IO.                 |
| **Max quantity**            | Hard-coded 10 trong cả FE lẫn BE middleware.                                        |

---

## 8. Issues / Code Smells / Rủi ro

### 8.1. 🚨 Security: Admin Routes Không Kiểm Tra Role

```typescript
// orders.routes.ts
ordersRouter.get('/admin/all', accessTokenValidator, verifiedUserValidator, ...)
ordersRouter.get('/admin/stats', accessTokenValidator, verifiedUserValidator, ...)
```

Chỉ check `verifiedUserValidator` (email xác thực) — **bất kỳ user nào đã xác thực đều có thể xem toàn bộ đơn hàng và thống kê.** Cần thêm `adminMiddleware`.

---

### 8.2. ⚠️ PayOS Return Không Verify Signature

```typescript
// payos.provider.ts - verifyReturn()
const isSuccess = params.status === 'PAID' || params.code === '00'
```

Return URL không dùng SDK để verify signature — chỉ trust query params. Mặc dù IPN có verify, nhưng Return URL có thể bị manipulate nếu kẻ xấu biết orderId. (Trong thực tế ít ảnh hưởng vì IPN là authoritative, nhưng vẫn nên verify).

---

### 8.3. ⚠️ PayOS OrderCode Collision Risk

```typescript
const orderCode = Number(String(Date.now()).slice(-6) + Math.floor(Math.random() * 1000))
```

Lấy 6 chữ số cuối của timestamp + 3 số random. Nếu nhiều người checkout đồng thời trong cùng millisecond → `orderCode` có thể trùng → PayOS reject. Cần tăng entropy hoặc dùng sequence number.

---

### 8.4. ⚠️ Race Condition Trong Cart Merge

```typescript
// carts.services.ts - getCart()
if (userCart) {
  await databaseService.carts.deleteOne({ _id: userCart._id })
}
await databaseService.carts.updateOne({ _id: sessionCart._id }, { $set: { userId, ... } })
```

Không có transaction → nếu server crash giữa delete và update → user mất cả 2 cart. Nên dùng MongoDB transaction hoặc thiết kế idempotent hơn.

---

### 8.5. ⚠️ Cart itemCount/uniqueProductCount Không Được Index

Các trường tổng hợp (`itemCount`, `uniqueProductCount`, `subtotal`) được tính lại và lưu vào DB mỗi lần thay đổi. Cách tiếp cận denormalized là đúng cho performance, nhưng cần đảm bảo `calculateTotals()` luôn được gọi đúng chỗ.

---

### 8.6. ℹ️ ShoppingCartPage: Unit trong removeFromCart

```typescript
// ShoppingCartPage.tsx
for (const key of selectedItems) {
  const [productId, unit] = key.split('-') // BUG TIỀM ẨN
  await removeFromCart(productId, unit)
}
```

Nếu `unit` chứa ký tự `-` (ví dụ "Lọ-30ml") thì `key.split('-')` sẽ split sai → `unit` bị cắt. Nên dùng `key.split('-').slice(1).join('-')` (đã được handle ở nơi khác nhưng chỗ này chưa nhất quán).

---

### 8.7. ℹ️ Coupon: `'fixed'` vs `'fixed_amount'`

```typescript
// coupons.services.ts
} else if (coupon.type === 'fixed_amount' || coupon.type === 'fixed') {
```

Có 2 string literals cho cùng 1 khái niệm. Nên chuẩn hóa về 1 giá trị duy nhất và có migration data.

---

### 8.8. ℹ️ Không Có Index Explicit

Các collection `carts`, `orders`, `coupons` không có MongoDB index được định nghĩa trong code. Các query như `findOne({ userId })`, `find({ orderStatus: 'pending' })` sẽ full-scan nếu không có index. Cần index:

- `carts`: `{ userId: 1 }`, `{ sessionId: 1 }`, `{ expiresAt: 1 }` (TTL index)
- `orders`: `{ userId: 1 }`, `{ orderStatus: 1 }`, `{ orderNumber: 1 }`, `{ paymentStatus: 1 }`
- `coupons`: `{ code: 1 }` (unique), `{ isActive: 1 }`, `{ isPublic: 1 }`
- `couponRedemptions`: `{ couponCode: 1, userId: 1, orderId: 1 }` (compound)
- `loyaltyTransactions`: `{ userId: 1, type: 1, orderId: 1 }`

---

### 8.9. ℹ️ Cart không có TTL Cleanup

`expiresAt = createdAt + 7 ngày` nhưng không có MongoDB TTL index hoặc cleanup job. Cart cũ không tự xóa → DB tăng không kiểm soát. Cần thêm TTL index: `db.carts.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 })`.

---

### 8.10. ℹ️ `updateUnit` không pass `currentUnit` từ ShoppingCartPage

```typescript
// CartContext.tsx
const updateUnit = async (productId: string, unit: string) => {
  const updatedCart = await cartService.updateCartItemUnit(productId, unit)
  // currentUnit không được truyền!
}
```

Trong `cartService.updateCartItemUnit`, không truyền `currentUnit`. BE sẽ tìm item đầu tiên của productId bất kể unit. Nếu user có cùng product với 2 unit khác nhau trong cart → có thể update sai item. (Code BE có logic xử lý merge nhưng thiếu currentUnit thì không xác định đúng item cần update).

---

## Phụ lục: File Reference Map

| File                                                 | Mô tả                                                    |
| ---------------------------------------------------- | -------------------------------------------------------- |
| `BE/src/models/schemas/Cart.schema.ts`               | Cart model + addItem/removeItem/calculateTotals methods  |
| `BE/src/models/schemas/Order.schema.ts`              | Order model + generateOrderNumber + updateStatus methods |
| `BE/src/models/schemas/Coupon.schema.ts`             | Coupon model với tất cả rules                            |
| `BE/src/models/schemas/CouponRedemption.schema.ts`   | Audit trail coupon usage                                 |
| `BE/src/models/schemas/LoyaltyAccount.schema.ts`     | Tier thresholds + multipliers                            |
| `BE/src/models/schemas/LoyaltyTransaction.schema.ts` | Điểm event log                                           |
| `BE/src/models/schemas/Product.schema.ts`            | PriceVariant, stock, requiresPrescription                |
| `BE/src/services/carts.services.ts`                  | CartService: getCart, addItem, refreshCampaignPrices     |
| `BE/src/services/orders.services.ts`                 | OrderService: createOrder (main business logic)          |
| `BE/src/services/coupons.services.ts`                | Validate, apply, record, release coupons                 |
| `BE/src/services/loyalty.services.ts`                | Earn, redeem, refund, revoke points                      |
| `BE/src/services/payment.services.ts`                | Provider pattern factory                                 |
| `BE/src/services/payment/payment.interface.ts`       | PaymentProvider interface                                |
| `BE/src/services/payment/vnpay.provider.ts`          | VNPay HMAC-SHA512 integration                            |
| `BE/src/services/payment/payos.provider.ts`          | PayOS SDK integration                                    |
| `BE/src/controllers/carts.controllers.ts`            | HTTP handlers cho cart                                   |
| `BE/src/controllers/orders.controllers.ts`           | HTTP handlers cho orders                                 |
| `BE/src/controllers/payment.controllers.ts`          | Return + IPN handlers, handlePostPaymentSuccess          |
| `BE/src/routes/carts.routes.ts`                      | Cart router                                              |
| `BE/src/routes/orders.routes.ts`                     | Orders router                                            |
| `BE/src/routes/payment.routes.ts`                    | Payment callback routes                                  |
| `BE/src/middlewares/carts.middlewares.ts`            | optionalAuth, addToCartValidator                         |
| `BE/src/middlewares/orders.middlewares.ts`           | createOrderValidator, shippingAddress validation         |
| `BE/src/constants/enum.ts`                           | PaymentMethod, ShippingMethod, OrderStatus enums         |
| `FE/src/contexts/CartContext.tsx`                    | Cart global state (useReducer + Context)                 |
| `FE/src/services/cartService.ts`                     | Cart API client                                          |
| `FE/src/services/orderService.ts`                    | Order API client + transformOrderFromBackend             |
| `FE/src/services/ghnService.ts`                      | GHN shipping fee/options API client                      |
| `FE/src/components/cart/ShoppingCartPage.tsx`        | Cart UI                                                  |
| `FE/src/components/cart/CheckoutPage.tsx`            | Checkout form + order placement                          |
| `FE/src/components/order/OrderSuccessPage.tsx`       | Payment result page                                      |
