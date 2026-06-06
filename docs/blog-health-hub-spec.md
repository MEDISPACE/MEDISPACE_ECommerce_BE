# Đặc tả tính năng Health Hub và bài viết sức khỏe

> **Phiên bản:** 1.0  
> **Cập nhật:** 2026-06-03  
> **Trạng thái:** Đã triển khai MVP nâng cao trên FE, BE và Python AI service

---

## 1. Mục tiêu

Tính năng Health Hub thay thế trải nghiệm blog thông thường bằng một khu vực nội dung sức khỏe có kiểm duyệt y tế, có AI hỗ trợ, có hành trình sau khi đọc bài và có liên kết phù hợp với hệ sinh thái MediSpace.

Mục tiêu chính:

- Cung cấp bài viết sức khỏe đáng tin cậy cho người dùng.
- Cho phép dược sĩ và admin tạo, chỉnh sửa, duyệt và xuất bản bài viết.
- Hiển thị thông tin kiểm duyệt y tế, nguồn tham khảo và ngày review.
- Gợi ý bài viết cá nhân hóa khi người dùng đăng nhập.
- Cho phép người dùng lưu bài viết và theo dõi chủ đề.
- Tích hợp AI để hỗ trợ tác giả và hỗ trợ người đọc hỏi theo ngữ cảnh bài viết.
- Gợi ý sản phẩm liên quan tự động, có kiểm soát y tế.
- Theo dõi hành động sau khi đọc bài để admin xem insight.

---

## 2. Phạm vi tính năng

### 2.1 Cho người dùng

- Trang Health Hub tại `/health`.
- Trang tìm kiếm bài viết tại `/health/search`.
- Trang checker/quiz sức khỏe tại `/health/checker`.
- Trang danh mục tại `/health/category/:slug`.
- Trang chi tiết bài viết tại `/health/article/:slug`.
- Lưu bài viết.
- Theo dõi chủ đề.
- Hỏi AI về bài viết hiện tại.
- Xem bài viết liên quan.
- Xem sản phẩm liên quan.
- CTA sau khi đọc:
  - Hỏi dược sĩ.
  - Gửi đơn thuốc.
  - Tìm sản phẩm liên quan.

### 2.2 Cho dược sĩ

- Quản lý bài viết tại `/pharmacist/articles`.
- Tạo bài viết.
- Sửa bài viết của mình.
- Gửi bài về trạng thái chờ duyệt.
- Dùng AI hỗ trợ viết bài:
  - Tạo dàn ý.
  - Tạo tóm tắt.
  - Gợi ý SEO.
  - Tạo FAQ.
  - Kiểm tra chất lượng nội dung.
  - Gợi ý nhóm nguồn tham khảo cần tra cứu.

### 2.3 Cho admin

- Quản lý toàn bộ bài viết tại `/admin/articles`.
- Tạo, sửa, xóa, xuất bản, archive bài viết.
- Duyệt bài từ dược sĩ.
- Xem tab `Insights` trong `/admin/articles`.
- Theo dõi funnel hành động sau khi đọc.
- Xem top bài theo engagement.
- Xem hiệu quả theo danh mục.
- Xem cảnh báo editorial cần rà soát.

---

## 3. Vai trò và phân quyền

| Vai trò | Quyền |
|--------|-------|
| Guest | Xem bài published, tìm kiếm, đọc bài, xem sản phẩm liên quan, dùng checker, hỏi AI public theo bài, lưu/follow local |
| User đăng nhập | Tất cả quyền guest, lưu bài/follow topic vào hồ sơ user, nhận cá nhân hóa bài viết |
| Pharmacist | Tạo/sửa bài viết theo quyền sở hữu, dùng AI authoring, gửi bài chờ duyệt |
| Admin | Quản lý toàn bộ bài viết, publish/archive/delete, xem insights |

Luồng publish:

- Pharmacist tạo bài ở `draft` hoặc `pending`.
- Admin duyệt và publish.
- Bài public chỉ hiển thị khi `status = published` và `isPublished = true`.

---

## 4. Kiến trúc tổng quan

```text
React FE
  |
  | REST API
  v
Node/Express BE
  |
  +-- MongoDB: articles, healthCategories, articleJourneyEvents, users, products, productDetails
  +-- Typesense: search article/product
  |
  | /article/assist, /article/ask
  v
Python Chat AI Service
  |
  v
OpenAI-compatible LLM endpoint
```

Module chính:

| Repo | Module | Vai trò |
|------|--------|---------|
| FE | `src/components/health/*` | Health Hub, article detail, checker, search |
| FE | `src/components/admin/articles/*` | Form/list quản trị bài viết, AI tools, insights |
| FE | `src/services/articleService.ts` | Client API cho article, AI, preferences, tracking |
| BE | `src/routes/articles.routes.ts` | Route article, AI, analytics, preferences |
| BE | `src/services/articles.services.ts` | Business logic bài viết, related products, insights |
| BE | `src/routes/healthCategories.routes.ts` | CRUD taxonomy Health Hub |
| BE | `src/services/typesense.services.ts` | Index/search article và product |
| Python | `MEDISPACE_Chat_AI_Service/src/agents/article_agent.py` | AI authoring và AI hỏi theo bài |

---

## 5. Domain model

### 5.1 Article

Collection: `articles`

Field quan trọng:

| Field | Ý nghĩa |
|-------|---------|
| `title` | Tiêu đề bài viết |
| `slug` | Slug public |
| `excerpt` | Tóm tắt ngắn |
| `content` | Nội dung HTML |
| `categoryId` | Danh mục Health Hub |
| `tags[]` | Từ khóa |
| `status` | `draft`, `pending`, `published`, `archived` |
| `isPublished` | Cờ public |
| `authorId` | Người tạo |
| `reviewedBy` | Người kiểm duyệt y tế |
| `reviewedByTitle` | Chức danh reviewer |
| `reviewedAt` | Ngày duyệt |
| `lastMedicallyReviewedAt` | Ngày review y tế gần nhất |
| `references[]` | Nguồn tham khảo |
| `contentVersion` | Phiên bản nội dung |
| `riskLevel` | `general`, `medication`, `disease`, `emergency-sensitive` |
| `targetAudiences[]` | Nhóm người đọc mục tiêu |
| `symptoms[]` | Triệu chứng liên quan |
| `activeIngredients[]` | Hoạt chất liên quan |
| `healthTopics[]` | Chủ đề sức khỏe |
| `relatedProductIds[]` | Sản phẩm pin thủ công, hiện chưa expose UI |
| `viewCount` | Lượt xem |

### 5.2 HealthCategory

Collection: `healthCategories`

Đại diện taxonomy Health Hub:

- Bệnh và triệu chứng.
- Thuốc và hoạt chất.
- Chăm sóc theo nhóm người.
- Dịch vụ liên quan.

### 5.3 ArticleJourneyEvent

Collection: `articleJourneyEvents`

Lưu các hành động sau khi đọc:

| Event | Ý nghĩa |
|-------|---------|
| `article_ai_ask` | Người dùng hỏi AI trong bài |
| `cta_chat` | Click hỏi dược sĩ |
| `cta_prescription_upload` | Click gửi đơn thuốc |
| `cta_product_search` | Click tìm sản phẩm |
| `related_product_click` | Click sản phẩm liên quan |
| `article_save` | Lưu/bỏ lưu bài |
| `topic_follow` | Follow/unfollow chủ đề |
| `article_share` | Chia sẻ bài |
| `source_click` | Click nguồn tham khảo |

---

## 6. API chính

### 6.1 Public article APIs

| Method | Endpoint | Mục đích |
|--------|----------|----------|
| `GET` | `/articles` | Danh sách/tìm kiếm/filter bài viết |
| `GET` | `/articles/:articleId` | Lấy bài theo id hoặc slug |
| `POST` | `/articles/:articleId/view` | Tăng view count |
| `GET` | `/articles/:articleId/related` | Bài viết liên quan |
| `GET` | `/articles/:articleId/related-products` | Sản phẩm liên quan tự động |
| `POST` | `/articles/:articleId/journey-events` | Ghi event hành trình |
| `POST` | `/articles/:articleId/ask-ai` | Hỏi AI theo bài hiện tại |

### 6.2 Authenticated user APIs

| Method | Endpoint | Mục đích |
|--------|----------|----------|
| `GET` | `/articles/personalized` | Bài viết cá nhân hóa |
| `GET` | `/articles/me/preferences` | Lấy bài đã lưu và topic đã follow |
| `PATCH` | `/articles/:articleId/save` | Lưu/bỏ lưu bài |
| `PATCH` | `/articles/topics/:topicId/follow` | Follow/unfollow topic |

### 6.3 Pharmacist/Admin APIs

| Method | Endpoint | Mục đích |
|--------|----------|----------|
| `POST` | `/articles` | Tạo bài viết |
| `PATCH` | `/articles/:articleId` | Cập nhật bài viết |
| `DELETE` | `/articles/:articleId` | Xóa bài theo quyền |
| `POST` | `/articles/ai-assist` | AI hỗ trợ tác giả |

### 6.4 Admin APIs

| Method | Endpoint | Mục đích |
|--------|----------|----------|
| `PATCH` | `/articles/:articleId/publish` | Publish bài |
| `PATCH` | `/articles/:articleId/archive` | Archive bài |
| `GET` | `/articles/:articleId/journey-analytics` | Analytics cho một bài |
| `GET` | `/articles/admin/insights?days=30` | Dashboard insight toàn bộ bài viết |

### 6.5 Health category APIs

| Method | Endpoint | Mục đích |
|--------|----------|----------|
| `GET` | `/health-categories` | Danh sách category |
| `GET` | `/health-categories/:categoryId` | Chi tiết category theo id/slug |
| `POST` | `/health-categories` | Admin tạo category |
| `PATCH` | `/health-categories/:categoryId` | Admin cập nhật category |
| `DELETE` | `/health-categories/:categoryId` | Admin xóa category |

---

## 7. Health Hub trên FE

### 7.1 Routes

| Route | Component | Mục đích |
|-------|-----------|----------|
| `/health` | `HealthCornerPage` | Trang hub chính |
| `/health/search` | `health/search.tsx` | Tìm kiếm bài viết |
| `/health/checker` | `HealthCheckerPage` | Quiz/checker điều hướng nội dung |
| `/health/article/:slug` | `ArticleDetailPage` | Chi tiết bài viết |
| `/health/category/:slug` | `CategoryArticlesPage` | Bài viết theo danh mục |
| `/admin/articles` | `AdminArticlesList` | Admin quản lý bài viết và insight |
| `/admin/articles/new` | `AdminArticleForm` | Admin tạo bài |
| `/admin/articles/:id/edit` | `AdminArticleForm` | Admin sửa bài |
| `/pharmacist/articles` | `AdminArticlesList` | Dược sĩ quản lý bài |
| `/pharmacist/articles/new` | `AdminArticleForm` | Dược sĩ tạo bài |
| `/pharmacist/articles/:id/edit` | `AdminArticleForm` | Dược sĩ sửa bài |

### 7.2 ArticleDetail

Trang chi tiết bài viết hiển thị:

- Breadcrumb.
- Category, tags, risk level.
- Tiêu đề, excerpt, thời gian đọc.
- Thông tin reviewer y tế.
- Nội dung bài viết.
- AI Summary/AI Ask box.
- CTA hỏi dược sĩ, gửi đơn thuốc, tìm sản phẩm.
- Nguồn tham khảo.
- Sản phẩm liên quan.
- Bài viết liên quan.
- Save/follow topic.

---

## 8. AI trong tính năng bài viết

### 8.1 AI hỗ trợ tác giả

Endpoint BE: `POST /articles/ai-assist`

BE gọi Python:

```text
CHAT_AI_URL/article/assist
```

Actions:

| Action | Kết quả |
|--------|---------|
| `outline` | Dàn ý bài viết |
| `seo` | Meta title, meta description, keywords |
| `excerpt` | Tóm tắt ngắn cho bài |
| `faq` | Câu hỏi thường gặp |
| `quality_check` | Cảnh báo và gợi ý cải thiện |
| `sources` | Nhóm nguồn tham khảo nên tra cứu |

Nguyên tắc:

- AI chỉ tạo draft/gợi ý.
- Không tự publish.
- Admin/pharmacist phải kiểm tra nội dung trước khi lưu hoặc xuất bản.
- FAQ phải có dạng `{ question, answer }`.
- Nếu LLM trả JSON lỗi hoặc bị cắt, Python parser sẽ cố recover cặp FAQ hoàn chỉnh.
- Nếu không recover được, hệ thống trả `faq: []` và gợi ý chạy lại, không chèn JSON thô vào bài.

### 8.2 AI hỏi về bài hiện tại

Endpoint BE: `POST /articles/:articleId/ask-ai`

BE gửi sang Python:

```text
CHAT_AI_URL/article/ask
```

Context gửi sang AI:

- Câu hỏi người dùng.
- Title.
- Excerpt.
- Content rút gọn.
- Category.
- Tags.

Guardrails:

- Trả lời dựa trên bài hiện tại.
- Không tư vấn liều dùng cá nhân hóa.
- Không thay thế bác sĩ/dược sĩ.
- Nếu có dấu hiệu khẩn cấp, hướng dẫn gọi cấp cứu hoặc gặp chuyên môn.

---

## 9. Cá nhân hóa bài viết

Endpoint: `GET /articles/personalized`

Nguồn tín hiệu:

- Medical profile.
- Patient medical info.
- Chronic diseases.
- Allergies.
- Current medications.
- Prescription history.
- Order history.
- Wishlist.
- Product category/tags từ sản phẩm đã mua hoặc quan tâm.

Nếu không đủ tín hiệu, hệ thống fallback về bài published phổ biến/gần đây.

Response có:

- `source`: `personalized` hoặc `fallback`.
- `reasons[]`: lý do chọn nguồn tín hiệu.
- `articles[]`: danh sách bài viết.

---

## 10. Sản phẩm liên quan tự động

Endpoint: `GET /articles/:articleId/related-products`

Không cần UI admin chọn thủ công. Logic mặc định tự động:

1. Lấy tín hiệu từ bài viết:
   - Category.
   - Tags.
   - Health topics.
   - Symptoms.
   - Active ingredients.
   - Title.
   - Excerpt.

2. Lấy candidate sản phẩm:
   - `isActive = true`.
   - `status = active`.
   - `stockQuantity > 0`.
   - Lookup category sản phẩm.
   - Lookup product detail: `activeIngredients`, `indications`.

3. Chấm điểm liên quan:
   - Match category/chủ đề.
   - Match hoạt chất/công dụng.
   - Match tên/mô tả sản phẩm.
   - Ưu tiên OTC.
   - Ưu tiên rating/review count.
   - Giảm điểm thuốc kê đơn.

4. Guardrail theo risk level:
   - Với `disease` hoặc `emergency-sensitive`, tự loại thuốc kê đơn khỏi candidate.
   - Với bài thường, Rx vẫn có thể xuất hiện nhưng bị giảm điểm và FE hiển thị nhãn cần tư vấn/đơn thuốc.

Nếu bài có `relatedProductIds`, BE vẫn ưu tiên danh sách đó, nhưng hiện tại chưa có UI để admin chọn thủ công.

---

## 11. Health journey sau khi đọc

Cuối bài viết có các CTA:

- Hỏi dược sĩ.
- Gửi đơn thuốc.
- Tìm sản phẩm liên quan.
- Xem sản phẩm liên quan.
- Lưu bài.
- Theo dõi chủ đề.
- Chia sẻ.

Mỗi hành động ghi vào `articleJourneyEvents` thông qua:

```text
POST /articles/:articleId/journey-events
```

Dữ liệu này dùng cho admin insights.

---

## 12. Dashboard insights cho admin

Vị trí FE: `/admin/articles`, tab `Insights`.

Endpoint:

```text
GET /articles/admin/insights?days=30
```

Chỉ admin được truy cập.

Dashboard gồm:

- Tổng engagement trong kỳ.
- Số lượt hỏi AI.
- Tổng CTA tư vấn/mua.
- Số bài đang được lưu và topic đang được follow.
- Funnel hành động sau khi đọc.
- Top bài theo engagement.
- Hiệu quả theo danh mục.
- Cảnh báo editorial cần rà soát.

Các số liệu lấy từ DB thật:

- `articles`.
- `articleJourneyEvents`.
- `users.savedArticleIds`.
- `users.followedHealthTopics`.

Không dùng mock data.

Lưu ý:

- Các card insight là read-only.
- Control thật trong tab gồm chọn khoảng ngày, link mở bài và link sửa bài cảnh báo.

---

## 13. Editorial workflow

Metadata y tế hỗ trợ độ tin cậy:

- `reviewedBy`.
- `reviewedByTitle`.
- `reviewedAt`.
- `lastMedicallyReviewedAt`.
- `references[]`.
- `contentVersion`.
- `riskLevel`.

Cảnh báo editorial trong admin insight khi:

- Bài published thiếu reviewer.
- Bài published thiếu nguồn.
- Ngày review y tế quá 180 ngày.
- Bài có `riskLevel = emergency-sensitive`.

Nguyên tắc publish:

- Nội dung AI chỉ là gợi ý.
- Nội dung y tế phải được người có chuyên môn kiểm tra.
- Bài có thuốc, bệnh lý hoặc nội dung nhạy cảm cần reviewer rõ ràng và nguồn tham khảo.

---

## 14. Search

Health search:

- Route FE: `/health/search`.
- Dùng `articleService.searchArticles`.
- BE `GET /articles` hỗ trợ `search`, `tags`, `categoryId`, sort/filter.
- Typesense cũng có index article/product phục vụ global search.

Route `/health/search` đã được register trong FE routes.

---

## 15. Seed data

BE có blog seed tại:

```text
src/services/seed.blog.ts
```

Seed gồm:

- Health categories.
- Bài viết sức khỏe.
- Metadata y tế như risk level, references, target audiences.

Dữ liệu seed dùng để dựng Health Hub có nội dung đủ chất lượng cho demo và smoke test.

---

## 16. Manual smoke test

### 16.1 Public Health Hub

1. Mở `/health`.
2. Kiểm tra:
   - Có category.
   - Có bài nổi bật/gần đây.
   - Có khu vực cá nhân hóa nếu đăng nhập.
3. Search một từ khóa như `ho`, `cảm cúm`, `paracetamol`.
4. Mở một bài viết.
5. Kiểm tra:
   - Nội dung render đúng.
   - Reviewer/sources hiển thị nếu có.
   - AI box hoạt động.
   - Save/follow hoạt động.
   - CTA điều hướng đúng.
   - Sản phẩm liên quan phù hợp chủ đề.

### 16.2 Pharmacist/Admin editor

1. Đăng nhập pharmacist hoặc admin.
2. Mở `/pharmacist/articles/new` hoặc `/admin/articles/new`.
3. Nhập title, category, excerpt, content.
4. Chạy các AI actions:
   - Outline.
   - Tóm tắt.
   - SEO.
   - FAQ.
   - Quality check.
   - Sources.
5. Kiểm tra:
   - Excerpt AI hiển thị trong panel và được áp dụng vào field tóm tắt.
   - FAQ chỉ hiển thị/chèn khi có question/answer hợp lệ.
   - Không có JSON thô bị chèn vào bài.
6. Lưu bài.
7. Admin publish bài.

### 16.3 Admin insights

1. Đăng nhập admin.
2. Mở `/admin/articles`.
3. Chọn tab `Insights`.
4. Đổi khoảng ngày 7/30/90/180.
5. Kiểm tra endpoint `/articles/admin/insights` trả 200.
6. Kiểm tra số liệu thay đổi theo dữ liệu thật.

---

## 17. Verification đã chạy

Các lệnh đã dùng trong quá trình triển khai:

```bash
# Backend
npm run build

# Frontend
npm run typecheck

# Python
python3 -m py_compile MEDISPACE_Chat_AI_Service/src/agents/article_agent.py
```

Playwright E2E đã có test cho admin insights:

```bash
npx playwright test tests/e2e/specs/blog-health-hub/admin-article.spec.ts \
  --config=playwright.blog.config.ts \
  --grep "insights tab"
```

---

## 18. Biến môi trường liên quan

BE:

| Biến | Ý nghĩa |
|------|---------|
| `CHAT_AI_URL` | URL Python Chat AI Service, mặc định `http://localhost:8003` |
| `DB_ARTICLES_COLLECTION` | Collection articles |
| `DB_HEALTH_CATEGORIES_COLLECTION` | Collection healthCategories |
| `DB_ARTICLE_JOURNEY_EVENTS_COLLECTION` | Collection articleJourneyEvents |
| `DB_PRODUCT_DETAILS_COLLECTION` | Collection productDetails |

Python:

| Biến | Ý nghĩa |
|------|---------|
| `CUSTOM_LLM_BASE_URL` | OpenAI-compatible LLM endpoint |
| `CUSTOM_LLM_MODEL` | Model dùng cho article agent |
| `ARTICLE_LLM_MAX_TOKENS_ASSIST` | Token limit cho authoring assist |
| `ARTICLE_LLM_MAX_TOKENS_ASK` | Token limit cho hỏi đáp bài viết |

---

## 19. Known limitations

- Chưa có UI admin để pin `relatedProductIds`; hiện related products mặc định là tự động.
- Related product scoring là rule-based, chưa dùng ML ranking riêng cho article-product.
- Tracking hiện ghi event, chưa có conversion attribution đầy đủ tới order/cart.
- AI answer dựa trên context rút gọn của bài, chưa có RAG nhiều nguồn ngoài bài.
- Notification cho followed topic chưa hoàn thiện end-to-end trong tài liệu này.
- Quiz/checker là checker điều hướng nội dung đơn giản, chưa phải symptom checker y tế chuyên sâu.

---

## 20. Hướng phát triển tiếp

- Thêm `relatedReasons` lên FE để giải thích vì sao sản phẩm liên quan.
- Tách article-product ranking thành service riêng nếu cần scale.
- Bổ sung conversion tracking từ article CTA tới cart/order.
- Thêm notification khi topic follow có bài mới.
- Bổ sung review workflow nhiều cấp cho bài `medication`, `disease`, `emergency-sensitive`.
- Thêm dashboard chi tiết theo từng bài: AI asks, product clicks, CTA conversion.
- Thêm cache cho `/articles/admin/insights` nếu dữ liệu lớn.

