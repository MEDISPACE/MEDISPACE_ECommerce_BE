# MediSpace Notification System Spec

## 1. Overview

Notification System là lớp thông báo nội bộ của MediSpace cho customer, pharmacist và admin. Tính năng này tồn tại để người dùng biết ngay các sự kiện quan trọng như đơn hàng, thanh toán, vận chuyển, đơn thuốc, đổi trả, bảo mật, tồn kho và hội thảo cộng đồng mà không phải tự làm mới từng màn hình nghiệp vụ.

Người dùng chính gồm customer xem thông báo trong tài khoản, pharmacist nhận việc cần xử lý, và admin nhận cảnh báo vận hành. Luồng tổng quát: service nghiệp vụ phát sinh sự kiện, `NotificationService` kiểm tra preference/idempotency, ghi MongoDB collection `notifications`, sau đó đẩy realtime qua Socket.IO nếu socket server đang sẵn sàng. Frontend nhận `notification:new`, hiển thị toast, invalidate React Query và tải lại danh sách/count qua REST API.

```text
Business services
  | order/payment/prescription/return/review/community/security/stock events
  v
NotificationService -> MongoDB notifications -> REST /notifications
  |                                         ^
  v                                         |
Socket.IO notification:new -------------- Frontend hooks/pages/dropdowns
```

## 2. Database Layer

### Collections

| Collection | Purpose | Source |
|---|---|---|
| `notifications` | Lưu từng notification theo user nhận | `src/models/schemas/Notification.schema.ts`, `src/services/database.services.ts` |
| `users` | Lưu user nhận notification và field động `notificationPreferences` | `src/models/schemas/User.schema.ts`, `src/services/notifications.services.ts` |
| `orders`, `prescriptions`, `return_requests`, `reviews`, `products`, `communityVideoEvents`, `communityVideoEventRegistrations` | Nguồn phát sinh sự kiện notification | các service nghiệp vụ tương ứng |

### `notifications` Schema

| Field | Type | Required | Notes |
|---|---:|---:|---|
| `_id` | `ObjectId` | No | MongoDB generated nếu không truyền |
| `userId` | `ObjectId` | Yes | User nhận notification |
| `type` | `NotificationTypeEnum` | Yes | `order`, `payment`, `shipping`, `prescription`, `promotion`, `reminder`, `system`, `review`, `return`, `security`, `community` |
| `title` | `string` | Yes | Tiêu đề hiển thị |
| `message` | `string` | Yes | Nội dung hiển thị |
| `isRead` | `boolean` | No | Default `false` |
| `readAt` | `Date` | No | Set khi mark read/read-all |
| `actionUrl` | `string` | No | Deep link FE như `/account/orders` |
| `metadata` | `Record<string, unknown>` | No | Business payload: `orderId`, `orderNumber`, `status`, `trackingNumber`, `eventId`, ... |
| `targetRole` | `customer/admin/pharmacist` | No | Default `customer` |
| `eventKey` | `string` | No | Idempotency key theo business event |
| `createdAt` | `Date` | No | Default current date |

### Indexes

Defined in `src/services/database.services.ts`:

| Index | Options | Purpose |
|---|---|---|
| `{ userId: 1, isRead: 1, createdAt: -1 }` | non-unique | List/count unread nhanh theo user |
| `{ userId: 1, targetRole: 1, createdAt: -1 }` | non-unique | Query theo role và user |
| `{ targetRole: 1, createdAt: -1 }` | non-unique | Role feed/audit |
| `{ userId: 1, eventKey: 1 }` | unique, partial when `eventKey` exists and is string | Chống duplicate notification cho cùng user/event |

### Preferences

`notificationPreferences` được đọc/ghi trên collection `users` bởi `NotificationService`, nhưng hiện chưa khai báo trong `User.schema.ts`. Default:

| Group | Fields | Default |
|---|---|---|
| `channels` | `inApp`, `email`, `push`, `sms` | `true`, `true`, `false`, `false` |
| `types` | tất cả `NotificationTypeEnum` | `true` |

Types luôn bật cho in-app bất kể preference: `order`, `payment`, `shipping`, `prescription`, `return`, `security`.

## 3. Backend - API Layer

All endpoints live in `src/routes/notifications.routes.ts`, use `accessTokenValidator` and `verifiedUserValidator`, and are handled by `src/controllers/notifications.controllers.ts`.

| Method | Path | Controller | Request | Success | Errors |
|---|---|---|---|---|---|
| `GET` | `/notifications` | `getNotificationsController` | Query `page?: int>=1`, `limit?: int 1..100`, `filter?: all/unread/order/payment/shipping/prescription/promotion/system/reminder/review/return/security/community` | `200 { message, result: Notification[], pagination }` | validation errors from `getNotificationsValidator`, auth/verified errors |
| `GET` | `/notifications/unread-count` | `getUnreadCountController` | none | `200 { message, result: { count } }` | auth/verified errors |
| `GET` | `/notifications/preferences` | `getNotificationPreferencesController` | none | `200 { message, result: NotificationPreferences }` | auth/verified errors |
| `PATCH` | `/notifications/preferences` | `updateNotificationPreferencesController` | Partial `{ channels?, types? }` | `200 { message: 'Notification preferences updated', result }` | auth/verified errors; no strict body validator currently |
| `PATCH` | `/notifications/read-all` | `markAllAsReadController` | none | `200 { message: 'All notifications marked as read' }` | auth/verified errors |
| `PATCH` | `/notifications/:id/read` | `markAsReadController` | Param `id` valid ObjectId | `200 { message: 'Notification marked as read' }` | `Notification ID is required`, `Invalid Notification ID format`, auth/verified errors |
| `DELETE` | `/notifications/:id` | `deleteNotificationController` | Param `id` valid ObjectId | `200 { message: 'Notification deleted' }` | same id/auth errors |

Response ownership is enforced in service writes by including `{ _id: notificationId, userId }` on read/delete mutations.

## 4. Backend - Business Logic

### Core Service

| Function | Purpose | Rules and side effects |
|---|---|---|
| `normalizePreferences` | Merge partial preferences with defaults | Missing channels/types fall back to default |
| `getPreferences(userId)` | Read user preferences | Returns normalized defaults if field missing |
| `updatePreferences(userId, preferences)` | Persist preferences | `$set notificationPreferences`, `updatedAt`; no body schema validation yet |
| `shouldCreateInAppNotification(payload)` | Gate in-app creation | Always-on types bypass user opt-out; other types require `channels.inApp` and type enabled |
| `createNotification(payload)` | Insert notification | If `eventKey` exists, uses `findOneAndUpdate` with `$setOnInsert` and upsert for idempotency |
| `createAndPush(payload, io?)` | Insert and realtime emit | Emits `notification:new` to `user:{id}`, `admins`, or `pharmacists`; DB write still works without `io` |
| `broadcastToRole(role, payload, io?)` | Fan out to all admins/pharmacists | Finds `users.role` `2` for admin, `1` for pharmacist; creates one doc per user; emits generic role payload |

### Trigger Helpers

| Helper | Trigger sources | Recipients | Notes |
|---|---|---|---|
| `notifyOrderStatusChange` | `orders.services.ts updateOrderStatus` | customer | Statuses: `confirmed`, `processing`, `shipped`, `delivered`, `cancelled` |
| `notifyPaymentStatusChange` | `orders.services.ts updatePaymentStatus`, `returnRequests.services.ts processRefund` | customer | Statuses: `paid`, `failed`, `refunded`, `partially_refunded` |
| `notifyShippingStatusChange` | `orders.services.ts updateOrderStatus` when shipped | customer | Includes optional tracking number |
| `notifyNewOrderToAdmin` | `orders.services.ts createOrder` | admin | Fire-and-forget |
| `createAndPush` direct order placed | `orders.services.ts createOrder` | customer | “Đặt hàng thành công” |
| `broadcastToRole('pharmacist')` order | `orders.services.ts createOrder` | pharmacist | “Đơn hàng mới cần chuẩn bị” |
| `broadcastToRole('pharmacist')` prescription | `prescriptions.services.ts submit` | pharmacist | New prescription needs review |
| `notifyPrescriptionStatus` | `prescriptions.services.ts verify/reject` | customer | `verified` or `rejected` |
| `notifyReturnRequestStatus` | `returnRequests.services.ts reviewReturnRequest` | customer | `approved`, `rejected`, `completed` |
| `notifyNewReturnRequestToAdmin` | `returnRequests.services.ts createReturnRequest` | admin | Type `system` |
| `notifyNewReturnRequestToPharmacists` | same | pharmacist | Type `return` |
| `notifyLowStock` | product/order/pharmacist/admin services | admin + pharmacist | Threshold/comment says 30; event key includes stock quantity |
| `notifyReviewModerated` | review services and AI moderation | customer | Skips auto-approved approved reviews; sends approved/rejected manual result |
| `notifyVideoEventLifecycle` | `communityVideoEvents.services.ts` register/live/cancel/time change | customer registrants | Uses community video event deep link |
| `notifyVideoEventReminder` | `communityVideoEvents.services.ts` reminder job loop | customer registrants | 15-minute reminder, type `reminder` |
| `notifySecurityAlert` | `users.services.ts verifyEmail/changePassword` | customer | Welcome/security messages |

All trigger calls are intentionally fire-and-forget in most business services. They catch `getIO()` errors and promise rejection so notification failure does not block checkout, prescription review, return review, etc.

### Socket Rooms

`src/sockets/chat.socket.ts` authenticates access token, rejects banned/missing users, joins:

| Room | Joined by | Used for |
|---|---|---|
| `user:{userId}` | every authenticated socket | Customer direct notification |
| `admins` | admin sockets | Admin broadcast notification |
| `pharmacists` | pharmacist sockets | Pharmacist broadcast notification |

## 5. Frontend

### Types and API

`src/types/account.ts` defines `Notification`, `NotificationType`, `NotificationFilter`, and `NotificationPreferences`. `src/services/notificationService.ts` wraps all REST calls:

| Function | API |
|---|---|
| `getNotifications(page, limit, filter)` | `GET /notifications` |
| `getUnreadCount()` | `GET /notifications/unread-count`; returns `0` on failure |
| `getPreferences()` | `GET /notifications/preferences` |
| `updatePreferences(preferences)` | `PATCH /notifications/preferences` |
| `markAsRead(id)` | `PATCH /notifications/:id/read` |
| `markAllAsRead()` | `PATCH /notifications/read-all` |
| `deleteNotification(id)` | `DELETE /notifications/:id` |

### Hooks and State

| Hook | File | Responsibilities |
|---|---|---|
| `useNotifications(filter, page)` | `src/hooks/useNotifications.ts` | Fetch paginated list, mark read/all, delete, subscribe to socket and invalidate list/count |
| `useUnreadNotificationCount()` | same | Fetch unread count, poll every 60s, invalidate on socket event |
| `useNotificationPreferences()` | same | Fetch/update preferences, toast success/error |
| `useSocketContext()` | `src/contexts/SocketContext.tsx` | Connect Socket.IO to `VITE_API_URL`, listen `notification:new`, broadcast to subscribers, show toast |

Hooks enable only when user is authenticated and `user.status === UserStatus.Verified`.

### Screens and Components

| UI | Route/usage | Behavior |
|---|---|---|
| `NotificationDropdown` | Header/customer, AdminLayout, PharmacistLayout | Bell badge, latest 5 notifications, mark all read, delete, navigate `actionUrl`, realtime toast |
| `NotificationsPage` | `/account/notifications` | Customer full center with tabs `all`, `unread`, `order`, `review`, `promotion`, `reminder`, `settings`; preferences switches |
| `NotificationItem` | customer page row | Type icon/label/color, mark read, optional action button |
| `AdminNotificationsPage` | `/admin/notifications`, `/pharmacist/notifications` | Shared admin/pharmacist list, filters, pagination, mark all, delete, navigate action URL |

Known UI detail: customer settings has switches for Email/SMS/Push and type groups, but backend currently only enforces in-app creation preference. Email/SMS/Push delivery providers are not wired to these preferences.

## 6. Integrations

| Integration | Status | Payload/Auth | Failure handling |
|---|---|---|---|
| MongoDB | Implemented | `notifications` docs and `users.notificationPreferences` | DB errors bubble unless fire-and-forget caller catches |
| Socket.IO | Implemented | `notification:new` event with notification payload; auth via access token in socket handshake | Business services catch missing `getIO`; frontend falls back to polling unread count every 60s |
| Email/Nodemailer | Existing for verify/order/forgot password | `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_USER`, `EMAIL_PASS`, `EMAIL_FROM_ADDRESS` | `EmailService.sendEmail` logs and does not throw |
| Browser Push | Preference only | No service worker/device token/provider found in inspected code | Not implemented |
| SMS | Preference only | No SMS provider tied to notification delivery found | Not implemented |
| Community video realtime | Implemented separately | `COMMUNITY_VIDEO_EVENT_SOCKET_EVENTS` plus notification helpers | Event socket and notification socket are separate but share Socket.IO connection |

## 7. Business Rules Summary

1. Only authenticated and verified users can use notification REST APIs.
2. Notification list is always scoped to the authenticated `userId`.
3. `page` must be >= 1 and `limit` must be 1..100.
4. `filter` must be one of the supported notification filters.
5. Mark-read and delete only affect documents matching both notification `_id` and current `userId`.
6. `eventKey` prevents duplicate notification documents per user/business event.
7. Admin/pharmacist broadcasts create one notification document per user in that role.
8. Customer notifications emit to `user:{userId}`; admin/pharmacist broadcasts emit to shared role rooms.
9. Missing Socket.IO server must not block the originating business transaction.
10. In-app preferences are enforced for non-critical types only.
11. Critical types `order`, `payment`, `shipping`, `prescription`, `return`, `security` are always created in-app.
12. Auto-approved reviews do not create an approved notification; rejected/manual-approved reviews do.
13. Unknown order/payment/shipping/return statuses are ignored by notification helper maps.
14. Unread count is refreshed by socket invalidation and by 60-second polling fallback on frontend.

## 8. Error Codes & Messages

| Code | Message | When it occurs | User-facing? |
|------|---------|----------------|--------------|
| `401/403` | auth middleware messages | Missing/invalid token or unverified user | Yes |
| `400` | `Notification ID is required` | Missing `:id` param in validated route | Yes |
| `400` | `Invalid Notification ID format` | `:id` is not valid MongoDB ObjectId | Yes |
| `400` | `Page must be a positive integer` | Invalid `page` query | Yes |
| `400` | `Limit must be a positive integer between 1 and 100` | Invalid `limit` query | Yes |
| `400` | `Invalid filter value` | Unsupported filter query | Yes |
| `200` | `Get notifications successfully` | List success | Yes/API |
| `200` | `Get unread count successfully` | Count success | Yes/API |
| `200` | `Get notification preferences successfully` | Preference read success | Yes/API |
| `200` | `Notification preferences updated` | Preference update success | Yes/API |
| `200` | `All notifications marked as read` | Read-all success | Yes/API |
| `200` | `Notification marked as read` | Single read success | Yes/API |
| `200` | `Notification deleted` | Delete success | Yes/API |

## 9. Configuration & Environment Variables

| Variable | Purpose | Example value | Required? |
|----------|---------|---------------|-----------|
| `FRONTEND_URLS` | Backend/Socket.IO CORS origins | `http://localhost:3000,https://example.com` | Recommended |
| `JWT_SECRET_ACCESS_TOKEN` | Verify REST and socket access tokens | `replace-with-secret` | Yes |
| `EMAIL_HOST` | SMTP host for existing email service | `smtp.gmail.com` | Required for email send |
| `EMAIL_PORT` | SMTP port | `587` | Required for email send |
| `EMAIL_USER` | SMTP username | `no-reply@example.com` | Required for email send |
| `EMAIL_PASS` | SMTP password/app password | `replace-with-secret` | Required for email send |
| `EMAIL_FROM_ADDRESS` | From header | `"MediSpace" <no-reply@example.com>` | Optional fallback exists |
| `CLIENT_URL` | Email verify/reset frontend base URL | `http://localhost:3000` | Optional fallback exists |
| `VITE_API_URL` | Frontend REST and Socket.IO base URL | `http://localhost:8000` | Yes for frontend |

No dedicated env var for notification collection name exists; `notifications` is hard-coded in `databaseService.notifications`.

## 10. Known Limitations & Edge Cases

1. `notificationPreferences` is dynamically persisted on `users` but not typed in `User.schema.ts`.
2. `PATCH /notifications/preferences` has no express-validator schema, so malformed nested fields can be normalized unpredictably.
3. Email/SMS/Push channel preferences exist in UI/API response, but notification delivery currently only implements in-app DB plus Socket.IO realtime.
4. No browser service worker, device token registration, push provider, or SMS provider was found for notification delivery.
5. Role broadcast uses numeric role mapping in `NotificationService` (`admin = 2`, `pharmacist = 1`); this depends on `UserRole` enum values staying stable.
6. Admin/pharmacist role socket payload omits `_id`/`userId`; frontend refetches after receiving it, so realtime row details depend on REST refresh.
7. `notifyLowStock` event key includes stock quantity, so repeated alerts at different quantities create multiple notifications.
8. `markAsRead` and `deleteNotification` return success even if no document matched; API does not currently return 404 for missing/foreign notification IDs.
9. Customer notification tabs do not expose every type as a top-level tab even though filters support all types.
10. Existing verification before this document: backend build, frontend typecheck, and frontend build passed; backend full test suite still had failures in unrelated chat/search/typesense areas per prior run.
