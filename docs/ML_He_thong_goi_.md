# MEDISPACE_ML_Service — Phân Tích Kỹ Thuật

## 1. Cấu Trúc Files

```
MEDISPACE_ML_Service/
│
├── main.py                         ← Cổng vào duy nhất, định nghĩa tất cả API
├── .env                            ← Config (MongoDB URI, thresholds)
├── requirements.txt                ← Python packages
│
├── saved_models/                   ← Models được save xuống disk (pkl, npy)
│   ├── tfidf_vectorizer.pkl
│   ├── tfidf_matrix.pkl
│   ├── fp_rules_dict.pkl
│   ├── nmf_trending.pkl
│   └── svd_matrix.npy
│
└── src/
    ├── data/
    │   └── mongo_loader.py         ← Kết nối DB, load & transform data
    │
    ├── models/
    │   ├── tfidf_model.py          ← Thuật toán 1: TF-IDF + Cosine
    │   ├── fpgrowth_model.py       ← Thuật toán 2: FP-Growth
    │   ├── nmf_trending.py         ← Thuật toán 3: NMF Trending
    │   ├── svd_model.py            ← Thuật toán 4: SVD
    │   └── hybrid_engine.py        ← Bộ điều phối, chọn thuật toán
    │
    ├── cache/
    │   └── mongo_cache.py          ← TTL Cache vào MongoDB
    │
    └── scheduler/
        └── jobs.py                 ← Tự động retrain mỗi 6 giờ
```

---

## 2. Vai Trò Từng File

### `main.py` — API Gateway
- Khởi tạo FastAPI app
- **Khi startup**: gọi `hybrid_engine.train_all()` → train tất cả models
- Định nghĩa tất cả HTTP endpoints
- Kiểm tra cache trước khi gọi model

### `mongo_loader.py` — Data Layer
Là tầng duy nhất giao tiếp với MongoDB. Load và transform data:

| Method | Lấy từ collection | Output |
|---|---|---|
| `load_products()` | `products` + join `productDetails`, `categories`, `brands` | List products với đầy đủ metadata |
| `load_orders()` | `orders` (365 ngày gần nhất) | List orders có items |
| `build_interaction_matrix()` | orders + reviews + carts | DataFrame `[user_id, product_id, score]` |
| `build_transaction_baskets()` | orders | `[[pid1, pid2], [pid3, pid4, pid5], ...]` |
| `get_user_top_categories()` | orders của 1 user | List categoryIds mua nhiều nhất |

**Interaction Score Weights:**
```
Purchase (đã mua) = 5.0 × recency_factor
Review (đánh giá) = (rating/5) × 4.0 × recency_factor  
Cart (đang giỏ)  = 1.0
recency_factor = e^(-0.005 × days_ago)  ← đơn hàng cũ ít weight hơn
```

---

## 3. Thuật Toán Chi Tiết

### Thuật Toán 1 — TF-IDF (`tfidf_model.py`)
**Mục đích:** "Sản Phẩm Liên Quan" dựa trên nội dung y tế

```
Input: Tên sản phẩm + hoạt chất (×3) + chỉ định (×2) + category (×2) + thương hiệu
          ↓ TF-IDF Vectorizer (5000 features, ngram 1-2)
Output: Ma trận 3238 × 5000

Khi query productId X:
  → Cosine similarity(X, tất cả products) → sort DESC → top-N
```

**Data source:** 3,238 products với `productDetails.activeIngredients`, `indications`

---

### Thuật Toán 2 — FP-Growth (`fpgrowth_model.py`)
**Mục đích:** "Thường Mua Kèm" dựa trên lịch sử đơn hàng

```
Input: Transaction baskets = [[pid1, pid2], [pid3, pid1, pid4], ...]
          ↓ FP-Growth (min_support=0.01, min_confidence=0.3)
Output: Association Rules (antecedent → consequent, lift, confidence)

Khi query productId X:
  → Tìm tất cả rules có X là antecedent
  → Sort theo lift × confidence DESC → top-N
```

**Trạng thái hiện tại:** ❌ SKIP (hầu hết orders chỉ có 1 item → không đủ baskets 2+ items)

---

### Thuật Toán 3 — NMF Trending (`nmf_trending.py`)
**Mục đích:** "Xu Hướng / Bán Chạy" + fallback cho "Dành Cho Bạn"

```
Input: Interaction matrix (users × products)
          ↓ NMF decomposition (20 factors)
          W (users × factors) × H (factors × products)
Output: H.sum(axis=0) = product popularity score

Final Score = NMF score × 0.7 + (rating/5) × 0.3
```

**Trạng thái hiện tại:** ✅ TRAINED — có global trending + per-category trending

---

### Thuật Toán 4 — SVD (`svd_model.py`)
**Mục đích:** "Dành Cho Bạn" - personalized recommendations

```
Input: User-Item matrix (7 users × N products)
          ↓ scipy.sparse.linalg.svds (k=20 factors)
          U (users × k) × Σ × Vt (k × products)
Output: Predicted matrix = U × diag(Σ) × Vt

Khi query userId X:
  → Lấy row X của predicted matrix → sort DESC
  → Loại bỏ products đã tương tác → top-N
```

**Trạng thái hiện tại:** ❌ SKIP (7 users < 10 minimum)

---

### `hybrid_engine.py` — Bộ Điều Phối

```
get_personalized(userId):
  if SVD.can_predict(userId) → SVD results         ← Tốt nhất
  elif user có orders → NMF filtered by categories  ← Personalized
  else → NMF global trending                        ← Cold-start

get_post_purchase(orderProductIds):
  FP-Growth associated + TF-IDF related (deduplicated)

get_pharmacist_suggestions(medical_context):
  TF-IDF related từ các sản phẩm trong đơn thuốc
```

---

### `mongo_cache.py` — Cache Layer

```
Mỗi request → check cache trước:
  HIT  → return ngay (< 5ms)
  MISS → chạy model → lưu cache → return

Cache keys & TTL:
  "related_{productId}"    → 24h (TF-IDF ổn định)
  "fbt_{productId}"        → 6h  (FP-Growth retrain 6h)
  "trending_{categoryId}"  → 2h  (trending thay đổi nhanh)
  "fyt_{userId}"           → 3h  (invalidate khi user đặt hàng)
```

---

## 4. Tất Cả API Endpoints

### `GET /health`
```
Input:  (none)
Output: { "status": "healthy" }
```

### `GET /`
```
Input:  (none)
Output: {
  "service": "MEDISPACE ML Recommendation Service",
  "status": "running",
  "models": {
    "tfidf": true,
    "fpgrowth": false,
    "nmf_trending": true,
    "svd": false
  }
}
```

### `POST /train`
```
Input:  (none) — trigger manually
Output: { "message": "Retraining completed", "models": {...} }
Dùng khi: Admin muốn retrain ngay lập tức sau khi có data mới
```

---

### `GET /recommend/related/{product_id}`
```
Input:
  product_id: string (MongoDB ObjectId) — path param
  limit: int (default=8) — query param

Output:
  {
    "source": "cache" | "computed",
    "algorithm": "tfidf",
    "products": ["id1", "id2", "id3", ...]  ← List productIds
  }

Ví dụ: GET /recommend/related/69467bddfb58d7e75940e52f?limit=8
Use case: ProductDetailPage → "Sản Phẩm Liên Quan"
```

---

### `GET /recommend/bought-together/{product_id}`
```
Input:
  product_id: string — path param
  limit: int (default=6) — query param

Output:
  {
    "source": "cache" | "computed",
    "algorithm": "fpgrowth" | "tfidf_fallback",
    "products": ["id1", "id2", ...]
  }

Fallback: Nếu FP-Growth không có rules → dùng TF-IDF thay thế
Use case: ProductDetailPage → "Thường Mua Kèm"
```

---

### `GET /recommend/trending`
```
Input:
  category_id: string (optional) — query param
  limit: int (default=12) — query param

Output:
  {
    "source": "cache" | "computed",
    "algorithm": "nmf",
    "products": ["id1", "id2", ...]
  }

Ví dụ: GET /recommend/trending?limit=12
        GET /recommend/trending?category_id=64abc123&limit=8
Use case: HomePage → "Xu Hướng", "Bán Chạy Hôm Nay"
```

---

### `GET /recommend/for-you/{user_id}`
```
Input:
  user_id: string (MongoDB ObjectId hoặc bất kỳ string) — path param
  limit: int (default=12) — query param

Output:
  {
    "source": "cache" | "computed",
    "algorithm": "svd" | "nmf_personalized" | "nmf_trending",
    "products": ["id1", "id2", ...]
  }

Use case: HomePage → "Dành Cho Bạn" (logged-in users)
          Guest → trending thay thế
```

---

### `GET /recommend/post-purchase`
```
Input:
  order_ids: string (comma-separated productIds) — query param
  limit: int (default=8) — query param

Output:
  {
    "algorithm": "hybrid",
    "products": ["id1", "id2", ...]
  }

Ví dụ: GET /recommend/post-purchase?order_ids=id1,id2,id3&limit=8
Use case: OrderSuccessPage → "Bạn Có Thể Cũng Thích"
```

---

### `GET /recommend/pharmacist`
```
Input (query params, tất cả optional):
  chronic_diseases: string   (comma-separated) → "tieu duong,huyet ap"
  allergies: string          (comma-separated) → "penicillin"
  current_medications: string (comma-separated)
  prescription_product_ids: string (comma-separated productIds)
  limit: int (default=10)

Output:
  {
    "algorithm": "tfidf_medical",
    "products": ["id1", "id2", ...]
  }

Use case: Pharmacist Panel → "Gợi Ý Thuốc" khi xử lý đơn thuốc
```

---

## 5. Luồng Hoạt Động Đầy Đủ

```
Client Request
     │
     ▼
main.py (FastAPI endpoint)
     │
     ├─→ MongoCache.get(key) ──────→ HIT → Return ngay (< 5ms)
     │                                        
     │   MISS ↓
     │
     ├─→ HybridEngine / Model.method()
     │        │
     │        ├─→ TFIDFRecommender.get_related()
     │        ├─→ FPGrowthRecommender.get_associated()
     │        ├─→ NMFTrendingRecommender.get_trending()
     │        └─→ SVDRecommender.get_for_user()
     │
     ├─→ MongoCache.set(key, result, ttl)
     │
     └─→ Return {source, algorithm, products: [id1, id2, ...]}

Background (APScheduler, mỗi 6h):
     └─→ HybridEngine.train_all()
              └─→ MongoLoader → Load data → Train models → Save to disk
```

---

## 6. Điều Quan Trọng Cho Phase 4 (Node.js Integration)

**Node.js BE sẽ:**
1. Nhận request từ FE
2. Gọi ML Service: `GET http://localhost:8002/recommend/...`
3. Nhận về `products: ["id1", "id2", ...]` (chỉ là IDs!)
4. **Enrich**: query MongoDB để lấy tên, ảnh, giá... của từng ID
5. Trả về FE dạng đầy đủ

> **Lý do ML Service chỉ trả productIds:** Giữ ML service gọn nhẹ, không phụ thuộc vào schema product của BE. Node.js BE mới biết cách format response đúng cho FE.
