# Đặc tả tính năng: Loyalty, Coupon và Points

> **Phiên bản:** 1.1
> **Cập nhật:** 2026-06-05
> **Phạm vi:** Backend MEDISPACE E-Commerce, có ghi chú các màn hình FE liên quan
> **Trạng thái:** Đã triển khai phần coupon/points/order/refund cốt lõi trên nhánh `feature/loyalty-coupon-points-fixes`

---

## 1. Tổng quan

Tính năng Loyalty, Coupon và Points là lớp khuyến mãi và giữ chân khách hàng của MEDISPACE E-Commerce. Vì MEDISPACE là hệ thống thương mại điện tử ngành dược/sức khỏe, tính năng này không chỉ xử lý giảm giá đơn giản. Hệ thống phải đảm bảo:

- Giảm giá đúng theo điều kiện coupon.
- Không giảm sai cho thuốc kê đơn nếu coupon loại trừ Rx.
- Không vượt giới hạn lượt dùng toàn hệ thống hoặc từng khách hàng.
- Không double-use coupon khi retry thanh toán hoặc retry callback.
- Không double-refund coupon/points khi hủy, payment fail hoặc return.
- Refund partial order phải dựa trên net amount của từng item, không refund gross price.
- Order history và refund phải ổn định dù coupon/category/product/loyalty config thay đổi sau này.

Thiết kế hiện tại chia thành 4 lớp:

- Coupon engine: tạo, validate, apply, reserve usage, release usage.
- Loyalty points ledger: earn, redeem, refund, revoke, admin adjustment.
- Order benefit snapshot: đóng băng coupon/points/freeship tại thời điểm tạo order.
- Return/refund allocation: phân bổ coupon và points xuống từng item để tính refund chính xác.

Mục tiêu cuối cùng là khuyến mãi linh hoạt nhưng vẫn kiểm soát được rủi ro tài chính, audit và nghiệp vụ dược phẩm.

---

## 2. Phạm vi tính năng

### 2.1 Phần đã triển khai

Tính năng hiện tại bao gồm:

- Quản lý coupon trong admin:
  - Tạo coupon.
  - Cập nhật coupon.
  - Xóa coupon nếu chưa có usage.
  - Chặn xóa coupon đã có usage, admin nên deactivate thay vì xóa vật lý.
  - Bật/tắt active.
  - Public/private coupon.
  - Exclude prescription items.
  - Target theo user/category/product bằng selector UI, không nhập raw ObjectId.
- Coupon validation:
  - Kiểm tra active/date.
  - Kiểm tra min order.
  - Kiểm tra total usage limit.
  - Kiểm tra per-user limit bằng `userUsageCounts`.
  - Kiểm tra target user.
  - Kiểm tra target product/category.
  - Kiểm tra thuốc kê đơn nếu coupon loại trừ Rx.
  - Tính discount amount trên phần item eligible.
- Coupon cart/checkout:
  - Apply/remove coupon trong cart.
  - Hỗ trợ selected items trong cart.
  - Revalidate coupon khi tạo order.
  - Rule stacking: tối đa 1 coupon giảm hàng hóa và 1 coupon freeship.
- Coupon lifecycle:
  - Reserve usage khi order được tạo.
  - Release usage khi payment fail/cancel.
  - Idempotency theo order/coupon.
  - Backfill `userUsageCounts` cho coupon cũ.
  - Verify indexes thật, không silent fail.
- Freeship:
  - Coupon freeship không tính vào item discount.
  - `shippingFee=0` khi được áp dụng.
  - Snapshot `shippingDiscountAmount` vào order.
- Loyalty:
  - Earn points.
  - Redeem points.
  - Refund redeemed points.
  - Revoke earned points.
  - Admin adjustment add/subtract points có reason.
  - Loyalty transaction history.
- Order/refund:
  - Snapshot coupon và points vào order.
  - Snapshot `categoryId` vào order item.
  - Phân bổ coupon/points xuống từng item.
  - Partial refund tính theo net refund amount.
  - Guard terminal order status.
- FE liên quan:
  - `CouponInput` trong cart/checkout.
  - `PointsRedeemInput` trong checkout.
  - `RewardsPage`.
  - `CouponManagementPage`.
  - `LoyaltyManagementPage`.
  - `OrderDetailsDrawer`.
  - `OrderDetailPage`.
  - `ReturnRequestDetailsSheet`.

### 2.2 Phần nằm ngoài phạm vi hiện tại

Các phần dưới đây chưa phải mục tiêu chính của phiên bản này:

- CRUD cấu hình loyalty tier/rate động từ admin.
- Loyalty program draft/publish/versioning.
- Points expiry policy.
- Coupon campaign engine nhiều lớp như buy X get Y, bundle, brand-specific promotion.
- Multi-coupon stacking phức tạp trên cùng item.
- Accounting ledger chuẩn kế toán.
- Notification/email đầy đủ cho mọi biến động points/coupon.
- Dashboard fraud/risk chuyên sâu cho coupon abuse.

---

## 3. Vai trò người dùng

### 3.1 Guest

Guest có thể xem coupon public nếu UI public hỗ trợ, nhưng không thể redeem points và không nên apply coupon yêu cầu user target nếu chưa đăng nhập.

Trong cart guest/session:

- Có thể có cart theo `sessionId`.
- Coupon apply cần cẩn trọng vì per-user limit chỉ có ý nghĩa khi có `userId`.
- Checkout cần đăng nhập để tạo order và dùng loyalty points.

### 3.2 Customer/User đã xác thực

Người dùng đã xác thực có thể:

- Nhập coupon code trong cart hoặc checkout.
- Apply coupon cho các item đang chọn trong cart.
- Dùng coupon public hoặc coupon được target riêng cho mình.
- Dùng coupon product/category nếu selected items có sản phẩm eligible.
- Redeem điểm khi checkout nếu đủ balance.
- Xem loyalty balance, tier và transaction history.
- Xem coupon/points/freeship đã dùng trong order detail.
- Tạo return request và thấy refund amount đã trừ coupon/points allocation.

### 3.3 Admin

Admin có thể:

- Tạo/sửa coupon với đầy đủ điều kiện nghiệp vụ.
- Tìm user để target coupon.
- Tìm product để target coupon.
- Chọn category để target coupon. Category cha áp dụng cho cả category con.
- Deactivate coupon đã sử dụng.
- Xem loyalty accounts.
- Add/subtract points với reason bắt buộc.
- Xem order detail và return/refund breakdown.

Admin không nên:

- Xóa vật lý coupon đã từng được dùng.
- Sửa trực tiếp usage counters.
- Sửa trực tiếp user points balance ngoài adjustment endpoint.
- Sửa loyalty tier/rate nếu chưa có config versioned.

### 3.4 System

System chịu trách nhiệm:

- Revalidate coupon khi tạo order.
- Reserve coupon usage atomic.
- Release coupon usage idempotent.
- Redeem/refund/revoke points idempotent.
- Snapshot benefit data vào order.
- Guard terminal order status.
- Cleanup abandoned carts/coupon state đúng code path.

---

## 4. Luồng nghiệp vụ chính

### 4.1 Admin tạo coupon

Admin tạo coupon từ `CouponManagementPage` hoặc API admin coupon.

Dữ liệu tối thiểu:

- `code`
- `name`
- `type`
- `value`
- `minOrderAmount`
- `perUserLimit`
- `startDate`
- `endDate`

Sau khi tạo:

- Coupon có `currentUsageCount=0`.
- `userUsageCounts` rỗng hoặc chưa có.
- Code được normalize uppercase/trim.
- Nếu `totalUsageLimit` để trống/null, hiểu là không giới hạn tổng lượt.
- Nếu có target user/product/category, BE normalize string id sang ObjectId.
- Coupon có thể public hoặc private.

### 4.2 Admin sửa coupon

Admin có thể sửa điều kiện coupon, nhưng có rule bảo vệ:

- Không cho `totalUsageLimit < currentUsageCount`.
- Không cho sửa audit/counter fields trực tiếp từ payload thường.
- Coupon đã dùng vẫn có thể deactivate.
- Coupon đã dùng không nên xóa vật lý.

Các field cần bảo vệ khỏi update tự do:

- `currentUsageCount`
- `userUsageCounts`
- `createdBy`
- `createdAt`
- redemption/audit state

### 4.3 Admin target coupon theo user

Admin tìm user bằng tên/email/số điện thoại, chọn user vào `targetUserIds`.

Rule:

- Nếu `targetUserIds` rỗng: mọi user đủ điều kiện dùng được.
- Nếu có target: chỉ user nằm trong danh sách mới dùng được.
- Target user không thay thế per-user limit. User target vẫn bị giới hạn bởi `perUserLimit`.

Ví dụ nghiệp vụ:

- Tặng mã riêng cho khách VIP.
- Bù lỗi vận hành bằng mã riêng cho khách bị ảnh hưởng.
- Coupon chăm sóc khách hàng sau return/refund.

### 4.4 Admin target coupon theo product

Admin tìm product bằng tên/SKU và thêm vào `applicableProductIds`.

Rule:

- Discount chỉ tính trên subtotal của product eligible.
- Min order amount của coupon target product tính trên `eligibleSubtotal`, không tính toàn order.
- Allocation coupon chỉ phân bổ vào item product eligible.

Ví dụ:

- Giảm 10% cho một loại vitamin.
- Giảm cố định 30.000đ cho sản phẩm mới.

### 4.5 Admin target coupon theo category

Admin chọn category từ cây danh mục.

Rule:

- Category được chọn áp dụng cho chính category đó.
- Category cha áp dụng cho toàn bộ category con theo `Category.path`.
- Discount chỉ tính trên item thuộc expanded category set.
- Khi tạo order, expanded category ids được snapshot để refund ổn định.

Lý do nghiệp vụ:

- Admin thường hiểu “giảm danh mục Vitamin” là bao gồm các nhóm con như Vitamin C, Vitamin D, Multivitamin.
- Product listing của MediSpace cũng đang dùng semantics category cha bao gồm category con.

### 4.6 Customer apply coupon trong cart

Người dùng có thể tick một phần giỏ hàng. FE gửi:

```json
{
  "code": "VITAMIN10",
  "selectedSubtotal": 200000,
  "selectedItems": [
    {
      "productId": "...",
      "unit": "box"
    }
  ]
}
```

Luồng xử lý:

1. BE lấy cart theo user/session.
2. BE lọc cart items theo `selectedItems`.
3. BE tính `hasPrescriptionItems` trên selected items, không dùng toàn cart.
4. BE validate coupon.
5. BE kiểm tra stacking.
6. BE lưu applied coupon vào cart.
7. BE cập nhật `discountAmount` và `totalAmount`.

Điểm quan trọng:

- Nếu cart có thuốc kê đơn nhưng user chỉ chọn item không kê đơn, coupon `excludePrescriptionItems=true` vẫn có thể apply.
- Nếu coupon target product/category nhưng selected items không có item eligible, reject.
- Nếu coupon fixed amount lớn hơn eligible subtotal, discount bị cap ở eligible subtotal.

### 4.7 Customer apply coupon trong direct buy/checkout

Direct buy không lưu coupon vào cart. FE gọi validate preview:

```http
POST /coupons/validate
```

Với body gồm `items`. BE validate và trả về discount preview.

Khi tạo order, BE vẫn revalidate lại coupon để tránh:

- Coupon vừa hết hạn.
- Coupon vừa bị deactivate.
- Coupon vừa hết lượt.
- Product/category/order items đã thay đổi.

### 4.8 Coupon stacking

Rule hiện tại:

- Tối đa 1 coupon giảm hàng hóa: `percentage`, `fixed_amount`, `fixed`.
- Tối đa 1 coupon freeship.
- Cho phép 1 coupon giảm hàng hóa + 1 coupon freeship.
- Không cho apply cùng một code hai lần.

Không hỗ trợ:

- Nhiều coupon giảm giá cùng item.
- Best-coupon auto selection.
- Coupon priority/stacking order phức tạp.

### 4.9 Tạo order

Khi checkout:

1. BE build order items từ cart/direct buy.
2. Mỗi order item snapshot `productId`, `categoryId`, `price`, `quantity`, `unit`, `totalPrice`.
3. BE revalidate từng coupon.
4. Coupon không còn hợp lệ bị bỏ qua hoặc reject tùy flow hiện tại.
5. BE tính:
   - `couponDiscountAmount`
   - `shippingDiscountAmount`
   - `pointsRedeemAmount`
   - `totalAmount`
6. BE attach allocations:
   - coupon allocations chỉ trên item eligible
   - points allocations theo tỷ trọng item total
7. BE tạo order.
8. BE reserve coupon usage.
9. BE redeem points.

Order là nguồn sự thật cho lịch sử mua hàng và refund sau này.

### 4.10 Reserve coupon usage

Khi order được tạo, hệ thống reserve usage:

- Tăng `currentUsageCount`.
- Tăng `userUsageCounts[userId]`.
- Insert `coupon_redemptions`.

Yêu cầu:

- Atomic.
- Không vượt total usage limit.
- Không vượt per-user limit.
- Retry cùng order không tăng thêm usage.
- Duplicate redemption phải rollback counter nếu cần.

### 4.11 Payment failed hoặc cancel order

Khi order fail/cancel:

1. Guard không xử lý lại terminal state.
2. Restore stock nếu đã trừ.
3. Release coupon redemptions.
4. Refund redeemed points.
5. Revoke earned points nếu đã earn.
6. Update order/payment status.

Release coupon:

- Giảm `currentUsageCount`, không xuống âm.
- Giảm `userUsageCounts[userId]`, không xuống âm.
- Xóa redemption của order.
- Idempotent nếu gọi lại nhiều lần.

### 4.12 Earn points

User earn points khi order đủ điều kiện theo rule BE hiện tại.

Yêu cầu nghiệp vụ:

- Earn chỉ xảy ra một lần cho một order.
- Earn nên xảy ra ở trạng thái order chắc chắn, thường là delivered/completed.
- Nếu order bị return/cancel sau khi earn, phải revoke tương ứng.
- Transaction type là `earn`.

### 4.13 Redeem points

Khi checkout:

- User chọn số points muốn redeem.
- BE kiểm tra balance.
- BE cap points theo remaining amount sau coupon.
- Transaction type là `redeem`.
- Order snapshot `pointsRedeemed` và `pointsRedeemAmount`.

Rule:

- Không cho redeem vượt balance.
- Không cho redeem khiến total amount âm.
- Không redeem cho guest.
- Redeem phải idempotent theo order.

### 4.14 Admin điều chỉnh điểm

Admin adjustment dùng endpoint riêng, không sửa trực tiếp balance.

Action:

- `add`
- `subtract`

Rule:

- `points > 0`.
- `reason` bắt buộc.
- `subtract` không vượt current balance.
- Tạo transaction type `adjust`.
- Ghi admin id và reason vào description/metadata.

Ví dụ nghiệp vụ:

- Bù điểm do lỗi thanh toán.
- Thu hồi điểm do phát hiện gian lận.
- Điều chỉnh thủ công sau khi CSKH xác minh.

### 4.15 Return/refund partial order

Refund không dùng gross item price. Refund dùng net amount sau benefit allocation.

Với mỗi returned item:

```text
grossReturnedAmount = item.price * returnedQuantity
couponDeduction = allocated coupon amount theo returnedQuantity
pointsDeduction = allocated points amount theo returnedQuantity
netRefundAmount = grossReturnedAmount - couponDeduction - pointsDeduction
```

Nếu refund 1 phần quantity:

```text
perUnitDiscountAllocation = item.discountAllocation / originalQuantity
perUnitPointsAllocation = item.pointsAllocation / originalQuantity
```

Rule:

- Item không eligible coupon thì không bị trừ coupon allocation.
- Points allocation vẫn tính theo tỷ trọng toàn order.
- Refund amount không được âm.
- Refund amount không được vượt net paid amount.
- Return UI cần hiển thị breakdown để admin/user hiểu vì sao refund thấp hơn giá gốc.

---

## 5. Mô hình dữ liệu

### 5.1 `coupons`

Đại diện cho coupon admin tạo.

| Trường | Kiểu | Ý nghĩa |
|--------|------|---------|
| `_id` | ObjectId | ID coupon |
| `code` | string | Mã nhập bởi user, normalize uppercase |
| `name` | string | Tên hiển thị |
| `description` | string | Mô tả |
| `type` | `percentage` / `fixed_amount` / `fixed` / `free_shipping` | Loại coupon |
| `value` | number | % giảm hoặc số tiền giảm |
| `minOrderAmount` | number | Điều kiện tối thiểu, với target coupon tính trên eligible subtotal |
| `maxDiscountAmount` | number/null | Cap cho percentage coupon |
| `totalUsageLimit` | number/null | Tổng lượt dùng, null nghĩa không giới hạn |
| `currentUsageCount` | number | Tổng lượt đã reserve |
| `perUserLimit` | number | Số lượt tối đa mỗi user |
| `userUsageCounts` | object | Source of truth cho per-user usage |
| `isPublic` | boolean | Có hiển thị công khai hay không |
| `isActive` | boolean | Có thể validate/apply hay không |
| `excludePrescriptionItems` | boolean | Loại trừ đơn/selected items có thuốc kê đơn |
| `targetUserIds` | ObjectId[] | Danh sách user được áp dụng |
| `applicableProductIds` | ObjectId[] | Product target |
| `applicableCategoryIds` | ObjectId[] | Category target |
| `startDate` | Date | Bắt đầu hiệu lực |
| `endDate` | Date | Kết thúc hiệu lực |
| `createdBy` | ObjectId | Admin tạo |
| `updatedBy` | ObjectId | Admin cập nhật |
| `createdAt` | Date | Thời điểm tạo |
| `updatedAt` | Date | Thời điểm cập nhật |

### 5.2 `coupon_redemptions`

Audit trail cho coupon đã được reserve theo order.

| Trường | Kiểu | Ý nghĩa |
|--------|------|---------|
| `_id` | ObjectId | ID redemption |
| `couponId` | ObjectId | Coupon |
| `couponCode` | string | Snapshot code |
| `userId` | ObjectId | User dùng coupon |
| `orderId` | ObjectId | Order liên quan |
| `discountAmount` | number | Số tiền giảm |
| `createdAt` | Date | Thời điểm reserve |

Unique/index cần có:

- Unique theo order/coupon để chống retry tạo duplicate.
- Index theo `couponId`, `userId`, `orderId`.

### 5.3 `carts.appliedCoupons`

Coupon đang apply trong cart.

| Trường | Kiểu | Ý nghĩa |
|--------|------|---------|
| `code` | string | Coupon code |
| `name` | string | Tên snapshot |
| `type` | CouponType | Loại coupon |
| `discountAmount` | number | Discount hiện tại |
| `eligibleSubtotal` | number | Subtotal item eligible |
| `applicableProductIds` | ObjectId[] | Product target snapshot |
| `applicableCategoryIds` | ObjectId[] | Expanded category target snapshot |

Cart chỉ là preview state. Checkout vẫn phải revalidate.

### 5.4 `orders.appliedCoupons`

Coupon snapshot trong order.

| Trường | Kiểu | Ý nghĩa |
|--------|------|---------|
| `code` | string | Coupon code |
| `name` | string | Tên snapshot |
| `type` | CouponType | Loại coupon |
| `discountAmount` | number | Số tiền giảm hàng hóa |
| `eligibleSubtotal` | number | Subtotal item eligible tại thời điểm order |
| `applicableProductIds` | ObjectId[] | Product target snapshot |
| `applicableCategoryIds` | ObjectId[] | Expanded category target snapshot |

Không dùng coupon document hiện tại để tính lại refund của order cũ.

### 5.5 `orders.items`

Order item cần chứa benefit allocation.

| Trường | Kiểu | Ý nghĩa |
|--------|------|---------|
| `productId` | ObjectId | Product |
| `categoryId` | ObjectId/null | Category snapshot |
| `quantity` | number | Số lượng |
| `unit` | string | Đơn vị |
| `price` | number | Đơn giá |
| `totalPrice` | number | Gross item amount |
| `couponAllocations` | array | Chi tiết coupon allocation theo code |
| `discountAllocation` | number | Tổng coupon allocation |
| `pointsAllocation` | number | Points amount allocation |
| `netRefundAmount` | number | Net refundable amount |

### 5.6 `loyalty_accounts`

Đại diện trạng thái loyalty hiện tại của user.

| Trường | Kiểu | Ý nghĩa |
|--------|------|---------|
| `userId` | ObjectId | User |
| `pointsBalance` | number | Điểm hiện có |
| `lifetimePoints` | number | Điểm tích lũy trọn đời |
| `tier` | `bronze` / `silver` / `gold` / `platinum` | Hạng hiện tại |
| `createdAt` | Date | Thời điểm tạo |
| `updatedAt` | Date | Thời điểm cập nhật |

Balance không thay thế transaction ledger.

### 5.7 `loyalty_transactions`

Ledger biến động điểm.

| Trường | Kiểu | Ý nghĩa |
|--------|------|---------|
| `_id` | ObjectId | ID transaction |
| `userId` | ObjectId | User |
| `orderId` | ObjectId/null | Order liên quan nếu có |
| `type` | `earn` / `redeem` / `refund` / `revoke` / `adjust` | Loại transaction |
| `points` | number | Số điểm thay đổi |
| `balanceAfter` | number | Balance sau giao dịch |
| `description` | string | Mô tả/audit |
| `metadata` | object | Dữ liệu bổ sung |
| `createdAt` | Date | Thời điểm tạo |

---

## 6. API chi tiết

### 6.1 Coupon API

Base path:

```http
/coupons
```

| Method | Endpoint | Quyền | Mô tả |
|--------|----------|-------|-------|
| `GET` | `/` | Public/Admin tùy filter | Danh sách coupon |
| `POST` | `/validate` | User | Validate coupon preview/direct buy |
| `POST` | `/apply` | User/session | Apply coupon vào cart |
| `DELETE` | `/remove/:code` | User/session | Remove coupon khỏi cart |
| `POST` | `/` | Admin | Tạo coupon |
| `PATCH` | `/:couponId` | Admin | Cập nhật coupon |
| `DELETE` | `/:couponId` | Admin | Xóa coupon nếu chưa có usage |

Body validate:

```json
{
  "code": "SAVE10",
  "cartSubtotal": 200000,
  "hasPrescriptionItems": false,
  "items": [
    {
      "productId": "665...",
      "unit": "box",
      "quantity": 1,
      "totalPrice": 200000,
      "prescriptionRequired": false
    }
  ]
}
```

Body apply:

```json
{
  "code": "SAVE10",
  "selectedSubtotal": 200000,
  "selectedItems": [
    {
      "productId": "665...",
      "unit": "box"
    }
  ]
}
```

Body create/update coupon:

```json
{
  "code": "VITAMIN10",
  "name": "Giảm vitamin",
  "description": "Giảm cho nhóm vitamin",
  "type": "percentage",
  "value": 10,
  "minOrderAmount": 100000,
  "maxDiscountAmount": 50000,
  "totalUsageLimit": 1000,
  "perUserLimit": 1,
  "isPublic": true,
  "excludePrescriptionItems": true,
  "targetUserIds": [],
  "applicableProductIds": [],
  "applicableCategoryIds": ["665..."],
  "startDate": "2026-06-05T00:00:00.000Z",
  "endDate": "2026-07-05T00:00:00.000Z",
  "isActive": true
}
```

### 6.2 Loyalty API

Base path:

```http
/loyalty
```

| Method | Endpoint | Quyền | Mô tả |
|--------|----------|-------|-------|
| `GET` | `/account` | User | Lấy loyalty account của chính user |
| `GET` | `/transactions` | User | Lịch sử giao dịch điểm của user |
| `POST` | `/redeem` | User | Redeem points nếu flow dùng endpoint riêng |
| `GET` | `/admin/accounts` | Admin | Danh sách loyalty accounts |
| `GET` | `/admin/accounts/:userId` | Admin | Chi tiết loyalty account |
| `POST` | `/admin/accounts/:userId/adjust-points` | Admin | Điều chỉnh điểm thủ công |

Body admin adjustment:

```json
{
  "action": "add",
  "points": 1000,
  "reason": "Bù điểm do lỗi thanh toán"
}
```

---

## 7. Quy tắc tính toán

### 7.1 Coupon eligible subtotal

Nếu coupon không target product/category:

```text
eligibleSubtotal = selectedSubtotal hoặc order subtotal
```

Nếu coupon target product/category:

```text
eligibleSubtotal = sum(totalPrice của item match product/category target)
```

Nếu `eligibleSubtotal <= 0`, reject:

```text
Mã giảm giá không áp dụng cho sản phẩm đã chọn.
```

### 7.2 Percentage coupon

```text
discountAmount = floor(eligibleSubtotal * value / 100)
discountAmount = min(discountAmount, maxDiscountAmount nếu có)
discountAmount = min(discountAmount, eligibleSubtotal)
```

### 7.3 Fixed coupon

```text
discountAmount = min(value, eligibleSubtotal)
```

### 7.4 Freeship coupon

```text
discountAmount = 0
shippingDiscountAmount = shippingFee trước khi giảm
shippingFee = 0
```

Freeship không allocate vào item discount.

### 7.5 Points redeem cap

```text
remainingAfterCoupon = max(0, subtotal - couponDiscountAmount)
pointsRedeemAmount = min(requestedPoints, balance, remainingAfterCoupon)
```

Không cho points làm `totalAmount` âm.

### 7.6 Allocation coupon theo item

Với coupon không target:

```text
eligibleItems = all order items
```

Với coupon target:

```text
eligibleItems = items match applicableProductIds hoặc applicableCategoryIds snapshot
```

Phân bổ theo tỷ trọng:

```text
itemAllocation = floor(couponDiscountAmount * item.totalPrice / eligibleSubtotal)
```

Remainder phân bổ thêm từng đồng vào item eligible có `totalPrice > 0`.

### 7.7 Allocation points theo item

Points allocation theo toàn bộ order items:

```text
itemPointsAllocation = floor(pointsRedeemAmount * item.totalPrice / subtotal)
```

Remainder phân bổ tương tự.

---

## 8. Frontend liên quan

### 8.1 Customer FE

Các màn hình/component:

| File | Vai trò |
|------|--------|
| `CouponInput` | Nhập/apply/remove coupon |
| `PointsRedeemInput` | Redeem points ở checkout |
| `ShoppingCartPage` | Tính selected subtotal và truyền selected items |
| `CheckoutPage` | Reuse coupon input và points input |
| `OrderDetailPage` | Hiển thị coupon/points/freeship |
| `RewardsPage` | Hiển thị tier, balance, transactions |
| `ReturnRequestDetailsSheet` | Hiển thị refund breakdown |

Yêu cầu UX:

- Khi coupon không áp dụng cho item đã chọn, hiển thị message từ BE.
- Khi coupon freeship, nên hiển thị số tiền tiết kiệm shipping nếu có snapshot.
- Khi refund thấp hơn giá gốc, phải hiển thị coupon/points deduction.
- Không mô tả logic bằng text dài trong app, ưu tiên breakdown số liệu rõ ràng.

### 8.2 Admin FE

Các màn hình/component:

| File | Vai trò |
|------|--------|
| `CouponManagementPage` | CRUD coupon, target user/category/product |
| `LoyaltyManagementPage` | Xem account, adjustment points |
| `OrderDetailsDrawer` | Xem order benefit/refund |
| `ReturnManagementPage` | Xử lý return/refund |

Yêu cầu UX:

- Coupon target không nhập raw ObjectId.
- User/product selector phải có search.
- Category selector phải thể hiện hierarchy.
- Coupon đã dùng nên hướng admin deactivate thay vì delete.
- Admin adjustment points phải bắt reason.

---

## 9. Migration, index và dữ liệu cũ

### 9.1 Backfill `userUsageCounts`

Mục tiêu:

- Coupon cũ có redemption nhưng chưa có `userUsageCounts` phải được backfill.
- `currentUsageCount` phải khớp redemption count.
- Coupon không có redemption reset usage counts về empty.

Sau backfill:

- `userUsageCounts` là source of truth cho per-user limit.
- `coupon_redemptions` là audit trail.

### 9.2 Verify indexes

Index verification phải chạy thật, không silent fail.

Index quan trọng:

| Collection | Index |
|------------|-------|
| `coupons` | `code` unique |
| `coupons` | active/date filters |
| `coupon_redemptions` | order/coupon unique |
| `coupon_redemptions` | `couponId`, `userId`, `orderId` |
| `loyalty_transactions` | `userId`, `orderId`, `type` |
| `orders` | `userId`, `orderStatus`, `paymentStatus`, `orderNumber` |
| `categories` | `path`, `parentId` |

Nếu index không tạo được ở startup/migration, cần log rõ và fail tùy môi trường.

---

## 10. Test matrix

### 10.1 Automated tests

BE đã có coverage cho:

- Coupon validation basic rules.
- Per-user limit bằng `userUsageCounts`.
- Coupon redemption reserve/release.
- Backfill `userUsageCounts`.
- Verify indexes.
- Order payment fail/cancel side effects.
- Return refund allocation.
- Product target discount chỉ tính item eligible.
- Category target áp dụng category con.
- Cart selected items Rx exclusion.

FE đã verify:

- Typecheck.
- Component/service tests hiện có.
- Production build.

### 10.2 Manual E2E trước production

Coupon admin:

1. Tạo percentage coupon public không target.
2. Tạo fixed coupon private target user.
3. Tạo coupon target category cha.
4. Tạo coupon target product cụ thể.
5. Tạo freeship coupon.
6. Edit coupon và kiểm tra payload lưu đúng.
7. Delete coupon chưa dùng.
8. Delete coupon đã dùng phải bị chặn.
9. Deactivate coupon đã dùng.

Cart/checkout:

1. Cart có 3 item, chọn 1 item eligible product target.
2. Category cha target, product nằm category con vẫn apply.
3. Cart có Rx + non-Rx, coupon exclude Rx:
   - chọn cả hai: reject
   - chỉ chọn non-Rx: apply
4. Apply 2 discount coupon: reject.
5. Apply discount coupon + freeship: success.
6. Checkout revalidate sau khi admin deactivate coupon.
7. Direct buy coupon validate không lưu cart.

Order/refund:

1. Order có product target coupon, refund item eligible.
2. Order có product target coupon, refund item không eligible.
3. Order có category target coupon, refund category child item.
4. Order có points redeemed, partial refund.
5. Order có freeship coupon, cancel/payment fail release usage.
6. Delivered/returned/cancelled không chuyển ngược status.

Loyalty:

1. Earn points sau delivered.
2. Redeem points ở checkout.
3. Cancel order hoàn redeemed points.
4. Return order revoke earned points nếu đã earn.
5. Admin add points có reason.
6. Admin subtract points quá balance phải reject.

---

## 11. Verification commands

BE:

```bash
npm run build
npm test
```

FE:

```bash
npm run typecheck
npm test -- --run
npm run build
```

Kết quả gần nhất:

- BE test: 18 files, 336 tests passed.
- BE build: passed.
- FE typecheck: passed.
- FE test: 4 files, 23 tests passed.
- FE build: passed.

FE build hiện có warning sourcemap cũ ở `src/components/ui/*`, không phải lỗi build.

---

## 12. Known decisions

### 12.1 Đã quyết định

- `userUsageCounts` là source of truth cho per-user coupon limit.
- `coupon_redemptions` là audit trail.
- Category target áp dụng cả category con.
- Min order amount của target coupon tính trên `eligibleSubtotal`.
- Coupon target admin dùng selector/search.
- Coupon đã có usage không xóa vật lý.
- Order/refund dùng snapshot, không tính lại từ config hiện tại.
- Refund partial dùng net allocation.
- Admin adjustment points phải có reason.

### 12.2 Chưa quyết định

#### Loyalty program config

Hiện tier/rate hard-code trong BE. Không nên cho admin sửa loyalty program thật sự nếu chưa có config versioned.

Thiết kế đề xuất collection `loyalty_program_configs`:

```ts
{
  _id: ObjectId,
  version: number,
  status: 'draft' | 'published' | 'archived',
  effectiveFrom: Date,
  effectiveTo?: Date,
  tiers: Array<{
    code: 'bronze' | 'silver' | 'gold' | 'platinum',
    name: string,
    minLifetimePoints: number,
    earnRate: number,
    redeemRate: number,
    maxRedeemPercent?: number
  }>,
  expiryPolicy?: {
    enabled: boolean,
    months: number
  },
  createdBy: ObjectId,
  publishedBy?: ObjectId,
  createdAt: Date,
  updatedAt: Date
}
```

Rule đề xuất:

- Chỉ một published config active tại một thời điểm.
- Draft có thể sửa, published không sửa trực tiếp.
- Publish config mới phải audit.
- Order snapshot:
  - `programConfigVersion`
  - `tierAtOrder`
  - `earnRateAtOrder`
  - `redeemRateAtOrder`
- Return/refund dùng snapshot, không dùng config mới.

#### Points expiry

Chưa quyết định:

- Điểm có hết hạn hay không.
- Hết hạn theo transaction hay theo account.
- Có notification trước khi hết hạn không.
- Có grace period không.

#### Coupon abuse policy

Chưa quyết định:

- Có giới hạn số lần apply fail theo user/IP không.
- Có lock coupon input tạm thời khi brute force code không.
- Có alert admin khi một coupon dùng tăng bất thường không.

---

## 13. Production checklist

Trước release:

- Chạy full BE/FE tests và builds.
- Chạy migration/backfill coupon usage trên staging.
- Verify indexes trên staging DB.
- Manual E2E theo test matrix.
- Kiểm tra order snapshot trong Mongo sau order thật.
- Kiểm tra refund partial với order có coupon target và points.
- Kiểm tra email xác nhận hiển thị coupon/points nếu template đã update.
- Kiểm tra admin cannot delete used coupon.
- Kiểm tra logs không có silent coupon validation failure.
- Backup DB trước migration production.

Sau release:

- Monitor coupon validation failures.
- Monitor discrepancy giữa `currentUsageCount` và redemption count.
- Monitor loyalty balance âm.
- Monitor refund amount âm hoặc lớn hơn gross.
- Monitor order có `discountAmount` nhưng item allocations rỗng.
- Monitor duplicate redemption errors.
- Monitor support tickets liên quan coupon target/points refund.

---

## 14. Rủi ro cần theo dõi

- Product đổi category sau khi order tạo: đã giảm rủi ro bằng snapshot `categoryId` và expanded category ids.
- Coupon config bị sửa sau order: order snapshot giúp refund ổn định.
- Cart selected items khác checkout items: checkout revalidate lại coupon.
- Retry payment/order callback: side effects phải idempotent.
- Admin target coupon quá rộng: UI cần hiển thị target rõ trước khi save.
- Loyalty config hard-code: cần chuyển sang versioned config trước khi cho admin sửa chương trình.
- Fixed coupon trên eligible subtotal nhỏ có thể khiến user thấy giảm thấp hơn kỳ vọng; UI cần message rõ.
- Freeship không allocate item nên refund shipping cần rule riêng nếu sau này hỗ trợ refund shipping.

---

## 15. Files chính

BE:

- `src/models/schemas/Coupon.schema.ts`
- `src/models/schemas/CouponRedemption.schema.ts`
- `src/models/schemas/Order.schema.ts`
- `src/services/coupons.services.ts`
- `src/services/orders.services.ts`
- `src/services/loyalty.services.ts`
- `src/services/couponUsageBackfill.services.ts`
- `src/controllers/coupons.controllers.ts`
- `src/controllers/loyalty.controllers.ts`
- `src/routes/coupons.routes.ts`
- `src/routes/loyalty.routes.ts`
- `src/tests/coupons.services.test.ts`
- `src/tests/orders.benefits.test.ts`
- `src/tests/returnRequests.allocations.test.ts`
- `src/tests/loyaltyCoupon.integration.test.ts`

FE:

- `src/components/admin/CouponManagementPage.tsx`
- `src/components/admin/LoyaltyManagementPage.tsx`
- `src/components/admin/OrderDetailsDrawer.tsx`
- `src/components/discount/CouponInput.tsx`
- `src/components/cart/CheckoutPage.tsx`
- `src/components/cart/ShoppingCartPage.tsx`
- `src/components/order/OrderDetailPage.tsx`
- `src/components/returns/ReturnRequestDetailsSheet.tsx`
- `src/components/loyalty/RewardsPage.tsx`
- `src/services/orderService.ts`
- `src/types/order.ts`

---

## 16. Hướng phát triển tiếp theo

Ưu tiên đề xuất:

1. Manual E2E với dữ liệu thật.
2. Merge/push feature commits mới vào develop.
3. Thiết kế và implement `loyalty_program_configs`.
4. Admin UI Loyalty Program config dạng draft/publish.
5. Playwright E2E cho coupon/points/refund.
6. Dashboard audit cho coupon usage và loyalty transactions.
7. Alert/monitor cho coupon abuse và loyalty balance anomaly.

