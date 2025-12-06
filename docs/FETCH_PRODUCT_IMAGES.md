# 🖼️ LẤY ẢNH SẢN PHẨM THỰC TẾ

Script tự động tìm và download ảnh thực tế cho sản phẩm từ Google Images.

## 🚀 Cách Sử Dụng

### Bước 1: Lấy Google API Key (Miễn Phí)

1. **Tạo Google Cloud Project:**
   - Truy cập: https://console.cloud.google.com/
   - Click "Create Project"
   - Đặt tên project (vd: "medispace-images")

2. **Enable Custom Search API:**
   - Vào "APIs & Services" → "Library"
   - Tìm "Custom Search API"
   - Click "Enable"

3. **Tạo API Key:**
   - Vào "APIs & Services" → "Credentials"
   - Click "Create Credentials" → "API Key"
   - Copy API key

4. **Tạo Custom Search Engine:**
   - Truy cập: https://programmablesearchengine.google.com/
   - Click "Add"
   - Tên: "Product Images"
   - Sites to search: "Toàn bộ web"
   - Click "Create"
   - Copy "Search engine ID"

5. **Thêm vào `.env`:**
```bash
GOOGLE_API_KEY=your_api_key_here
GOOGLE_SEARCH_ENGINE_ID=your_search_engine_id_here
```

### Bước 2: Chạy Script

```bash
npm run fetch:images
```

## 📊 Kết Quả

Script sẽ:
- ✅ Tìm ảnh thực tế trên Google Images
- ✅ Download về `public/products/`
- ✅ Tạo file mapping `data/product-images.json`
- ✅ Fallback sang placeholder nếu không tìm thấy

## 🎯 Nguồn Ảnh

1. **Google Custom Search** (ưu tiên)
   - Limit: 100 queries/day (free)
   - Ảnh chất lượng cao

2. **Wikimedia Commons** (fallback)
   - Miễn phí, không giới hạn
   - Ảnh có license tự do

3. **Placeholder** (cuối cùng)
   - Luôn có sẵn
   - Hiển thị tên sản phẩm

## ⚙️ Cấu Hình

### Số lượng sản phẩm

Sửa trong `fetch-product-images.ts`:
```typescript
const testProducts = products.slice(0, 20) // Thay 20 = số lượng bạn muốn
```

### Delay giữa requests

```typescript
await new Promise(resolve => setTimeout(resolve, 1000)) // 1 giây
```

## 📝 Lưu Ý

### Bản Quyền
- ⚠️ Ảnh từ Google có thể có bản quyền
- ✅ Wikimedia Commons: Miễn phí sử dụng
- ✅ Cho dự án học tập: OK
- ⚠️ Cho production: Nên xin phép hoặc dùng ảnh tự chụp

### Rate Limiting
- Google: 100 queries/day (free tier)
- Wikimedia: Không giới hạn
- Script có delay 1s giữa mỗi request

### Troubleshooting

**Lỗi 403:**
- API key chưa đúng
- Chưa enable Custom Search API

**Không tìm thấy ảnh:**
- Tên sản phẩm quá chung chung
- Thử thêm keyword "thuốc" hoặc "hộp"

**Download lỗi:**
- URL ảnh hết hạn
- Firewall chặn

## 🎨 Kết Quả Mẫu

Sau khi chạy:
```
public/products/
├── paracetamol-500mg-abc123.jpg
├── vitamin-c-1000mg-def456.jpg
└── ...

data/product-images.json
```

File JSON:
```json
[
  {
    "productName": "Paracetamol 500mg",
    "imageUrl": "https://...",
    "localPath": "/products/paracetamol-500mg-abc123.jpg",
    "source": "google"
  }
]
```

## 🔄 Cập Nhật Seed Data

Sau khi có ảnh, cập nhật seed:
```typescript
// Trong seed.ts
const imageMapping = require('../data/product-images.json')

products.forEach(product => {
  const image = imageMapping.find(img => img.productName === product.name)
  if (image) {
    product.featuredImage = image.localPath
  }
})
```

## ✨ Tips

1. **Chạy từng đợt nhỏ** (20-30 sản phẩm) để tránh rate limit
2. **Kiểm tra ảnh** trước khi seed vào DB
3. **Backup** ảnh đã download
4. **Dùng Wikimedia** nếu không có Google API key
