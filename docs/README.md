# MediSpace E-Commerce API Documentation

## Tổng quan

Đây là tập hợp documentation cho tất cả APIs trong hệ thống MediSpace E-Commerce - nền tảng thương mại điện tử dược phẩm.

## Cấu trúc API

MediSpace API được thiết kế theo RESTful principles với các module chính:

### 🏥 **Core APIs**

- **Users API** - Quản lý người dùng, authentication, authorization
- **Categories API** - Quản lý danh mục sản phẩm dược phẩm với cấu trúc phân cấp
- **Brands API** - Quản lý thương hiệu và nhà sản xuất dược phẩm
- **Products API** - Quản lý sản phẩm dược phẩm với đầy đủ thông tin y tế

### 📚 **Available Documentation**

| API                                   | Status         | Description                                                 |
| ------------------------------------- | -------------- | ----------------------------------------------------------- |
| [Categories API](./CATEGORIES_API.md) | ✅ Complete    | Quản lý danh mục sản phẩm với cấu trúc hierarchy 3 cấp      |
| [Brands API](./BRANDS_API.md)         | ✅ Complete    | Quản lý thương hiệu dược phẩm và tracking sản phẩm          |
| [Products API](./PRODUCTS_API.md)     | ✅ Complete    | Quản lý sản phẩm dược phẩm với inventory và medical info    |
| Users API                             | 🚧 In Progress | Quản lý người dùng đa vai trò (Customer, Pharmacist, Admin) |

### 🔄 **Future APIs**

- **Orders API** - Quản lý đơn hàng và prescription workflow
- **Cart API** - Quản lý giỏ hàng và checkout process
- **Inventory API** - Quản lý tồn kho và batch tracking
- **Chat API** - Tư vấn trực tuyến với dược sĩ
- **Reviews API** - Đánh giá và feedback sản phẩm
- **Promotions API** - Quản lý khuyến mãi và loyalty program

## 🏗️ **Kiến trúc Hệ thống**

### Tech Stack

- **Backend**: Node.js + Express.js + TypeScript
- **Database**: MongoDB với native driver
- **Authentication**: JWT tokens
- **Validation**: express-validator
- **Error Handling**: ErrorWithStatus pattern

### Design Patterns

- **Layered Architecture**: Routes → Controllers → Services → Database
- **Error Handling**: Centralized error handling với ErrorWithStatus
- **Validation**: Schema-based validation với express-validator
- **Database**: MongoDB collections với proper indexing

## 🔐 **Authentication & Authorization**

### User Roles

- **Customer**: Mua hàng, xem sản phẩm, chat với dược sĩ
- **Pharmacist**: Tư vấn, verify prescriptions, quản lý inventory
- **Admin**: Full system access, user management, reports

### Permission Matrix

| API Endpoint     | Customer | Pharmacist | Admin |
| ---------------- | -------- | ---------- | ----- |
| GET /products    | ✅       | ✅         | ✅    |
| POST /products   | ❌       | ✅         | ✅    |
| DELETE /products | ❌       | ❌         | ✅    |
| GET /categories  | ✅       | ✅         | ✅    |
| POST /categories | ❌       | ❌         | ✅    |
| POST /brands     | ❌       | ❌         | ✅    |

## 📊 **Database Schema**

### Collections Overview

```
medispacedb-test/
├── users/           # User accounts với multi-role support
├── categories/      # Hierarchical product categories
├── brands/          # Pharmaceutical brands
├── products/        # Core product information
├── refreshTokens/   # JWT refresh tokens
└── [Future collections for orders, cart, inventory...]
```

### Relationships

```
Categories (1:N) Products (N:1) Brands
Users (1:N) Products (created/modified by)
Products (1:N) Orders (future)
Users (1:N) Orders (future)
```

## 🧪 **Testing**

### Test Environment

- **Base URL**: `http://localhost:3000`
- **Database**: `medispacedb-test`
- **Port**: 3000

### Testing Tools

- **API Testing**: cURL commands provided trong mỗi documentation
- **Postman**: Collections và environments setup
- **Validation Testing**: Edge cases và error scenarios

### Sample Test Flow

1. **Setup**: Start server và database connection
2. **Categories**: Tạo root categories và subcategories
3. **Brands**: Tạo pharmaceutical brands
4. **Products**: Tạo products với category và brand relationships
5. **Validation**: Test error cases và business rules

## 🚀 **Getting Started**

### Prerequisites

```bash
Node.js >= 18
MongoDB Atlas account
npm hoặc yarn
```

### Installation

```bash
# Clone repository
git clone <repository-url>
cd MEDISPACE_ECommerce_BE

# Install dependencies
npm install

# Setup environment variables
cp .env.example .env
# Edit .env với MongoDB credentials

# Start development server
npm run dev
```

### Environment Variables

```env
PORT=3000
DB_USERNAME=your_mongodb_username
DB_PASSWORD=your_mongodb_password
DB_NAME=medispacedb-test
DB_CATEGORIES_COLLECTION=categories
DB_BRANDS_COLLECTION=brands
DB_PRODUCTS_COLLECTION=products
JWT_SECRET_ACCESS_TOKEN=your_jwt_secret
```

## 📝 **API Standards**

### Response Format

```json
{
  "message": "Operation successful message",
  "result": {
    // Response data
  }
}
```

### Error Format

```json
{
  "message": "Error description",
  "status": 400
}
```

### HTTP Status Codes

- `200 OK` - Successful GET, PATCH operations
- `201 Created` - Successful POST operations
- `400 Bad Request` - Validation errors, business rule violations
- `401 Unauthorized` - Authentication required
- `403 Forbidden` - Insufficient permissions
- `404 Not Found` - Resource not found
- `409 Conflict` - Duplicate resource (name, SKU, etc.)
- `422 Unprocessable Entity` - Validation errors with details

### Pagination

```json
{
  "pagination": {
    "page": 1,
    "limit": 20,
    "totalPages": 5,
    "totalCount": 95
  }
}
```

## 🔧 **Development Guidelines**

### Code Style

- **TypeScript**: Strict mode enabled
- **ESLint + Prettier**: Code formatting và linting
- **Naming**: camelCase cho variables, PascalCase cho classes
- **Error Handling**: Always use ErrorWithStatus pattern

### Git Workflow

- **Branch**: feature/api-name hoặc fix/issue-description
- **Commits**: Conventional commits format
- **Pull Requests**: Required for main branch

### API Development Checklist

- [ ] Schema definitions (TypeScript interfaces)
- [ ] Request/Response types
- [ ] Services layer với business logic
- [ ] Middlewares với validation
- [ ] Controllers với error handling
- [ ] Routes với proper middleware chain
- [ ] Database collections setup
- [ ] Error messages constants
- [ ] Documentation
- [ ] cURL test commands
- [ ] Postman collection

## 📞 **Support & Contact**

- **Technical Issues**: Create GitHub issue
- **API Questions**: Check documentation hoặc ask team
- **Business Logic**: Consult với pharmacy domain experts

---

**Last Updated**: January 2024
**Version**: 1.0.0  
**Status**: Active Development
