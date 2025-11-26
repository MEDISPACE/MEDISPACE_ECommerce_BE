# Order Management APIs for Pharmacist

## Overview

4 new API endpoints for pharmacists to manage orders, track shipments, and view order statistics.

## Base URL

```
/pharmacist/orders
```

## Authentication

All endpoints require:

- `Authorization: Bearer <access_token>`
- User must have `pharmacist` role

---

## 1. Get Orders List

### Endpoint

`GET /pharmacist/orders`

### Description

Get paginated list of orders with filters for status, payment status, and search.

### Query Parameters

| Parameter     | Type   | Required | Description                                                                                       |
| ------------- | ------ | -------- | ------------------------------------------------------------------------------------------------- |
| page          | number | No       | Page number (default: 1)                                                                          |
| limit         | number | No       | Items per page (default: 20)                                                                      |
| status        | string | No       | Filter by order status: `pending`, `confirmed`, `processing`, `shipped`, `delivered`, `cancelled` |
| paymentStatus | string | No       | Filter by payment status: `pending`, `paid`, `failed`, `refunded`                                 |
| search        | string | No       | Search by order number, customer name, or phone                                                   |

### Request Example

```http
GET /pharmacist/orders?page=1&limit=20&status=pending&search=ORD
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### Response Example

```json
{
  "message": "Get orders successfully",
  "result": {
    "orders": [
      {
        "_id": "6752d14b8dcfa64e1e234567",
        "userId": "6752a111222333444555",
        "orderNumber": "ORD-1733020123-456",
        "items": [
          {
            "productId": "6752b999888777666555",
            "name": "Paracetamol 500mg",
            "sku": "PARA-500",
            "quantity": 2,
            "unitPrice": 15000,
            "totalPrice": 30000,
            "prescriptionRequired": false,
            "image": "https://example.com/paracetamol.jpg"
          }
        ],
        "itemCount": 2,
        "shippingAddress": {
          "firstName": "Nguyen",
          "lastName": "Van A",
          "phone": "0901234567",
          "email": "nguyenvana@gmail.com",
          "address": "123 Nguyen Hue",
          "ward": "Ben Nghe",
          "district": "District 1",
          "province": "Ho Chi Minh City",
          "postalCode": "700000"
        },
        "paymentMethod": "cod",
        "paymentStatus": "pending",
        "orderStatus": "pending",
        "subtotal": 30000,
        "taxAmount": 0,
        "shippingFee": 25000,
        "discountAmount": 0,
        "totalAmount": 55000,
        "notes": "",
        "trackingNumber": null,
        "createdAt": "2024-12-01T10:00:00.000Z",
        "updatedAt": "2024-12-01T10:00:00.000Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "totalOrders": 45,
      "totalPages": 3
    }
  }
}
```

---

## 2. Get Order Details

### Endpoint

`GET /pharmacist/orders/:orderId`

### Description

Get detailed information about a specific order including customer information.

### Path Parameters

| Parameter | Type   | Required | Description                   |
| --------- | ------ | -------- | ----------------------------- |
| orderId   | string | Yes      | MongoDB ObjectId of the order |

### Request Example

```http
GET /pharmacist/orders/6752d14b8dcfa64e1e234567
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### Response Example

```json
{
  "message": "Get order details successfully",
  "result": {
    "_id": "6752d14b8dcfa64e1e234567",
    "userId": "6752a111222333444555",
    "orderNumber": "ORD-1733020123-456",
    "items": [
      {
        "productId": "6752b999888777666555",
        "name": "Paracetamol 500mg",
        "sku": "PARA-500",
        "quantity": 2,
        "unitPrice": 15000,
        "totalPrice": 30000,
        "prescriptionRequired": false,
        "image": "https://example.com/paracetamol.jpg"
      }
    ],
    "itemCount": 2,
    "shippingAddress": {
      "firstName": "Nguyen",
      "lastName": "Van A",
      "phone": "0901234567",
      "email": "nguyenvana@gmail.com",
      "address": "123 Nguyen Hue",
      "ward": "Ben Nghe",
      "district": "District 1",
      "province": "Ho Chi Minh City"
    },
    "paymentMethod": "cod",
    "paymentStatus": "pending",
    "orderStatus": "pending",
    "subtotal": 30000,
    "taxAmount": 0,
    "shippingFee": 25000,
    "discountAmount": 0,
    "totalAmount": 55000,
    "customer": {
      "_id": "6752a111222333444555",
      "email": "nguyenvana@gmail.com",
      "firstName": "Nguyen",
      "lastName": "Van A"
    },
    "createdAt": "2024-12-01T10:00:00.000Z",
    "updatedAt": "2024-12-01T10:00:00.000Z"
  }
}
```

---

## 3. Update Order Status

### Endpoint

`PATCH /pharmacist/orders/:orderId/status`

### Description

Update the status of an order. Can also add tracking number and notes.

### Path Parameters

| Parameter | Type   | Required | Description                   |
| --------- | ------ | -------- | ----------------------------- |
| orderId   | string | Yes      | MongoDB ObjectId of the order |

### Request Body

| Field          | Type   | Required | Description                                                                                 |
| -------------- | ------ | -------- | ------------------------------------------------------------------------------------------- |
| status         | string | Yes      | New order status: `pending`, `confirmed`, `processing`, `shipped`, `delivered`, `cancelled` |
| trackingNumber | string | No       | Shipping tracking number (required when status is `shipped`)                                |
| notes          | string | No       | Additional notes about the status change                                                    |

### Request Example (Confirm Order)

```json
PATCH /pharmacist/orders/6752d14b8dcfa64e1e234567/status
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Content-Type: application/json

{
  "status": "confirmed",
  "notes": "Order verified and ready for processing"
}
```

### Request Example (Ship Order)

```json
PATCH /pharmacist/orders/6752d14b8dcfa64e1e234567/status
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Content-Type: application/json

{
  "status": "shipped",
  "trackingNumber": "VN123456789",
  "notes": "Shipped via Viettel Post"
}
```

### Response Example

```json
{
  "message": "Update order status successfully",
  "result": {
    "_id": "6752d14b8dcfa64e1e234567",
    "orderNumber": "ORD-1733020123-456",
    "orderStatus": "shipped",
    "trackingNumber": "VN123456789",
    "notes": "Shipped via Viettel Post",
    "shippedAt": "2024-12-01T14:30:00.000Z",
    "updatedAt": "2024-12-01T14:30:00.000Z"
  }
}
```

### Status Workflow

```
pending → confirmed → processing → shipped → delivered
                          ↓
                      cancelled (can be cancelled at any stage before shipped)
```

### Automatic Timestamps

- When status changes to `shipped`: `shippedAt` timestamp is set
- When status changes to `delivered`: `deliveredAt` timestamp is set
- `updatedAt` is always updated on any status change

---

## 4. Get Order Statistics

### Endpoint

`GET /pharmacist/orders/statistics`

### Description

Get aggregated statistics about orders including counts by status, payment status, and total revenue.

### Query Parameters

| Parameter | Type   | Required | Description                  |
| --------- | ------ | -------- | ---------------------------- |
| startDate | string | No       | Start date (ISO 8601 format) |
| endDate   | string | No       | End date (ISO 8601 format)   |

### Request Example (All Time)

```http
GET /pharmacist/orders/statistics
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### Request Example (Date Range)

```http
GET /pharmacist/orders/statistics?startDate=2024-11-01&endDate=2024-11-30
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### Response Example

```json
{
  "message": "Get order statistics successfully",
  "result": {
    "ordersByStatus": [
      {
        "_id": "pending",
        "count": 15
      },
      {
        "_id": "confirmed",
        "count": 8
      },
      {
        "_id": "processing",
        "count": 12
      },
      {
        "_id": "shipped",
        "count": 20
      },
      {
        "_id": "delivered",
        "count": 45
      },
      {
        "_id": "cancelled",
        "count": 5
      }
    ],
    "ordersByPayment": [
      {
        "_id": "pending",
        "count": 23
      },
      {
        "_id": "paid",
        "count": 72
      },
      {
        "_id": "failed",
        "count": 3
      },
      {
        "_id": "refunded",
        "count": 2
      }
    ],
    "totalRevenue": 15750000
  }
}
```

**Note:** Total revenue only includes orders with:

- Order status: `confirmed`, `shipped`, or `delivered`
- Payment status: `paid`

---

## Use Case Scenarios

### Scenario 1: Process New Orders

```bash
# Step 1: Get pending orders
GET /pharmacist/orders?status=pending&page=1&limit=10

# Step 2: View order details
GET /pharmacist/orders/6752d14b8dcfa64e1e234567

# Step 3: Confirm order after verification
PATCH /pharmacist/orders/6752d14b8dcfa64e1e234567/status
{
  "status": "confirmed",
  "notes": "All items in stock. Ready to prepare."
}
```

### Scenario 2: Ship Orders

```bash
# Step 1: Get confirmed orders ready to ship
GET /pharmacist/orders?status=confirmed

# Step 2: Update to shipped with tracking
PATCH /pharmacist/orders/6752d14b8dcfa64e1e234567/status
{
  "status": "shipped",
  "trackingNumber": "VN987654321",
  "notes": "Shipped via Giao Hang Nhanh"
}
```

### Scenario 3: Search Customer Orders

```bash
# Search by order number
GET /pharmacist/orders?search=ORD-1733020123

# Search by customer phone
GET /pharmacist/orders?search=0901234567

# Search by customer name
GET /pharmacist/orders?search=Nguyen Van A
```

### Scenario 4: Monitor Performance

```bash
# Get today's statistics
GET /pharmacist/orders/statistics?startDate=2024-12-01&endDate=2024-12-01

# Get monthly statistics
GET /pharmacist/orders/statistics?startDate=2024-11-01&endDate=2024-11-30

# Get all-time statistics
GET /pharmacist/orders/statistics
```

---

## Order Status Reference

### Order Status Values

| Status       | Description                        | Next Possible States      |
| ------------ | ---------------------------------- | ------------------------- |
| `pending`    | New order waiting for confirmation | `confirmed`, `cancelled`  |
| `confirmed`  | Order verified and accepted        | `processing`, `cancelled` |
| `processing` | Order being prepared               | `shipped`, `cancelled`    |
| `shipped`    | Order dispatched to customer       | `delivered`               |
| `delivered`  | Order received by customer         | _(final state)_           |
| `cancelled`  | Order cancelled                    | _(final state)_           |

### Payment Status Values

| Status     | Description                  |
| ---------- | ---------------------------- |
| `pending`  | Payment not yet received     |
| `paid`     | Payment confirmed            |
| `failed`   | Payment attempt failed       |
| `refunded` | Payment refunded to customer |

### Payment Methods

| Method          | Description                    |
| --------------- | ------------------------------ |
| `cod`           | Cash on Delivery               |
| `bank_transfer` | Bank Transfer                  |
| `credit_card`   | Credit/Debit Card              |
| `e_wallet`      | E-Wallet (Momo, ZaloPay, etc.) |

---

## Error Responses

### 404 - Order Not Found

```json
{
  "message": "Order not found"
}
```

### 401 - Unauthorized

```json
{
  "message": "Unauthorized access"
}
```

### 403 - Access Denied

```json
{
  "message": "Access denied. Pharmacist role required."
}
```

---

## Integration with Other Modules

### Patient History

When viewing order details for prescription-required items:

1. Check customer's medical history
2. Verify prescription approval
3. Check for drug interactions

### Inventory Management

When confirming orders:

1. Verify stock availability
2. Reserve items for the order
3. Update stock quantities after shipment

### Notifications

Automatic notifications sent on status changes:

- `confirmed` → Email/SMS to customer
- `shipped` → Tracking number notification
- `delivered` → Delivery confirmation

---

## Summary

**Total Endpoints:** 4

- ✅ GET `/orders` - List orders with filters
- ✅ GET `/orders/:orderId` - Get order details
- ✅ PATCH `/orders/:orderId/status` - Update order status
- ✅ GET `/orders/statistics` - Get order statistics

**All endpoints:**

- ✅ Protected by authentication
- ✅ Require pharmacist role
- ✅ Zero TypeScript errors
- ✅ Full CRUD operations
- ✅ Pagination support
- ✅ Advanced filtering

**Progress Update:**

- Previous: 17/34 APIs (50%)
- **Current: 21/34 APIs (62%)**
- Remaining: 13 APIs

**Next Modules:**

1. Chat/Consultation (6 APIs) - Requires WebSocket
2. Drug Database (4 APIs)
3. Reports (2 APIs)
4. Settings (1 API)
