# Đặc tả hệ thống Authentication & Authorization

> **Phiên bản:** 1.0
> **Cập nhật:** 2026-06-05
> **Phạm vi:** Backend MEDISPACE E-Commerce + Frontend React + Socket.IO realtime
> **Trạng thái:** Đã triển khai trên nhánh `feature/auth-flow-fixes`

---

## 1. Tổng quan

Hệ thống Auth của MEDISPACE sử dụng JWT (JSON Web Token) kết hợp httpOnly cookie để quản lý phiên đăng nhập. Thiết kế tuân theo các nguyên tắc:

- **Access token ngắn hạn** (15 phút) lưu trong `localStorage` phía FE.
- **Refresh token dài hạn** (30 hoặc 90 ngày) lưu trong httpOnly cookie, không thể đọc bằng JavaScript.
- **Token rotation**: mỗi lần refresh, refresh token cũ bị xóa và thay bằng token mới.
- **DB-backed validation**: mọi request đều query DB để kiểm tra user tồn tại, trạng thái ban, và lấy role/status hiện tại thay vì tin JWT payload cũ.
- **Token type enforcement**: mỗi validator kiểm tra `tokenType` để chống sử dụng nhầm loại token.
- **Session revocation**: đổi password hoặc reset password sẽ xóa toàn bộ refresh token, ép tất cả thiết bị đăng nhập lại.

---

## 2. Vai trò và trạng thái người dùng

### 2.1 UserRole

| Giá trị | Enum | Ý nghĩa |
|---------|------|---------|
| `0` | `Customer` | Khách hàng thông thường |
| `1` | `Pharmacist` | Dược sĩ, có quyền tạo/sửa bài viết, tạo đơn hàng tại quầy |
| `2` | `Admin` | Quản trị viên, toàn quyền |

### 2.2 UserStatus

| Giá trị | Enum | Ý nghĩa |
|---------|------|---------|
| `0` | `Unverified` | Chưa xác thực email, bị hạn chế tính năng |
| `1` | `Verified` | Đã xác thực email, sử dụng đầy đủ |
| `2` | `Banned` | Bị cấm, không thể đăng nhập hoặc thao tác |

### 2.3 TokenType

| Giá trị | Enum | Secret key | TTL |
|---------|------|-----------|-----|
| `0` | `AccessToken` | `JWT_SECRET_ACCESS_TOKEN` | 15 phút |
| `1` | `RefreshToken` | `JWT_SECRET_REFRESH_TOKEN` | 30 hoặc 90 ngày |
| `2` | `ForgotPasswordToken` | `JWT_SECRET_FORGOT_PASSWORD_TOKEN` | 7 ngày |
| `3` | `EmailVerifyToken` | `JWT_SECRET_EMAIL_VERIFY_TOKEN` | 7 ngày |

---

## 3. JWT Payload

### 3.1 Access Token

```json
{
  "userId": "ObjectId string",
  "tokenType": 0,
  "verify": 1,
  "role": 0,
  "iat": 1717578000,
  "exp": 1717578900
}
```

### 3.2 Refresh Token

```json
{
  "userId": "ObjectId string",
  "tokenType": 1,
  "verify": 1,
  "role": 0,
  "iat": 1717578000,
  "exp": 1720170000
}
```

### 3.3 Email Verify Token

```json
{
  "userId": "ObjectId string",
  "tokenType": 3,
  "verify": 0,
  "iat": 1717578000,
  "exp": 1718182800
}
```

### 3.4 Forgot Password Token

```json
{
  "userId": "ObjectId string",
  "tokenType": 2,
  "verify": 1,
  "iat": 1717578000,
  "exp": 1718182800
}
```

---

## 4. Mô hình dữ liệu

### 4.1 `users`

Các field liên quan đến auth:

| Field | Kiểu | Ý nghĩa |
|-------|------|---------|
| `_id` | ObjectId | ID người dùng |
| `email` | string | Email đăng nhập, unique |
| `password` | string | SHA256 hash |
| `role` | number | `UserRole` enum |
| `status` | number | `UserStatus` enum |
| `emailVerifyToken` | string | Token xác thực email hiện tại, rỗng nếu đã verify |
| `forgotPasswordToken` | string | Token quên mật khẩu hiện tại, rỗng nếu đã dùng |

### 4.2 `refreshTokens`

| Field | Kiểu | Ý nghĩa |
|-------|------|---------|
| `_id` | ObjectId | ID document |
| `userId` | ObjectId | Người sở hữu token |
| `token` | string | JWT refresh token string |
| `expiresAt` | Date | Thời điểm hết hạn, dùng cho TTL index |
| `created_at` | Date | Thời điểm tạo |

Indexes:

| Index | Mục đích |
|-------|---------|
| `{ token: 1 }` unique | Lookup và chống trùng |
| `{ userId: 1 }` | Xóa tất cả token theo user (revoke session) |
| `{ expiresAt: 1 }` TTL `expireAfterSeconds: 0` | MongoDB tự xóa token hết hạn |

---

## 5. Luồng nghiệp vụ chi tiết

### 5.1 Đăng ký (Register)

```
POST /users/register
```

**Middleware:** `registerValidator`
- Validate `firstName`, `lastName`, `email`, `password`, `confirm_password`.
- Check email chưa tồn tại trong DB.

**Luồng xử lý:**

1. Tạo `userId` mới.
2. Ký `emailVerifyToken` (type `EmailVerifyToken`, TTL 7 ngày).
3. Insert user vào DB với `status = Unverified`, `role = Customer`.
4. Gửi email xác thực chứa `emailVerifyToken`.
5. Trả về `{ message, userId }`.

**Không phát access/refresh token.** User phải xác thực email rồi đăng nhập riêng. Đây là quyết định bảo mật chủ động: không cấp session cho user chưa verify.

**Response:**

```json
{
  "message": "Registration successful",
  "userId": "665..."
}
```

### 5.2 Xác thực email (Verify Email)

```
POST /users/verify-email
```

**Middleware:** `emailVerifyTokenValidator`
- Verify JWT signature bằng `JWT_SECRET_EMAIL_VERIFY_TOKEN`.
- Check `tokenType === EmailVerifyToken`.
- Query DB: user tồn tại.
- So sánh `user.emailVerifyToken === value` (chống token cũ/replay).
- Nếu lỗi là `ErrorWithStatus` (ví dụ `USER_NOT_FOUND`), giữ nguyên lỗi gốc, không nuốt thành generic error.

**Luồng xử lý:**

1. Middleware validate token.
2. Controller kiểm tra nếu `emailVerifyToken === ''` → đã verify trước → trả thông báo.
3. Nếu chưa verify: set `emailVerifyToken = ''`, `status = Verified`.
4. Trả `{ message, result: { status: 1 } }`.

**Sau verify, user cần đăng nhập thủ công.** FE hiển thị nút "Đăng nhập ngay" redirect về `/login`.

### 5.3 Gửi lại email xác thực (Resend Verify Email)

```
POST /users/resend-verify-email
```

**Middleware:** `accessTokenValidator` — cần đăng nhập.

**Luồng:**

1. Kiểm tra user tồn tại.
2. Nếu đã `Verified` → trả thông báo "đã xác thực".
3. Ký `emailVerifyToken` mới, update vào DB.
4. Gửi email xác thực.

### 5.4 Đăng nhập (Login)

```
POST /users/login
```

**Middleware:** `loginValidator`
- Query user theo `email` + `hashPassword(password)`.
- Nếu không tìm thấy → `EMAIL_OR_PASSWORD_IS_NOT_CORRECT`.
- Nếu user bị `Banned` → `USER_BANNED` 403 Forbidden. **Block ngay ở middleware, không vào service.**
- Gán `req.user = user`.

**Luồng xử lý:**

1. Middleware validate email/password và check ban.
2. `login()` service:
   - Tính `refreshTokenExpiresIn` theo `rememberMe` (90d hoặc 30d).
   - Ký access token (15m) + refresh token (30d/90d) song song.
   - Insert refresh token vào `refreshTokens` collection với `expiresAt`.
3. Controller:
   - Set `refreshToken` vào httpOnly cookie, `maxAge` theo remember me.
   - Trả `accessToken` trong JSON response body.

**Response:**

```json
{
  "message": "Login successful",
  "result": {
    "accessToken": "eyJhbGciOi..."
  }
}
```

**Cookie:** `refreshToken=eyJ...; HttpOnly; SameSite=Lax; MaxAge=2592000000`

### 5.5 Đăng nhập bằng Google OAuth

```
GET /users/oauth/google?code=...
```

**Không có middleware auth.** Google redirect callback.

**Luồng xử lý:**

1. Đổi `code` lấy `id_token` + `access_token` từ Google.
2. Lấy user info từ Google API.
3. Nếu email Google chưa verified → reject.
4. Nếu email đã tồn tại trong DB:
   - **Check banned** → nếu bị ban, redirect FE `?error=banned`.
   - Ký access + refresh token, insert refresh token vào DB.
   - Set cookie, redirect FE `?accessToken=...`.
5. Nếu email chưa tồn tại:
   - Tạo user mới, `status = Verified`, `role = Customer`.
   - Ký token, insert refresh token.
   - Set cookie, redirect FE `?accessToken=...`.
6. Nếu bất kỳ lỗi nào khác → redirect FE `?error=oauth_failed`.

**FE (OAuth callback page `login/oauth`):**
- Nhận `accessToken` từ URL params.
- Lưu vào `localStorage`.
- Gọi `getMe()` để lấy user profile.
- Cập nhật `AuthContext`.
- Navigate theo role.

### 5.6 Đăng xuất (Logout)

```
POST /users/logout
```

**Middleware:** `accessTokenValidator` + `refreshTokenValidator`

**Luồng:**

1. `accessTokenValidator` xác thực access token, check user tồn tại/ban.
2. `refreshTokenValidator` xác thực refresh token từ cookie, check token tồn tại trong DB.
3. `logout()` service: `deleteOne({ token: refreshToken })`.
4. Controller: `clearCookie('refreshToken', ...)`.

**`refreshTokenValidator` gán `req.refreshToken`**, đảm bảo controller đọc đúng giá trị refresh token đã validate.

### 5.7 Refresh Token (Token Rotation)

```
POST /users/refresh-token
```

**Middleware:** `refreshTokenValidator`
- Verify JWT signature.
- Check `tokenType === RefreshToken`.
- Check token tồn tại trong DB (`refreshTokens`).
- Query user: tồn tại, không bị ban.
- Override `decodedRefreshToken.verify` và `decodedRefreshToken.role` từ DB hiện tại.

**Luồng xử lý:**

1. Controller tính `expiresIn` từ token cũ: `exp - iat > 31 ngày` → `'90d'`, ngược lại `'30d'`. Đây là cách **preserve remember-me lifetime**.
2. `refreshToken()` service:
   - `findOneAndDelete()` xóa refresh token cũ trước (consume trước, ký sau).
   - Nếu token cũ không tồn tại → throw error, không ký token mới.
   - Ký access + refresh token mới song song.
   - Insert refresh token mới với `expiresAt` mới.
3. Controller:
   - Set cookie mới, `maxAge` theo 30d/90d.
   - Trả `accessToken` mới.

**FE:**
- `apiClient` interceptor bắt 401 → gọi `refreshToken()`.
- Dùng promise singleton (`isRefreshing` + `refreshPromise`) để chống race condition nhiều request cùng lúc trong cùng một tab/app instance.
- `performTokenRefresh()` dùng `axios` thuần (không qua interceptor) để tránh loop.
- Guard `!url.includes('/refresh-token')` ngăn interceptor cố refresh chính request refresh.

### 5.8 Quên mật khẩu (Forgot Password)

```
POST /users/forgot-password
```

**Middleware:** `forgotPasswordValidator`
- Query user theo email.
- Nếu tìm thấy → gán `req.user`. Nếu không → trả response thành công (chống user enumeration).

**Luồng:**

1. Nếu `!req.user` → trả thành công giả (không leak thông tin email có tồn tại).
2. Ký `forgotPasswordToken` (type `ForgotPasswordToken`, TTL 7 ngày).
3. Lưu vào `user.forgotPasswordToken`.
4. Gửi email chứa link reset.

### 5.9 Xác thực Forgot Password Token

```
POST /users/verify-forgot-password
```

**Middleware:** `verifyForgotPasswordTokenValidator` — dùng `forgotPasswordTokenSchema`:
- Verify JWT.
- Check `tokenType === ForgotPasswordToken`.
- Query DB: user tồn tại.
- So sánh `user.forgotPasswordToken === value`.
- Nếu lỗi là `ErrorWithStatus` → re-throw (không nuốt `USER_NOT_FOUND`).

### 5.10 Đặt lại mật khẩu (Reset Password)

```
POST /users/reset-password
```

**Middleware:** `resetPasswordValidator` — validate `password`, `confirmPassword`, `forgotPasswordToken`.

**Luồng:**

1. Update password mới + clear `forgotPasswordToken`.
2. **Xóa toàn bộ refresh tokens** của user → ép tất cả thiết bị đăng nhập lại.

### 5.11 Đổi mật khẩu (Change Password)

```
PUT /users/change-password
```

**Middleware:** `accessTokenValidator` + `verifiedUserValidator` + `changePasswordValidator`
- Chỉ user đã verified mới đổi được.
- Middleware kiểm tra `currentPassword` đúng.

**Luồng:**

1. Verify current password.
2. Update password mới.
3. **Xóa toàn bộ refresh tokens** → ép tất cả thiết bị đăng nhập lại.

---

## 6. Middleware Validators chi tiết

### 6.1 `accessTokenValidator`

Dùng cho: mọi route cần đăng nhập.

Luồng:

```text
1. Lấy token từ header `Authorization: Bearer <token>`
2. Verify JWT signature bằng JWT_SECRET_ACCESS_TOKEN
3. Check tokenType === AccessToken
   → Nếu sai: INVALID_ACCESS_TOKEN 401
4. Query DB: findOne({ _id: userId }, { role, status })
   → Nếu không tìm thấy: USER_NOT_FOUND 401
   → Nếu banned: USER_BANNED 403
5. Override decoded.verify = user.status (từ DB)
6. Override decoded.role = user.role (từ DB)
7. Gán req.decoded_authorization = decoded
```

Đặc biệt: catch block kiểm tra `error instanceof ErrorWithStatus` → re-throw nguyên vẹn (không map tất cả thành `INVALID_ACCESS_TOKEN`).

### 6.2 `refreshTokenValidator`

Dùng cho: `/logout`, `/refresh-token`.

Luồng:

```text
1. Lấy refreshToken từ body hoặc cookie
2. Verify JWT + query DB refreshTokens song song (Promise.all)
3. Check tokenType === RefreshToken
   → Sai: throw JsonWebTokenError → map INVALID_REFRESH_TOKEN 401
4. Check refreshTokenDoc tồn tại
   → Null: USED_REFRESH_TOKEN_OR_NOT_EXISTS 401
5. Query user từ DB
   → Không tồn tại: USER_NOT_FOUND 401
   → Bị ban: USER_BANNED 403
6. Override decodedRefreshToken.verify/.role từ DB
7. Gán req.decodedRefreshToken + req.refreshToken
```

### 6.3 `verifiedUserValidator`

Middleware đồng bộ, chạy sau `accessTokenValidator`.

```text
1. Đọc verify từ req.decoded_authorization
   (Giá trị này đã được refresh từ DB trong accessTokenValidator)
2. Nếu verify === Unverified → USER_NOT_VERIFIED 403
```

### 6.4 `emailVerifyTokenValidator`

```text
1. Verify JWT bằng JWT_SECRET_EMAIL_VERIFY_TOKEN
2. Check tokenType === EmailVerifyToken
3. Query DB: user tồn tại
4. So sánh user.emailVerifyToken === value
5. Catch: ErrorWithStatus → re-throw, khác → INVALID_EMAIL_VERIFY_TOKEN
```

### 6.5 `forgotPasswordTokenSchema`

```text
1. Verify JWT bằng JWT_SECRET_FORGOT_PASSWORD_TOKEN
2. Check tokenType === ForgotPasswordToken
3. Query DB: user tồn tại
4. So sánh user.forgotPasswordToken === value
5. Catch: ErrorWithStatus → re-throw, khác → INVALID_FORGOT_PASSWORD_TOKEN
```

---

## 7. Socket.IO Authentication

Realtime chat và community cũng kiểm tra auth đúng chuẩn.

### 7.1 Middleware Socket Auth

```text
1. Lấy token từ socket.handshake.auth.token
2. Verify JWT bằng JWT_SECRET_ACCESS_TOKEN
3. Check tokenType === AccessToken
4. Query DB: user tồn tại, không bị Banned
5. Gán socket.userId, socket.userRole từ DB hiện tại
```

User bị ban sẽ **không thể kết nối socket**, không chỉ bị chặn ở REST API.

### 7.2 Rate Limiting

Socket có rate limit: **15 messages / 60 giây / user** để chống spam. Áp dụng cho tất cả loại message gửi qua socket.

---

## 8. Frontend Auth Architecture

### 8.1 Token Storage

| Token | Nơi lưu | Đọc bằng JS | Gửi tự động |
|-------|---------|-------------|-------------|
| Access token | `localStorage` (`medispace_access_token`) | ✅ | Không, FE gắn thủ công vào header |
| Refresh token | httpOnly cookie | ❌ | ✅ Browser gửi tự động khi `withCredentials: true` |
| User data cache | `localStorage` (`medispace_user_data`) | ✅ | Không |

### 8.2 AuthContext — Session Restore khi mở app

Khi mount `AuthProvider`:

```text
1. Có access token?
   ├── Có → Có user data cache?
   │   ├── Có → Set state ngay (fast render) → gọi getMe() cập nhật lại
   │   └── Không → Gọi getMe()
   │       ├── Thành công → Set state
   │       └── Thất bại → Clear tokens
   └── Không → Thử refresh token (cookie)
       ├── Thành công → Lưu access token mới → gọi getMe()
       └── Thất bại → Clear state, user chưa đăng nhập
```

### 8.3 apiClient — Interceptor 401 Auto-refresh

```text
Request → 401 response
  → Đã retry? → Reject
  → URL là /refresh-token? → Reject (tránh loop)
  → Gọi refreshToken() (singleton promise)
  → Thành công → Retry request gốc với token mới
  → Thất bại → Clear auth state → Redirect /login
```

### 8.4 FE Service Methods

| Method | Endpoint | Ghi chú |
|--------|----------|---------|
| `authService.login()` | `POST /users/login` | Trả accessToken, refreshToken trong cookie |
| `authService.register()` | `POST /users/register` | Chỉ trả userId |
| `authService.logout()` | `POST /users/logout` | Cookie bị clear server-side + client-side |
| `authService.refreshToken()` | `POST /users/refresh-token` | Cookie tự gửi |
| `authService.verifyEmail()` | `POST /users/verify-email` | Không cần auth |
| `authService.forgotPassword()` | `POST /users/forgot-password` | Không cần auth |
| `authService.resetPassword()` | `POST /users/reset-password` | Không cần auth |
| `authService.changePassword()` | `PUT /users/change-password` | Cần access token |
| `authService.getMe()` | `GET /users/me` | Cần access token |

---

## 9. Phân quyền theo route

### 9.1 Public routes (không cần auth)

| Route | Middleware |
|-------|-----------|
| `POST /users/register` | `registerValidator` |
| `POST /users/login` | `loginValidator` |
| `GET /users/oauth/google` | Không |
| `POST /users/verify-email` | `emailVerifyTokenValidator` |
| `POST /users/forgot-password` | `forgotPasswordValidator` |
| `POST /users/verify-forgot-password` | `verifyForgotPasswordTokenValidator` |
| `POST /users/reset-password` | `resetPasswordValidator` |
| `POST /users/refresh-token` | `refreshTokenValidator` |

### 9.2 Authenticated routes (cần access token)

| Route | Middleware bổ sung |
|-------|-------------------|
| `POST /users/logout` | `refreshTokenValidator` |
| `POST /users/resend-verify-email` | Không |
| `GET /users/me` | Không |
| `PATCH /users/me` | `verifiedUserValidator`, `updateMeValidator` |
| `PUT /users/change-password` | `verifiedUserValidator`, `changePasswordValidator` |
| Wishlist routes | Không |

### 9.3 Role-based routes

Các route admin/pharmacist dùng nhiều middleware theo từng module:

| Nhóm route | Middleware chính |
|------------|------------------|
| Products write routes | `accessTokenValidator`, `verifiedUserValidator`, `adminOrPharmacistRequired` |
| Products delete | `accessTokenValidator`, `verifiedUserValidator`, `adminRequired` |
| Categories create/update/delete/admin-tree | `accessTokenValidator`, `verifiedUserValidator`, `adminRequired` |
| Categories toggle-status | `accessTokenValidator`, `verifiedUserValidator`, `adminOrPharmacistRequired` |
| Admin routes, admin community, moderation, campaigns, coupons | `accessTokenValidator`, `verifiedUserValidator`, `adminRequired` |
| Articles admin routes | `accessTokenValidator`, `adminValidator` |
| Pharmacist routes | Middleware dược sĩ riêng theo router/module |

Lưu ý: codebase hiện có nhiều helper phân quyền (`adminRequired`, `adminOrPharmacistRequired`, `adminValidator`, `pharmacistValidator`) do lịch sử module khác nhau. Khi thêm route mới nên ưu tiên middleware hiện đang dùng trong router cùng module.

---

## 10. Bảo mật và kiểm soát

### 10.1 Đã triển khai

| Biện pháp | Chi tiết |
|-----------|---------|
| Token type enforcement | Mỗi validator check `tokenType`, chống cross-use |
| DB-backed role/status | Không tin JWT payload cũ, luôn query DB |
| Banned user guard | Block ở login (middleware), access token (middleware), refresh token (middleware), socket (middleware), OAuth (service) |
| Token rotation | Refresh token cũ bị xóa khi dùng |
| Session revocation | Reset/change password xóa toàn bộ refresh tokens |
| httpOnly cookie | Refresh token không đọc được bằng JS, chống XSS |
| Error specificity | Banned → `USER_BANNED` 403, không nuốt thành generic error |
| Anti-enumeration | Forgot password trả response giả nếu email không tồn tại |
| Socket auth | Realtime cũng kiểm tra token type, user exists, banned |
| Rate limiting | Socket: 15 msg/60s/user |

### 10.2 Lưu ý

| Điểm | Ghi chú |
|------|---------|
| Password hashing | Dùng SHA256 + `PASSWORD_SECRET` pepper, chưa dùng bcrypt/scrypt/Argon2. Đủ cho MVP nhưng nên nâng cấp cho production. |
| Access token blacklist | Chưa có. Access token hết hạn sau 15m nên rủi ro chấp nhận được. |
| Refresh token reuse detection | Chưa có family tracking. Nếu token bị đánh cắp và replay, hệ thống xóa token cũ nhưng không xóa toàn bộ family. |
| CORS | `sameSite: 'lax'` cho cookie, `withCredentials: true` cho axios. |
| CSRF | Không có CSRF token riêng. Dựa vào `sameSite: lax` + header `Authorization` cho các request mutating. |

---

## 11. Biến môi trường liên quan

### Backend (.env)

| Biến | Ý nghĩa |
|------|---------|
| `JWT_SECRET_ACCESS_TOKEN` | Secret ký access token |
| `JWT_SECRET_REFRESH_TOKEN` | Secret ký refresh token |
| `JWT_SECRET_EMAIL_VERIFY_TOKEN` | Secret ký email verify token |
| `JWT_SECRET_FORGOT_PASSWORD_TOKEN` | Secret ký forgot password token |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret |
| `GOOGLE_REDIRECT_URI` | URI Google redirect sau OAuth |
| `CLIENT_REDIRECT_URI` | URI FE nhận callback OAuth |
| `FRONTEND_URLS` | Danh sách origin FE cho CORS socket |

### Frontend (.env)

| Biến | Ý nghĩa |
|------|---------|
| `VITE_API_URL` | Base URL backend API |
| `VITE_GOOGLE_CLIENT_ID` | Google OAuth client ID |
| `VITE_GOOGLE_REDIRECT_URI` | URI redirect cho Google OAuth |

---

## 12. Files chính

### Backend

| File | Vai trò |
|------|---------|
| `src/services/users.services.ts` | Business logic: register, login, oauth, logout, refresh, verify, reset/change password |
| `src/middlewares/users.middlewares.ts` | Validators: register, login, accessToken, refreshToken, emailVerify, forgotPassword, changePassword, verifiedUser |
| `src/controllers/users.controllers.ts` | Request handlers, cookie management, OAuth redirect |
| `src/routes/users.routes.ts` | Route definitions và middleware chains |
| `src/constants/enum.ts` | TokenType, UserRole, UserStatus enums |
| `src/constants/message.ts` | Error/success message constants |
| `src/models/schemas/User.schema.ts` | User model |
| `src/models/schemas/RefreshToken.schema.ts` | RefreshToken model |
| `src/utils/jwt.ts` | signToken, verifyToken utilities |
| `src/utils/crypto.ts` | hashPassword utility |
| `src/sockets/chat.socket.ts` | Socket.IO auth middleware + connection handler |
| `src/services/database.services.ts` | Database indexes cho refreshTokens |

### Frontend

| File | Vai trò |
|------|---------|
| `src/contexts/AuthContext.tsx` | Auth state management, session restore, login/register/logout |
| `src/services/authService.ts` | API calls cho auth endpoints |
| `src/services/apiClient.ts` | Axios instance, interceptor 401 auto-refresh |
| `src/routes/login.oauth.tsx` | OAuth callback handler |
| `src/components/auth/VerifyEmailPage.tsx` | Email verification UI |

---

## 13. Sequence Diagrams

### 13.1 Login Flow

```text
User                FE                      BE                     DB
 |  email/password   |                       |                      |
 |------------------>|  POST /users/login     |                      |
 |                   |---------------------->|  query user by       |
 |                   |                       |  email + hash(pwd)   |
 |                   |                       |--------------------->|
 |                   |                       |  user found          |
 |                   |                       |<---------------------|
 |                   |                       |  check banned        |
 |                   |                       |  sign AT + RT        |
 |                   |                       |  insert RT to DB     |
 |                   |                       |--------------------->|
 |                   |  Set-Cookie: RT       |                      |
 |                   |  { accessToken }      |                      |
 |                   |<----------------------|                      |
 |                   |  save AT localStorage |                      |
 |                   |  GET /users/me        |                      |
 |                   |---------------------->|  validate AT         |
 |                   |                       |  query user (fresh)  |
 |                   |  { user }             |                      |
 |                   |<----------------------|                      |
 |  logged in        |                       |                      |
 |<------------------|                       |                      |
```

### 13.2 Token Refresh Flow

```text
FE                           BE                          DB
 |  request (expired AT)      |                           |
 |-------------------------->|  401 Unauthorized          |
 |<--------------------------|                            |
 |  POST /refresh-token       |                           |
 |  (cookie: RT)              |                           |
 |-------------------------->|  verify RT JWT             |
 |                            |  check tokenType          |
 |                            |  check RT in DB           |
 |                            |  check user exists/banned  |
 |                            |  findOneAndDelete(old RT)  |
 |                            |--------------------------->|
 |                            |  sign new AT + RT          |
 |                            |  insert new RT             |
 |                            |--------------------------->|
 |  Set-Cookie: new RT        |                           |
 |  { accessToken: new AT }   |                           |
 |<--------------------------|                            |
 |  retry original request    |                           |
 |  with new AT               |                           |
 |-------------------------->|                            |
```

### 13.3 Register → Verify → Login Flow

```text
User                FE                      BE                     DB
 |  register         |                       |                      |
 |------------------>|  POST /users/register  |                      |
 |                   |---------------------->|  insert user          |
 |                   |                       |  (Unverified)         |
 |                   |                       |--------------------->|
 |                   |                       |  send verify email    |
 |                   |  { userId }           |                      |
 |                   |<----------------------|                      |
 |  "Check your      |                       |                      |
 |   email"          |                       |                      |
 |<------------------|                       |                      |
 |                   |                       |                      |
 |  click email link |                       |                      |
 |------------------>|  POST /verify-email    |                      |
 |                   |  { emailVerifyToken }  |                      |
 |                   |---------------------->|  verify token         |
 |                   |                       |  set Verified         |
 |                   |  "Verified!"          |                      |
 |                   |<----------------------|                      |
 |  click "Login"    |                       |                      |
 |------------------>|  → /login page        |                      |
 |  login normally   |                       |                      |
```

---

## 14. Hướng phát triển tiếp

Ưu tiên đề xuất:

1. **Nâng cấp password hashing**: chuyển từ SHA256 sang bcrypt hoặc Argon2.
2. **Refresh token family tracking**: phát hiện token reuse → revoke toàn bộ family.
3. **Access token blacklist**: Redis-based blacklist cho trường hợp ban user cần revoke tức thì.
4. **Multi-factor authentication**: OTP qua email/SMS cho admin và dược sĩ.
5. **Audit log cho auth events**: ghi login, logout, password change, ban/unban.
6. **Session management UI**: cho user xem và revoke các phiên đăng nhập trên các thiết bị.
7. **CSRF token**: bổ sung CSRF protection cho các action mutating qua cookie.
8. **Rate limiting cho auth endpoints**: chống brute-force login, register, forgot-password.
