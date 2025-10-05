# MediSpace Products API Documentation

## Tổng quan

Products API quản lý thông tin sản phẩm dược phẩm trong hệ thống MediSpace E-Commerce. API hỗ trợ quản lý thông tin sản phẩm, tồn kho, phân loại, và các mối quan hệ với categories và brands.

## Cấu trúc Database

### Product Schema
```typescript
{
  _id: ObjectId,
  name: string,              // Tên sản phẩm
  slug: string,              // URL-friendly slug
  sku: string,               // Mã sản phẩm (Stock Keeping Unit)
  barcode?: string,          // Mã vạch
  
  // Basic Information
  shortDescription: string,   // Mô tả ngắn
  categoryId: ObjectId,      // ID danh mục
  brandId?: ObjectId,        // ID thương hiệu
  
  // Inventory Summary
  stockQuantity: number,     // Số lượng tồn kho
  maxOrderQuantity: number,  // Số lượng tối đa mỗi đơn hàng
  
  // Product Status & Classification
  status: string,            // 'active' | 'discontinued' | 'out_of_stock'
  isActive: boolean,         // Trạng thái hoạt động
  requiresPrescription: boolean, // Yêu cầu đơn thuốc
  
  // Featured Media
  featuredImage?: string,    // Hình ảnh chính
  
  // Audit Information
  createdAt: Date,
  updatedAt: Date,
  createdBy: ObjectId,       // Người tạo
  lastModifiedBy: ObjectId   // Người sửa cuối
}
```

## API Endpoints

### 1. Tạo Product Mới
```
POST /products
Authorization: Bearer <access_token> (Admin/Pharmacist)
```

**Request Body:**
```json
{
  "name": "Paracetamol 500mg",
  "slug": "paracetamol-500mg", // Optional - auto generated
  "sku": "PFZ-PARA-123456", // Optional - auto generated
  "barcode": "1234567890123", // Optional
  "shortDescription": "Thuốc giảm đau, hạ sốt cho người lớn và trẻ em trên 12 tuổi",
  "categoryId": "64a7b2c1d4e5f6789abcdef1", // Required
  "brandId": "64a7b2c1d4e5f6789abcdef2", // Optional
  "stockQuantity": 100, // Optional, default: 0
  "maxOrderQuantity": 5, // Optional, default: 10
  "status": "active", // Optional, default: "active"
  "isActive": true, // Optional, default: true
  "requiresPrescription": false, // Optional, default: false
  "featuredImage": "https://example.com/paracetamol.jpg" // Optional
}
```

**Response:**
```json
{
  "message": "Product created successfully",
  "result": {
    "_id": "64a7b2c1d4e5f6789abcdef3",
    "name": "Paracetamol 500mg",
    "slug": "paracetamol-500mg",
    "sku": "PFZ-PARA-123456",
    "barcode": "1234567890123",
    "shortDescription": "Thuốc giảm đau, hạ sốt cho người lớn và trẻ em trên 12 tuổi",
    "categoryId": "64a7b2c1d4e5f6789abcdef1",
    "brandId": "64a7b2c1d4e5f6789abcdef2",
    "stockQuantity": 100,
    "maxOrderQuantity": 5,
    "status": "active",
    "isActive": true,
    "requiresPrescription": false,
    "featuredImage": "https://example.com/paracetamol.jpg",
    "createdAt": "2024-01-15T10:30:00.000Z",
    "updatedAt": "2024-01-15T10:30:00.000Z",
    "createdBy": "64a7b2c1d4e5f6789abcdef0",
    "lastModifiedBy": "64a7b2c1d4e5f6789abcdef0"
  }
}
```

### 2. Lấy Danh Sách Products
```
GET /products
```

**Query Parameters:**
- `page`: Số trang (default: 1)
- `limit`: Số lượng per page (default: 20, max: 100)
- `categoryId`: Filter theo danh mục
- `brandId`: Filter theo thương hiệu
- `status`: Filter theo trạng thái ("active" | "discontinued" | "out_of_stock")
- `isActive`: Trạng thái hoạt động ("true"/"false")
- `requiresPrescription`: Yêu cầu đơn thuốc ("true"/"false")
- `search`: Tìm kiếm theo tên, mô tả, SKU
- `sortBy`: Sắp xếp theo ("name" | "createdAt" | "stockQuantity" | "sku")
- `sortOrder`: Thứ tự sắp xếp ("asc" | "desc")
- `minStock`: Tồn kho tối thiểu
- `maxStock`: Tồn kho tối đa

**Response:**
```json
{
  "message": "Get products successfully",
  "result": {
    "products": [
      {
        "_id": "64a7b2c1d4e5f6789abcdef3",
        "name": "Paracetamol 500mg",
        "slug": "paracetamol-500mg",
        "sku": "PFZ-PARA-123456",
        "stockQuantity": 100,
        "category": {
          "_id": "64a7b2c1d4e5f6789abcdef1",
          "name": "Thuốc giảm đau",
          "slug": "thuoc-giam-dau"
        },
        "brand": {
          "_id": "64a7b2c1d4e5f6789abcdef2",
          "name": "Pfizer",
          "slug": "pfizer"
        },
        // ... other fields
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "totalPages": 5,
      "totalCount": 95
    }
  }
}
```

### 3. Lấy Product theo ID
```
GET /products/:productId
```

**Response:** Product với thông tin đầy đủ bao gồm category và brand data

### 4. Cập Nhật Product
```
PATCH /products/:productId
Authorization: Bearer <access_token> (Admin/Pharmacist)
```

**Request Body:** (Tương tự POST, tất cả fields đều optional)

### 5. Toggle Trạng Thái Product
```
PATCH /products/:productId/toggle-status
Authorization: Bearer <access_token> (Admin/Pharmacist)
```

**Request Body:**
```json
{
  "isActive": false
}
```

### 6. Cập Nhật Tồn Kho
```
PATCH /products/:productId/stock
Authorization: Bearer <access_token> (Admin/Pharmacist)
```

**Request Body:**
```json
{
  "stockQuantity": 50
}
```

### 7. Xóa Product
```
DELETE /products/:productId
Authorization: Bearer <access_token> (Admin only)
```

## Business Logic

### 1. SKU Generation
- Auto-generate từ brand name + product name + timestamp
- Format: `{BRAND_PREFIX}-{PRODUCT_CODE}-{TIMESTAMP}`
- Example: `PFZ-PARA-123456`
- Unique trong toàn bộ hệ thống

### 2. Slug Generation
- Auto-generate từ product name
- Loại bỏ dấu tiếng Việt, chuyển lowercase
- Thay spaces bằng hyphens
- Unique trong toàn bộ hệ thống

### 3. Stock Management
- stockQuantity = 0 → status auto change to 'out_of_stock'
- stockQuantity > 0 → status auto change to 'active'
- maxOrderQuantity giới hạn số lượng trong mỗi đơn hàng

### 4. Category & Brand Relationships
- categoryId is required - product must belong to a category
- brandId is optional - generic products can have no brand
- Auto update productCount trong categories và brands collections
- Validate category và brand phải active khi tạo/update product

### 5. Product Status Flow
- `active`: Sản phẩm đang bán
- `discontinued`: Ngừng sản xuất nhưng còn tồn kho
- `out_of_stock`: Hết hàng tạm thời

## Validation Rules

### 1. Product Information
- **name**: Required, 1-200 characters
- **shortDescription**: Required, 10-500 characters
- **sku**: Optional, 3-50 characters, format: [A-Z0-9-]+
- **barcode**: Optional, 8-50 characters

### 2. IDs Validation
- **categoryId**: Required, must be valid ObjectId and active category
- **brandId**: Optional, must be valid ObjectId and active brand
- **productId**: Must be valid ObjectId

### 3. Inventory Validation
- **stockQuantity**: Non-negative integer
- **maxOrderQuantity**: Positive integer

### 4. Status Validation
- **status**: Must be one of: active, discontinued, out_of_stock
- **isActive**: Boolean
- **requiresPrescription**: Boolean

## Error Codes

### 400 Bad Request
- Validation errors
- Invalid ObjectId format
- Business rule violations

### 404 Not Found
- Product not found
- Category not found
- Brand not found

### 409 Conflict
- Product name already exists
- SKU already exists
- Barcode already exists

### 403 Forbidden
- Insufficient permissions

## Examples Usage

### Tạo Product Cơ Bản
```bash
curl -X POST http://localhost:3000/products \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <admin_token>" \
  -d '{
    "name": "Aspirin 100mg",
    "shortDescription": "Thuốc giảm đau, kháng viêm, hạ sốt",
    "categoryId": "64a7b2c1d4e5f6789abcdef1",
    "brandId": "64a7b2c1d4e5f6789abcdef2",
    "stockQuantity": 200,
    "requiresPrescription": false
  }'
```

### Tìm Kiếm Products
```bash
# Tìm theo tên
curl "http://localhost:3000/products?search=paracetamol"

# Filter theo category và brand
curl "http://localhost:3000/products?categoryId=64a7b2c1d4e5f6789abcdef1&brandId=64a7b2c1d4e5f6789abcdef2"

# Filter theo tồn kho
curl "http://localhost:3000/products?minStock=10&maxStock=100"

# Products yêu cầu đơn thuốc
curl "http://localhost:3000/products?requiresPrescription=true"

# Sort theo tồn kho giảm dần
curl "http://localhost:3000/products?sortBy=stockQuantity&sortOrder=desc"
```

### Cập Nhật Tồn Kho
```bash
curl -X PATCH http://localhost:3000/products/{PRODUCT_ID}/stock \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <admin_token>" \
  -d '{
    "stockQuantity": 75
  }'
```

### Toggle Status
```bash
curl -X PATCH http://localhost:3000/products/{PRODUCT_ID}/toggle-status \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <admin_token>" \
  -d '{
    "isActive": false
  }'
```

## Advanced Features

### 1. Aggregated Data
Products API trả về thông tin đầy đủ với:
- Category information (name, slug)
- Brand information (name, slug)
- Tự động populate khi GET product by ID

### 2. Inventory Tracking
- Real-time stock updates
- Auto status change based on stock
- Integration với inventory management system

### 3. Search & Filtering
- Full-text search trên name, description, SKU
- Multi-field filtering
- Advanced sorting options
- Stock level filtering

## Performance Optimization

### 1. Database Indexing
```javascript
// Recommended indexes
{
  "name": "text",
  "shortDescription": "text",
  "sku": "text"
}
{
  "categoryId": 1,
  "isActive": 1
}
{
  "brandId": 1,
  "isActive": 1
}
{
  "stockQuantity": 1
}
{
  "status": 1,
  "isActive": 1
}
```

### 2. Aggregation Pipeline
- Sử dụng MongoDB aggregation để populate category và brand
- Efficient pagination với $facet
- Optimized sorting và filtering

### 3. Caching Strategy
- Cache popular products
- Cache category và brand lookups
- Redis cho session và frequent queries

## Testing với Postman

### Test Collection Structure

#### 1. Product CRUD Operations
```javascript
// Create Product Test
pm.test("Product created successfully", function () {
    pm.response.to.have.status(201);
    var jsonData = pm.response.json();
    pm.expect(jsonData.result).to.have.property('sku');
    pm.expect(jsonData.result.stockQuantity).to.be.a('number');
    pm.environment.set("product_id", jsonData.result._id);
});

// SKU Auto-generation Test
pm.test("SKU auto-generated if not provided", function () {
    var jsonData = pm.response.json();
    pm.expect(jsonData.result.sku).to.match(/^[A-Z]{3}-[A-Z0-9]+-[0-9]+$/);
});
```

#### 2. Validation Tests
```bash
# Test missing required fields
curl -X POST http://localhost:3000/products \
  -H "Content-Type: application/json" \
  -d '{"name": "Test Product"}' # Missing categoryId and shortDescription

# Test invalid category ID
curl -X POST http://localhost:3000/products \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Product",
    "shortDescription": "Test description",
    "categoryId": "invalid-id"
  }'
```

#### 3. Business Logic Tests
```bash
# Test duplicate SKU
curl -X POST http://localhost:3000/products \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Product 2",
    "sku": "EXISTING-SKU-123",
    "shortDescription": "Test description",
    "categoryId": "64a7b2c1d4e5f6789abcdef1"
  }'
```

## Integration với Các API Khác

### 1. Categories API
- Validate categoryId khi tạo product
- Auto update category.productCount
- Prevent category deletion if có products

### 2. Brands API
- Validate brandId khi tạo product (optional)
- Auto update brand.productCount
- Use brand name cho SKU generation

### 3. Orders API (Future)
- Stock deduction khi order confirmed
- Stock restoration khi order cancelled
- Inventory tracking

## Security Considerations

### 1. Authentication & Authorization
- Admin: Full CRUD access
- Pharmacist: Create, Read, Update (không Delete)
- Customer: Read-only access to active products

### 2. Data Validation
- Server-side validation cho tất cả inputs
- Sanitization cho search queries
- ObjectId validation

### 3. Business Rules Enforcement
- Category phải active khi assign cho product
- Brand phải active khi assign cho product
- Stock không thể âm

## Migration & Seeding

### Sample Products Data
```json
[
  {
    "name": "Paracetamol 500mg",
    "shortDescription": "Thuốc giảm đau, hạ sốt",
    "categoryId": "pain-relief-category-id",
    "brandId": "generic-brand-id",
    "stockQuantity": 1000,
    "requiresPrescription": false
  },
  {
    "name": "Amoxicillin 250mg",
    "shortDescription": "Kháng sinh điều trị nhiễm khuẩn",
    "categoryId": "antibiotics-category-id",
    "brandId": "pfizer-brand-id",
    "stockQuantity": 500,
    "requiresPrescription": true
  }
]
```

Sử dụng seeding script để tạo sample data cho development và testing.
