# Đặc tả tính năng: Cộng đồng, kiểm duyệt và AI Moderation

> **Phiên bản:** 1.1
> **Cập nhật:** 2026-06-03
> **Phạm vi:** Backend MEDISPACE E-Commerce, có ghi chú các màn hình FE liên quan
> **Trạng thái:** Đã triển khai trên nhánh tính năng `feature/ai-moderation-community`

---

## 1. Tổng quan

Tính năng Cộng đồng cho phép người dùng MEDISPACE tham gia các phòng thảo luận theo chủ đề sức khỏe, gửi tin nhắn, theo dõi hội thoại theo thời gian thực và tương tác với các thành viên khác trong cùng phòng.

Vì đây là môi trường liên quan đến sức khỏe, tính năng không chỉ là một kênh chat đơn thuần. Hệ thống cần có lớp kiểm soát nghiệp vụ để hạn chế thông tin nguy hiểm, nội dung nhạy cảm, spam, lạm dụng, chia sẻ thông tin cá nhân và các lời khuyên y tế không an toàn. Do đó, phần cộng đồng được thiết kế cùng với hệ thống kiểm duyệt nhiều lớp:

- Kiểm duyệt rule-based ngay khi người dùng gửi tin.
- Hàng đợi kiểm duyệt cho admin.
- Hành động quản trị như ẩn, khôi phục, xóa tin nhắn, mute hoặc ban người dùng.
- Luồng appeal để người dùng khiếu nại khi bị mute, ban hoặc khi tin nhắn bị xử lý.
- AI Moderation để hỗ trợ đánh giá nội dung có rủi ro và tạo audit job rõ ràng.
- Realtime events để cập nhật message, member, unread count và moderation event cho FE.

Mục tiêu cuối cùng là tạo một không gian trao đổi có ích cho người dùng nhưng vẫn có khả năng kiểm soát rủi ro vận hành, pháp lý và an toàn y tế.

---

## 2. Phạm vi tính năng

### 2.1 Phần đã triển khai

Tính năng hiện tại bao gồm:

- Quản lý phòng cộng đồng trong admin:
  - Tạo phòng.
  - Cập nhật tên, slug, visibility, disease key.
  - Archive và unarchive phòng.
  - Tìm kiếm, lọc và phân trang danh sách phòng.
- Quyền tham gia phòng:
  - Phòng `public`: người dùng có thể join trực tiếp.
  - Phòng `private`: người dùng gửi yêu cầu tham gia, admin duyệt.
  - Admin có thể invite thành viên bằng `userId` hoặc email.
  - Admin có thể cập nhật trạng thái thành viên.
- Chat trong phòng:
  - Gửi tin nhắn.
  - Danh sách tin nhắn có thông tin người gửi.
  - Phân biệt tin của mình và tin của người khác ở FE.
  - Realtime message event.
  - Unread count và message/member count.
- Kiểm duyệt:
  - Rule-based moderation khi gửi tin.
  - Report message.
  - Moderation queue cho admin.
  - Admin action.
  - Audit history cho moderation actions.
- Appeal:
  - Người dùng gửi appeal cho ban, mute hoặc message.
  - Admin approve/reject appeal.
  - Có thể xem appeal đang mở và lịch sử appeal theo filter.
- AI Moderation:
  - Tự động enqueue nếu bật `AI_MODERATION_ENABLED`.
  - Admin có thể chạy AI review thủ công cho từng message.
  - AI job audit list.
  - Retry job.
  - Mock mode ổn định cho e2e.
  - Sanitize lỗi và redact dữ liệu nhạy cảm trước khi gửi prompt.

### 2.2 Phần nằm ngoài phạm vi hiện tại

Các phần dưới đây chưa phải mục tiêu chính của phiên bản này:

- Phân quyền moderator riêng trong từng phòng ở UI đầy đủ.
- Dashboard metric chuyên sâu cho AI moderation.
- Tự động cleanup toàn bộ dữ liệu test/e2e.
- Notification đầy đủ cho mọi event appeal/join request.
- Bộ rule moderation cấu hình động từ admin.
- Flow invite external user chưa tồn tại tài khoản.

---

## 3. Vai trò người dùng

### 3.1 Guest

Guest có thể xem danh sách phòng public tùy endpoint/public UI, nhưng không thể join, gửi tin, report hoặc appeal nếu chưa đăng nhập.

### 3.2 Customer/User đã xác thực

Người dùng đã xác thực có thể:

- Xem danh sách phòng public.
- Xem danh sách phòng của mình, bao gồm private room mà họ đang active hoặc được invite.
- Join public room.
- Gửi request join private room.
- Accept invite bằng cách join room đã được invite.
- Gửi tin nhắn nếu là active member và không bị mute/ban.
- Report message.
- Đánh dấu phòng đã đọc.
- Gửi appeal khi bị mute, ban hoặc khi message bị xử lý.

### 3.3 Admin

Admin có thể:

- Tạo và quản lý phòng.
- Duyệt hoặc từ chối thành viên.
- Invite thành viên.
- Xem toàn bộ moderation queue.
- Xử lý message và user qua moderation action.
- Chạy AI review thủ công.
- Retry AI job.
- Xem audit actions.
- Xử lý appeal.

---

## 4. Luồng nghiệp vụ chính

### 4.1 Tạo phòng cộng đồng

Admin tạo phòng từ admin UI hoặc API `/admin/community/rooms`.

Dữ liệu tối thiểu:

- `name`
- `slug`
- `visibility`: `public` hoặc `private`
- `diseaseKey`

Sau khi tạo:

- Room có `status=active`.
- `slug` là duy nhất.
- Room xuất hiện trong admin room list.
- Public room có thể xuất hiện trong danh sách public.
- Private room chỉ xuất hiện với admin hoặc user có quan hệ thành viên phù hợp.

### 4.2 Tham gia phòng public

Người dùng gọi:

```http
POST /community/rooms/:roomId/join
```

Nếu room là public:

- Hệ thống tạo hoặc cập nhật membership.
- Member chuyển thành `active`.
- Emit realtime `community:member:joined`.
- Người dùng có thể đọc/gửi tin nhắn.

### 4.3 Xin tham gia phòng private

Người dùng gọi:

```http
POST /community/rooms/:roomId/join-request
```

Nếu room là private:

- Hệ thống tạo membership `status=pending`.
- Emit event cho admin: `community:member:requested`.
- FE hiển thị trạng thái đã gửi yêu cầu.
- Nút join/request nên bị disable hoặc đổi trạng thái để tránh gửi lặp.

Admin duyệt bằng:

```http
PATCH /admin/community/rooms/:roomId/members/:userId
```

Với body ví dụ:

```json
{
  "status": "active"
}
```

Sau khi duyệt:

- Member được active.
- User có thể join realtime room.
- User có thể đọc/gửi tin nhắn.

### 4.4 Invite thành viên vào phòng private

Admin gọi:

```http
POST /admin/community/rooms/:roomId/invite
```

Body có thể dùng:

```json
{
  "userId": "..."
}
```

Hoặc:

```json
{
  "email": "user@example.com"
}
```

Hệ thống:

- Tìm user theo `userId` hoặc email.
- Tạo hoặc cập nhật membership `status=invited`.
- Emit event `community:member:invited` đến user.
- Khi user gọi join, membership chuyển thành `active`.

### 4.5 Gửi tin nhắn

Người dùng gửi:

```http
POST /community/rooms/:roomId/messages
```

Body:

```json
{
  "content": "Nội dung tin nhắn"
}
```

Luồng xử lý:

1. Kiểm tra room tồn tại và active.
2. Kiểm tra user là active member.
3. Kiểm tra user không bị ban.
4. Kiểm tra user không bị mute hoặc `mutedUntil` đã hết hạn.
5. Insert message.
6. Chạy rule-based moderation.
7. Nếu nội dung vi phạm nặng, tự động ẩn message.
8. Nếu cần review, tạo moderation finding.
9. Nếu AI moderation được bật, enqueue AI job.
10. Emit realtime event tương ứng.

Nếu message visible:

- Emit `community:message:new` cho room.

Nếu message bị auto hide:

- Emit `community:message:hidden` cho user gửi.
- Admin nhận `community:moderation:queued`.

Khi lấy danh sách tin nhắn, message `hidden` vẫn có thể được trả về cho chính sender. Đây là chủ ý UX để người gửi biết tin của mình đã bị ẩn, trong khi các thành viên khác không thấy nội dung đó.

### 4.6 Report message

User report message qua:

```http
POST /community/messages/:messageId/report
```

Hệ thống:

- Kiểm tra reporter có quyền truy cập room.
- Không cho report trùng cùng message bởi cùng user.
- Tạo record trong `moderationReports`.
- Tạo hoặc cập nhật `moderationFindings`.
- Tăng `reportCount`.
- Emit `community:moderation:queued` cho admin.

Để tránh race condition, `moderationReports` có unique index theo `{ messageId, reporterId }`. Nếu hai request report song song cùng tới, request thứ hai sẽ bị duplicate key và trả về conflict thay vì tạo thêm report.

### 4.7 Admin xử lý moderation queue

Admin xem queue:

```http
GET /admin/moderation/queue
```

Admin chọn action:

```http
PATCH /admin/moderation/messages/:messageId/action
```

Các action hiện hỗ trợ:

- `approve`
- `hide`
- `delete`
- `restore_message`
- `mute_user`
- `ban_user`
- `unmute_user`
- `unban_user`
- `reopen_finding`

Sau khi xử lý:

- Message hoặc member được cập nhật.
- Finding được chuyển `resolved` hoặc mở lại bằng `reopen_finding` nếu phù hợp.
- Ghi audit vào `moderationActions`.
- Emit realtime event cho room/user/admin.

### 4.8 Appeal

User gửi appeal:

```http
POST /community/rooms/:roomId/appeals
```

Body cho ban/mute:

```json
{
  "type": "ban",
  "reason": "Lý do khiếu nại"
}
```

Body cho message:

```json
{
  "type": "message",
  "messageId": "...",
  "reason": "Tôi cho rằng tin nhắn này bị ẩn nhầm"
}
```

Rule:

- Không tạo appeal trùng đang mở cho cùng `roomId + userId + type + messageId`.
- Appeal mới có `status=open`.
- Admin có thể xem trong `/admin/moderation/appeals`.

Admin xử lý:

```http
PATCH /admin/moderation/appeals/:appealId
```

Body:

```json
{
  "decision": "approved",
  "notes": "Đã kiểm tra lại"
}
```

Khi approve:

- Appeal `ban`: member chuyển về trạng thái có thể tham gia lại.
- Appeal `mute`: xóa mute, member có thể chat lại.
- Appeal `message`: khôi phục message nếu hợp lệ.

Khi reject:

- Appeal đóng với `status=rejected`.
- Không thay đổi trạng thái ban/mute/message.

---

## 5. Mô hình dữ liệu

### 5.1 `communityRooms`

Đại diện cho phòng cộng đồng.

| Trường | Kiểu | Ý nghĩa |
|--------|------|---------|
| `_id` | ObjectId | ID phòng |
| `name` | string | Tên hiển thị |
| `slug` | string | Định danh duy nhất |
| `visibility` | `public` / `private` | Quyền xem/tham gia |
| `diseaseKey` | string | Chủ đề/nhóm bệnh |
| `status` | `active` / `archived` | Trạng thái phòng |
| `createdBy` | ObjectId | Admin tạo phòng |
| `createdAt` | Date | Thời điểm tạo |
| `updatedAt` | Date | Thời điểm cập nhật |

### 5.2 `communityRoomMembers`

Đại diện cho quan hệ user-room.

| Trường | Kiểu | Ý nghĩa |
|--------|------|---------|
| `roomId` | ObjectId | Phòng |
| `userId` | ObjectId | Người dùng |
| `role` | `member` / `moderator` | Vai trò trong phòng |
| `status` | `active` / `pending` / `invited` / `left` / `banned` | Trạng thái thành viên |
| `mutedUntil` | Date/null | Thời điểm hết mute. Mute không phải một giá trị `status`; FE phải đọc field này để xác định user đang bị mute. |
| `lastReadAt` | Date/null | Mốc đọc cuối cùng |
| `joinedAt` | Date | Thời điểm tham gia |
| `updatedAt` | Date | Thời điểm cập nhật |

### 5.3 `communityMessages`

Đại diện cho tin nhắn trong phòng.

| Trường | Kiểu | Ý nghĩa |
|--------|------|---------|
| `_id` | ObjectId | ID tin nhắn |
| `roomId` | ObjectId | Phòng chứa tin nhắn |
| `senderId` | ObjectId | Người gửi |
| `content` | string | Nội dung |
| `status` | `visible` / `hidden` / `deleted` | Trạng thái hiển thị |
| `moderated` | object | Kết quả kiểm duyệt rule/AI |
| `createdAt` | Date | Thời điểm gửi |
| `updatedAt` | Date | Thời điểm cập nhật |

### 5.4 `moderationFindings`

Đại diện cho một item trong hàng đợi kiểm duyệt.

| Trường | Ý nghĩa |
|--------|---------|
| `roomId` | Phòng liên quan |
| `messageId` | Tin nhắn liên quan |
| `senderId` | Người gửi tin |
| `trigger` | Nguồn tạo finding: `auto`, `user_report`, `ai` |
| `status` | `open`, `resolved` |
| `severity` | `low`, `medium`, `high`, `critical` |
| `categories` | Nhóm vi phạm |
| `confidence` | Độ tin cậy |
| `reasons` | Lý do |
| `ai` | Kết quả AI nếu có |
| `reportCount` | Số report |

### 5.5 `moderationActions`

Audit log cho hành động admin.

Ghi nhận:

- Admin thực hiện.
- Action.
- Room/message/user liên quan.
- Ghi chú.
- Thời điểm thực hiện.

### 5.6 `moderationAppeals`

Đại diện cho khiếu nại của user.

| Trường | Ý nghĩa |
|--------|---------|
| `roomId` | Phòng liên quan |
| `userId` | Người gửi appeal |
| `messageId` | Message liên quan nếu type là `message` |
| `type` | `ban`, `mute`, `message` |
| `reason` | Lý do appeal |
| `status` | `open`, `approved`, `rejected` |
| `resolvedBy` | Admin xử lý |
| `resolvedAt` | Thời điểm xử lý |
| `resolutionNotes` | Ghi chú xử lý |

### 5.7 `moderationAiJobs`

Đại diện cho một lần AI review message.

| Trường | Ý nghĩa |
|--------|---------|
| `messageId` | Tin nhắn cần review |
| `roomId` | Phòng |
| `senderId` | Người gửi |
| `promptVersion` | Version prompt |
| `status` | `pending`, `running`, `succeeded`, `failed` |
| `attempts` | Số lần chạy |
| `lockedUntil` | Lock xử lý job |
| `lastError` | Lỗi đã sanitize |
| `aiResult` | Kết quả AI |
| `applied` | Kết quả apply vào message/finding |
| `latencyMs` | Thời gian gọi AI |

---

## 6. API chi tiết

### 6.1 Community API

Base path:

```http
/community
```

| Method | Endpoint | Quyền | Mô tả |
|--------|----------|-------|-------|
| `GET` | `/rooms` | Public/optional auth | Danh sách phòng public, hỗ trợ search/filter |
| `GET` | `/rooms/my` | User đã xác thực | Danh sách phòng user có quyền thấy |
| `POST` | `/rooms` | Admin | Tạo phòng, endpoint legacy |
| `POST` | `/rooms/:roomId/join` | User | Join public room hoặc accept invite |
| `POST` | `/rooms/:roomId/join-request` | User | Gửi yêu cầu vào private room |
| `POST` | `/rooms/:roomId/leave` | User | Rời phòng |
| `POST` | `/rooms/:roomId/read` | User | Đánh dấu đã đọc |
| `POST` | `/rooms/:roomId/appeals` | User | Gửi appeal |
| `GET` | `/rooms/:roomId/messages` | Member | Lấy danh sách tin nhắn |
| `POST` | `/rooms/:roomId/messages` | Member active | Gửi tin nhắn |
| `POST` | `/messages/:messageId/report` | User có quyền room | Report tin nhắn |

### 6.2 Admin Community API

Base path:

```http
/admin/community
```

Tất cả endpoint yêu cầu admin.

| Method | Endpoint | Mô tả |
|--------|----------|-------|
| `GET` | `/rooms` | Danh sách phòng admin, có search/filter/pagination |
| `POST` | `/rooms` | Tạo phòng |
| `PATCH` | `/rooms/:roomId` | Cập nhật phòng |
| `PATCH` | `/rooms/:roomId/archive` | Lưu trữ phòng |
| `PATCH` | `/rooms/:roomId/unarchive` | Mở lại phòng |
| `GET` | `/rooms/:roomId/members` | Danh sách thành viên |
| `PATCH` | `/rooms/:roomId/members/:userId` | Cập nhật thành viên |
| `POST` | `/rooms/:roomId/invite` | Mời thành viên |

### 6.3 Admin Moderation API

Base path:

```http
/admin/moderation
```

| Method | Endpoint | Mô tả |
|--------|----------|-------|
| `GET` | `/queue` | Hàng đợi kiểm duyệt |
| `GET` | `/actions` | Lịch sử hành động kiểm duyệt |
| `GET` | `/appeals` | Danh sách appeal |
| `GET` | `/ai-jobs` | Danh sách AI moderation jobs |
| `POST` | `/ai-jobs/:jobId/retry` | Retry AI job |
| `PATCH` | `/appeals/:appealId` | Duyệt/từ chối appeal |
| `PATCH` | `/messages/:messageId/action` | Thực hiện moderation action |
| `POST` | `/messages/:messageId/ai-review` | Chạy lại AI review cho message |

---

## 7. AI Moderation

### 7.1 Mục tiêu

AI Moderation không thay thế admin. Nó là lớp hỗ trợ để:

- Phát hiện nội dung có rủi ro mà rule-based có thể bỏ sót.
- Tạo queue item cho admin review.
- Tự động ẩn nội dung nguy hiểm khi confidence đủ cao.
- Lưu audit job để truy vết model, latency, kết quả và lỗi.

### 7.2 Cấu hình môi trường

| Biến môi trường | Mặc định | Ý nghĩa |
|-----------------|----------|---------|
| `AI_MODERATION_ENABLED` | `false` | Bật tự động enqueue AI review khi gửi message |
| `AI_MODERATION_BASE_URL` | rỗng | Base URL OpenAI-compatible, ví dụ `http://localhost:8001/v1` |
| `AI_MODERATION_MODEL` | `gemma-4-e4b-it.gguf` | Tên model |
| `AI_MODERATION_API_KEY` | rỗng | API key nếu provider yêu cầu |
| `AI_MODERATION_MOCK` | `false` | Mock mode cho test/e2e |
| `AI_MODERATION_TIMEOUT_MS` | `12000` | Timeout gọi provider |
| `AI_MODERATION_MAX_ATTEMPTS` | `3` | Số lần thử tối đa |
| `AI_MODERATION_WORKER_INTERVAL_MS` | `5000` | Chu kỳ worker |
| `AI_MODERATION_HIDE_CONFIDENCE` | `0.78` | Ngưỡng tự động ẩn |
| `AI_MODERATION_REVIEW_CONFIDENCE` | `0.55` | Ngưỡng đưa vào queue |

Hệ thống cũng hỗ trợ fallback từ:

- `CUSTOM_LLM_BASE_URL`
- `CUSTOM_LLM_API_KEY`
- `CUSTOM_LLM_MODEL`

### 7.3 Luồng xử lý AI job

1. Message được gửi hoặc admin bấm chạy AI review.
2. Hệ thống upsert job theo `messageId + promptVersion`.
3. Worker lấy job `pending`, chuyển sang `running`.
4. Hệ thống gọi `reviewText()`.
5. Nội dung message được redact email/số điện thoại trước khi đưa vào prompt.
6. Provider trả JSON.
7. Hệ thống normalize kết quả.
8. Nếu `shouldHide=true`, severity cao và confidence đạt ngưỡng, message bị ẩn.
9. Nếu cần review, hệ thống tạo hoặc cập nhật `moderationFindings`.
10. Job chuyển sang `succeeded`.
11. Nếu lỗi, job chuyển sang `failed`, lưu `lastError` đã sanitize.

Trong một process, service có cờ `running` để tránh worker tự chạy chồng lên nhau. Nếu triển khai nhiều instance, cơ chế chống xử lý trùng dựa vào DB lock `lockedUntil` trên `moderationAiJobs`, đây mới là lớp bảo vệ chính.

### 7.4 Schema kết quả AI mong muốn

```json
{
  "severity": "low",
  "categories": [],
  "confidence": 0.92,
  "shouldHide": false,
  "requiresHumanReview": false,
  "reason": "Nội dung an toàn",
  "suggestedAction": "none"
}
```

Giá trị hợp lệ:

- `severity`: `low`, `medium`, `high`, `critical`
- `categories`: `pii`, `spam`, `toxic`, `medical_harm`, `harassment`, `unsafe_advice`, `self_harm`, `other`
- `suggestedAction`: `none`, `review`, `hide`

### 7.5 Mock mode cho e2e

Khi bật:

```bash
AI_MODERATION_MOCK=true
```

Hệ thống không gọi provider thật.

Nội dung có marker:

- `[ai-hide]` hoặc `AI_E2E_HIDE`: trả về severity `high`, confidence `0.95`, auto hide.
- `[ai-review]` hoặc `AI_E2E_REVIEW`: trả về severity `medium`, cần review.
- Nội dung khác: trả về `low`.

Mock mode chỉ dùng cho test/e2e, không bật ở staging/prod.

### 7.6 Bảo mật và dữ liệu nhạy cảm

Các biện pháp đã có:

- Email và số điện thoại được thay bằng `[email]`, `[phone]` trước khi gửi sang LLM.
- Không lưu prompt raw vào DB.
- Không log API key.
- `lastError` được lọc Bearer token/API key trước khi lưu.
- AI result chỉ là tín hiệu hỗ trợ; admin vẫn có quyền sửa bằng action và appeal.

Rủi ro còn lại:

- Nội dung message gốc vẫn được lưu trong DB vì đây là bản chất của chat.
- Nếu dùng provider AI bên ngoài, cần đánh giá privacy, DPA và chính sách dữ liệu trước khi bật production.
- AI có thể false positive hoặc false negative, nên không nên coi AI là nguồn quyết định tuyệt đối.

---

## 8. Realtime

Socket.IO dùng các room:

| Room | Ý nghĩa |
|------|---------|
| `user:{userId}` | Kênh cá nhân của user |
| `admins` | Kênh admin |
| `community:room:{roomId}` | Kênh realtime của phòng cộng đồng |

Client join phòng bằng:

- `community:room:join`
- `community:room:leave`

Các event chính:

| Event | Người nhận | Ý nghĩa |
|-------|------------|---------|
| `community:message:new` | Room | Có message mới |
| `community:message:hidden` | Room/User | Message bị ẩn |
| `community:message:deleted` | Room/User | Message bị xóa |
| `community:member:joined` | Room | Có member join |
| `community:member:left` | Room | Có member rời phòng |
| `community:member:updated` | Room/User | Trạng thái member thay đổi |
| `community:member:requested` | Admin | Có request vào private room |
| `community:member:invited` | User | User được invite |
| `community:room:read` | User | User đã đọc phòng |
| `community:moderation:queued` | Admin | Có finding cần duyệt |
| `community:appeal:created` | User/Admin flow | Appeal được tạo |
| `community:appeal:resolved` | User | Appeal đã xử lý |

FE dùng các event này để cập nhật:

- Danh sách tin nhắn.
- Message count.
- Unread count.
- Member count.
- Trạng thái moderation/appeal.

---

## 9. Chỉ mục MongoDB

Các index quan trọng:

| Collection | Index | Mục đích |
|------------|-------|----------|
| `communityRooms` | `{ slug: 1 } unique` | Chống trùng slug |
| `communityRooms` | `{ visibility: 1, status: 1, createdAt: -1 }` | List/filter room |
| `communityRoomMembers` | `{ roomId: 1, userId: 1 } unique` | Một user chỉ có một membership trong room |
| `communityRoomMembers` | `{ roomId: 1, status: 1, updatedAt: -1 }` | List member theo room/status |
| `communityRoomMembers` | `{ userId: 1, status: 1, updatedAt: -1 }` | List phòng của user |
| `communityMessages` | `{ roomId: 1, createdAt: -1 }` | List message |
| `communityMessages` | `{ senderId: 1, createdAt: -1 }` | Query message theo user |
| `communityMessages` | `{ status: 1, createdAt: -1 }` | Query message theo trạng thái |
| `moderationFindings` | `{ status: 1, createdAt: -1 }` | Queue admin |
| `moderationFindings` | `{ roomId: 1, status: 1, createdAt: -1 }` | Queue theo phòng |
| `moderationFindings` | `{ messageId: 1 } unique` | Một finding chính cho mỗi message |
| `moderationReports` | `{ messageId: 1, createdAt: -1 }` | Report theo message |
| `moderationReports` | `{ messageId: 1, reporterId: 1 } unique` | Chống duplicate report, kể cả khi có request song song |
| `moderationActions` | `{ messageId: 1, createdAt: -1 }` | Audit action |
| `moderationAppeals` | `{ status: 1, createdAt: -1 }` | Appeal queue |
| `moderationAppeals` | `{ roomId: 1, userId: 1, status: 1, createdAt: -1 }` | Chống/truy vấn appeal trùng |
| `moderationAiJobs` | `{ status: 1, lockedUntil: 1, createdAt: 1 }` | Worker lấy job |
| `moderationAiJobs` | `{ messageId: 1, promptVersion: 1 } unique` | Upsert job theo message/version |

---

## 10. Admin UI liên quan

Dù tài liệu nằm ở BE, các API này đang được FE sử dụng ở các màn:

| Màn hình FE | Vai trò |
|-------------|---------|
| `AdminCommunityPage` | Quản lý phòng, thành viên, invite, duyệt private request |
| `AdminModerationPage` | Xem queue, xử lý action, xem appeals, xem AI jobs |
| Community room list | Hiển thị room, trạng thái join/request, member/message/unread count |
| Community room detail | Chat realtime trong room |

Các cải tiến UX đã có:

- Hiển thị rõ trạng thái đã gửi request.
- Disable button theo member status.
- Hiển thị tên/avatar người gửi trong room.
- Filter/search trong admin room và moderation.
- Appeal có thể xem theo trạng thái, không chỉ appeal đang mở.
- AI job audit có status, retry, search/filter.

---

## 11. Kiểm thử

### 11.1 Backend

Build:

```bash
npm run build
```

Toàn bộ test:

```bash
npm test -- --run
```

Test riêng AI moderation:

```bash
npm test -- --run src/tests/aiModeration.services.test.ts
```

### 11.2 Seed tài khoản e2e

```bash
cd MEDISPACE_ECommerce_BE
npm run seed:e2e
```

Seed tạo/cập nhật các tài khoản test:

- Admin e2e.
- Customer e2e.
- Customer2 e2e.

### 11.3 E2E community thông thường

```bash
cd MEDISPACE_ECommerce_FE
npm run test:e2e -- --reporter=list
```

Luồng được kiểm tra:

- Tạo private room.
- Gửi request join.
- Admin approve member.
- Realtime message/unread count.
- Moderation ban.
- Appeal và approve appeal.

### 11.4 E2E AI moderation ổn định

Chạy backend mock:

```bash
cd MEDISPACE_ECommerce_BE
PORT=8010 AI_MODERATION_MOCK=true AI_MODERATION_ENABLED=true npm run dev
```

Chạy FE trỏ vào backend mock:

```bash
cd MEDISPACE_ECommerce_FE
VITE_API_URL=http://localhost:8010 npm run dev -- --port 3000
```

Chạy spec:

```bash
E2E_AI_MODERATION=true \
E2E_API_URL=http://localhost:8010 \
E2E_BASE_URL=http://localhost:3000 \
npm run test:e2e -- --reporter=list tests/e2e/specs/community-ai-moderation.spec.ts
```

Spec này kiểm tra:

- Tạo room.
- Join room.
- Gửi message có marker AI.
- Admin chạy AI review.
- AI job `succeeded`.
- Message bị auto hide.
- Finding `trigger=ai` được tạo.
- Admin UI hiển thị AI job audit.

### 11.5 Smoke test AI provider thật

Nên chạy smoke mà không in API key/base URL ra log.

Ví dụ:

```bash
AI_MODERATION_BASE_URL=http://your-provider/v1 \
AI_MODERATION_MODEL=your-model \
AI_MODERATION_TIMEOUT_MS=60000 \
npx tsx -e "import aiModerationService from './src/services/aiModeration.services'; (async()=>{ const r=await aiModerationService.reviewText('Tôi bị ho nhẹ, có nên uống thuốc theo hướng dẫn bác sĩ không?'); console.log({severity:r.severity, confidence:r.confidence, shouldHide:r.shouldHide, suggestedAction:r.suggestedAction}); })()"
```

Ghi chú vận hành:

- Timeout mặc định `12000ms` có thể thấp nếu model cold start.
- Với provider local hoặc model lớn, nên cân nhắc `60000ms`.

---

## 12. Vận hành và monitoring

Nên theo dõi:

- Số lượng AI job theo trạng thái `pending`, `running`, `failed`, `succeeded`.
- Latency AI trung bình, p50, p95.
- Tỷ lệ AI job failed.
- Số message bị auto hide.
- Số moderation finding đang mở.
- Số appeal đang mở.
- Tỷ lệ appeal approved/rejected.
- Số join request private room chưa xử lý.
- Socket connection/join room error.

Cảnh báo nên có:

- AI job pending quá lâu.
- AI provider timeout tăng đột biến.
- Auto hide tăng bất thường.
- Appeal tồn đọng quá lâu.
- Moderation queue tăng nhanh trong thời gian ngắn.

---

## 13. Rủi ro và kiểm soát

### 13.1 Rủi ro nghiệp vụ

- Người dùng có thể chia sẻ lời khuyên y tế nguy hiểm.
- Người dùng có thể chia sẻ thông tin cá nhân.
- Rule-based moderation có thể bắt nhầm hoặc bỏ sót.
- AI moderation có thể đánh giá sai.
- Admin xử lý không nhất quán nếu thiếu audit/context.

### 13.2 Kiểm soát đã có

- Rule-based moderation ngay khi gửi tin.
- AI review hỗ trợ đánh giá sâu hơn.
- Queue để admin kiểm tra thủ công.
- Audit action.
- Appeal flow để khôi phục khi xử lý sai.
- Private room có request/approve.
- Member status rõ ràng: `pending`, `invited`, `active`, `banned`, `left`; trạng thái mute được biểu diễn bằng `mutedUntil`.

### 13.3 Kiểm soát nên bổ sung

- Dashboard SLA moderation.
- Notification admin khi có appeal hoặc private join request mới.
- Rule engine cấu hình được từ admin.
- Báo cáo/export audit moderation.
- Chính sách retention dữ liệu moderation.
- Đánh giá privacy nếu dùng AI provider bên ngoài.

---

## 14. Những việc nên làm tiếp

Ưu tiên đề xuất:

1. Thêm dashboard metric cho AI moderation.
2. Thêm notification cho admin khi có join request, finding hoặc appeal mới.
3. Thêm cleanup/retry job cho AI jobs bị lock quá lâu.
4. Chuẩn hóa retention policy cho moderation data.
5. Bổ sung rule-based moderation có cấu hình động.
6. Thêm export audit cho moderation actions và appeals.
7. Chạy staging test với AI provider thật và timeout production-like.

---

## 15. Tóm tắt

Tính năng cộng đồng hiện không chỉ là một room chat. Nó là một workflow hoàn chỉnh gồm:

- Quản lý phòng.
- Quản lý thành viên.
- Chat realtime.
- Private join request/invite.
- Kiểm duyệt rule-based.
- Kiểm duyệt bằng AI.
- Admin action.
- Audit log.
- Appeal.
- E2E ổn định.

Thiết kế hiện tại đủ để đưa vào PR và kiểm thử staging. Trước khi bật rộng ở production, nên ưu tiên monitoring, notification cho admin và rà lại chính sách dữ liệu khi dùng AI provider thật.
