# 💬 Test Perspectives — Cart, Checkout & Payment (MediSpace)

> **Format:** Cuộc trò chuyện của QA team — mỗi người mang một lens riêng.
> **10 Lenses covered:** Happy Path · Boundary · Error/Failure · Angry User · Malicious User · Performance · Business Rules · Data Integrity · Integrations · MediSpace-specific

---

## 👥 Thành viên

| Avatar | Vai | Lens chính |
|--------|-----|------------|
| 🧪 **Minh** | QA Functional | Happy path, Business rules |
| 📐 **Bảo** | QA Boundary | Edge cases, Limits, Zero values |
| 💥 **Khoa** | QA Failure | Error handling, Network, Server down |
| 😤 **Tú** | QA Angry User | Spam, Double-click, Multi-tab, Back button |
| 🔐 **An** | QA Security | Malicious user, IDOR, Bypass, Tampering |
| 🚀 **Hà** | QA Performance | Race condition, Flash sale, Large cart |
| 🔢 **Duyên** | QA Data Integrity | Totals, Inventory sync, No duplicates |
| 🔌 **Phong** | QA Integration | Payment gateway, Notifications, GHN |
| 💊 **Nam** | QA Domain | Prescription gate, Controlled drugs |

---

## 🔴 LENS 1 — HAPPY PATH

*🧪 Minh chủ trì*

---

**🧪 Minh:**
Bắt đầu từ cái cơ bản nhất — user bình thường, mọi thứ đều đúng.

### 1.1 Add to Cart

```
✅ User đăng nhập → search product → click "Thêm vào giỏ" → toast success
✅ Quantity mặc định = 1, unit = default variant
✅ Icon giỏ hàng trên navbar tăng lên 1
✅ Vào /cart → thấy item vừa thêm với đúng giá
✅ Thêm cùng product+unit lần 2 → quantity cộng dồn (không tạo item mới)
✅ Thêm cùng product nhưng unit khác → 2 item riêng biệt
✅ Guest user → thêm vào giỏ được (sessionId cookie được set)
```

### 1.2 Cart Management

```
✅ Chọn checkbox item → tick ✓, tổng tiền bên phải cập nhật
✅ Select all → tất cả items được chọn, tổng = toàn bộ cart
✅ Bỏ chọn 1 item → tổng giảm đúng giá item đó
✅ Tăng quantity item → tổng tăng, không vượt stock
✅ Giảm quantity về 1 → vẫn giữ item
✅ Đổi unit (Viên → Hộp) → giá cập nhật theo priceVariant của Hộp
✅ Xóa 1 item → giỏ cập nhật, còn lại items khác
✅ Clear cart → giỏ rỗng, tổng = 0
```

### 1.3 Checkout — COD

```
✅ Click "Thanh toán" → redirect /cart/checkout với selected items
✅ Checkout page load: address form pre-filled từ saved address
✅ Tỉnh/huyện/xã dropdown từ GHN: chọn Hà Nội → quận được filter
✅ GHN trả shipping options (Standard/Fast/Express) → hiển thị đúng phí
✅ Subtotal ≥ 300,000đ → tự động shippingFee = 0 (badge "Miễn phí")
✅ Chọn COD → không có payment URL
✅ Click "Đặt hàng" → spinner → API call → toast success
✅ Redirect /order/success → thấy order number, tổng tiền, địa chỉ, phương thức
✅ Email confirmation gửi đến địa chỉ email trong shipping address
✅ /account/orders → order mới ở trạng thái "Chờ xác nhận"
```

### 1.4 Checkout — VNPay

```
✅ Chọn VNPay → click "Đặt hàng" → nhận paymentUrl
✅ window.location.href = paymentUrl → browser redirect sang VNPay
✅ Điền thông tin thẻ, xác nhận → VNPay redirect về /payment/vnpay-return
✅ Backend verify chữ ký → update paymentStatus = 'paid'
✅ Cart items được xóa (chỉ các item đã mua)
✅ Email confirmation gửi
✅ Redirect về /order/success?paymentStatus=success
✅ Order status tự chuyển 'pending' → 'confirmed'
```

### 1.5 Checkout — PayOS

```
✅ Chọn PayOS → redirect sang PayOS checkout URL
✅ Thanh toán thành công → PayOS redirect về /payment/payos/return?orderId=...
✅ Backend verify → update paid → redirect FE
✅ PayOS webhook (IPN) cũng arrive → idempotent (không update 2 lần)
✅ Cart cleared, email sent
```

### 1.6 Order Lifecycle

```
✅ Admin: pending → confirmed → processing → shipped (+ trackingNumber) → delivered
✅ Khi delivered + COD: paymentStatus tự = 'paid'
✅ Khi delivered: loyaltyPoints được tích cho user
✅ User xem /account/orders → có thanh timeline status
```

### 1.7 Coupon

```
✅ Nhập mã "SAVE10" → validate → hiển thị -50,000đ trong summary
✅ Mã freeship → shippingFee = 0
✅ Apply discount coupon + freeship coupon cùng lúc → cả 2 áp dụng
✅ Remove coupon → discount biến mất, tổng tăng lại
✅ Tạo order → coupon được ghi nhận, currentUsageCount tăng 1
```

### 1.8 Loyalty Points

```
✅ User Silver (1.2x) mua đơn 500k → sau delivered: earn floor(500000/1000)*1.2 = 600 điểm
✅ User có 20,000 điểm → checkbox "Dùng điểm" → giảm 20,000đ
✅ Tổng tiền = subtotal - couponDiscount - pointsDiscount + shippingFee
✅ Cancel order → points được hoàn lại đúng số
```

---

## 📐 LENS 2 — BOUNDARY & EDGE CASES

*📐 Bảo chủ trì*

---

**📐 Bảo:**
Mình test mọi giới hạn và giá trị biên. Đây là nơi 80% bugs ẩn náu.

### 2.1 Quantity Boundaries

```
📐 quantity = 0  → reject (BE validator: min=1)
📐 quantity = 1  → accept (min valid)
📐 quantity = 10 → accept (max valid)
📐 quantity = 11 → reject (BE validator: max=10)
📐 quantity = -1 → reject

🔺 CUMULATIVE boundary (bug!):
📐 Cart có 7 units → thêm 3 → total = 10 ✅
📐 Cart có 7 units → thêm 4 → total = 11 → BE validator pass (chỉ check input=4, không check total!)
   → test xem có bị vượt limit không
```

### 2.2 Price & Amount Boundaries

```
📐 totalAmount = 0 (coupon + points cover 100%) → tạo order được, không fail
📐 totalAmount = 1đ (rất nhỏ) → VNPay/PayOS có accept không? (min amount limits)
📐 subtotal = 299,999đ → shippingFee > 0
📐 subtotal = 300,000đ → shippingFee = 0 (biên chính xác)
📐 subtotal = 300,001đ → shippingFee = 0
📐 Coupon percentage 100% → discount = subtotal (không âm)
📐 Fixed coupon value > subtotal → discount = subtotal (không âm)
📐 Floating point: 3 items × 33,333đ = 99,999đ (rounding)
```

### 2.3 Loyalty Points Boundaries

```
📐 pointsBalance = 0 → không thể redeem
📐 pointsBalance = 9,999 → dưới min 10,000 → không thể redeem
📐 pointsBalance = 10,000 → đúng min → redeem được
📐 pointsToRedeem = subtotal (100%) → bị cap bởi ratio 30%
📐 pointsToRedeem = floor(subtotal * 0.3) → đúng max
📐 pointsToRedeem = floor(subtotal * 0.3) + 1 → bị cap về max
📐 subtotal sau coupon = 0 → không thể redeem gì (maxPointsVnd = 0)
```

### 2.4 Cart Empty States

```
📐 Cart rỗng → /cart hiển thị empty state (illustration + nút mua sắm)
📐 Cart rỗng → click "Thanh toán" → nút bị disable hoặc toast error
📐 Cart có items nhưng không có item nào được chọn → "Thanh toán" → toast "Chưa chọn sản phẩm"
📐 Checkout page với selectedItems rỗng (không phải buy_now) → redirect về /cart
```

### 2.5 String Boundaries

```
📐 notes = "" (empty) → valid
📐 notes = 500 ký tự (max) → valid
📐 notes = 501 ký tự → reject
📐 shippingAddress.phone = "" → reject
📐 shippingAddress.email = "notanemail" → reject
📐 couponCode = "" → reject
📐 couponCode = ký tự đặc biệt "!@#$%" → reject gracefully
```

### 2.6 Stock Boundaries

```
📐 stockQuantity = 1, order quantity = 1 → success, stock = 0 sau đó
📐 stockQuantity = 1, order quantity = 2 → reject (insufficient stock)
📐 stockQuantity = 0 → không thể thêm vào giỏ
📐 Unit conversion: stockQuantity = 10 viên, order "1 Vỉ" (1 vỉ = 10 viên) → success, stock = 0
📐 Unit conversion: stockQuantity = 9 viên, order "1 Vỉ" (10 viên/vỉ) → reject
```

### 2.7 Coupon Boundaries

```
📐 Coupon startDate = now → valid
📐 Coupon endDate = now → invalid (qua đúng biên)
📐 totalUsageLimit = null → không giới hạn
📐 totalUsageLimit = 1, currentUsageCount = 0 → valid
📐 totalUsageLimit = 1, currentUsageCount = 1 → invalid
📐 perUserLimit = 1, user đã dùng 1 lần → invalid
📐 minOrderAmount = 300,000đ, subtotal = 299,999đ → invalid
📐 minOrderAmount = 300,000đ, subtotal = 300,000đ → valid
```

---

## 💥 LENS 3 — ERROR & FAILURE

*💥 Khoa chủ trì*

---

**💥 Khoa:**
Mọi thứ đều có thể fail. Server down, network drop, API timeout. Hỏi: hệ thống xử lý đẹp hay crash?

### 3.1 Network Failures

```
💥 getCart() → network timeout → hiển thị skeleton/error state, không crash app
💥 addToCart() → network drop → toast error "Không thể thêm", giỏ không thay đổi
💥 updateQuantity() → network drop → quantity revert về trước, toast error
💥 GHN API down khi load shipping options → fallback 3 options mặc định (30k/45k/60k)
💥 POST /orders → network timeout → spinner vẫn quay? hay timeout sau Xs? order có được tạo không?
💥 VNPay API down khi tạo payment URL → error message rõ, order không được tạo (hiện tại bug: order được tạo nhưng không có URL)
💥 PayOS API down → tương tự VNPay
```

### 3.2 Server Errors (5xx)

```
💥 GET /cart → 500 → cart không load, có error state không?
💥 POST /orders → 500 → toast error "Có lỗi xảy ra", không navigate đi
💥 POST /orders → 409 (hết hàng concurrent) → message "Sản phẩm vừa hết hàng" rõ ràng
💥 Payment return URL → orderService.updatePaymentStatus throws → redirect về fail page không crash
💥 Email service down → order vẫn được tạo thành công (email failure không rollback order)
💥 Socket.IO notification fail → order vẫn tạo được (fire-and-forget, không ảnh hưởng)
```

### 3.3 Payment Failures

```
💥 VNPay: user hủy giao dịch → redirect về với vnp_ResponseCode ≠ 00
   → order cancelled, stock restored, coupon/points refunded
   → UI: trang fail với nút "Thử lại"
💥 VNPay: thẻ không đủ tiền → response code fail → same flow
💥 PayOS: user đóng tab → cancel URL được gọi → order cancelled
💥 Payment URL expired (VNPay URL có expiry 15 phút): user quay lại sau 20 phút → URL invalid → hướng dẫn retry
💥 Order đã paid → gọi payment URL lần 2 → 400 "Order đã được thanh toán"
```

### 3.4 Database Failures

```
💥 Stock deduction: findOne product ok, nhưng updateOne timeout → order rolled back?
💥 Coupon recordCouponRedemption fail → order deleted, loyalty refunded → user thấy lỗi, không mất tiền
💥 loyaltyService.redeemPoints fail → tương tự rollback
💥 DB connection lost giữa chừng createOrder → order có thể partial state → cần check orphaned orders
```

### 3.5 GHN Integration Failures

```
💥 GHN calculateFee API down → fallback 30,000đ default, không throw
💥 GHN getProvinces fail → dropdown rỗng → user không thể chọn địa chỉ → có fallback UI không?
💥 GHN getShippingOptions fail → return [] → FE có hiển thị fallback options không?
💥 Invalid districtId/wardCode → GHN trả error → FE handle gracefully
```

---

## 😤 LENS 4 — ANGRY USER

*😤 Tú chủ trì*

---

**😤 Tú:**
Đây là những user không theo flow bình thường. Click loạn, back button, mở nhiều tab. Hệ thống phải chịu được.

### 4.1 Double-Click & Spam

```
😤 Double-click "Thêm vào giỏ" nhanh → 2 request cùng lúc → quantity tăng 2 hay 1?
   (addItem: nếu item đã có → cộng; 2 concurrent → race condition qty)
😤 Double-click "Đặt hàng" → 2 orders được tạo? (BUG #6 — không có idempotency key)
😤 Spam click coupon "Áp dụng" → nhiều request validate cùng lúc → UI hiển thị lỗi hay duplicate?
😤 Click "+" quantity 20 lần liên tục → 20 concurrent updateQuantity requests → final qty đúng không?
😤 Rapid click remove item → item bị remove nhiều lần → error hay idempotent?
```

### 4.2 Back Button

```
😤 Checkout → bấm Back → về cart → selected items vẫn còn không?
😤 Checkout → đặt hàng thành công → bấm Back → về checkout lại → không được tạo order thứ 2
😤 Redirect sang VNPay → bấm Back trên browser → về đâu? Checkout? Cart?
😤 Trên VNPay page → bấm Back → VNPay cancel → order cancelled? hay pending limbo?
😤 /order/success → bấm Back → về /cart/checkout (breadcrumb bug) → có re-order không?
```

### 4.3 Multi-Tab

```
😤 Tab 1: đang checkout với item A (qty=2)
   Tab 2: update qty của item A lên 10
   Tab 1: submit checkout → qty trong order là 2 hay 10?
   (Answer: order lấy từ filteredCartItems, refresh cart tại thời điểm createOrder → 10)

😤 Tab 1: apply coupon SAVE10
   Tab 2: remove coupon SAVE10
   Tab 1: submit checkout → coupon có được apply không?
   (Answer: createOrder re-validate từ cart DB → coupon đã bị remove → không apply)

😤 Tab 1: mở /cart
   Tab 2: mua cùng product → last item hết
   Tab 1: chưa biết → click checkout → CONFLICT 409
   → Tab 1 phải thấy message "sản phẩm vừa hết hàng"

😤 User login trên Tab 2 trong khi Tab 1 đang là guest cart
   → Tab 1 cart có merge không? (Cần custom event 'auth-changed' để trigger)
```

### 4.4 Rapid Navigation

```
😤 Click "Buy Now" → ngay lập tức click "Thêm vào giỏ" cùng product → race không?
😤 Checkout → navigate away → navigate back → form data có còn không? (React state lost)
😤 Thanh toán đang xử lý → user force refresh → order status là gì?
😤 Thêm vào giỏ → ngay lập tức xóa trước khi response về → cart state đúng không?
```

### 4.5 Session & Auth Edge Cases

```
😤 Token hết hạn giữa checkout (sau 1 giờ) → submit order → 401 → có redirect login không?
😤 Logout tab khác trong khi checkout → cart có clear không? (storage event handler)
😤 Login tab khác → cart context reload không?
😤 Session cookie hết hạn (7 ngày) → guest cart mất → UX thế nào?
```

---

## 🔐 LENS 5 — MALICIOUS USER

*🔐 An chủ trì*

---

**🔐 An:**
Đây là phần quan trọng nhất với một hệ thống thanh toán. Mình test như một attacker.

### 5.1 Price Manipulation

```
🔐 POST /cart/add với body: { productId, quantity: 1, unit: "Hộp", price: 1 }
   → giá trong giỏ phải là giá thật từ BE (price bị ignore)
   → VERIFY: kiểm tra cart.items[0].unitPrice = giá thật

🔐 POST /orders với body: { ..., shippingFee: 0 }
   → CRITICAL BUG: BE accept shippingFee từ FE
   → Expected: BE ignore hoặc validate

🔐 POST /orders với body: { ..., shippingFee: -999999 }
   → totalAmount tăng lên? (negative shipping?)
   → Expected: max(0, shippingFee)

🔐 POST /orders với body: { ..., totalAmount: 1 }
   → BE không có field totalAmount trong request, tự tính → safe
   → VERIFY: không có way nào inject totalAmount vào order
```

### 5.2 IDOR (Insecure Direct Object Reference)

```
🔐 GET /orders/<người khác's orderId> với token của user A
   → Expected: 404 (orderService.getOrderById checks userId match)
   → VERIFY: check cả ObjectId valid nhưng không phải của mình

🔐 PUT /orders/<người khác's orderId>/status { status: 'cancelled' }
   → CRITICAL BUG: không check ownership
   → Expected: 403 Forbidden
   → Actual: có thể cancel được

🔐 GET /orders/admin/all với token của customer thường (email đã verified)
   → CRITICAL BUG: không check role Admin
   → Expected: 403
   → Actual: trả về toàn bộ orders của hệ thống

🔐 DELETE /cart/remove/<productId của người khác> với sessionId của mình
   → Mình chỉ có cart của mình → người khác không bị ảnh hưởng (safe, isolated carts)

🔐 POST /orders/:orderId/payment-url với orderId của người khác
   → getPaymentUrl checks { _id: orderId, userId } → safe
```

### 5.3 Auth Bypass

```
🔐 POST /orders không có Authorization header → 401 (accessTokenValidator)
🔐 POST /orders với token giả → 401
🔐 POST /orders với token của unverified user → 401 (verifiedUserValidator)
🔐 GET /payment/vnpay-return không có token → PASS (public endpoint — intended)
   → nhưng có thể fake kết quả không? (xem Payment Tampering bên dưới)

🔐 Gọi coupon/apply không có token → optionalAuth: không có userId
   → coupon validate không có userId → sẽ fail tại perUserLimit check (userId undefined)
```

### 5.4 Payment Tampering

```
🔐 VNPay Return URL: thay đổi vnp_ResponseCode từ 97 → 00 (không đổi hash)
   → signature mismatch → phải fail

🔐 VNPay Return URL: replay URL của order khác (cùng hash secret, khác TxnRef)
   → HMAC includes all params → signature invalid

🔐 VNPay: vnp_Amount khác order.totalAmount nhưng signature hợp lệ (cùng 1 transaction)
   → BUG: BE không check amount match → mark paid với amount sai

🔐 PayOS Return URL: GET /payment/payos/return?orderId=<any_valid_id>&status=PAID
   → CRITICAL BUG: không verify signature → order được mark paid
   → Test: gửi request này với orderId của order pending → paid không?

🔐 PayOS IPN: POST với body không có valid signature
   → verifyPaymentWebhookData(body) throws → return { isSuccess: false }
   → Response 400 → OK

🔐 Replay PayOS IPN 3 lần → idempotency check (paymentStatus !== 'paid') → chỉ update 1 lần
```

### 5.5 Mass Assignment & Injection

```
🔐 POST /orders với extra fields: { orderStatus: 'delivered', paymentStatus: 'paid' }
   → Order schema constructor không set orderStatus từ payload → safe
   → orderStatus luôn = 'pending' khi tạo mới

🔐 POST /cart/add với productId: { "$gt": "" } (NoSQL injection)
   → ObjectId.isValid() check → reject 400

🔐 notes field: "<script>alert(1)</script>"
   → Stored trong DB nhưng khi render ở FE có escape không?
   → Check OrderDetailPage render notes field

🔐 couponCode: "' OR 1=1 --" (SQL-style, không áp dụng nhưng test graceful)
   → findOne({ code: "' OR 1=1 --" }) → không tìm thấy → 404

🔐 X-Session-Id header: forge sessionId của victim (nếu biết format)
   → Có thể access cart của victim không?
   → Depends on entropy of sessionId generation
```

### 5.6 Rate Limiting & Brute Force

```
🔐 POST /coupons/validate 100 lần/phút → rate limit có không?
   → BUG: không có rate limit → có thể enumerate valid codes
🔐 POST /orders 20 lần/phút → rate limit?
🔐 Brute-force coupon: SAVE01, SAVE02, ..., SAVE99 sequentially
🔐 Brute-force orderId (ObjectId incremental) qua GET /orders/:id
```

---

## 🚀 LENS 6 — PERFORMANCE

*🚀 Hà chủ trì*

---

**🚀 Hà:**
Server của mình có chịu được không khi traffic đột biến? Race condition là kẻ thù số 1.

### 6.1 Last Item Race Condition

```
🚀 Setup: Product A, stockQuantity = 1
   User 1 và User 2 đồng thời POST /orders với product A, quantity = 1
   → Cả 2 qua stock check (đọc stockQuantity = 1, đều ≥ 1)
   → User 1 atomic deduct: { $gte: 1 } → success, stock = 0
   → User 2 atomic deduct: { $gte: 1 } → fail (modifiedCount = 0)
   → User 2 rollback: stock restore + coupon release + order delete
   Expected: User 1 success 200, User 2 fail 409

🚀 Setup: stockQuantity = 5
   5 users đồng thời order 2 units mỗi người (total demand = 10 > 5)
   → Chỉ 2 users đầu tiên được, 3 còn lại 409
   → VERIFY: stock cuối = 5 - 4 = 1 (2 orders × 2 units)
```

### 6.2 Flash Sale Spike

```
🚀 Simulate 100 concurrent POST /orders vào cùng 1 sản phẩm flash sale (stock = 50)
   → Đúng 50 orders succeed, 50 orders 409
   → VERIFY: sau khi done, stock = 0 (không âm, không positive còn dư không đúng)
   → Response time P95 < 5s under load

🚀 GET /cart spike: 1000 concurrent users load cart cùng lúc
   → refreshCampaignPrices: N×product lookups per user → N×1000 DB reads
   → Response time không degrade quá 2s

🚀 POST /coupons/apply spike: 500 users apply cùng 1 coupon (perUserLimit = 1)
   → Atomic findOneAndUpdate → không có ai áp dụng 2 lần
   → currentUsageCount tăng đúng số user succeed
```

### 6.3 Large Cart Performance

```
🚀 Cart với 10 items (max) → getCart: refreshCampaignPrices gọi 10 × (findProduct + getActiveCampaign)
   → 20 DB calls per getCart → measure time
   → Acceptable threshold: < 800ms

🚀 POST /orders với 10 items:
   → 10 × (stock check + deduct) = 20 DB calls
   → + coupon validation + loyalty + order insert
   → Measure: < 3000ms

🚀 getAllOrders?limit=100 without index → full collection scan
   → With 10,000 orders → measure query time
   → Index cần thiết: { userId: 1, createdAt: -1 }
```

### 6.4 Concurrent Coupon Depletion

```
🚀 Coupon totalUsageLimit = 10, 20 users apply đồng thời
   → Atomic: findOneAndUpdate với condition → chỉ 10 user succeed
   → VERIFY: currentUsageCount = 10 sau khi done
   → Không có trường hợp count = 11 (over-redemption)

🚀 perUserLimit = 1, cùng 1 user gửi 5 concurrent apply requests
   → Chỉ 1 succeed, 4 fail với "đã dùng rồi"
   → userUsageCounts[userId] = 1 (không phải 5)
```

### 6.5 Loyalty Points Race

```
🚀 User có 15,000 điểm, 2 tab checkout cùng lúc đều dùng 15,000 điểm
   → atomic $gte check: 1 succeed (balance = 0), 1 fail (không đủ)
   → VERIFY: balance không âm
```

---

## 📊 LENS 7 — BUSINESS RULES

*🧪 Minh + 📐 Bảo cùng*

---

**🧪 Minh:**
Đây là business rules cần verify chính xác — đúng theo spec nghiệp vụ.

### 7.1 Pricing Rules

```
📊 Giá trong cart = giá từ BE (campaign price), không phải giá FE gửi lên
📊 Khi campaign hết hạn → getCart refreshCampaignPrices → giá cart cập nhật về giá gốc
📊 Campaign đang chạy → addToCart → giá trong cart = campaign price
📊 Tạo order → re-verify campaign price tại thời điểm checkout (có thể khác giá trong cart)
📊 Nhiều priceVariants: Viên 5,000đ, Vỉ 45,000đ, Hộp 400,000đ → chọn đúng theo unit
📊 VAT = 0 (đã gộp vào giá bán) → taxAmount = 0 trong order
```

### 7.2 Shipping Rules

```
📊 subtotal < 300,000đ → shippingFee > 0 (phụ thuộc method + GHN)
📊 subtotal >= 300,000đ → shippingFee = 0 (freeship tự động, bất kể method)
📊 Freeship coupon → shippingFee = 0, shippingDiscountAmount = original shippingFee
📊 Freeship tự động + freeship coupon: shippingFee = 0, shippingDiscountAmount = 0 (không có gì để giảm)
📊 Standard + GHN API: phí = GHN.calculateFee() với weight = 2kg
📊 Fast = 45,000đ cố định
📊 Express = 60,000đ cố định
📊 InStore = không có phí ship
```

### 7.3 Coupon Stacking Rules

```
📊 1 coupon giảm giá (percentage/fixed) tối đa mỗi cart
📊 1 coupon freeship tối đa mỗi cart
📊 Có thể stack 1 giảm giá + 1 freeship
📊 Không thể stack 2 giảm giá
📊 Không thể stack 2 freeship
📊 Coupon giảm giá áp trước → loyalty points áp sau (trên phần còn lại)
📊 Coupon chỉ giảm eligible items (applicableProductIds / applicableCategoryIds)
📊 excludePrescriptionItems: coupon không áp cho Rx drugs
```

### 7.4 Loyalty Tier Rules

```
📊 Member: 0-1,999,999đ totalSpent → multiplier 1x
📊 Silver: 2,000,000-9,999,999đ → multiplier 1.2x
📊 Gold: 10,000,000-49,999,999đ → multiplier 1.5x
📊 Platinum: ≥ 50,000,000đ → multiplier 2x
📊 Tier upgrade ngay khi totalSpent vượt ngưỡng (earnPointsFromOrder cập nhật totalSpent + tier)
📊 Tích điểm: floor(orderTotal / 1000) × tierMultiplier
📊 Điểm hết hạn sau 365 ngày kể từ ngày earn
📊 Min redeem: 10,000 điểm
📊 Max redeem: min(balance, floor(subtotal × 0.3))
```

### 7.5 Order Status Business Rules

```
📊 pending → confirmed: manual (admin) hoặc auto khi paymentStatus = 'paid'
📊 confirmed → processing: manual (admin)
📊 processing → shipped: manual (admin), phải có trackingNumber
📊 shipped → delivered: manual (admin)
📊 delivered: không thể cancel, chỉ có thể returned
📊 cancelled, returned: terminal — không chuyển tiếp
📊 COD + delivered: paymentStatus tự = 'paid'
📊 paymentStatus = 'failed': orderStatus tự = 'cancelled', rollback benefits
📊 paymentStatus = 'paid': orderStatus pending → confirmed (auto)
```

### 7.6 Stock Rules

```
📊 stockToDeduct = quantity × quantityPerUnit (unit conversion)
📊 Stock deduction atomic: { $gte: stockToDeduct } condition
📊 Rollback: deductedItems tracked, restore theo thứ tự
📊 Low stock alert: stockQuantity ≤ 30 sau deduct → Socket.IO notify admin
📊 Stock restore khi cancel/payment fail
📊 Stock không được âm (atomic guard)
```

---

## 🔢 LENS 8 — DATA INTEGRITY

*🔢 Duyên chủ trì*

---

**🔢 Duyên:**
Tôi không tin bất kỳ số nào cho đến khi verify được trong DB. Mình test toàn bộ invariants.

### 8.1 Cart Total Invariants

```
🔢 cart.subtotal = Σ(item.totalPrice) cho tất cả items
🔢 item.totalPrice = item.quantity × item.unitPrice
🔢 cart.totalAmount = subtotal - discountAmount - loyaltyDiscount + taxAmount + shippingFee
🔢 cart.itemCount = Σ(item.quantity)
🔢 cart.uniqueProductCount = items.length
🔢 cart.discountAmount = Σ(appliedCoupons.discountAmount) không tính free_shipping
🔢 cart.requiresPrescription = any(items.prescriptionRequired)

Test: thêm 3 items → verify tất cả totals trong DB khớp với công thức
Test: remove 1 item → verify lại
Test: apply coupon → verify discountAmount và totalAmount
```

### 8.2 Order Total Invariants

```
🔢 order.subtotal = Σ(item.totalPrice)
🔢 order.totalAmount = max(0, subtotal + taxAmount + shippingFee - discountAmount - pointsRedeemAmount)
🔢 order.taxAmount = 0 (always)
🔢 order.discountAmount = Σ(appliedCoupons.discountAmount) không tính free_shipping
🔢 order.shippingDiscountAmount = shippingFee của freeship coupon
🔢 discountAllocation của item: Σ(item.discountAllocation) = order.discountAmount (± rounding)
🔢 pointsAllocation của item: Σ(item.pointsAllocation) = order.pointsRedeemAmount (± rounding)

Test: tạo order phức tạp (coupon + points + nhiều items) → verify tất cả trong DB
```

### 8.3 Stock Integrity

```
🔢 Trước createOrder: product.stockQuantity = S
🔢 Sau createOrder: product.stockQuantity = S - (quantity × quantityPerUnit)
🔢 Sau cancel: product.stockQuantity = S (restored)
🔢 NEVER negative: product.stockQuantity >= 0 (atomic guard)
🔢 2 concurrent orders → final stock = S - deducted (không dư, không âm)

Test script: query stockQuantity trước và sau mỗi operation → verify delta
```

### 8.4 Coupon Usage Integrity

```
🔢 Sau apply coupon + tạo order: coupon.currentUsageCount tăng 1
🔢 Sau apply coupon + tạo order: coupon.userUsageCounts[userId] tăng 1
🔢 couponRedemptions collection: có 1 document với orderId đó
🔢 Sau cancel: currentUsageCount giảm 1, userUsageCounts[userId] giảm 1
🔢 Sau cancel: couponRedemptions document bị xóa
🔢 Không bao giờ âm: $max([0, count-1]) guard trong release
🔢 Idempotent: cancel 2 lần → count chỉ giảm 1 lần (check existing adjust transaction)
```

### 8.5 Loyalty Points Integrity

```
🔢 Sau redeem: loyaltyAccount.pointsBalance = old - pointsRedeemed
🔢 loyaltyTransaction(type='redeem'): balanceAfter = loyaltyAccount.pointsBalance
🔢 Sau earn (delivered): loyaltyAccount.pointsBalance tăng đúng
🔢 loyaltyTransaction(type='earn'): expiresAt = earnedAt + 365 days
🔢 Sau cancel+refund: loyaltyTransaction(type='adjust') được tạo
🔢 Balance không âm: atomic $gte guard
🔢 totalPointsEarned, totalPointsRedeemed cập nhật đúng
```

### 8.6 No Duplicate Orders

```
🔢 Cùng 1 user, double-click submit → có 2 orders trong DB không? (BUG #6)
🔢 Cùng 1 orderId, VNPay IPN + Return cùng arrive → paymentStatus chỉ update 1 lần
🔢 orderNumber unique: không có 2 orders cùng orderNumber
🔢 couponRedemption unique per (orderId, couponCode): không duplicate
🔢 loyaltyTransaction earn: idempotent per orderId
```

### 8.7 Cross-Module Consistency

```
🔢 Tạo order với 3 items từ cart → cart.items KHÔNG xóa ngay (với online payment)
🔢 Sau payment success → cart.items xóa đúng 3 items đó (không xóa items khác)
🔢 Order.items snapshot giá đúng tại thời điểm tạo (không thay đổi dù campaign thay đổi)
🔢 Order.items.prescriptionRequired đúng theo product.requiresPrescription tại thời điểm order
```

---

## 🔌 LENS 9 — INTEGRATIONS

*🔌 Phong chủ trì*

---

**🔌 Phong:**
Hệ thống phụ thuộc vào nhiều external service. Test từng integration point.

### 9.1 VNPay Integration

```
🔌 Môi trường sandbox: VNP_TMN_CODE, VNP_HASH_SECRET, VNP_URL đúng config
🔌 createPaymentUrl: tất cả required params có đủ không?
   → vnp_Version, vnp_Command, vnp_TmnCode, vnp_Amount (×100), vnp_ReturnUrl, vnp_TxnRef
🔌 vnp_Amount = order.totalAmount × 100 (verify conversion)
🔌 HMAC-SHA512 signature được tính đúng (test với VNPay test tool)
🔌 vnp_TxnRef = order._id.toString() (MongoDB ObjectId)
🔌 VNPay IPN: response format đúng { RspCode: '00', Message: 'Confirm Success' }
🔌 verifyReturn: sort params → stringify → HMAC → so sánh (giống VNPay docs)
🔌 IP address: x-forwarded-for parsing đúng khi qua reverse proxy
```

### 9.2 PayOS Integration

```
🔌 SDK init: PAYOS_CLIENT_ID, PAYOS_API_KEY, PAYOS_CHECKSUM_KEY
🔌 createPaymentLink: paymentData đủ fields (orderCode, amount, description, items, returnUrl, cancelUrl)
🔌 orderCode: Number, unique, fit trong integer limits (9 digits max)
🔌 description = "DH {orderNumber}".substring(0, 25)
🔌 returnUrl = backend URL (không phải FE direct)
🔌 verifyPaymentWebhookData(body): SDK verify signature → đúng/sai
🔌 Extract orderNumber từ description: "DH ORD-xxx" → replace "DH " → "ORD-xxx"
🔌 Lookup order bằng orderNumber khi webhook arrive
```

### 9.3 GHN Integration (Giao Hàng Nhanh)

```
🔌 getProvinces: response format { message, result: [...] }
🔌 getDistricts(provinceId): filter đúng theo province
🔌 getWards(districtId): filter đúng theo district
🔌 getShippingOptions({ to_district_id, to_ward_code, weight }): trả list options
🔌 calculateFee({ to_district_id, to_ward_code, weight, service_type_id })
🔌 Khi GHN API lỗi → catch → return [] hoặc null → FE fallback
🔌 Test với real Hà Nội address → fee hợp lý (không âm, không quá lớn)
```

### 9.4 Email Service

```
🔌 COD order: email gửi ngay sau createOrder
🔌 Online payment: email gửi trong handlePostPaymentSuccess
🔌 Email to: shippingAddress.email
🔌 Email content: có order number, items, total, shipping address
🔌 Email service down: order vẫn tạo thành công (try/catch ignore)
🔌 Invalid email format: vẫn gọi sendEmail → email service xử lý
```

### 9.5 Socket.IO Notifications

```
🔌 Admin nhận 'new_order' khi order được tạo
🔌 Pharmacist nhận 'new_order_prepare' khi order mới
🔌 Customer nhận 'order_placed' (notification) khi đặt hàng
🔌 Admin nhận 'low_stock_alert' khi stockQuantity ≤ 30
🔌 Customer nhận 'order_status_change' khi admin update status
🔌 Socket.IO chưa kết nối (getIO throws) → catch {} → order vẫn tạo
🔌 Test: socket connected → notification receive trong realtime
```

### 9.6 Recommendations Service

```
🔌 addToCart → recommendationsService.recordRealtimeEvent(userId)
🔌 Order delivered → recommendationsService.recordRealtimeEvent(userId)
🔌 Service down → void + .catch → không ảnh hưởng order flow
```

---

## 💊 LENS 10 — MEDISPACE-SPECIFIC (PHARMACY DOMAIN)

*💊 Nam chủ trì*

---

**💊 Nam:**
Đây là nơi MediSpace khác biệt hoàn toàn với e-commerce thông thường. Sai ở đây là sai pháp lý.

### 10.1 Prescription Gate (CRITICAL GAP)

```
💊 Hiện trạng: không có enforcement — phải document và escalate
💊 Test what exists:
   → Thuốc kê đơn (requiresPrescription=true) CÓ THỂ thêm vào giỏ: PASS/FAIL?
   → Thuốc kê đơn CÓ THỂ checkout và tạo order: PASS/FAIL?
   → Kết quả expected sau khi implement: REJECT với "Cần đơn thuốc"

💊 Test prescriptionRequired flag propagation:
   → product.requiresPrescription = true
   → cartItem.prescriptionRequired = true ✅ (khi addToCart)
   → cart.requiresPrescription = true ✅ (khi calculateTotals)
   → orderItem.prescriptionRequired = true ✅ (khi createOrder)
   → Coupon excludePrescriptionItems: true + order có Rx → coupon rejected ✅

💊 refreshCampaignPrices BUG: prescriptionRequired không được refresh
   → Product thay đổi requiresPrescription sau khi item đã vào giỏ
   → cartItem.prescriptionRequired vẫn là giá trị cũ
   → Coupon có thể bị bypass
```

### 10.2 Quantity Limits for Controlled Substances

```
💊 product.maxOrderQuantity field tồn tại nhưng không được enforce trong createOrder
💊 Test: set maxOrderQuantity = 2, order quantity = 5 → phải bị reject (hiện tại không reject)
💊 Accumulative limit: không có cơ chế kiểm tra user đã mua bao nhiêu trong tháng
💊 Test: 10 đơn × 10 units = 100 units trong 1 tháng → không bị chặn

💊 Boundary: max quantity = 10 (hard-coded BE/FE)
   → Thuốc kiểm soát: cần max nhỏ hơn (ví dụ 2/đơn)
   → Hiện tại không có per-product limit enforcement
```

### 10.3 Pharmacist Workflow

```
💊 Đơn hàng mới → pharmacist nhận Socket.IO notification "cần chuẩn bị thuốc"
💊 Pharmacist truy cập /pharmacist/orders → thấy order mới
💊 Pharmacist confirm order (business flow ngoài scope code hiện tại?)
💊 Prescription review: nếu có prescription → pharmacist review và approve/reject
   → Hiện tại feature này chưa implement
```

### 10.4 Campaign & Drug Pricing

```
💊 Campaign áp dụng cho thuốc kê đơn: có bị chặn không?
   → getActiveCampaignForProduct nhận requiresPrescription flag
   → Campaign config có thể exclude Rx drugs không?
   
💊 Thuốc OTC (Over-the-counter): không cần prescription → flow bình thường ✅
💊 Thuốc kê đơn trong campaign → giá giảm → user order được (chưa có prescription gate)
```

### 10.5 Coupon & Prescription Interaction

```
💊 Coupon với excludePrescriptionItems = true:
   → Cart có Rx drug + OTC → coupon chỉ apply cho OTC items
   → Eligible subtotal = chỉ OTC items tổng cộng
   → Verify eligibleSubtotal tính đúng
   
💊 Cart chỉ có Rx drugs + coupon excludePrescriptionItems = true:
   → eligibleSubtotal = 0 → discount = 0 → coupon rejected (minOrderAmount không met)

💊 Cart chỉ có OTC + coupon không có excludePrescriptionItems:
   → Áp dụng bình thường
```

### 10.6 Compliance Logging (Gap Analysis)

```
💊 NEED TO TEST (audit trail for regulators):
   → Ai đã mua thuốc X, số lượng bao nhiêu, ngày nào?
   → Order history có đủ để báo cáo cơ quan quản lý không?
   → Không có audit log riêng cho controlled substances

💊 Data Retention:
   → Orders có TTL không? (không nên xóa)
   → CouponRedemptions có được giữ không? (cần cho audit)

💊 Regulatory Gaps to Escalate:
   1. Thông tư 27/2021/TT-BYT: cần prescription verification trước khi bán
   2. Không có age verification (thuốc không dùng cho trẻ em)
   3. Không giới hạn purchase frequency (monthly limit for controlled drugs)
   4. Không có pharmacist sign-off trước khi dispatch
```

---

## 📋 LENS COVERAGE MATRIX

| Test Area | L1 Happy | L2 Boundary | L3 Failure | L4 Angry | L5 Malicious | L6 Perf | L7 Business | L8 Integrity | L9 Integration | L10 Domain |
|-----------|:--------:|:-----------:|:----------:|:--------:|:------------:|:-------:|:-----------:|:------------:|:--------------:|:----------:|
| Add to Cart | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | - | ✅ |
| Cart Management | ✅ | ✅ | ✅ | ✅ | ✅ | - | ✅ | ✅ | - | ✅ |
| Checkout Form | ✅ | ✅ | ✅ | ✅ | ✅ | - | ✅ | - | ✅ | ✅ |
| Shipping Fee | ✅ | ✅ | ✅ | - | ✅ | - | ✅ | ✅ | ✅ | - |
| Coupon | ✅ | ✅ | ✅ | 😤 | ✅ | ✅ | ✅ | ✅ | - | ✅ |
| Loyalty Points | ✅ | ✅ | ✅ | - | - | ✅ | ✅ | ✅ | - | - |
| COD Payment | ✅ | - | ✅ | ✅ | - | - | ✅ | ✅ | ✅ | - |
| VNPay | ✅ | ✅ | ✅ | ✅ | ✅ | - | ✅ | ✅ | ✅ | - |
| PayOS | ✅ | ✅ | ✅ | - | ✅ | - | ✅ | ✅ | ✅ | - |
| Order Status | ✅ | ✅ | ✅ | - | ✅ | - | ✅ | ✅ | ✅ | ✅ |
| Stock/Inventory | ✅ | ✅ | ✅ | - | - | ✅ | ✅ | ✅ | - | ✅ |
| Prescription | - | - | - | - | - | - | - | - | - | ✅ |

---

## 🎯 TEST EXECUTION PRIORITY

**P0 — Block release nếu fail:**
- Stock race condition (last item)
- Payment amount verification (VNPay)
- Admin route access control
- PayOS return URL bypass
- No duplicate orders
- Cart → Order total invariant

**P1 — Fix trong sprint:**
- Coupon validation edge cases
- Loyalty points boundaries
- Payment failure recovery flow
- Silent coupon drop notification
- Double-click protection

**P2 — Fix khi có thời gian:**
- GHN integration fallbacks
- Multi-tab behavior
- Mobile UX
- Angry user scenarios

**P3 — Technical debt / Compliance:**
- Prescription enforcement
- maxOrderQuantity per product
- Rate limiting
- NoSQL injection
- Index performance
