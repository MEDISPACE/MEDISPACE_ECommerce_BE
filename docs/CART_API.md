# MediSpace Cart API Documentation

## Tổng quan

Cart API quản lý giỏ hàng trong hệ thống MediSpace E-Commerce. API hỗ trợ cả người dùng đã đăng nhập (userId) và khách hàng chưa đăng nhập (sessionId), cho phép quản lý sản phẩm trong giỏ hàng, tính toán tổng tiền, và chuẩn bị dữ liệu cho thanh toán.

## Cấu trúc Database

### Cart Schema
```typescript
{
  _id: ObjectId,
  userId?: ObjectId,        // ID người dùng (optional cho guest)
  sessionId?: string,       // Session ID cho khách hàng chưa đăng nhập
  items: [
    {
      productId: ObjectId,   // ID sản phẩm
      quantity: number,      // Số lượng
      price: number,         // Giá tại thời điểm thêm
      addedAt: Date          // Thời gian thêm
    }
  ],
  totalAmount: number,      // Tổng tiền
  itemCount: number,        // Tổng số lượng sản phẩm
  createdAt: Date,
  updatedAt: Date
}
```

## API Endpoints

### 1. Lấy Giỏ Hàng
```
GET /cart
```

**Headers:**
- `Cookie: sessionId=<session_id>` (cho khách hàng chưa đăng nhập)

**Response:**
```json
{
  "message": "Get cart successfully",
  "result": {
    "_id": "64a7b2c1d4e5f6789abcdef3",
    "userId": "64a7b2c1d4e5f6789abcdef0", // null cho guest
    "sessionId": "00a81da7576b3b061a7045ba441d50bf6657ae857255bac4a6f70028a4fe6e45", // cho guest
    "items": [
      {
        "productId": "68fdf072cead1801068cf31f",
        "quantity": 2,
        "price": 456860,
        "addedAt": "2024-01-15T10:30:00.000Z",
        "product": {
          "name": "Paracetamol 500mg",
          "sku": "PFZ-PARA-123456",
          "featuredImage": "https://example.com/paracetamol.jpg",
          "stockQuantity": 100,
          "requiresPrescription": false
        }
      }
    ],
    "totalAmount": 913720,
    "itemCount": 2,
    "createdAt": "2024-01-15T10:30:00.000Z",
    "updatedAt": "2024-01-15T10:30:00.000Z"
  }
}
```

### 2. Thêm Sản Phẩm Vào Giỏ
```
POST /cart/add
```

**Headers:**
- `Cookie: sessionId=<session_id>` (cho khách hàng chưa đăng nhập)
- `Content-Type: application/json`

**Request Body:**
```json
{
  "productId": "68fdf072cead1801068cf31f",
  "quantity": 2
}
```

**Response:**
```json
{
  "message": "Add item to cart successfully",
  "result": {
    "_id": "64a7b2c1d4e5f6789abcdef3",
    "items": [
      {
        "productId": "68fdf072cead1801068cf31f",
        "quantity": 2,
        "price": 456860,
        "addedAt": "2024-01-15T10:30:00.000Z",
        "product": {
          "name": "Paracetamol 500mg",
          "sku": "PFZ-PARA-123456",
          "featuredImage": "https://example.com/paracetamol.jpg",
          "stockQuantity": 100,
          "requiresPrescription": false
        }
      }
    ],
    "totalAmount": 913720,
    "itemCount": 2
  }
}
```

### 3. Cập Nhật Số Lượng Sản Phẩm
```
PUT /cart/update/:productId
```

**Headers:**
- `Cookie: sessionId=<session_id>` (cho khách hàng chưa đăng nhập)
- `Content-Type: application/json`

**Request Body:**
```json
{
  "quantity": 3
}
```

**Response:**
```json
{
  "message": "Update item quantity successfully",
  "result": {
    "_id": "64a7b2c1d4e5f6789abcdef3",
    "items": [
      {
        "productId": "68fdf072cead1801068cf31f",
        "quantity": 3,
        "price": 456860,
        "addedAt": "2024-01-15T10:30:00.000Z",
        "product": {
          "name": "Paracetamol 500mg",
          "sku": "PFZ-PARA-123456",
          "featuredImage": "https://example.com/paracetamol.jpg",
          "stockQuantity": 100,
          "requiresPrescription": false
        }
      }
    ],
    "totalAmount": 1370580,
    "itemCount": 3
  }
}
```

### 4. Xóa Sản Phẩm Khỏi Giỏ
```
DELETE /cart/remove/:productId
```

**Headers:**
- `Cookie: sessionId=<session_id>` (cho khách hàng chưa đăng nhập)

**Response:**
```json
{
  "message": "Remove item from cart successfully",
  "result": {
    "_id": "64a7b2c1d4e5f6789abcdef3",
    "items": [],
    "totalAmount": 0,
    "itemCount": 0
  }
}
```

### 5. Xóa Toàn Bộ Giỏ Hàng
```
DELETE /cart/clear
```

**Headers:**
- `Cookie: sessionId=<session_id>` (cho khách hàng chưa đăng nhập)

**Response:**
```json
{
  "message": "Clear cart successfully",
  "result": {
    "_id": "64a7b2c1d4e5f6789abcdef3",
    "items": [],
    "totalAmount": 0,
    "itemCount": 0
  }
}
```

### 6. Lấy Dữ Liệu Checkout
```
GET /cart/checkout
```

**Headers:**
- `Cookie: sessionId=<session_id>` (cho khách hàng chưa đăng nhập)

**Response:**
```json
{
  "message": "Get checkout data successfully",
  "result": {
    "cart": {
      "_id": "64a7b2c1d4e5f6789abcdef3",
      "items": [
        {
          "productId": "68fdf072cead1801068cf31f",
          "quantity": 2,
          "price": 456860,
          "addedAt": "2024-01-15T10:30:00.000Z",
          "product": {
            "name": "Paracetamol 500mg",
            "sku": "PFZ-PARA-123456",
            "featuredImage": "https://example.com/paracetamol.jpg",
            "stockQuantity": 100,
            "requiresPrescription": false
          }
        }
      ],
      "totalAmount": 913720,
      "itemCount": 2
    },
    "shippingFee": 30000,
    "taxAmount": 0,
    "discountAmount": 0,
    "finalAmount": 943720
  }
}
```

## Business Logic

### 1. Session Management
- Khách hàng chưa đăng nhập: Tạo sessionId ngẫu nhiên, lưu trong cookie
- Người dùng đã đăng nhập: Sử dụng userId từ JWT token
- Session tồn tại trong 30 ngày

### 2. Cart Creation
- Tự động tạo giỏ hàng mới khi GET /cart lần đầu cho guest
- Một user/session chỉ có một giỏ hàng active

### 3. Stock Validation
- Kiểm tra tồn kho trước khi thêm/cập nhật sản phẩm
- Không cho phép thêm vượt quá maxOrderQuantity
- Cập nhật stock khi order được confirm (future integration)

### 4. Price Calculation
- Lưu giá tại thời điểm thêm sản phẩm
- Tính tổng tiền real-time
- Hỗ trợ discount và tax calculation

### 5. Product Information
- Populate thông tin sản phẩm (name, sku, image, stock)
- Validate sản phẩm phải active và available

## Validation Rules

### 1. Product Validation
- **productId**: Required, valid ObjectId, sản phẩm phải active
- **quantity**: Required, positive integer, không vượt quá stock và maxOrderQuantity

### 2. Session/User Validation
- Phải có userId (từ auth) hoặc sessionId (từ cookie)
- Một trong hai phải có, không thể thiếu cả

### 3. Business Rules
- Sản phẩm phải có stock > 0
- Quantity không vượt quá maxOrderQuantity của sản phẩm
- Chỉ update quantity của sản phẩm đã có trong giỏ

## Error Codes

### 400 Bad Request
- Validation errors (invalid productId, quantity)
- Insufficient stock
- Product not found or inactive

### 404 Not Found
- Cart not found
- Product not found

### 409 Conflict
- Quantity exceeds maxOrderQuantity

## Examples Usage

### Thêm Sản Phẩm Cho Guest
```bash
curl -X POST http://localhost:8000/cart/add \
  -H "Content-Type: application/json" \
  -H "Cookie: sessionId=00a81da7576b3b061a7045ba441d50bf6657ae857255bac4a6f70028a4fe6e45" \
  -d '{
    "productId": "68fdf072cead1801068cf31f",
    "quantity": 2
  }'
```

### Lấy Giỏ Hàng
```bash
curl -X GET http://localhost:8000/cart \
  -H "Cookie: sessionId=00a81da7576b3b061a7045ba441d50bf6657ae857255bac4a6f70028a4fe6e45"
```

### Cập Nhật Số Lượng
```bash
curl -X PUT http://localhost:8000/cart/update/68fdf072cead1801068cf31f \
  -H "Content-Type: application/json" \
  -H "Cookie: sessionId=00a81da7576b3b061a7045ba441d50bf6657ae857255bac4a6f70028a4fe6e45" \
  -d '{
    "quantity": 3
  }'
```

### Xóa Sản Phẩm
```bash
curl -X DELETE http://localhost:8000/cart/remove/68fdf072cead1801068cf31f \
  -H "Cookie: sessionId=00a81da7576b3b061a7045ba441d50bf6657ae857255bac4a6f70028a4fe6e45"
```

### Xóa Giỏ Hàng
```bash
curl -X DELETE http://localhost:8000/cart/clear \
  -H "Cookie: sessionId=00a81da7576b3b061a7045ba441d50bf6657ae857255bac4a6f70028a4fe6e45"
```

### Lấy Dữ Liệu Checkout
```bash
curl -X GET http://localhost:8000/cart/checkout \
  -H "Cookie: sessionId=00a81da7576b3b061a7045ba441d50bf6657ae857255bac4a6f70028a4fe6e45"
```

## Advanced Features

### 1. Session Persistence
- Cookie-based session management
- 30-day expiration
- Secure và HttpOnly flags

### 2. Real-time Updates
- Auto calculation của totalAmount và itemCount
- Price locking tại thời điểm thêm

### 3. Inventory Integration
- Stock validation trước khi add/update
- Future: Stock deduction khi checkout

## Performance Optimization

### 1. Database Indexing
```javascript
// Recommended indexes
{
  "userId": 1,
  "sessionId": 1
}
{
  "updatedAt": 1
}
{
  "items.productId": 1
}
```

### 2. Aggregation Pipeline
- Populate product information efficiently
- Calculate totals trong database

### 3. Caching Strategy
- Cache product information
- Session store (Redis recommended)

## Testing với Postman

### Test Collection Structure

#### 1. Guest Cart Operations
```javascript
// Test guest cart creation
pm.test("Guest cart created", function () {
    pm.response.to.have.status(200);
    var jsonData = pm.response.json();
    pm.expect(jsonData.result).to.have.property('sessionId');
    pm.cookies.set("sessionId", jsonData.result.sessionId);
});

// Test add item
pm.test("Item added successfully", function () {
    var jsonData = pm.response.json();
    pm.expect(jsonData.result.items).to.have.lengthOf(1);
    pm.expect(jsonData.result.totalAmount).to.be.above(0);
});
```

#### 2. Validation Tests
```bash
# Test invalid product ID
curl -X POST http://localhost:8000/cart/add \
  -H "Content-Type: application/json" \
  -d '{"productId": "invalid-id", "quantity": 1}'

# Test insufficient stock
curl -X POST http://localhost:8000/cart/add \
  -H "Content-Type: application/json" \
  -d '{"productId": "68fdf072cead1801068cf31f", "quantity": 1000}'
```

## Integration với Các API Khác

### 1. Products API
- Validate product existence và stock
- Get product details cho cart items

### 2. Auth API
- Optional authentication cho cart operations
- User cart merge khi login (future)

### 3. Orders API (Future)
- Convert cart to order
- Stock deduction
- Cart cleanup sau successful order

## Security Considerations

### 1. Session Security
- Secure cookie flags
- Session ID generation using crypto.randomBytes
- Session expiration

### 2. Data Validation
- Server-side validation cho tất cả inputs
- ObjectId validation
- Quantity limits

### 3. Business Rules Enforcement
- Stock validation
- Product availability checks
- Session isolation

## Migration & Seeding

### Sample Cart Data
```json
{
  "userId": null,
  "sessionId": "00a81da7576b3b061a7045ba441d50bf6657ae857255bac4a6f70028a4fe6e45",
  "items": [
    {
      "productId": "68fdf072cead1801068cf31f",
      "quantity": 2,
      "price": 456860,
      "addedAt": "2024-01-15T10:30:00.000Z"
    }
  ],
  "totalAmount": 913720,
  "itemCount": 2
}
```

Sử dụng seeding script để tạo sample carts cho development và testing.
