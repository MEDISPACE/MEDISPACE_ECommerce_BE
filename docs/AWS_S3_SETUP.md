# Hướng Dẫn Cấu Hình AWS S3 Cho Media Upload

## 📋 Tổng Quan

Hệ thống đã được chuyển đổi từ lưu trữ local sang AWS S3 để:
- ✅ Tăng khả năng mở rộng (scalability)
- ✅ Giảm tải cho server
- ✅ Tăng tốc độ truy cập với CDN
- ✅ Backup và bảo mật tốt hơn

---

## 🚀 BƯỚC 1: Tạo AWS Account và S3 Bucket

### 1.1. Tạo AWS Account
1. Truy cập: https://aws.amazon.com/
2. Click "Create an AWS Account"
3. Điền thông tin và xác thực tài khoản

### 1.2. Tạo S3 Bucket
1. Đăng nhập AWS Console
2. Tìm kiếm "S3" trong thanh tìm kiếm
3. Click "Create bucket"
4. Cấu hình:
   ```
   Bucket name: medispace-media-storage (hoặc tên bạn muốn)
   AWS Region: ap-southeast-1 (Singapore - gần VN nhất)
   
   Object Ownership: ACLs disabled
   Block Public Access: ✅ Block all public access (BỎ TICK để public)
   
   Bucket Versioning: Disable
   Default encryption: Enable (Server-side encryption with Amazon S3 managed keys)
   ```
5. Click "Create bucket"

### 1.3. Cấu hình Bucket Policy (Cho phép public read)
1. Vào bucket vừa tạo
2. Tab "Permissions" → "Bucket Policy"
3. Click "Edit" và paste policy sau:

```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Sid": "PublicReadGetObject",
            "Effect": "Allow",
            "Principal": "*",
            "Action": "s3:GetObject",
            "Resource": "arn:aws:s3:::medispace-media-storage/*"
        }
    ]
}
```

**LƯU Ý**: Thay `medispace-media-storage` bằng tên bucket của bạn

### 1.4. Cấu hình CORS (Cho phép upload từ frontend)
1. Tab "Permissions" → "Cross-origin resource sharing (CORS)"
2. Click "Edit" và paste:

```json
[
    {
        "AllowedHeaders": ["*"],
        "AllowedMethods": ["GET", "PUT", "POST", "DELETE", "HEAD"],
        "AllowedOrigins": ["*"],
        "ExposeHeaders": ["ETag"]
    }
]
```

---

## 🔑 BƯỚC 2: Tạo IAM User và Access Keys

### 2.1. Tạo IAM User
1. Tìm kiếm "IAM" trong AWS Console
2. Menu bên trái: "Users" → "Create user"
3. User name: `medispace-s3-uploader`
4. Click "Next"

### 2.2. Gán Quyền (Permissions)
1. Chọn "Attach policies directly"
2. Tìm và chọn: `AmazonS3FullAccess`
3. Click "Next" → "Create user"

### 2.3. Tạo Access Key
1. Click vào user vừa tạo
2. Tab "Security credentials"
3. Scroll xuống "Access keys" → "Create access key"
4. Chọn: "Application running outside AWS"
5. Click "Next" → "Create access key"
6. **LƯU LẠI**:
   - Access key ID: `AKIA...`
   - Secret access key: `wJalr...` (chỉ hiện 1 lần!)

---

## ⚙️ BƯỚC 3: Cấu Hình Environment Variables

Mở file `.env` và thêm/cập nhật:

```env
# AWS S3 Configuration
AWS_REGION=ap-southeast-1
AWS_ACCESS_KEY_ID=AKIA...your_access_key_id
AWS_SECRET_ACCESS_KEY=wJalr...your_secret_access_key
AWS_S3_BUCKET_NAME=medispace-media-storage
```

---

## 📁 BƯỚC 4: Cấu Trúc Thư Mục Trên S3

Sau khi upload, files sẽ được tổ chức như sau:

```
medispace-media-storage/
├── images/
│   ├── 123e4567-e89b-12d3-a456-426614174000.jpeg
│   ├── 234e5678-e89b-12d3-a456-426614174001.jpeg
│   └── ...
└── videos/
    ├── 345e6789-e89b-12d3-a456-426614174002.mp4
    ├── 456e7890-e89b-12d3-a456-426614174003.mov
    └── ...
```

---

## 🔄 BƯỚC 5: Đăng Ký Route (Nếu chưa có)

Mở file `src/index.ts` và thêm:

```typescript
import mediasRouter from './routes/medias.route'

// ... các import khác

app.use('/medias', mediasRouter)
```

Và import initFolder:

```typescript
import { initFolder } from './utils/file'

// Sau dòng databaseService.connect()
initFolder() // Tạo thư mục temp nếu chưa có
```

---

## 🧪 BƯỚC 6: Test Upload

### 6.1. Test với Postman/Thunder Client

**Upload Image:**
```http
POST http://localhost:8000/medias/upload-image
Headers:
  Authorization: Bearer {your_access_token}
Body (form-data):
  image: [chọn file ảnh] (có thể chọn nhiều, tối đa 4)
```

**Upload Video:**
```http
POST http://localhost:8000/medias/upload-video
Headers:
  Authorization: Bearer {your_access_token}
Body (form-data):
  video: [chọn file video .mp4 hoặc .mov]
```

### 6.2. Response Mẫu

```json
{
  "url": [
    {
      "url": "https://medispace-media-storage.s3.ap-southeast-1.amazonaws.com/images/123e4567-e89b-12d3-a456-426614174000.jpeg",
      "type": 0
    }
  ],
  "message": "Image uploaded successfully"
}
```

---

## 📊 LUỒNG HOẠT ĐỘNG

### Upload Image Flow:
```
Client
  ↓ (multipart/form-data)
Server (formidable)
  ↓ (lưu vào uploads/images-temp/)
Sharp Processing
  ↓ (convert to JPEG, optimize)
Upload to S3
  ↓ (images/uuid.jpeg)
Delete Local Files
  ↓
Return S3 URL to Client
```

### Upload Video Flow:
```
Client
  ↓ (multipart/form-data)
Server (formidable)
  ↓ (lưu vào uploads/videos-temp/)
Upload to S3
  ↓ (videos/uuid.mp4)
Delete Local Files
  ↓
Return S3 URL to Client
```

---

## 🔧 Troubleshooting

### Lỗi: "Access Denied"
- ✅ Kiểm tra IAM user có quyền S3FullAccess
- ✅ Kiểm tra Access Key và Secret Key đúng
- ✅ Kiểm tra Bucket Policy đã cấu hình đúng

### Lỗi: "Bucket not found"
- ✅ Kiểm tra tên bucket trong .env
- ✅ Kiểm tra region đúng

### Lỗi: "CORS policy"
- ✅ Kiểm tra CORS configuration trong S3 bucket

### File không public được
- ✅ Tắt "Block all public access" trong bucket settings
- ✅ Thêm Bucket Policy như hướng dẫn

---

## 💰 Chi Phí AWS S3

### Free Tier (12 tháng đầu):
- 5GB storage
- 20,000 GET requests
- 2,000 PUT requests

### Sau Free Tier:
- Storage: ~$0.023/GB/tháng
- PUT/POST: $0.005/1000 requests
- GET: $0.0004/1000 requests

**Ước tính**: Với 10GB storage + 100k requests/tháng ≈ $0.50 - $1.00/tháng

---

## 🎯 Best Practices

1. **Bảo mật**:
   - Không commit Access Keys vào Git
   - Sử dụng IAM roles khi deploy lên EC2/ECS
   - Rotate Access Keys định kỳ

2. **Tối ưu**:
   - Compress ảnh trước khi upload (đã có Sharp)
   - Sử dụng CloudFront CDN để tăng tốc
   - Set lifecycle policy để xóa file tạm

3. **Monitoring**:
   - Bật CloudWatch để theo dõi usage
   - Set billing alerts

---

## 📚 Tài Liệu Tham Khảo

- [AWS S3 Documentation](https://docs.aws.amazon.com/s3/)
- [AWS SDK for JavaScript v3](https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/)
- [Sharp Documentation](https://sharp.pixelplumbing.com/)

---

## ✅ Checklist

- [ ] Tạo AWS Account
- [ ] Tạo S3 Bucket
- [ ] Cấu hình Bucket Policy
- [ ] Cấu hình CORS
- [ ] Tạo IAM User
- [ ] Tạo Access Keys
- [ ] Cập nhật .env
- [ ] Đăng ký route trong index.ts
- [ ] Test upload image
- [ ] Test upload video
- [ ] Verify files trên S3
- [ ] Verify public access

---

**Hoàn thành!** 🎉

Bạn đã chuyển đổi thành công từ local storage sang AWS S3!
