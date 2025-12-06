# Test Media Upload với S3

## Chuẩn Bị

1. **Đảm bảo server đang chạy:**
```bash
npm run dev
```

2. **Lấy access token:**
- Đăng nhập để lấy access token
- Hoặc sử dụng token có sẵn

## Test Upload Image

### Sử dụng cURL:

```bash
curl -X POST http://localhost:8000/medias/upload-image \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -F "image=@/path/to/your/image.jpg"
```

### Sử dụng Postman/Thunder Client:

1. **Method:** POST
2. **URL:** `http://localhost:8000/medias/upload-image`
3. **Headers:**
   - `Authorization: Bearer YOUR_ACCESS_TOKEN`
4. **Body:** form-data
   - Key: `image` (type: File)
   - Value: Chọn file ảnh (có thể chọn nhiều, tối đa 4)

### Response mẫu:

```json
{
  "url": [
    {
      "url": "https://your-bucket.s3.ap-southeast-1.amazonaws.com/images/123e4567-e89b-12d3-a456-426614174000.jpeg",
      "type": 0
    }
  ],
  "message": "Image uploaded successfully"
}
```

## Test Upload Video

### Sử dụng cURL:

```bash
curl -X POST http://localhost:8000/medias/upload-video \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -F "video=@/path/to/your/video.mp4"
```

### Sử dụng Postman/Thunder Client:

1. **Method:** POST
2. **URL:** `http://localhost:8000/medias/upload-video`
3. **Headers:**
   - `Authorization: Bearer YOUR_ACCESS_TOKEN`
4. **Body:** form-data
   - Key: `video` (type: File)
   - Value: Chọn file video (.mp4 hoặc .mov)

### Response mẫu:

```json
{
  "url": [
    {
      "url": "https://your-bucket.s3.ap-southeast-1.amazonaws.com/videos/234e5678-e89b-12d3-a456-426614174001.mp4",
      "type": 1
    }
  ],
  "message": "Video uploaded successfully"
}
```

## Kiểm Tra Trên S3

1. Đăng nhập AWS Console
2. Vào S3 → Chọn bucket của bạn
3. Kiểm tra thư mục `images/` và `videos/`
4. Verify file đã được upload
5. Click vào file → Copy URL
6. Mở URL trong browser để xem file

## Giới Hạn Upload

### Image:
- **Số lượng:** Tối đa 4 files/request
- **Kích thước mỗi file:** Tối đa 2MB
- **Tổng kích thước:** Tối đa 8MB
- **Format:** Chỉ chấp nhận image/* (jpg, png, gif, etc.)
- **Output:** Luôn convert sang JPEG với quality 80%

### Video:
- **Số lượng:** 1 file/request
- **Kích thước:** Tối đa 50MB
- **Format:** mp4, mov (quicktime)
- **Output:** Giữ nguyên format gốc

## Xử Lý Lỗi

### 400 Bad Request - "File is not valid"
- File không đúng format
- Image: Phải là image/*
- Video: Phải là mp4 hoặc quicktime

### 400 Bad Request - "File is empty"
- Không có file được gửi lên
- Kiểm tra key trong form-data phải là `image` hoặc `video`

### 413 Payload Too Large
- File vượt quá giới hạn kích thước
- Image: > 2MB/file hoặc > 8MB total
- Video: > 50MB

### 401 Unauthorized
- Access token không hợp lệ hoặc đã hết hạn
- User chưa verify email

### 500 Internal Server Error
- Lỗi khi upload lên S3
- Kiểm tra AWS credentials trong .env
- Kiểm tra S3 bucket permissions
- Xem logs để biết chi tiết

## Debug

### Kiểm tra logs:

```bash
# Server logs sẽ hiển thị:
# - File received
# - Processing with Sharp
# - Uploading to S3
# - S3 URL returned
```

### Kiểm tra thư mục temp:

```bash
ls -la uploads/images-temp/
ls -la uploads/videos-temp/
```

**Lưu ý:** Thư mục temp phải rỗng sau khi upload thành công (files đã bị xóa)

## Tích Hợp Vào Frontend

### Upload Image Example (JavaScript):

```javascript
async function uploadImage(file) {
  const formData = new FormData()
  formData.append('image', file)
  
  const response = await fetch('http://localhost:8000/medias/upload-image', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`
    },
    body: formData
  })
  
  const data = await response.json()
  return data.url[0].url // S3 URL
}
```

### Upload Video Example (JavaScript):

```javascript
async function uploadVideo(file) {
  const formData = new FormData()
  formData.append('video', file)
  
  const response = await fetch('http://localhost:8000/medias/upload-video', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`
    },
    body: formData
  })
  
  const data = await response.json()
  return data.url[0].url // S3 URL
}
```

### React Example với Progress:

```jsx
import { useState } from 'react'

function ImageUploader() {
  const [uploading, setUploading] = useState(false)
  const [imageUrl, setImageUrl] = useState('')
  
  const handleUpload = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    
    setUploading(true)
    try {
      const url = await uploadImage(file)
      setImageUrl(url)
      alert('Upload thành công!')
    } catch (error) {
      alert('Upload thất bại: ' + error.message)
    } finally {
      setUploading(false)
    }
  }
  
  return (
    <div>
      <input 
        type="file" 
        accept="image/*" 
        onChange={handleUpload}
        disabled={uploading}
      />
      {uploading && <p>Đang upload...</p>}
      {imageUrl && <img src={imageUrl} alt="Uploaded" />}
    </div>
  )
}
```

## Performance Tips

1. **Compress ảnh trước khi upload** (client-side) để giảm thời gian upload
2. **Sử dụng loading indicator** để UX tốt hơn
3. **Validate file size** ở client trước khi gửi lên server
4. **Resize ảnh lớn** trước khi upload nếu không cần độ phân giải cao

## Security Notes

1. ✅ Chỉ user đã đăng nhập mới upload được
2. ✅ Chỉ user đã verify email mới upload được
3. ✅ Validate file type và size ở server
4. ✅ Files được lưu với UUID random → không đoán được
5. ✅ S3 bucket có CORS policy → chỉ frontend được phép access

---

**Happy Testing!** 🚀
