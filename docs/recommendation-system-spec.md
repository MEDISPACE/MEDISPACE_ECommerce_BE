# Spec: Hệ Thống Gợi Ý Sản Phẩm

> **Phiên bản:** 2.0
> **Cập nhật:** 2026-06-11
> **Trạng thái:** Hoàn thiện cho phạm vi dự án học thuật; cần staging verification trước production

## 1. Phạm vi nghiệp vụ

Hệ thống recommendation phục vụ hai nhóm use case:

- **Recommendation thương mại OTC:** sản phẩm nổi bật, dành cho bạn, liên quan, thường mua kèm, sau mua và mua lại.
- **Hỗ trợ dược sĩ:** chỉ gợi ý sản phẩm OTC để tham khảo, không tự động gợi ý thuốc kê đơn và không kết luận tổ hợp thuốc an toàn.

Mọi recommendation tự động phải thỏa policy:

- Sản phẩm đang hoạt động, còn hàng và thuộc category/brand đang hoạt động.
- Không tự động trả thuốc kê đơn, kể cả ở pharmacist workflow.
- Loại sản phẩm đã có trong ngữ cảnh hiện tại.
- Loại sản phẩm khớp dị ứng hoặc thuốc đang dùng.
- Có thể áp dụng rule chống chỉ định/tương tác đã được xác thực nếu collection `drugSafetyRules` có dữ liệu.

Nếu chưa có dữ liệu safety đã được xác thực, hệ thống phải trả trạng thái **chưa được đánh giá**, tuyệt đối không kết luận **an toàn**.

## 2. Kiến trúc và luồng dữ liệu

```text
Frontend React
  -> Node/Express BE
     -> Python/FastAPI ML Service
        -> MongoDB training/runtime data + recommendation cache
     -> BE policy filter/rerank/backfill
  -> FE render + attribution events
```

Luồng serving:

1. ML lấy candidate pool lớn hơn số lượng FE yêu cầu.
2. ML trả candidate kèm `score`, `reason`, `evidence`, `model_version`.
3. BE áp dụng policy, enrich product, backfill và A/B rerank.
4. BE trả attribution metadata.
5. FE ghi nhận impression, click, add-to-cart, purchase và feedback.
6. Event mới invalidates cache cá nhân hóa của user.

## 3. Các loại recommendation

| Loại | Endpoint BE | Mục tiêu | Algorithm chính |
|------|-------------|----------|-----------------|
| Popular | `GET /api/recommendations/popular` | Sản phẩm phổ biến dùng rating/review | Rating/review fallback |
| Featured/Trending | `GET /api/recommendations/trending` | Sản phẩm nổi bật toàn hệ thống/danh mục | NMF + rating |
| Related | `GET /api/recommendations/related/:productId` | Sản phẩm tương đồng nhưng đa dạng | TF-IDF + MMR |
| Bought together | `GET /api/recommendations/bought-together/:productId` | Sản phẩm thường xuất hiện cùng đơn | FP-Growth |
| For you | `GET /api/recommendations/for-you` | Cá nhân hóa theo user | SVD/NMF fallback |
| Post purchase | `POST /api/recommendations/post-purchase` | Cross-sell theo danh sách sản phẩm | Hybrid FP-Growth + TF-IDF |
| Replenishment | `GET /api/recommendations/replenishment` | Dự đoán chu kỳ mua lại | Purchase interval heuristic |
| Pharmacist support | `POST /api/recommendations/pharmacist` | Gợi ý OTC tham khảo theo ngữ cảnh | TF-IDF medical + BE policy |

Endpoint vận hành:

| Method | Endpoint BE | Auth | Mô tả |
|--------|-------------|------|-------|
| `POST` | `/api/recommendations/track` | Optional | Ghi nhận attribution/feedback event |
| `GET` | `/api/recommendations/metrics` | Admin | CTR, CVR, revenue, quality và safety metrics |
| `GET` | `/api/recommendations/ml-status` | Admin | Trạng thái ML service |

ML internal endpoints sử dụng `x-service-token`. Personalized endpoints của ML chứa `user_id` trong path, ví dụ `/recommend/for-you/{user_id}`.

## 4. Response contract

```typescript
interface RecommendationResult {
  requestId: string
  attributionToken: string
  algorithm: string
  modelVersion: string
  experiment: {
    id: string
    variant: 'control' | 'diversified'
  }
  products: RecommendedProduct[]
}

interface RecommendedProduct {
  _id: string
  name: string
  slug: string
  featuredImage?: string
  priceVariants: PriceVariant[]
  rating: number
  reviewCount: number
  stockQuantity: number
  requiresPrescription: boolean
  category?: Array<{ name: string }>
  brand?: Array<{ name: string }>
  recommendation: {
    score: number | null
    reason: string
    evidence: string[]
    requiresIndependentReview: boolean
  }
}
```

Candidate từ ML:

```typescript
interface RecommendationCandidate {
  productId: string
  score: number
  reason: string
  evidence: string[]
}
```

## 5. Event attribution và feedback

`POST /api/recommendations/track`

```typescript
interface RecommendationEvent {
  productId: string
  algorithm: string
  section: string
  position: number
  eventType:
    | 'impression'
    | 'click'
    | 'add_to_cart'
    | 'purchase'
    | 'dismiss'
    | 'snooze'
  requestId?: string
  attributionToken?: string
  modelVersion?: string
  experimentId?: string
  experimentVariant?: string
  value?: number
}
```

Quy tắc:

- Impression được ghi khi recommendation page/card thực sự hiển thị.
- Click chỉ ghi khi user mở sản phẩm; click nút add-to-cart/wishlist không bị tính thành product click.
- Add-to-cart được lưu tạm attribution trên FE.
- Purchase được nối lại với add-to-cart attribution sau khi đặt hàng thành công.
- `dismiss` và `snooze` được lọc khỏi personalized/replenishment serving.

## 6. Safety và policy engine

Policy engine nằm tại `src/services/recommendation-policy.services.ts`.

Các rule bắt buộc:

1. Active, in-stock, active category và active brand.
2. Chặn toàn bộ automatic prescription recommendation.
3. Loại excluded products.
4. Keyword guardrail cho allergy/current medication.
5. Nếu có rule `status: validated` trong `drugSafetyRules`, áp dụng chống chỉ định và tương tác.
6. Pharmacist recommendation luôn có `requiresIndependentReview: true`.

`drugSafetyRules` là optional trong phạm vi học thuật. Nếu sử dụng dữ liệu demo, phải ghi rõ `academic_demo`; không được mô tả là cơ sở dữ liệu y khoa hoàn chỉnh.

Các safety block được ghi vào `recommendationSafetyEvents`.

## 7. Model lifecycle và realtime update

- Retrain định kỳ mặc định mỗi 6 giờ.
- Catalog thay đổi sẽ trigger retrain nền.
- Model mới được train trong shadow bundle.
- Chỉ swap toàn bộ bundle khi TF-IDF và NMF vượt readiness gate.
- Request đang phục vụ không nhìn thấy trạng thái model train dở.
- Mỗi bundle có `model_version` và evaluation snapshot.
- `/health` trả `503` khi model chưa sẵn sàng.
- Click/cart/wishlist/order/feedback invalidates personalized và replenishment cache của user.

Training signals:

| Signal | Trọng số tương đối |
|--------|-------------------|
| Purchase | Cao nhất |
| Add to cart | Cao |
| Wishlist/review | Trung bình |
| Click | Thấp |
| Dismiss/snooze | Serving-time exclusion |

## 8. A/B testing và metrics

Mỗi response được gán ổn định trong request vào một variant:

- `control`: giữ nguyên ranking.
- `diversified`: xen kẽ sản phẩm theo category.

Admin metrics 30 ngày gồm:

- Impression, click, add-to-cart, purchase.
- CTR, add-to-cart rate, conversion rate.
- Recommendation-attributed revenue.
- Average result count, diversity và novelty.
- Safety block incidents.

Quality events được lưu trong `recommendationQualityEvents`.

## 9. Frontend UX

`RecommendationCarousel`:

- Hiển thị lý do gợi ý.
- Ghi nhận impression riêng với click.
- Ghi nhận add-to-cart attribution.
- Cho phép “Không quan tâm”.
- Với replenishment, cho phép “Nhắc lại sau”.
- Tự ẩn khi không có sản phẩm.

Pharmacist workflow:

- Medical info response sử dụng camelCase thống nhất với FE.
- Kết hợp thuốc đang dùng từ đơn thuốc đã xác nhận gần đây.
- Không có nút xác nhận tương tác thuốc “an toàn”.
- Không cho thêm Rx trực tiếp từ recommendation.
- UI luôn nhắc dược sĩ kiểm tra độc lập.

## 10. Fallback và cache

- BE có circuit breaker cho ML service.
- Khi ML unavailable, các luồng phù hợp fallback sang rating/review hoặc trả rỗng.
- FE ẩn section khi response rỗng.
- BE Redis cache cho trending/featured.
- ML Mongo cache cho related, bought-together, trending, for-you và replenishment.
- Retrain invalidates ML cache và thông báo BE flush recommendation cache.
- Candidate retrieval lấy tối đa khoảng 3 lần limit để policy filter vẫn có thể backfill.

## 11. Testing và CI

Các pipeline hiện bắt buộc:

- **BE:** build và toàn bộ Vitest suite.
- **FE:** typecheck, Vitest và production build.
- **Python ML:** pytest suite.

Kết quả verification tại thời điểm cập nhật spec:

- BE: `422/422` tests passed.
- FE: `25/25` tests passed, typecheck và production build passed.
- Python ML: `53/53` tests passed.

## 12. Giới hạn phạm vi học thuật

- “Trending” hiện phản ánh sản phẩm nổi bật dựa trên tương tác và rating, không phải short-term sales velocity thực sự.
- Replenishment là heuristic theo khoảng cách giữa các lần mua, không dự đoán liều dùng.
- Pharmacist support không thay thế clinical decision support.
- Không có cơ sở dữ liệu tương tác thuốc chuyên nghiệp; hệ thống không được kết luận thuốc an toàn.
- Cần staging verification, load test và dữ liệu traffic thực trước khi tuyên bố production-ready.

## 13. Việc còn lại ngoài phạm vi đồ án

- Tích hợp nguồn safety data có license và quy trình chuyên gia phê duyệt.
- Dashboard/alert vận hành thực tế.
- Đánh giá A/B có ý nghĩa thống kê bằng traffic production.
- Drift monitoring và rollback tự động nâng cao.
