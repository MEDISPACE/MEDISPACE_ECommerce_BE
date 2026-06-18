# Community Video Events - Technical Document

## 1. Overview

Community Video Events là tính năng hội thảo video trực tuyến trong Community module của MEDISPACE. Tính năng cho phép admin tạo link cuộc họp theo phòng cộng đồng, người dùng đăng ký tham gia, host bắt đầu/kết thúc buổi live, người tham gia vào phòng video LiveKit và trao đổi ngay bằng chat realtime của phòng cộng đồng.

Mục tiêu kinh doanh là giúp MEDISPACE Pharmacy chia sẻ kiến thức, kỹ năng và kinh nghiệm chăm sóc sức khỏe tới cộng đồng trong chính ứng dụng MEDISPACE, thay vì phụ thuộc vào link họp bên ngoài như Zoom/Meet. Tính năng tập trung vào tương tác tức thời trong cuộc họp: quyền xem theo room, đăng ký, LiveKit, chat realtime, nhắc lịch và audit dữ liệu tham dự.

Người dùng chính gồm `guest`, `customer/user đã xác thực`, `admin`, và `host/pharmacist`. Guest chỉ xem được danh sách public qua endpoint public. User đã xác thực có thể xem chi tiết, đăng ký, hủy đăng ký, tham gia khi event live và chat trực tiếp trong phòng họp. Admin có thể tạo, cập nhật, start/end/cancel event và xem registration. Host được xác định qua `hostIds` hoặc role admin trong backend service.

High-level flow: admin tạo link cuộc họp gắn với một community room active; user xem danh sách/chi tiết, đăng ký, nhận reminder trước giờ bắt đầu; admin/host start event; user bấm join, backend kiểm tra quyền và cấp LiveKit JWT; frontend dùng token để kết nối LiveKit room; chat cuộc họp dùng message API và Socket.IO hiện có của community room.

```text
Admin/Host
   | create/start/end/cancel
   v
MEDISPACE Backend ---- Agenda Reminder ---- Notifications
   |                         |
   | DB + permissions        v
   v                    Registered Users
MongoDB
   ^
   | list/register/join/chat
User Frontend ---- LiveKit JWT ---- LiveKit Self-host/Cloud
   |                                |
   +----- Socket.IO room chat ------+
```

## 2. Database Layer

### Collections

| Collection | Source | Purpose |
|------------|--------|---------|
| `communityVideoEvents` | `src/services/database.services.ts` | Stores webinar/event metadata, scheduling, provider info, lifecycle state and recording metadata. |
| `communityVideoEventRegistrations` | `src/services/database.services.ts` | Stores each user's registration/attendance state for a video event. |
| `communityMessages` | Existing community module | Stores realtime chat messages used inside the meeting room. |
| `communityRooms` | Existing community module | Parent room/topic that owns event visibility and membership context. |
| `communityRoomMembers` | Existing community module | Used for private event access, banned user checks and room membership authorization. |
| `users` | Existing auth/user module | Joined for admin registration listing. |
| `agendaJobs` | `src/services/scheduler.services.ts` | Agenda.js Mongo backend collection for scheduled reminder job metadata. |
| notifications collection | `src/services/notifications.services.ts` | Created through `notificationService.createAndPush()` for 15-minute reminders. |

Collection names for the two video-event collections are configurable by environment variables. If not configured, defaults are `communityVideoEvents` and `communityVideoEventRegistrations`.

### `communityVideoEvents` Schema

| Field | Type | Required | Constraints / Meaning |
|-------|------|----------|-----------------------|
| `_id` | `ObjectId` | Yes | MongoDB primary identifier. |
| `roomId` | `ObjectId` | Yes | Must reference an active `communityRooms` document during creation. |
| `title` | `string` | Yes | Trimmed; validator requires 3-160 chars. |
| `description` | `string` | No | Trimmed; max 3000 chars when provided; defaults to empty string. |
| `agenda` | `string \/ null` | No | Trimmed; max 3000 chars; defaults to `null`. |
| `visibility` | `'public' \| 'private'` | Yes | Controls public/private access. |
| `status` | `'draft' \| 'scheduled' \| 'live' \| 'ended' \| 'cancelled'` | Yes | Defaults to `scheduled` on create. Create validator only allows `draft` or `scheduled`. |
| `scheduledStartAt` | `Date` | Yes | Must be valid date. |
| `scheduledEndAt` | `Date` | Yes | Must be valid date and later than `scheduledStartAt`. |
| `startedAt` | `Date \/ null` | Yes | Set when event starts; initially `null`. |
| `endedAt` | `Date \/ null` | Yes | Set when event ends; initially `null`. |
| `hostIds` | `ObjectId[]` | No | Host users; admin can also manage regardless of hostIds. |
| `speakerProfiles` | `object[]` | No | Display-only speaker metadata; defaults to empty array. |
| `registrationRequired` | `boolean` | Yes | Defaults to `true`; if `false`, non-host join does not require registration. |
| `capacity` | `number \/ null` | No | Validator accepts integer 1-10000 or null. Capacity counts `registered` + `attended`. |
| `provider` | `string` | Yes | Defaults to `livekit`; service currently returns only LiveKit join payload. |
| `providerMeetingId` | `string \/ null` | No | External provider meeting ID; defaults to `null`. |
| `meetingUrl` | `string \/ null` | No | External/static meeting URL; defaults to `null`. |
| `recordingUrl` | `string \/ null` | No | Defaults to `null`; no Egress webhook currently fills it. |
| `recordingStatus` | `'none' \| 'processing' \| 'ready' \| 'failed'` | Yes | Defaults to `none`. |
| `materials` | `object[]` | No | Attachment metadata; defaults to empty array. |
| `tags` | `string[]` | No | Normalized by trimming/filtering string array. |
| `reminders.fifteenMinutesSentAt` | `Date \/ null` | Yes | Event-level marker for 15-minute reminder run. |
| `reminders.oneHourSentAt` | `Date \/ null` | Yes | Present but no one-hour reminder job currently implemented. |
| `createdBy` | `ObjectId` | Yes | Admin user who created event. |
| `createdAt` | `Date` | Yes | Set at creation. |
| `updatedAt` | `Date` | Yes | Updated on event mutation and reminder processing. |

### `communityVideoEventRegistrations` Schema

| Field | Type | Required | Constraints / Meaning |
|-------|------|----------|-----------------------|
| `_id` | `ObjectId` | Yes | MongoDB primary identifier. |
| `eventId` | `ObjectId` | Yes | References `communityVideoEvents._id`. |
| `roomId` | `ObjectId` | Yes | Duplicated from event for fast query. |
| `userId` | `ObjectId` | Yes | References `users._id`. Unique with `eventId`. |
| `status` | `'registered' \| 'cancelled' \| 'attended' \| 'no_show' \| 'removed'` | Yes | Current registration/attendance state. |
| `role` | `'attendee' \| 'host' \| 'co_host'` | No | Set to `attendee` during registration; set to `host` or `attendee` during join. |
| `registeredAt` | `Date` | Yes for inserted docs | First registration timestamp. |
| `cancelledAt` | `Date \/ null` | No | Set when user cancels; reset to null when re-registering. |
| `joinedAt` | `Date \/ null` | No | Set when user joins live session. Current implementation overwrites on each join. |
| `lastSeenAt` | `Date \/ null` | No | Set when user joins. Leave tracking is not currently updated. |
| `reminder15mSentAt` | `Date \/ null` | No | Set after sending 15-minute reminder to this registration. |
| `removedBy` | `ObjectId \/ null` | No | Set when admin marks registration as `removed`. |
| `removeReason` | `string \/ null` | No | Optional reason; max 500 chars in validator. |
| `updatedAt` | `Date` | No | Set during registration, join, cancel and admin updates. |

### Indexes

Defined in `src/services/database.services.ts`.

| Collection | Index | Options | Purpose |
|------------|-------|---------|---------|
| `communityVideoEvents` | `{ roomId: 1, status: 1, scheduledStartAt: 1 }` | none | List events by room, lifecycle and schedule. |
| `communityVideoEvents` | `{ visibility: 1, status: 1, scheduledStartAt: 1 }` | none | Public/upcoming event queries. |
| `communityVideoEvents` | `{ hostIds: 1, scheduledStartAt: -1 }` | none | Host schedule lookup. |
| `communityVideoEventRegistrations` | `{ eventId: 1, userId: 1 }` | unique | Prevent duplicate registration rows per user/event. |
| `communityVideoEventRegistrations` | `{ userId: 1, status: 1, registeredAt: -1 }` | none | User's registered events. |
| `communityVideoEventRegistrations` | `{ eventId: 1, status: 1, joinedAt: -1 }` | none | Attendance listing/statistics. |
| `communityVideoEventRegistrations` | `{ eventId: 1, reminder15mSentAt: 1 }` | none | Reminder lookup. |

### ERD Description

```text
communityRooms 1 ---- N communityVideoEvents
communityVideoEvents 1 ---- N communityVideoEventRegistrations
users 1 ---- N communityVideoEventRegistrations
users N ---- N communityVideoEvents via hostIds[]
communityRoomMembers controls access to private/banned room context
communityMessages stores room chat used by the meeting chat panel
agendaJobs stores scheduler job metadata for reminder processing
```

### Status Enums

| Enum | Values | Meaning |
|------|--------|---------|
| `VideoEventStatus` | `draft` | Draft event, hidden from non-admin listing and socket join. |
| `VideoEventStatus` | `scheduled` | Planned event; users can register before the host starts the live room. |
| `VideoEventStatus` | `live` | Event is currently joinable through LiveKit token endpoint. |
| `VideoEventStatus` | `ended` | Event finished; new registration/cancel is blocked, registered users become `no_show`. |
| `VideoEventStatus` | `cancelled` | Event cancelled; hidden from non-admin listing. |
| `RegistrationStatus` | `registered` | User has active registration. |
| `RegistrationStatus` | `cancelled` | User cancelled registration. |
| `RegistrationStatus` | `attended` | User joined live session. |
| `RegistrationStatus` | `no_show` | Event ended while registration remained `registered`. |
| `RegistrationStatus` | `removed` | Admin removed/marked attendee removed. |

### Audit Fields

This feature uses `createdAt` and `updatedAt` timestamps. It does not implement `deletedAt`; lifecycle soft-deletion is represented by status values such as `cancelled` and `removed`.

## 3. Backend - API Layer

Base route registration is in `src/index.ts`:

| Mount | Router |
|-------|--------|
| `/community` | `src/routes/community.routes.ts` |
| `/admin/community` | `src/routes/adminCommunity.routes.ts` |

Common error response from `defaultErrorHandler`:

```json
{ "message": "..." }
```

Validation errors use HTTP `422` with:

```json
{ "message": "Validation error", "errors": { "field": { "msg": "..." } } }
```

Unexpected errors use HTTP `500` with `message` and `errorInfo`.

### Public/User Community Endpoints

| Method | Path | Auth | Controller | Request | Success | Status Codes |
|--------|------|------|------------|---------|---------|--------------|
| `GET` | `/community/video-events` | Optional; no token validator on route | `listVideoEventsController` | Query: `roomId?: ObjectId`, `status?: draft/scheduled/live/ended/cancelled`, `visibility?: public/private`, `search?: string`, `upcomingOnly?: "true"`, `page?: int 1-100000`, `limit?: int 1-50` | `200 { message: "OK", data: { items, page, limit, total } }` | `200`, `422`, `500` |
| `GET` | `/community/video-events/my` | Required access token + verified user | `listMyVideoEventsController` | Query: `status?`, `page?`, `limit?` | `200 { message: "OK", data: { items, page, limit, total } }` | `200`, `401`, `422`, `500` |
| `GET` | `/community/video-events/:eventId` | Required access token + verified user | `getVideoEventDetailController` | Param: `eventId` valid ObjectId | `200 { message: "OK", data: eventWithRoomRegistrationCountViewerRegistration }` | `200`, `401`, `403`, `404`, `422`, `500` |
| `POST` | `/community/video-events/:eventId/register` | Required access token + verified user | `registerVideoEventController` | Param: `eventId` valid ObjectId | `201 { message: "Đăng ký hội thảo thành công", data: registration }` | `201`, `400`, `401`, `403`, `404`, `409`, `422`, `500` |
| `POST` | `/community/video-events/:eventId/cancel-registration` | Required access token + verified user | `cancelVideoEventRegistrationController` | Param: `eventId` valid ObjectId | `200 { message: "Đã hủy đăng ký hội thảo", data: registration }` | `200`, `400`, `401`, `404`, `422`, `500` |
| `POST` | `/community/video-events/:eventId/join` | Required access token + verified user | `joinVideoEventController` | Param: `eventId` valid ObjectId | `200 { message: "OK", data: { eventId, provider, wsUrl, token, role, expiresAt } }` | `200`, `400`, `401`, `403`, `404`, `422`, `500` |

Meeting chat uses the existing community room endpoints: `GET /community/rooms/:roomId/messages` and `POST /community/rooms/:roomId/messages`. The video-event feature no longer exposes separate `/video-events/:eventId/questions` endpoints.

### Admin Community Endpoints

All routes in `src/routes/adminCommunity.routes.ts` use `accessTokenValidator`, `verifiedUserValidator`, and `adminRequired`.

| Method | Path | Controller | Request | Success | Status Codes |
|--------|------|------------|---------|---------|--------------|
| `GET` | `/admin/community/video-events` | `listVideoEventsController` | Query: same as public list, plus admin can see `draft` and `cancelled` because service does not apply non-admin restrictions. | `200 { message: "OK", data: { items, page, limit, total } }` | `200`, `401`, `403`, `422`, `500` |
| `POST` | `/admin/community/video-events` | `createAdminVideoEventController` | Body: `roomId` ObjectId required; `title` 3-160 required; `description?` max 3000; `agenda?` max 3000; `visibility` public/private required; `status?` draft/scheduled; `scheduledStartAt` valid date required; `scheduledEndAt` valid date required; `hostIds?` ObjectId array; `registrationRequired?` boolean; `capacity?` int 1-10000/null; `provider?`; `providerMeetingId?`; `meetingUrl?`; `tags?` array; `materials?` array. | `201 { message: "Tạo hội thảo thành công", data: event }` | `201`, `400`, `401`, `403`, `404`, `422`, `500` |
| `GET` | `/admin/community/video-events/:eventId` | `getVideoEventDetailController` | Param: valid `eventId`. | `200 { message: "OK", data: eventDetail }` | `200`, `401`, `403`, `404`, `422`, `500` |
| `PATCH` | `/admin/community/video-events/:eventId` | `updateAdminVideoEventController` | Body: partial create fields; `status` can be draft/scheduled/live/ended/cancelled; date fields must be valid; capacity int 1-10000/null. | `200 { message: "Cập nhật hội thảo thành công", data: event }` | `200`, `400`, `401`, `403`, `404`, `422`, `500` |
| `POST` | `/admin/community/video-events/:eventId/start` | `startAdminVideoEventController` | Param: valid `eventId`. | `200 { message: "Hội thảo đã bắt đầu", data: event }` | `200`, `400`, `401`, `403`, `404`, `422`, `500` |
| `POST` | `/admin/community/video-events/:eventId/end` | `endAdminVideoEventController` | Param: valid `eventId`. | `200 { message: "Hội thảo đã kết thúc", data: event }` | `200`, `400`, `401`, `403`, `404`, `422`, `500` |
| `POST` | `/admin/community/video-events/:eventId/cancel` | `cancelAdminVideoEventController` | Param: valid `eventId`. | `200 { message: "Đã hủy hội thảo", data: event }` | `200`, `400`, `401`, `403`, `404`, `422`, `500` |
| `GET` | `/admin/community/video-events/:eventId/registrations` | `listAdminVideoEventRegistrationsController` | Query: `status?: registered/cancelled/attended/no_show/removed`, `page?`, `limit?`. | `200 { message: "OK", data: { items, page, limit, total } }` | `200`, `401`, `403`, `404`, `422`, `500` |
| `PATCH` | `/admin/community/video-events/:eventId/registrations/:userId` | `updateAdminVideoEventRegistrationController` | Body: `status?` registration enum; `removeReason?` string max 500. | `200 { message: "Cập nhật đăng ký thành công", data: registration }` | `200`, `401`, `403`, `404`, `422`, `500` |

## 4. Backend - Business Logic

### `src/services/communityVideoEvents.services.ts`

| Function | Purpose | Input -> Output | Business Rules / Side Effects / Errors |
|----------|---------|-----------------|----------------------------------------|
| `escapeRegex(input)` | Escapes user search text before building RegExp. | `string -> string` | Prevents regex meta characters from changing search semantics. |
| `emitRoom(event, roomId, payload)` | Emits Socket.IO event to `community:room:{roomId}`. | event name + roomId + payload -> void | Swallows errors if Socket.IO is not initialized. |
| `emitUser(event, userId, payload)` | Emits Socket.IO event to `user:{userId}`. | event name + userId + payload -> void | Used for registration updates. |
| `emitAdmins(event, payload)` | Emits Socket.IO event to `admins`. | event name + payload -> void | Used for event creation. |
| `emitVideoEvent(event, eventId, payload)` | Emits Socket.IO event to `community:video-event:{eventId}`. | event name + eventId + payload -> void | Used for live lifecycle and attendee updates. |
| `toDate(value, fieldName)` | Normalizes/validates date fields. | string/Date -> Date | Throws `400` if invalid. |
| `normalizeStringArray(value)` | Cleans tag arrays. | unknown -> string[] | Non-arrays become `[]`; non-string/blank items are removed. |
| `isAdmin(context)` | Checks admin role. | auth context -> boolean | Admin role comes from decoded access token. |
| `isHost(event, userId)` | Checks whether user is in event `hostIds`. | event + userId -> boolean | Requires ObjectId equality. |
| `getActiveRoom(roomId)` | Loads active parent community room. | roomId -> room | Throws `404 Không tìm thấy phòng cộng đồng.` if missing/inactive. |
| `getEvent(eventId)` | Loads event by id. | eventId -> event | Throws `404 Không tìm thấy hội thảo.` if missing. |
| `getMembership(roomId, userId)` | Loads community room membership. | roomId + optional userId -> member/null | Returns null when unauthenticated. |
| `assertCanViewEvent(event, context)` | Enforces view permission. | event + auth context -> void | Admin/host can view; public events are viewable; private events require `active` or `invited` room membership; otherwise `403`. |
| `assertCanJoinOrRegister(event, userId, role)` | Enforces join/register permission. | event + userId + role -> void | Admin/host bypass; banned room member is forbidden; private events require active/invited membership. |
| `assertCanManageEvent(event, context)` | Enforces management permission. | event + auth context -> void | Admin or host only; otherwise `403 Bạn không có quyền quản lý hội thảo này.` |
| `canAccessVideoEvent(eventId, context)` | Safe boolean access check. | eventId + context -> boolean | Catches all errors and returns false. Currently used as helper for potential socket/access checks. |
| `createEvent(params)` | Creates event document. | create params -> event | Requires active room and end > start. Defaults provider/livekit, registrationRequired true, recordingStatus none, reminders null. Emits `community:video-event:created` to room and admins. |
| `updateEvent(eventId, params, context)` | Updates event metadata. | eventId + partial body + context -> updated event | Requires manage permission. Converts hostIds to ObjectIds, validates end > start, updates `updatedAt`. Emits `community:video-event:updated` to parent room and video-event room. |
| `listEvents(params)` | Lists events with filters and permission-aware visibility. | filters -> paginated result | Non-admin cannot see `draft` or `cancelled`. Guest sees only public. Auth user sees public plus private events for active/invited rooms. Aggregates room summary and registrationCount. |
| `listMyEvents(userId, role, params)` | Lists events where user registered/attended or is host. | userId + role + filters -> paginated result | Non-admin excludes cancelled by default. Sorts by scheduledStartAt ascending. |
| `getEventDetail(eventId, context)` | Returns event detail with room and viewer state. | eventId + context -> event detail | Requires view permission. Adds `room`, `registrationCount`, and `viewerRegistration`. |
| `cancelEvent(eventId, context)` | Cancels an event. | eventId + context -> updated event | Requires manage permission. Cannot cancel ended event. Sets status `cancelled`, emits cancelled to room and event. |
| `startEvent(eventId, context)` | Starts live event. | eventId + context -> updated event | Requires manage permission. Only `scheduled` or `draft` can start. Sets `status=live`, `startedAt`, emits live. |
| `endEvent(eventId, context)` | Ends live event. | eventId + context -> updated event | Requires manage permission. Only `live` can end. Sets `status=ended`, `endedAt`; changes all remaining `registered` registrations to `no_show`; emits ended. |
| `registerForEvent(eventId, userId, role)` | Registers user for event. | eventId + userId + role -> registration | Blocks ended/cancelled. Enforces access. Checks capacity. Upserts registration to `registered`, resets `cancelledAt`, emits `community:video-event:registered` to user. |
| `cancelRegistration(eventId, userId)` | Cancels user's active registration. | eventId + userId -> registration | Blocks ended events. Only cancels `registered` or `attended`. Throws `404` if no active registration. |
| `joinEvent(eventId, userId, role)` | Issues LiveKit token and marks attendance. | eventId + userId + role -> join payload | Requires access and `status=live`. Non-host must be registered/attended when `registrationRequired=true`. Calls `liveKitService.createJoinToken()`, upserts registration as `attended`, emits attendee joined. |
| `listRegistrations(eventId, context, params)` | Admin/host registration list. | eventId + context + filters -> paginated result | Requires manage permission. Joins user summary. Supports status filter. |
| `updateRegistration(eventId, userId, context, params)` | Admin/host updates attendee status. | eventId + userId + body -> registration | Requires manage permission. If `status=removed`, records `removedBy` and `removeReason`. Emits `community:video-event:registration:updated` to user. |
| `sendDueReminders()` | Sends 15-minute reminders. | none -> `{ processedEvents }` | Finds scheduled events starting in 14-16 minutes and not event-marked sent. Sends notification to registered users without `reminder15mSentAt`, updates registration and event reminder marker. |

### `src/services/livekit.services.ts`

| Function | Purpose | Input -> Output | Rules / Errors |
|----------|---------|-----------------|----------------|
| `isConfigured()` | Checks required LiveKit env vars. | none -> boolean | Requires `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `LIVEKIT_WS_URL`. |
| `getWsUrl()` | Returns LiveKit WebSocket URL. | none -> string | Returns empty string when env missing. |
| `createJoinToken(params)` | Creates LiveKit JWT. | `{ eventId, userId, isHost, ttl? } -> JWT string` | Throws `400 LiveKit chưa được cấu hình.` if env missing. Room is `medispace-event-{eventId}`. Host/admin can publish; attendees can subscribe only. TTL defaults to `2h`. `canPublishData=false`. |

### `src/services/scheduler.services.ts`

| Function | Purpose | Input -> Output | Rules / Side Effects |
|----------|---------|-----------------|----------------------|
| `start()` | Starts Agenda scheduler. | none -> void | Idempotent via `started`. Uses Mongo backend collection `AGENDA_JOB_COLLECTION || agendaJobs`. Defines `video-event-reminders`; starts Agenda; schedules every 5 minutes. |
| `stop()` | Stops Agenda scheduler. | none -> void | Sets `started=false`. |

### `src/services/notifications.services.ts`

| Function | Purpose | Input -> Output | Side Effects |
|----------|---------|-----------------|--------------|
| `notifyVideoEventReminder(userId, eventTitle, eventId, io?)` | Creates and pushes 15-minute reminder notification. | userId + title + eventId -> void | Notification type `reminder`, title `Hội thảo sắp bắt đầu`, actionUrl `/community/video-events/{eventId}`, metadata `{ eventId }`, targetRole `customer`. |

### `src/sockets/chat.socket.ts`

| Handler | Purpose | Input -> Ack | Rules |
|---------|---------|--------------|-------|
| `community:video-event:join` | Joins Socket.IO realtime room for video event updates. | `eventId`, optional ack -> `{ ok, eventId?, message? }` | Requires socket user and valid ObjectId. Rejects missing/cancelled/draft events. Admin/host/public can access; private requires active/invited room membership. Joins `community:video-event:{eventId}`. |
| `community:video-event:leave` | Leaves realtime event room. | `eventId` -> void | Calls `socket.leave()`. No permission check. |

### `src/controllers/communityVideoEvents.controllers.ts`

Controllers are thin request/response adapters. They parse `ObjectId`, extract `req.decoded_authorization`, pass query/body to `communityVideoEventsService`, and return `{ message, data }`. They do not contain business rules beyond filtering accepted status/visibility query values.

### `src/middlewares/community.middlewares.ts`

Validators enforce request shape before controllers:

| Validator | Purpose |
|-----------|---------|
| `eventIdValidator` | Validates `params.eventId` as required ObjectId. |
| `userIdParamValidator` | Validates `params.userId` as required ObjectId. |
| `paginationValidator` | Validates `page` 1-100000 and `limit` 1-50. |
| `createVideoEventValidator` | Validates admin create body. |
| `updateVideoEventValidator` | Validates admin update body. |
| `updateVideoRegistrationValidator` | Validates registration status/removeReason body. |

## 5. Frontend

### Routes

| Route | File | Component |
|-------|------|-----------|
| `/community/video-events` | `src/routes/community/video-events._index.tsx` | `CommunityVideoEventsPage` |
| `/community/video-events/:eventId` | `src/routes/community/video-events.$eventId.tsx` | `CommunityVideoEventDetailPage` |
| `/admin/video-events` | `src/routes/admin/video-events.tsx` | `AdminCommunityVideoEventsPage` |

Admin navigation includes `/admin/video-events` in `src/components/layout/AdminLayout.tsx`. Community room page links to `/community/video-events` from `CommunityRoomsPage`.

### State Management

| Area | Mechanism | Details |
|------|-----------|---------|
| Server data | TanStack Query | Event list/detail/registrations and room messages are queried by stable query keys and invalidated after mutations. |
| Auth | `useAuth()` | Used to gate registration/detail/join. Unauthenticated users are redirected to login. |
| Socket | `SocketContext` | Adds `joinCommunityVideoEvent`, `leaveCommunityVideoEvent`, `joinCommunityRoom`, `leaveCommunityRoom`, video-event update callbacks and room message callbacks. |
| LiveKit room | Local React state | `joinPayload` stores backend token/wsUrl. Rendering `LiveKitRoom` starts after join success. |
| Forms | Local React state | Search, create event form, disclaimer checkbox, meeting chat text and selected admin event are local states. |

### `src/services/communityService.ts`

Public/user API methods:

| Method | Endpoint | Trigger |
|--------|----------|---------|
| `listVideoEvents(params)` | `GET /community/video-events` | User list page load/search. |
| `listMyVideoEvents(params)` | `GET /community/video-events/my` | Currently available service method; not used by shown pages. |
| `getVideoEvent(eventId)` | `GET /community/video-events/:eventId` | Detail page load. |
| `registerVideoEvent(eventId)` | `POST /community/video-events/:eventId/register` | List/detail register button. |
| `cancelVideoEventRegistration(eventId)` | `POST /community/video-events/:eventId/cancel-registration` | Available service method; no current button in inspected UI. |
| `joinVideoEvent(eventId)` | `POST /community/video-events/:eventId/join` | Detail page join button after disclaimer. |
| `listMessages({ roomId, page, limit })` | `GET /community/rooms/:roomId/messages` | Meeting chat panel after user joins the live room. |
| `sendMessage({ roomId, content })` | `POST /community/rooms/:roomId/messages` | Meeting chat message submit. |

Admin API methods:

| Method | Endpoint | Trigger |
|--------|----------|---------|
| `adminCommunityService.listVideoEvents(params)` | `GET /admin/community/video-events` | Admin list/search. |
| `createVideoEvent(data)` | `POST /admin/community/video-events` | Admin create form submit. |
| `updateVideoEvent(eventId, data)` | `PATCH /admin/community/video-events/:eventId` | Service exists; current admin page does not expose edit form. |
| `startVideoEvent(eventId)` | `POST /admin/community/video-events/:eventId/start` | Admin Start button. |
| `endVideoEvent(eventId)` | `POST /admin/community/video-events/:eventId/end` | Admin End button. |
| `cancelVideoEvent(eventId)` | `POST /admin/community/video-events/:eventId/cancel` | Admin Cancel button. |
| `listVideoEventRegistrations(params)` | `GET /admin/community/video-events/:eventId/registrations` | Admin selected event attendee panel. |
| `updateVideoEventRegistration(eventId, userId, data)` | `PATCH /admin/community/video-events/:eventId/registrations/:userId` | Service exists; current page does not expose attendee remove/status actions. |

### `CommunityVideoEventsPage`

File: `src/components/community/CommunityVideoEventsPage.tsx`.

Responsibilities:

- Displays searchable list of community video events.
- Shows status, visibility, room badge, schedule and registration count/capacity.
- Lets authenticated users register; redirects unauthenticated users to `/login` with `from` state.
- Invalidates `community-video-events` queries after successful registration.
- Shows loading state `Đang tải lịch hội thảo...` and empty state `Chưa có hội thảo phù hợp.`.

Error handling uses toast messages from `error.response.data.message` or generic `Không thể đăng ký hội thảo`.

### `CommunityVideoEventDetailPage`

File: `src/components/community/CommunityVideoEventDetailPage.tsx`.

Responsibilities:

- Requires login to view details; unauthenticated users see a login prompt.
- Loads event detail and, after joining, room chat messages.
- Joins Socket.IO event room through `socket.joinCommunityVideoEvent(eventId)` and subscribes to event updates.
- Shows medical disclaimer checkbox before join.
- Allows registration when not registered and event is not ended.
- Enables join button only when disclaimer accepted and event status is `live`.
- Calls backend join endpoint, stores `joinPayload`, then renders `LiveKitRoom` and `VideoConference` from `@livekit/components-react`.
- Shows `Chat cuộc họp` after LiveKit join and subscribes to room message events.
- Allows chat message submission when text is not blank.
- Displays `recordingUrl` button if present.

Loading state is `Đang tải hội thảo...`. Meeting chat empty state is `Chưa có tin nhắn. Hãy trao đổi trực tiếp trong cuộc họp.`. Mutations use toast errors from backend messages.

### `AdminCommunityVideoEventsPage`

File: `src/components/admin/AdminCommunityVideoEventsPage.tsx`.

Responsibilities:

- Lists active community rooms for event creation.
- Lists/searches admin video events.
- Creates a new LiveKit provider event with room, title, description, agenda, schedule, visibility, capacity, tags and `registrationRequired=true`.
- Selects an event to inspect registrations and meeting link/chat guidance.
- Starts, ends or cancels selected event.
- Shows registered attendees with user name/email/id and status.
- Shows direct chat guidance instead of a separate moderation queue.

Admin form defaults start time to 24 hours from page load, end time to 25 hours from page load, capacity to `300`, visibility to `public`.

The current admin UI does not expose event update/edit or registration removal even though service methods exist.

### `SocketContext`

File: `src/contexts/SocketContext.tsx`.

Video event support includes:

- Events listened: `community:video-event:created`, `updated`, `cancelled`, `live`, `ended`, `registered`, and community room message events.
- Actions exposed: `joinCommunityVideoEvent(eventId, ack?)` and `leaveCommunityVideoEvent(eventId)`.
- Component subscriptions fan out callbacks by subscriber ID.

## 6. Integrations

### LiveKit

Integration files:

- Backend: `src/services/livekit.services.ts`
- Frontend: `CommunityVideoEventDetailPage.tsx`
- Packages: `livekit-server-sdk`, `@livekit/components-react`, `@livekit/components-styles`, `livekit-client`

Backend request/response contract for join:

```json
{
  "eventId": "ObjectId",
  "provider": "livekit",
  "wsUrl": "wss://livekit.medispace.io.vn",
  "token": "jwt",
  "role": "host|attendee",
  "expiresAt": "ISO date"
}
```

LiveKit token behavior:

- Identity is userId.
- Room is `medispace-event-{eventId}`.
- TTL defaults to 2 hours.
- `roomJoin=true`.
- `canSubscribe=true` for all.
- `canPublish=true` only for admin/host.
- `canPublishData=false`.

Failure handling:

- Missing LiveKit env throws `400 LiveKit chưa được cấu hình.`.
- Frontend displays backend message or `Không thể tham gia hội thảo`.
- There is no webhook callback flow implemented for recording, participant events or Egress.

Production self-host notes as configured during deployment:

| Domain | Purpose |
|--------|---------|
| `livekit.medispace.io.vn` | LiveKit HTTPS/WSS endpoint. |
| `turn.medispace.io.vn` | TURN domain for hard network conditions. |

### Agenda.js Scheduler

Integration files:

- `src/services/scheduler.services.ts`
- `src/index.ts`

Agenda uses MongoDB as backend through `@agendajs/mongo-backend`, runs every 5 minutes, and calls `communityVideoEventsService.sendDueReminders()`.

Failure handling:

- Scheduler startup failure is caught in `src/index.ts` and logged as `[Scheduler] Failed to start scheduler:`.
- Individual notification sends are awaited sequentially. There is no per-recipient retry wrapper in this feature code.

### Notification Service

Integration file: `src/services/notifications.services.ts`.

`notifyVideoEventReminder()` creates a customer notification and pushes it through Socket.IO when `io` is provided.

### Socket.IO

Integration files:

- Backend: `src/sockets/chat.socket.ts`
- Frontend: `src/contexts/SocketContext.tsx`

Socket.IO is used for event lifecycle updates and meeting chat messages, not for media streaming. Video/audio media goes through LiveKit.

### Community Room Chat

Integration files:

- Backend: `src/controllers/community.controllers.ts`, `src/services/community.services.ts`
- Frontend: `src/services/communityService.ts`, `src/components/community/CommunityVideoEventDetailPage.tsx`

The meeting chat reuses `communityMessages` and the existing moderation flow for room messages. There is no separate delayed Q&A queue for video events.

## 7. Business Rules Summary

1. A video event must belong to an active community room.
2. `scheduledEndAt` must be later than `scheduledStartAt` on create and update.
3. Create event `title` must be 3-160 characters.
4. Create/update `description` and `agenda` can be at most 3000 characters.
5. Event `visibility` must be `public` or `private`.
6. Event create `status` can only be `draft` or `scheduled`.
7. Event update `status` can be `draft`, `scheduled`, `live`, `ended`, or `cancelled`.
8. Capacity must be null or an integer from 1 to 10000.
9. Tags are normalized by trimming and removing blank/non-string entries.
10. Admin can view and manage all events.
11. Users in `hostIds` can view/manage their events.
12. Public events are viewable by non-admin users.
13. Private events require active or invited membership in the parent room.
14. Banned room members cannot register or join related events.
15. Non-admin event listing hides `draft` and `cancelled` events.
16. Guest event listing is restricted to public events.
17. Authenticated user event listing includes public events plus private events from active/invited rooms.
18. Ended or cancelled events do not accept new registrations.
19. Registration checks event capacity using registrations with status `registered` or `attended`.
20. Each user can have only one registration document per event.
21. Re-registering upserts the same registration, sets status to `registered`, and clears `cancelledAt`.
22. Users cannot cancel registration after event status becomes `ended`.
23. Cancel registration only works for `registered` or `attended` records.
24. A video event can start only from `scheduled` or `draft` state.
25. A video event can end only from `live` state.
26. An ended event cannot be cancelled.
27. Ending an event marks remaining `registered` users as `no_show`.
28. Join is allowed only when event status is `live`.
29. Non-host users must have registration when `registrationRequired=true`.
30. Admin/host can join without registration requirement.
31. LiveKit join tokens expire after 2 hours by default.
32. Only admin/host LiveKit tokens can publish audio/video.
33. Attendee LiveKit tokens can subscribe but cannot publish by default.
34. Meeting chat uses the parent community room message API.
35. A user must be able to join the community room before sending meeting chat messages.
36. Chat content must be non-empty and at most 2000 characters.
37. Chat moderation follows the existing community message moderation flow.
41. Reminder job only processes scheduled events starting 14-16 minutes from now.
42. Reminder job only sends to registrations with status `registered` and no `reminder15mSentAt` field.
43. Event-level `reminders.fifteenMinutesSentAt` prevents the same event reminder batch from running repeatedly.
44. Socket realtime join rejects draft/cancelled/missing events.
45. Socket realtime join for private events requires active/invited room membership unless admin/host.
46. Frontend join button is disabled until user accepts the medical disclaimer and event is live.
47. Frontend redirects unauthenticated list registration attempts to login.
48. The medical disclaimer warns users that the session is for general information and does not replace personal treatment advice.

## 8. Error Codes & Messages

| Code | Message | When it occurs | User-facing? |
|------|---------|----------------|--------------|
| `400` | `scheduledEndAt phải sau scheduledStartAt.` | Event create/update has invalid date order. | Yes |
| `400` | `scheduledStartAt không hợp lệ.` / `scheduledEndAt không hợp lệ.` | `toDate()` receives invalid date. | Yes |
| `400` | `Không thể hủy hội thảo đã kết thúc.` | Admin attempts to cancel ended event. | Yes |
| `400` | `Chỉ có thể bắt đầu hội thảo đang được lên lịch.` | Admin attempts to start event not in `scheduled` or `draft`. | Yes |
| `400` | `Chỉ có thể kết thúc hội thảo đang live.` | Admin attempts to end event not in `live`. | Yes |
| `400` | `Hội thảo không còn nhận đăng ký.` | User registers ended/cancelled event. | Yes |
| `400` | `Không thể hủy đăng ký hội thảo đã kết thúc.` | User cancels registration after event ended. | Yes |
| `400` | `Hội thảo chưa bắt đầu.` | User calls join before event is live. | Yes |
| `400` | `LiveKit chưa được cấu hình.` | Join token requested without LiveKit env vars. | Yes |
| `403` | `Bạn không có quyền xem hội thảo này.` | User tries to view private event without membership. | Yes |
| `403` | `Bạn đã bị cấm trong phòng liên quan.` | Banned member tries to register/join/ask. | Yes |
| `403` | `Hội thảo riêng tư yêu cầu quyền truy cập phòng.` | Private event register/join without active/invited membership. | Yes |
| `403` | `Bạn không có quyền quản lý hội thảo này.` | Non-admin/non-host manages event. | Yes |
| `403` | `Bạn cần đăng ký trước khi tham gia.` | Non-host joins registration-required event without registration. | Yes |
| `404` | `Không tìm thấy phòng cộng đồng.` | Parent room missing/inactive on create. | Yes |
| `404` | `Không tìm thấy hội thảo.` | Event not found. | Yes |
| `404` | `Không tìm thấy đăng ký hợp lệ.` | User cancels missing/inactive registration. | Yes |
| `404` | `Không tìm thấy đăng ký.` | Admin updates missing registration. | Yes |
| `409` | `Hội thảo đã đủ số lượng đăng ký.` | Capacity reached on registration. | Yes |
| `422` | `roomId là bắt buộc` / `roomId không hợp lệ` | Create event validation fails. | Yes |
| `422` | `title là bắt buộc` / `title độ dài 3-160 ký tự` | Title validation fails. | Yes |
| `422` | `visibility chỉ nhận public|private` | Visibility validation fails. | Yes |
| `422` | `status khi tạo chỉ nhận draft|scheduled` | Create status invalid. | Yes |
| `422` | `status không hợp lệ` | Update status invalid. | Yes |
| `422` | `capacity không hợp lệ` | Capacity outside accepted range/type. | Yes |
| `422` | `content tối đa 2000 ký tự` | Community room chat content validation fails. | Yes |
| `422` | `status đăng ký không hợp lệ` | Update registration status invalid. | Yes |
| `422` | `page không hợp lệ` / `limit không hợp lệ` | Pagination validation fails. | Yes |
| `500` | `{ message, errorInfo }` | Unexpected exception, Mongo error, unhandled integration error. | No, but returned by API currently. |

Socket ack errors:

| Code | Message | When it occurs | User-facing? |
|------|---------|----------------|--------------|
| socket ack | `eventId không hợp lệ` | Socket join receives invalid/missing eventId. | Yes if UI displays ack. |
| socket ack | `Không tìm thấy hội thảo.` | Socket join event missing, cancelled or draft. | Yes if UI displays ack. |
| socket ack | `Bạn không có quyền theo dõi hội thảo này.` | Socket join access denied. | Yes if UI displays ack. |
| socket ack | `Không thể tham gia kênh realtime hội thảo.` | Unexpected socket join error. | Yes if UI displays ack. |

## 9. Configuration & Environment Variables

| Variable | Purpose | Example value | Required? |
|----------|---------|---------------|-----------|
| `LIVEKIT_API_KEY` | Backend key used to sign LiveKit JWT. | `replace-with-livekit-api-key` | Required for join. |
| `LIVEKIT_API_SECRET` | Backend secret used to sign LiveKit JWT. | `replace-with-livekit-api-secret` | Required for join. |
| `LIVEKIT_WS_URL` | LiveKit WebSocket server URL returned to frontend. | `wss://livekit.medispace.io.vn` | Required for join. |
| `VITE_LIVEKIT_WS_URL` | Frontend fallback/config placeholder. Current join flow uses backend `wsUrl`. | `wss://livekit.medispace.io.vn` | Optional in current flow. |
| `AGENDA_JOB_COLLECTION` | Mongo collection used by Agenda.js. | `agendaJobs` | Optional; defaults to `agendaJobs`. |
| `DB_COMMUNITY_VIDEO_EVENTS_COLLECTION` | Mongo collection name for events. | `communityVideoEvents` | Optional; default exists. |
| `DB_COMMUNITY_VIDEO_EVENT_REGISTRATIONS_COLLECTION` | Mongo collection name for registrations. | `communityVideoEventRegistrations` | Optional; default exists. |
| `DB_COMMUNITY_ROOMS_COLLECTION` | Existing community rooms collection used in lookups. | `communityRooms` | Optional; default exists. |
| `USERS_COLLECTION` | Users collection for registration user lookup. | `users` | Optional; default exists. |
| `AI_MODERATION_ENABLED` | Existing community chat moderation toggle; applies to room messages when enabled by community moderation flow. | `false` | Optional. |
| `AI_MODERATION_BASE_URL` | AI moderation provider URL used by moderation service. | `http://localhost:8001/v1` | Required only if AI moderation enabled and non-mock. |
| `AI_MODERATION_MODEL` | AI moderation model. | `gemma-4-e4b-it.gguf` | Optional/default in moderation service. |
| `AI_MODERATION_API_KEY` | AI provider API key. | `***redacted***` | Provider-dependent. |
| `AI_MODERATION_MOCK` | Mock moderation mode. | `false` | Optional. |
| `MONGODB_URI` | Mongo connection string for app and Agenda scheduler. | `mongodb+srv://...` | Required unless DB username/password fallback works. |
| `DB_USERNAME` / `DB_PASSWORD` | Fallback Mongo credentials used by scheduler/app config. | `***redacted***` | Required if no `MONGODB_URI`. |
| `PORT` | Backend HTTP/Socket.IO port. | `8000` | Optional; defaults to 8000. |
| `FRONTEND_URLS` | CORS allowed origins. | `http://localhost:3000` | Required for browser CORS in deployed env. |

Deployment-specific LiveKit self-host config is stored on the LiveKit server in `/opt/livekit/livekit.yaml`; do not commit real key/secret to git.

## 10. Known Limitations & Edge Cases

Recording/Egress is not implemented. Fields `recordingUrl` and `recordingStatus` exist, but there is no LiveKit Egress worker, webhook, S3 upload pipeline or retention policy in the inspected code.

Frontend attendee publishing is intentionally blocked by LiveKit token grants for non-hosts (`canPublish=false`). This fits webinar mode, but it means attendees cannot speak on camera/mic unless backend logic changes token grants.

The `provider`, `providerMeetingId`, and `meetingUrl` fields are generic, but `joinEvent()` always returns `provider: livekit` and creates a LiveKit token. Non-LiveKit providers are not implemented.

Admin UI can create/start/end/cancel events, but it does not currently expose a full edit form for updating existing event metadata even though `PATCH /admin/community/video-events/:eventId` exists.

Admin UI does not expose attendee removal/status update even though `PATCH /admin/community/video-events/:eventId/registrations/:userId` exists.

User UI service includes `cancelVideoEventRegistration()`, but inspected pages do not show a cancel registration button.

`joinedAt` is overwritten on every join. If multiple session entries are needed, a separate attendance log collection is required.

`leftAt` is documented in the broad spec but current join/leave logic does not update registration `leftAt`; Socket.IO leave only leaves realtime room.

Reminder logic sends only 15-minute reminders. `reminders.oneHourSentAt` exists but no one-hour job is implemented.

Reminder window is 14-16 minutes before start. If scheduler is down during that window, the event may never receive a reminder because later runs fall outside the query window.

Agenda recurring job may be scheduled by every backend instance in a multi-instance deployment. Agenda's storage helps coordination, but duplicate recurring job behavior should be reviewed before horizontal scaling.

Automated coverage exists for service rules, frontend component behavior, API/E2E flows, and visual UI/UX screenshots. Route-level integration coverage can still be expanded around negative cases and deployment-like configuration.

The current frontend imports LiveKit components directly in the detail route, which can increase bundle size. Lazy-loading LiveKit UI is a future optimization.

The feature depends on existing community room membership semantics. If room membership statuses change elsewhere, private event authorization must be revisited.

Medical disclaimer is enforced only in frontend UI before calling join. Backend does not record disclaimer acceptance.

Capacity checks are not protected by a transaction. Under heavy concurrent registrations, two users could pass the count check before both upsert, so strict capacity enforcement may need transactional or atomic counter logic.

No video-event-specific chat rate limit exists in the inspected feature code. Spam control relies on existing community chat auth/moderation and should be hardened for production if needed.
