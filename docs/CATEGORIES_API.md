# MediSpace Categories API Documentation

## Tổng quan

Categories API quản lý hệ thống phân loại sản phẩm dược phẩm trong MediSpace E-Commerce. API hỗ trợ cấu trúc phân cấp tối đa 3 cấp với materialized path pattern cho hiệu suất truy vấn tối ưu.

## Cấu trúc Database

### Category Schema

```typescript
{
  _id: ObjectId,
  name: string,           // Tên danh mục
  slug: string,           // URL-friendly slug
  description?: string,   // Mô tả danh mục
  parentId?: ObjectId,    // ID danh mục cha
  level: number,          // Cấp độ (0-3)
  path: string,           // Materialized path (/parent/child)
  productCount: number,   // Số lượng sản phẩm
  icon?: string,          // URL icon
  thumbnailImage?: string, // URL hình ảnh
  sortOrder: number,      // Thứ tự sắp xếp
  isActive: boolean,      // Trạng thái hoạt động
  createdAt: Date,
  updatedAt: Date
}
```

## API Endpoints

### 1. Tạo Category Mới

```
POST /categories
Authorization: Bearer <access_token> (Admin only)
```

**Request Body:**

```json
{
  "name": "Thuốc tim mạch",
  "slug": "thuoc-tim-mach", // Optional - auto generated from name
  "description": "Các loại thuốc điều trị bệnh tim mạch",
  "parentId": "64a7b2c1d4e5f6789abcdef0", // Optional
  "icon": "https://example.com/icon.png", // Optional
  "thumbnailImage": "https://example.com/thumb.jpg", // Optional
  "sortOrder": 10, // Optional, default: 0
  "isActive": true // Optional, default: true
}
```

**Response:**

```json
{
  "message": "Category created successfully",
  "result": {
    "_id": "64a7b2c1d4e5f6789abcdef1",
    "name": "Thuốc tim mạch",
    "slug": "thuoc-tim-mach",
    "description": "Các loại thuốc điều trị bệnh tim mạch",
    "parentId": "64a7b2c1d4e5f6789abcdef0",
    "level": 1,
    "path": "/thuoc-dac-tri",
    "productCount": 0,
    "icon": "https://example.com/icon.png",
    "thumbnailImage": "https://example.com/thumb.jpg",
    "sortOrder": 10,
    "isActive": true,
    "createdAt": "2024-01-15T10:30:00.000Z",
    "updatedAt": "2024-01-15T10:30:00.000Z"
  }
}
```

### 2. Lấy Danh Sách Categories

```
GET /categories
```

**Query Parameters:**

- `page`: Số trang (default: 1)
- `limit`: Số lượng per page (default: 20, max: 100)
- `parentId`: ID danh mục cha (hoặc "null" để lấy root categories)
- `level`: Cấp độ category (0-3)
- `isActive`: Trạng thái ("true"/"false")
- `search`: Tìm kiếm theo tên hoặc mô tả

**Response:**

```json
{
  "message": "Get categories successfully",
  "result": {
    "categories": [...],
    "pagination": {
      "page": 1,
      "limit": 20,
      "totalPages": 3,
      "totalCount": 45
    }
  }
}
```

### 3. Lấy Category Tree (Cấu trúc phân cấp)

```
GET /categories/tree
```

**Response:**

```json
{
  "message": "Get category tree successfully",
  "result": [
    {
      "_id": "...",
      "name": "Thuốc đặc trị",
      "slug": "thuoc-dac-tri",
      "level": 0,
      "children": [
        {
          "_id": "...",
          "name": "Thuốc tim mạch",
          "slug": "thuoc-tim-mach",
          "level": 1,
          "children": [...]
        }
      ]
    }
  ]
}
```

### 4. Lấy Category theo ID

```
GET /categories/:categoryId
```

**Response:**

```json
{
  "message": "Get category successfully",
  "result": {
    "_id": "64a7b2c1d4e5f6789abcdef1",
    "name": "Thuốc tim mạch"
    // ... full category info
  }
}
```

### 5. Lấy Breadcrumb

```
GET /categories/:categoryId/breadcrumb
```

**Response:**

```json
{
  "message": "Get category breadcrumb successfully",
  "result": [
    {
      "_id": "...",
      "name": "Thuốc đặc trị",
      "slug": "thuoc-dac-tri"
    },
    {
      "_id": "...",
      "name": "Thuốc tim mạch",
      "slug": "thuoc-tim-mach"
    }
  ]
}
```

### 6. Lấy Categories Con

```
GET /categories/:categoryId/children
```

**Response:**

```json
{
  "message": "Get category children successfully",
  "result": [
    {
      "_id": "...",
      "name": "Thuốc huyết áp",
      "slug": "thuoc-huyet-ap",
      "level": 2
    }
  ]
}
```

### 7. Cập Nhật Category

```
PATCH /categories/:categoryId
Authorization: Bearer <access_token> (Admin only)
```

**Request Body:** (Tương tự POST, tất cả fields đều optional)

```json
{
  "name": "Thuốc tim mạch cập nhật",
  "description": "Mô tả mới"
}
```

### 8. Toggle Trạng Thái Category

```
PATCH /categories/:categoryId/toggle-status
Authorization: Bearer <access_token> (Pharmacist/Admin)
```

**Request Body:**

```json
{
  "isActive": false
}
```

### 9. Xóa Category

```
DELETE /categories/:categoryId
Authorization: Bearer <access_token> (Admin only)
```

**Điều kiện xóa:**

- Không có categories con
- Không có sản phẩm (productCount = 0)

## Quy tắc Business

### 1. Hierarchy Rules

- Tối đa 3 cấp độ (level 0, 1, 2, 3)
- Root categories có level = 0, path = "/"
- Child categories có path = parent_path + "/" + parent_slug

### 2. Slug Generation

- Auto generate từ name nếu không cung cấp
- Loại bỏ dấu tiếng Việt, chuyển thành lowercase
- Thay spaces bằng hyphens
- Unique trong toàn bộ hệ thống

### 3. Validation Rules

- name: required, 1-100 chars
- slug: optional, 1-100 chars, format: [a-z0-9-]+
- description: optional, max 500 chars
- parentId: must be valid ObjectId và không tạo circular reference
- sortOrder: non-negative number
- icon, thumbnailImage: must be valid URLs

### 4. Permission Rules

- GET endpoints: Public access
- POST, PATCH (update), DELETE: Admin only
- PATCH (toggle-status): Pharmacist hoặc Admin

## Error Codes

### 400 Bad Request

- Validation errors
- Circular reference khi set parent
- Max level exceeded
- Invalid parent category

### 404 Not Found

- Category not found
- Parent category not found

### 409 Conflict

- Category name/slug already exists

### 403 Forbidden

- Insufficient permissions

## Examples Usage

### Tạo Root Category

```bash
curl -X POST http://localhost:3000/categories \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <admin_token>" \
  -d '{
    "name": "Thuốc không kê đơn",
    "description": "Các loại thuốc bán tự do",
    "sortOrder": 1
  }'
```

### Tạo Subcategory

```bash
curl -X POST http://localhost:3000/categories \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <admin_token>" \
  -d '{
    "name": "Thuốc cảm cúm",
    "parentId": "64a7b2c1d4e5f6789abcdef0",
    "description": "Thuốc điều trị cảm cúm"
  }'
```

### Lấy Tree Structure

```bash
curl http://localhost:3000/categories/tree
```

### Search Categories

```bash
curl "http://localhost:3000/categories?search=tim%20mạch&isActive=true&limit=10"
```

## Performance Notes

1. **Materialized Path**: Cho phép query hierarchical data hiệu quả
2. **Indexing**: Cần index trên slug, path, level, parentId
3. **Pagination**: Luôn sử dụng pagination cho list APIs
4. **Caching**: Recommend cache category tree ở Redis

## Migration & Seeding

Tạo script seed data với categories phổ biến trong ngành dược:

- Thuốc kê đơn / Thuốc không kê đơn
- Theo nhóm chức năng (tim mạch, tiêu hóa, etc.)
- Theo dạng bào chế (viên nén, siro, etc.)

## Database Collections

MediSpace sử dụng các MongoDB collections sau:

- `users`: Thông tin người dùng
- `refreshTokens`: JWT refresh tokens (thống nhất chỉ dùng collection này)
- `categories`: Danh mục sản phẩm

## Testing với Postman

### Bước 1: Setup Environment

1. Tạo Environment mới trong Postman với tên `MediSpace Local`
2. Thêm variables:
   - `base_url`: `http://localhost:3000`
   - `admin_token`: `Bearer <access_token>` (sẽ có sau khi implement authentication)

### Bước 2: Import Collection

Tạo Collection mới với tên `Categories API` và thêm các request sau:

#### 1. Tạo Root Category

```
Method: POST
URL: {{base_url}}/categories
Headers:
- Content-Type: application/json
- Authorization: {{admin_token}} (tạm thời bỏ qua)

Body (JSON):
{
  "name": "Thuốc không kê đơn",
  "description": "Các loại thuốc bán tự do không cần đơn thuốc",
  "sortOrder": 1,
  "isActive": true
}
```

#### 2. Tạo Subcategory

```
Method: POST
URL: {{base_url}}/categories
Headers:
- Content-Type: application/json
- Authorization: {{admin_token}}

Body (JSON):
{
  "name": "Thuốc cảm cúm",
  "slug": "thuoc-cam-cum",
  "description": "Thuốc điều trị cảm lạnh, cúm",
  "parentId": "{{root_category_id}}", // Lấy từ response bước 1
  "icon": "https://example.com/cold-medicine-icon.png",
  "sortOrder": 1,
  "isActive": true
}
```

#### 3. Lấy Danh Sách Categories

```
Method: GET
URL: {{base_url}}/categories
Query Params:
- page: 1
- limit: 10
- isActive: true
```

#### 4. Lấy Category Tree

```
Method: GET
URL: {{base_url}}/categories/tree
```

#### 5. Tìm Kiếm Categories

```
Method: GET
URL: {{base_url}}/categories
Query Params:
- search: cảm cúm
- isActive: true
- limit: 5
```

#### 6. Lấy Category by ID

```
Method: GET
URL: {{base_url}}/categories/{{category_id}}
```

#### 7. Lấy Breadcrumb

```
Method: GET
URL: {{base_url}}/categories/{{category_id}}/breadcrumb
```

#### 8. Lấy Children Categories

```
Method: GET
URL: {{base_url}}/categories/{{parent_category_id}}/children
```

#### 9. Cập Nhật Category

```
Method: PATCH
URL: {{base_url}}/categories/{{category_id}}
Headers:
- Content-Type: application/json
- Authorization: {{admin_token}}

Body (JSON):
{
  "name": "Thuốc cảm cúm (cập nhật)",
  "description": "Thuốc điều trị cảm lạnh, cúm - mô tả cập nhật",
  "sortOrder": 2
}
```

#### 10. Toggle Category Status

```
Method: PATCH
URL: {{base_url}}/categories/{{category_id}}/toggle-status
Headers:
- Content-Type: application/json
- Authorization: {{admin_token}}

Body (JSON):
{
  "isActive": false
}
```

#### 11. Xóa Category

```
Method: DELETE
URL: {{base_url}}/categories/{{category_id}}
Headers:
- Authorization: {{admin_token}}
```

### Bước 3: Test Scenarios

#### Scenario 1: Tạo Hierarchy 3 Cấp

1. Tạo Root Category: "Thuốc đặc trị"
2. Tạo Level 1: "Thuốc tim mạch" (parent: Root)
3. Tạo Level 2: "Thuốc huyết áp" (parent: Level 1)
4. Tạo Level 3: "Thuốc huyết áp cao" (parent: Level 2)
5. Thử tạo Level 4 → Should fail với error "Maximum category level exceeded"

#### Scenario 2: Test Validation

1. **Tên trống**: Gửi POST với `name: ""`
   - Expected: 400 Bad Request
2. **Slug invalid**: Gửi POST với `slug: "Thuốc Cảm"`
   - Expected: 400 Bad Request
3. **Parent ID invalid**: Gửi POST với `parentId: "invalid_id"`
   - Expected: 400 Bad Request
4. **Circular reference**:
   - Tạo Category A
   - Tạo Category B với parent = A
   - Update Category A với parent = B
   - Expected: 400 Bad Request

#### Scenario 3: Test Hierarchy Operations

1. Tạo cấu trúc: Root → Level1 → Level2
2. Test breadcrumb cho Level2
3. Test children cho Root
4. Test tree structure
5. Thử xóa Level1 khi có Level2 → Should fail

#### Scenario 4: Test Search & Filter

1. Tạo nhiều categories với tên khác nhau
2. Test search theo keyword
3. Test filter theo level
4. Test filter theo parentId
5. Test pagination

### Bước 4: Postman Tests Script

Thêm test script vào từng request để auto-validate response:

```javascript
// Test cho Create Category
pm.test('Status code is 201', function () {
  pm.response.to.have.status(201)
})

pm.test('Response has required fields', function () {
  var jsonData = pm.response.json()
  pm.expect(jsonData).to.have.property('message')
  pm.expect(jsonData).to.have.property('result')
  pm.expect(jsonData.result).to.have.property('_id')
  pm.expect(jsonData.result).to.have.property('name')
  pm.expect(jsonData.result).to.have.property('slug')
})

pm.test('Category name matches request', function () {
  var jsonData = pm.response.json()
  var requestData = JSON.parse(pm.request.body.raw)
  pm.expect(jsonData.result.name).to.eql(requestData.name)
})

// Lưu category ID cho request tiếp theo
if (pm.response.code === 201) {
  var jsonData = pm.response.json()
  pm.environment.set('category_id', jsonData.result._id)
  if (jsonData.result.level === 0) {
    pm.environment.set('root_category_id', jsonData.result._id)
  }
}
```

```javascript
// Test cho Get Categories
pm.test('Status code is 200', function () {
  pm.response.to.have.status(200)
})

pm.test('Response has pagination', function () {
  var jsonData = pm.response.json()
  pm.expect(jsonData.result).to.have.property('categories')
  pm.expect(jsonData.result).to.have.property('pagination')
  pm.expect(jsonData.result.pagination).to.have.property('page')
  pm.expect(jsonData.result.pagination).to.have.property('totalPages')
})

pm.test('Categories array is valid', function () {
  var jsonData = pm.response.json()
  pm.expect(jsonData.result.categories).to.be.an('array')
  if (jsonData.result.categories.length > 0) {
    pm.expect(jsonData.result.categories[0]).to.have.property('_id')
    pm.expect(jsonData.result.categories[0]).to.have.property('name')
  }
})
```

### Bước 5: Automated Testing

Tạo Collection Runner để chạy tự động:

1. **Setup Data**: Tạo root categories
2. **Create Hierarchy**: Tạo subcategories
3. **Read Operations**: Test GET endpoints
4. **Update Operations**: Test PATCH endpoints
5. **Validation Tests**: Test error cases
6. **Cleanup**: Xóa test data

### Bước 6: Environment Variables

Sử dụng các biến sau để test linh hoạt:

```json
{
  "base_url": "http://localhost:3000",
  "admin_token": "Bearer your_admin_token_here",
  "category_id": "dynamic_from_response",
  "root_category_id": "dynamic_from_response",
  "parent_category_id": "dynamic_from_response"
}
```

### Expected Responses

#### Success Responses

- **201 Created**: Tạo category thành công
- **200 OK**: Get, Update, Toggle status thành công

#### Error Responses

- **400 Bad Request**: Validation error, Business rule violation
- **404 Not Found**: Category không tồn tại
- **409 Conflict**: Tên/slug đã tồn tại
- **403 Forbidden**: Không có quyền (khi implement auth)

### Performance Testing

Dùng Postman để test performance:

1. **Load Test**: Tạo 100 categories cùng lúc
2. **Hierarchy Depth**: Test với cấu trúc 3 cấp sâu
3. **Search Performance**: Test search với nhiều keyword
4. **Pagination**: Test với limit lớn

Với hướng dẫn này, bạn có thể test toàn diện Categories API và đảm bảo tất cả chức năng hoạt động đúng trước khi deploy.
