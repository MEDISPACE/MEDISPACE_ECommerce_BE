# 🧠 Spec: Hệ Thống Gợi Ý Sản Phẩm (ML Recommendation Engine)

> **Phiên bản:** 1.0  
> **Cập nhật:** 2026-05-17  
> **Trạng thái:** Production-ready (Sprint 1–4 hoàn tất)

---

## 1. Tổng quan kiến trúc

```
┌─────────────────────────────────────────────────────────┐
│                    MEDISPACE Platform                   │
├─────────────────┬───────────────────┬───────────────────┤
│   Frontend (FE) │   Backend (BE)    │  ML Service (Py)  │
│   React + Vite  │   Node/Express    │   FastAPI + SKL   │
│   Port: 3000    │   Port: 8000      │   Port: 8002      │
└─────────────────┴───────────────────┴───────────────────┘
```

### Flow dữ liệu

```
User Action (FE)
    │
    ▼ GET/POST /api/recommendations/...
Node BE (proxy)
    │
    ▼ GET/POST /recommend/...
Python ML Service
    │
    ▼ Query MongoDB + run algorithm
Return products[]
```

---

## 2. Danh sách Endpoints

### 2.1 Python ML Service (port 8002)

| Method | Endpoint | Algorithm | Mô tả |
|--------|----------|-----------|-------|
| `GET` | `/recommend/trending` | NMF | Sản phẩm trending toàn hệ thống |
| `GET` | `/recommend/trending?category_id={id}` | NMF + filter | Trending trong danh mục |
| `GET` | `/recommend/related/{productId}` | TF-IDF + MMR | Sản phẩm liên quan |
| `GET` | `/recommend/bought-together/{productId}` | FP-Growth | Thường mua kèm |
| `GET` | `/recommend/for-you` | SVD / NMF fallback | Cá nhân hoá (auth required) |
| `GET` | `/recommend/replenishment` | Lịch sử mua | Nhắc mua lại (auth required) |
| `POST` | `/recommend/post-purchase` | TF-IDF cross-sell | Sau khi đặt hàng |
| `POST` | `/recommend/pharmacist` | TF-IDF medical | Gợi ý cho dược sĩ |

### 2.2 Node BE Proxy (port 8000)

| Method | Endpoint | Proxy đến |
|--------|----------|-----------|
| `GET` | `/api/recommendations/trending` | ML `/recommend/trending` |
| `GET` | `/api/recommendations/related/:id` | ML `/recommend/related/{id}` |
| `GET` | `/api/recommendations/bought-together/:id` | ML `/recommend/bought-together/{id}` |
| `GET` | `/api/recommendations/for-you` | ML `/recommend/for-you` |
| `GET` | `/api/recommendations/replenishment` | ML `/recommend/replenishment` |
| `POST` | `/api/recommendations/post-purchase` | ML `/recommend/post-purchase` |
| `POST` | `/api/recommendations/pharmacist` | ML `/recommend/pharmacist` |

### 2.3 Query Parameters chung

| Param | Type | Default | Mô tả |
|-------|------|---------|-------|
| `limit` | number | 5–12 | Số sản phẩm trả về |
| `category_id` | string | — | Lọc theo danh mục (chỉ trending) |

---

## 3. Response Schema

```typescript
interface RecommendationResult {
  algorithm: string          // Tên thuật toán đã dùng
  products: RecommendedProduct[]
}

interface RecommendedProduct {
  _id: string
  name: string
  slug: string
  featuredImage?: string
  priceVariants: Array<{
    unit: string
    price: number
    originalPrice?: number
    salePrice?: number       // Giá sau giảm
    isDefault: boolean
    quantityPerUnit: number
  }>
  rating: number
  reviewCount: number
  stockQuantity: number
  requiresPrescription: boolean
  category?: Array<{ name: string }>
  brand?: Array<{ name: string }>
}
```

---

## 4. Tích hợp Frontend

### 4.1 Hooks (`src/hooks/product/useRecommendations.ts`)

```typescript
// Trending (tất cả hoặc theo danh mục)
useTrending(limit?: number, categoryId?: string)

// Sản phẩm liên quan với 1 sản phẩm cụ thể
useRelated(productId: string, limit?: number)

// Thường mua kèm (FP-Growth)
useBoughtTogether(productId: string, limit?: number)

// Cá nhân hoá — fallback trending nếu guest
useForYou(limit?: number, isAuthenticated?: boolean)

// Nhắc mua lại — chỉ khi đã đăng nhập
useReplenishment(limit?: number, isAuthenticated?: boolean)

// Cross-sell sau mua hàng
usePostPurchase(productIds: string[], limit?: number)
```

Tất cả hooks trả về:
```typescript
{ products: RecommendedProduct[], loading: boolean, algorithm: string }
```

### 4.2 Service (`src/services/recommendationService.ts`)

```typescript
recommendationService.getTrending(limit, categoryId?)
recommendationService.getRelated(productId, limit)
recommendationService.getBoughtTogether(productId, limit)
recommendationService.getForYou(limit)
recommendationService.getReplenishment(limit)
recommendationService.getPostPurchase(productIds[], limit)
recommendationService.getPharmacistSuggestions({ chronicDiseases, allergies, ... }, limit)
```

### 4.3 UI Component

**`RecommendationCarousel`** (`src/components/products/RecommendationCarousel.tsx`)

```tsx
<RecommendationCarousel
  title="Tiêu đề hiển thị"
  subtitle="Mô tả phụ"           // optional
  badge="trending"                // 'trending' | 'for-you' | 'bundle' | 'post-purchase' | 'related'
  products={products}
  loading={loading}
  viewAllLink="/products"         // optional
  itemsPerPage={5}                // optional, default 5
  layout="compact"                // optional: 'compact' | 'centered'
/>
```

---

## 5. Vị trí tích hợp theo trang

| Trang | URL | Tính năng | Hook | Điều kiện hiển thị |
|-------|-----|-----------|------|-------------------|
| **HomePage** | `/` | "Gợi Ý Hôm Nay" / "Dành Cho Bạn" | `useForYou` | Luôn hiện |
| **HomePage** | `/` | "Xu Hướng Hôm Nay" | `useTrending` | Luôn hiện |
| **ProductDetailPage** | `/products/:slug` | "Thường Mua Kèm" | `useBoughtTogether` | Luôn hiện |
| **ProductDetailPage** | `/products/:slug` | "Sản Phẩm Liên Quan" | `useRelated` | Luôn hiện |
| **ShoppingCartPage** | `/cart` | "Thêm vào đơn hàng?" | `usePostPurchase(cartItemIds)` | Khi giỏ có sản phẩm |
| **OrderSuccessPage** | `/order/success` | "Bạn Có Thể Cũng Thích" | `usePostPurchase(orderItemIds)` | Sau đặt hàng thành công |
| **SearchResultsPage** | `/search?q=...` | "Có thể bạn cũng thích" (related) | `useRelated(firstResultId)` | Khi tìm thấy 1–5 kết quả |
| **SearchResultsPage** | `/search?q=...` | "Có thể bạn đang tìm..." (trending) | `useTrending` | Khi 0 kết quả |
| **CategoryPage** | `/categories/:slug` | "Đang Được Mua Nhiều Trong..." | `useTrending(8, categoryId)` | Trên product grid |
| **AccountDashboard** | `/account` | "Có thể bạn cần mua lại" | `useReplenishment` | Đã đăng nhập + có lịch sử |
| **AccountDashboard** | `/account` | "Dành Riêng Cho Bạn" | `useForYou` | Đã đăng nhập |
| **OrderDetailPage** | `/account/orders/:id` | "Mua Kèm Được Nhiều Người Chọn" | `usePostPurchase(orderItemIds)` | Luôn hiện |
| **WishlistPage** | `/account/wishlist` | "Bạn Có Thể Cũng Thích" | `useRelated(firstWishlistItemId)` | Khi wishlist có sản phẩm |
| **WishlistPage** | `/account/wishlist` | "Sản Phẩm Nổi Bật" | `useTrending` | Khi wishlist rỗng |
| **PharmacistCreateOrder** | `/pharmacist/orders/create` | "Gợi Ý Cho Bệnh Nhân" | `getPharmacistSuggestions` | Khi nhập thông tin bệnh nhân |

---

## 6. Thuật toán ML

### 6.1 NMF — Trending
- **Input:** Ma trận user-item (lượt xem, thêm giỏ, đặt hàng)
- **Output:** Top N sản phẩm có score cao nhất
- **Dùng cho:** Trang chủ, Category page
- **Cập nhật:** Hàng ngày (batch job)

### 6.2 TF-IDF + MMR — Related Products
- **Input:** Vector mô tả sản phẩm (tên, thành phần, chỉ định)
- **Output:** K sản phẩm gần nhất (MMR đảm bảo đa dạng)
- **Dùng cho:** ProductDetail, SearchResults, WishlistPage
- **Cập nhật:** Khi catalog thay đổi

### 6.3 FP-Growth — Bought Together
- **Input:** Lịch sử đơn hàng → tập itemset
- **Output:** Frequent itemsets → sản phẩm hay mua kèm nhất
- **Dùng cho:** ProductDetail, CartPage
- **Cập nhật:** Hàng tuần

### 6.4 SVD — For You (Personalized)
- **Input:** Lịch sử tương tác của user cụ thể
- **Output:** Sản phẩm dự đoán phù hợp với profile user
- **Fallback:** Trending (NMF) nếu user mới / guest
- **Dùng cho:** AccountDashboard, HomePage (đã đăng nhập)

### 6.5 Replenishment
- **Input:** Lịch sử mua hàng + chu kỳ mua trung bình
- **Output:** Sản phẩm dự đoán sắp hết / cần mua lại
- **Dùng cho:** AccountDashboard
- **Điều kiện:** Requires authentication + có ≥ 1 đơn hàng

### 6.6 TF-IDF Medical — Pharmacist
- **Input:** `chronicDiseases[]`, `allergies[]`, `currentMedications[]`, `prescriptionProductIds[]`
- **Output:** Sản phẩm phù hợp với profile sức khoẻ bệnh nhân
- **Dùng cho:** Pharmacist CreateOrder workflow
- **Lưu ý:** Không lọc sản phẩm Rx — dược sĩ tự quyết định

---

## 7. Cấu hình giới hạn số lượng

| Endpoint | Limit mặc định | Giới hạn tối đa | Ghi chú |
|----------|---------------|-----------------|---------|
| Trending | 12 | 20 | Home page dùng 8 |
| Related | 8 | 12 | ProductDetail dùng 8 |
| Bought Together | 6 | 10 | Cart dùng 6 |
| For You | 12 | 20 | Dashboard dùng 8 |
| Replenishment | 5 | 8 | Dashboard dùng 4 |
| Post Purchase | 8 | 12 | OrderSuccess/Cart dùng 6–8 |
| Pharmacist | 10 | 15 | — |

---

## 8. Error Handling & Fallback

```typescript
// Mọi endpoint đều có fallback:
return data ?? { algorithm: 'unavailable', products: [] }

// Nếu products.length === 0:
// → Carousel tự ẩn (không render ra DOM)
// → Không hiện skeleton vô tận

// Nếu ML service down:
// → BE trả 503, FE ẩn carousel silently
// → Không ảnh hưởng UX core
```

---

## 9. Môi trường & Cấu hình

### Development
```yaml
# docker-compose.dev.yml
ml-service:
  build: ./MEDISPACE_Python_Services
  ports:
    - "8002:8002"
  environment:
    - MONGO_URI=${MONGO_URI}
    - MODEL_PATH=/app/models
```

### Environment Variables
```env
# Backend .env
ML_SERVICE_URL=http://localhost:8002   # dev
ML_SERVICE_URL=http://ml-service:8002  # docker
```

---

## 10. Testing

### Manual test từng tính năng

```bash
# 1. Trending toàn hệ thống
curl "http://localhost:8002/recommend/trending?limit=5"

# 2. Trending theo danh mục
curl "http://localhost:8002/recommend/trending?category_id=<id>&limit=5"

# 3. Related products
curl "http://localhost:8002/recommend/related/<productId>?limit=5"

# 4. Bought together
curl "http://localhost:8002/recommend/bought-together/<productId>?limit=5"

# 5. Post purchase (cross-sell)
curl -X POST "http://localhost:8002/recommend/post-purchase" \
  -H "Content-Type: application/json" \
  -d '{"productIds": ["id1","id2"], "limit": 5}'

# 6. For You (cần auth token)
curl "http://localhost:8002/recommend/for-you?limit=5" \
  -H "Authorization: Bearer <token>"

# 7. Replenishment (cần auth token)
curl "http://localhost:8002/recommend/replenishment?limit=5" \
  -H "Authorization: Bearer <token>"

# 8. Pharmacist
curl -X POST "http://localhost:8002/recommend/pharmacist" \
  -H "Content-Type: application/json" \
  -d '{"chronicDiseases":["tiểu đường"],"allergies":[],"currentMedications":[],"prescriptionProductIds":[],"limit":5}'
```

### Frontend E2E

| Trang | Action | Expected |
|-------|--------|----------|
| `/categories/thuoc` | Load page | Carousel trending xuất hiện trên product grid |
| `/search?q=máy đo huyết áp ua-6` | Search | Carousel "Có thể bạn cũng thích" (related) |
| `/search?q=xyzabc123` | Search không có kết quả | Carousel "Có thể bạn đang tìm..." (trending) |
| `/cart` | Có sản phẩm trong giỏ | Carousel "Thêm vào đơn hàng?" |
| `/order/success` | Sau đặt hàng COD | Carousel post-purchase |
| `/account` | Đã đăng nhập | Grid replenishment + carousel for-you |
| `/account/wishlist` | Có sản phẩm | Carousel related |
| `/account/orders/:id` | Xem chi tiết đơn | Carousel post-purchase |

---

## 11. Roadmap tương lai

| Tính năng | Ưu tiên | Mô tả |
|-----------|---------|-------|
| A/B Testing | HIGH | So sánh CTR giữa các thuật toán |
| Real-time update | MEDIUM | Cập nhật recommendations khi user browse |
| Caching layer | MEDIUM | Redis cache cho trending (TTL 1h) |
| Feedback loop | LOW | User explicit rating để retrain model |
| Email replenishment | LOW | Gửi email nhắc mua lại định kỳ |

---

*Tài liệu này được tạo dựa trên codebase tại commit Sprint 4 hoàn thành (2026-05-17)*
