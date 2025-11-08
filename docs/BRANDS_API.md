# MediSpace Brands API Documentation

## Tổng quan

Brands API quản lý thông tin các thương hiệu và nhà sản xuất dược phẩm trong hệ thống MediSpace E-Commerce. API hỗ trợ quản lý thông tin thương hiệu, theo dõi số lượng sản phẩm, và các thao tác CRUD cơ bản.

## Cấu trúc Database

### Brand Schema

```typescript
{
  _id: ObjectId,
  name: string,           // Tên thương hiệu
  slug: string,           // URL-friendly slug
  logo?: string,          // URL logo thương hiệu
  description?: string,   // Mô tả thương hiệu
  website?: string,       // Website chính thức
  country?: string,       // Quốc gia
  isActive: boolean,      // Trạng thái hoạt động
  productCount: number,   // Số lượng sản phẩm
  createdAt: Date
}
```

## API Endpoints

### 1. Tạo Brand Mới

```
POST /brands
Authorization: Bearer <access_token> (Admin only)
```

**Request Body:**

```json
{
  "name": "Pfizer",
  "slug": "pfizer", // Optional - auto generated from name
  "description": "Global pharmaceutical company",
  "logo": "https://example.com/pfizer-logo.png", // Optional
  "website": "https://www.pfizer.com", // Optional
  "country": "United States", // Optional
  "isActive": true // Optional, default: true
}
```

**Response:**

```json
{
  "message": "Brand created successfully",
  "result": {
    "_id": "64a7b2c1d4e5f6789abcdef1",
    "name": "Pfizer",
    "slug": "pfizer",
    "description": "Global pharmaceutical company",
    "logo": "https://example.com/pfizer-logo.png",
    "website": "https://www.pfizer.com",
    "country": "United States",
    "isActive": true,
    "productCount": 0,
    "createdAt": "2024-01-15T10:30:00.000Z"
  }
}
```

### 2. Lấy Danh Sách Brands

```
GET /brands
```

**Query Parameters:**

- `page`: Số trang (default: 1)
- `limit`: Số lượng per page (default: 20, max: 100)
- `isActive`: Trạng thái ("true"/"false")
- `search`: Tìm kiếm theo tên hoặc mô tả
- `country`: Filter theo quốc gia
- `sortBy`: Sắp xếp theo ("name" | "createdAt" | "productCount")
- `sortOrder`: Thứ tự sắp xếp ("asc" | "desc")

**Response:**

```json
{
  "message": "Get brands successfully",
  "result": {
    "brands": [...],
    "pagination": {
      "page": 1,
      "limit": 20,
      "totalPages": 3,
      "totalCount": 45
    }
  }
}
```

### 3. Lấy Brand theo ID

```
GET /brands/:brandId
```

**Response:**

```json
{
  "message": "Get brand successfully",
  "result": {
    "_id": "64a7b2c1d4e5f6789abcdef1",
    "name": "Pfizer",
    "slug": "pfizer"
    // ... full brand info
  }
}
```

### 4. Cập Nhật Brand

```
PATCH /brands/:brandId
Authorization: Bearer <access_token> (Admin only)
```

**Request Body:** (Tương tự POST, tất cả fields đều optional)

```json
{
  "name": "Pfizer Inc.",
  "description": "Updated description"
}
```

### 5. Toggle Trạng Thái Brand

```
PATCH /brands/:brandId/toggle-status
Authorization: Bearer <access_token> (Admin/Pharmacist)
```

**Request Body:**

```json
{
  "isActive": false
}
```

### 6. Xóa Brand

```
DELETE /brands/:brandId
Authorization: Bearer <access_token> (Admin only)
```

**Điều kiện xóa:**

- Không có sản phẩm (productCount = 0)

## Validation Rules

### 1. Name Validation

- Required, 1-100 characters
- Must be string

### 2. Slug Validation

- Optional, auto-generated from name
- 1-100 characters, format: [a-z0-9-]+
- Unique trong toàn bộ hệ thống

### 3. URL Validation

- logo, website: Must be valid URLs
- Optional fields

### 4. Country Validation

- Optional, max 100 characters
- Must be string

## Error Codes

### 400 Bad Request

- Validation errors
- Invalid brand ID format

### 404 Not Found

- Brand not found

### 409 Conflict

- Brand name/slug already exists

### 403 Forbidden

- Insufficient permissions

## Examples Usage

### Tạo Brand

```bash
curl -X POST http://localhost:3000/brands \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <admin_token>" \
  -d '{
    "name": "Pfizer",
    "description": "Global pharmaceutical company",
    "website": "https://www.pfizer.com",
    "country": "United States"
  }'
```

### Lấy Danh Sách Brands

```bash
curl "http://localhost:3000/brands?isActive=true&sortBy=name&sortOrder=asc"
```

### Tìm Kiếm Brands

```bash
curl "http://localhost:3000/brands?search=pfizer&country=United%20States"
```

### Cập Nhật Brand

```bash
curl -X PATCH http://localhost:3000/brands/{BRAND_ID} \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <admin_token>" \
  -d '{
    "description": "Updated pharmaceutical company description"
  }'
```

### Toggle Status

```bash
curl -X PATCH http://localhost:3000/brands/{BRAND_ID}/toggle-status \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <admin_token>" \
  -d '{
    "isActive": false
  }'
```

## Business Logic

### 1. Slug Generation

- Auto generate từ name nếu không cung cấp
- Loại bỏ dấu tiếng Việt, chuyển thành lowercase
- Thay spaces bằng hyphens
- Unique trong toàn bộ hệ thống

### 2. Product Count Management

- Tự động tăng khi product được thêm vào brand
- Tự động giảm khi product bị xóa hoặc chuyển brand
- Không cho phép xóa brand khi productCount > 0

### 3. Permission Rules

- GET endpoints: Public access
- POST, PATCH (update), DELETE: Admin only
- PATCH (toggle-status): Admin hoặc Pharmacist

## Performance Notes

1. **Indexing**: Cần index trên name, slug, isActive, country
2. **Pagination**: Luôn sử dụng pagination cho list APIs
3. **Search**: Support full-text search trên name và description
4. **Caching**: Recommend cache active brands list

## Testing với Postman

### Environment Variables

```json
{
  "base_url": "http://localhost:3000",
  "admin_token": "Bearer your_admin_token_here",
  "brand_id": "dynamic_from_response"
}
```

### Test Collection

#### 1. Create Brand

```
POST {{base_url}}/brands
Headers:
- Content-Type: application/json
- Authorization: {{admin_token}}

Body:
{
  "name": "Johnson & Johnson",
  "description": "Healthcare and pharmaceutical company",
  "website": "https://www.jnj.com",
  "country": "United States"
}
```

#### 2. Get All Brands

```
GET {{base_url}}/brands?page=1&limit=10&isActive=true
```

#### 3. Search Brands

```
GET {{base_url}}/brands?search=johnson&country=United%20States
```

#### Test Scripts

```javascript
// Validation test
pm.test('Status code is 201', function () {
  pm.response.to.have.status(201)
})

pm.test('Brand created with correct data', function () {
  var jsonData = pm.response.json()
  pm.expect(jsonData.result).to.have.property('name')
  pm.expect(jsonData.result).to.have.property('slug')
  pm.expect(jsonData.result.productCount).to.eql(0)
})

// Save brand ID for next requests
if (pm.response.code === 201) {
  var jsonData = pm.response.json()
  pm.environment.set('brand_id', jsonData.result._id)
}
```

## Integration với Products API

Brands API tích hợp chặt chẽ với Products API:

1. **Product Creation**: Validate brandId khi tạo product
2. **Product Count**: Auto update khi products thay đổi
3. **Brand Deletion**: Không cho phép xóa brand có products
4. **Status Management**: Inactive brands không thể được assign cho products mới

## Error Handling

Tất cả errors đều sử dụng ErrorWithStatus pattern để đảm bảo consistency:

```json
{
  "message": "Brand with this name or slug already exists",
  "status": 409
}
```

## Migration & Seeding

Seed data với các brands phổ biến trong ngành dược:

- Pfizer, Johnson & Johnson, Novartis, Roche
- Các brands Việt Nam: Traphaco, Hau Giang Pharma, Domesco
- Generic brands cho thuốc không kê đơn
