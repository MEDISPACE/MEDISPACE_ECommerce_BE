# Spec: Community Rooms, Moderation va AI Review

> **Phien ban:** 1.0  
> **Cap nhat:** 2026-06-01  
> **Trang thai:** Feature-ready, da merge `origin/develop` vao nhanh feature

---

## 1. Muc tieu tinh nang

Tinh nang nay bo sung khu vuc cong dong cho MEDISPACE, cho phep nguoi dung tham gia phong suc khoe, trao doi tin nhan, va duoc kiem duyet bang rule-based moderation, admin moderation, appeal flow va AI moderation.

Pham vi hien tai gom:

- Tao, cap nhat, archive/unarchive phong cong dong tu admin.
- Phong public va private, co request join, invite, approve/reject/member status.
- Tin nhan realtime trong phong, co sender info, unread count va message/member count.
- Rule-based moderation khi gui tin nhan.
- Admin moderation queue, action history, appeal history.
- AI moderation job queue, manual rerun, retry, audit list.
- Mock mode cho e2e khong goi AI provider that.

---

## 2. Kien truc tong quan

```
FE Community/Admin UI
        |
        | REST + Socket.IO
        v
Node/Express BE
        |
        +-- communityService: rooms, members, messages, reports
        +-- moderationService: queue, actions, appeals
        +-- aiModerationService: AI jobs, prompt, apply result
        |
        v
MongoDB collections

Optional:
Node BE -> OpenAI-compatible LLM endpoint /chat/completions
```

Module chinh:

| Module | Vai tro |
|--------|---------|
| `src/routes/community.routes.ts` | API user-facing cho room, join, message, report, appeal |
| `src/routes/adminCommunity.routes.ts` | API admin quan ly room/member/invite |
| `src/routes/adminModeration.routes.ts` | API admin queue/action/appeal/AI jobs |
| `src/services/community.services.ts` | Nghiep vu room, member, message, report |
| `src/services/moderation.services.ts` | Nghiep vu moderation queue, actions, appeals |
| `src/services/aiModeration.services.ts` | Queue job AI, call provider, apply auto hide/finding |
| `src/sockets/chat.socket.ts` | Socket room join va realtime events |
| `src/services/database.services.ts` | Collection getters va indexes |

---

## 3. Domain model

### 3.1 Community room

Collection: `communityRooms`

Field chinh:

| Field | Type | Mo ta |
|-------|------|-------|
| `_id` | ObjectId | Room id |
| `name` | string | Ten phong |
| `slug` | string | Unique slug |
| `visibility` | `public` / `private` | Kieu truy cap |
| `diseaseKey` | string | Nhom benh/chu de |
| `status` | `active` / `archived` | Trang thai phong |
| `createdBy` | ObjectId | Admin tao phong |
| `createdAt`, `updatedAt` | Date | Audit thoi gian |

Room list co them metrics tu aggregation:

- `memberCount`
- `messageCount`
- `unreadCount` theo viewer
- `viewerMemberStatus`

### 3.2 Room member

Collection: `communityRoomMembers`

| Field | Type | Mo ta |
|-------|------|-------|
| `roomId` | ObjectId | Phong |
| `userId` | ObjectId | User |
| `role` | `member` / `moderator` | Vai tro trong phong |
| `status` | `active` / `pending` / `invited` / `left` / `muted` / `banned` | Trang thai tham gia |
| `mutedUntil` | Date/null | Thoi han mute |
| `lastReadAt` | Date/null | Moc tinh unread |
| `joinedAt`, `updatedAt` | Date | Audit thoi gian |

Rule truy cap:

- Public room: user co the join truc tiep.
- Private room:
  - User goi join-request -> `pending`.
  - Admin approve bang update member `status=active`.
  - Admin invite user/email -> `invited`.
  - User da `invited` co the join thanh `active`.
- User `banned` khong chat duoc cho toi khi admin unban/approve appeal.
- User `muted` hoac con `mutedUntil` khong chat duoc.

### 3.3 Community message

Collection: `communityMessages`

| Field | Type | Mo ta |
|-------|------|-------|
| `_id` | ObjectId | Message id |
| `roomId` | ObjectId | Phong |
| `senderId` | ObjectId | Nguoi gui |
| `content` | string | Noi dung |
| `status` | `visible` / `hidden` / `deleted` | Trang thai hien thi |
| `moderated` | object | Ket qua rule/AI moderation |
| `createdAt`, `updatedAt` | Date | Audit thoi gian |

Message list lookup sender de FE hien thi ten/avatar nguoi gui.

---

## 4. Public/community API

Base path: `/community`

| Method | Endpoint | Auth | Mo ta |
|--------|----------|------|-------|
| `GET` | `/rooms` | optional | List public rooms, co filter/search |
| `GET` | `/rooms/my` | user | List rooms user co quyen thay, gom private active/invited |
| `POST` | `/rooms` | admin | Legacy admin-only create room |
| `POST` | `/rooms/:roomId/join` | user | Join public room hoac accept invite |
| `POST` | `/rooms/:roomId/join-request` | user | Tao request join private room |
| `POST` | `/rooms/:roomId/leave` | user | Roi phong |
| `POST` | `/rooms/:roomId/read` | user | Cap nhat `lastReadAt` de tinh unread |
| `POST` | `/rooms/:roomId/appeals` | user | Gui appeal ban/mute/message |
| `GET` | `/rooms/:roomId/messages` | user | List visible messages trong room |
| `POST` | `/rooms/:roomId/messages` | user | Gui message va chay moderation |
| `POST` | `/messages/:messageId/report` | user | Report message |

Response chung dung envelope `data` hoac `result` tuy controller cu/moi. FE service da unwrap ca hai dang.

---

## 5. Admin community API

Base path: `/admin/community`

Tat ca endpoint yeu cau `accessTokenValidator`, `verifiedUserValidator`, `adminRequired`.

| Method | Endpoint | Mo ta |
|--------|----------|-------|
| `GET` | `/rooms` | List room admin, co pagination/filter/search server-side |
| `POST` | `/rooms` | Tao room |
| `PATCH` | `/rooms/:roomId` | Cap nhat name/slug/visibility/diseaseKey |
| `PATCH` | `/rooms/:roomId/archive` | Archive room |
| `PATCH` | `/rooms/:roomId/unarchive` | Mo lai room |
| `GET` | `/rooms/:roomId/members` | List member, co status filter |
| `PATCH` | `/rooms/:roomId/members/:userId` | Cap nhat role/status/mutedUntil |
| `POST` | `/rooms/:roomId/invite` | Invite user theo `userId` hoac `email` |

Admin UI tuong ung: `AdminCommunityPage` ben FE.

---

## 6. Moderation flow

### 6.1 Rule-based moderation khi gui tin

Khi user gui message:

1. `communityService.requireCanChat()` kiem tra room active, member active, khong bi mute/ban.
2. Insert base message `status=visible`.
3. Chay `moderateTextRuleBased(content)`.
4. Neu severity cao:
   - Cap nhat message `status=hidden`.
   - Ghi `moderated.autoHidden=true`.
   - Tao moderation finding.
   - Emit event cho admin/user.
5. Neu severity can review:
   - Tao moderation finding `status=open`.
6. Neu AI moderation auto enabled:
   - Enqueue AI review job.

Rule-based moderation hien la lop dau, nhanh va deterministic. No co the false positive/false negative, nen AI review va admin queue la lop bo sung.

### 6.2 Moderation finding

Collection: `moderationFindings`

| Field | Mo ta |
|-------|-------|
| `roomId`, `messageId`, `senderId` | Context |
| `trigger` | `rule` / `report` / `ai` |
| `status` | `open` / `resolved` / `dismissed` |
| `severity` | `low` / `medium` / `high` / `critical` |
| `categories` | Danh muc vi pham |
| `confidence` | Do tin cay |
| `reasons` | Ly do |
| `ai` | Ket qua AI neu trigger/nguon lien quan AI |

### 6.3 Admin moderation API

Base path: `/admin/moderation`

| Method | Endpoint | Mo ta |
|--------|----------|-------|
| `GET` | `/queue` | List findings, filter severity/trigger/search |
| `GET` | `/actions` | Audit action history, filter room/message/user/action/date |
| `GET` | `/appeals` | List appeal, filter status/type/room/user/search |
| `GET` | `/ai-jobs` | List AI review jobs, filter status/roomId/messageId/search |
| `POST` | `/ai-jobs/:jobId/retry` | Retry failed/succeeded/pending job |
| `PATCH` | `/appeals/:appealId` | Approve/reject appeal |
| `PATCH` | `/messages/:messageId/action` | Apply admin action |
| `POST` | `/messages/:messageId/ai-review` | Manual rerun AI review cho message |

Admin action ho tro:

- `hide_message`
- `restore_message`
- `delete_message`
- `mute_user`
- `unmute_user`
- `ban_user`
- `unban_user`
- `dismiss`

Moi action ghi vao `moderationActions` de audit.

---

## 7. Appeal flow

User co the gui appeal khi:

- Bi ban khoi room: `type=ban`
- Bi mute: `type=mute`
- Message bi hidden/deleted: `type=message`, can `messageId`

Rule nghiep vu:

- Chi tao appeal neu room active.
- Appeal duplicate `status=open` cho cung `roomId + userId + type + messageId` bi chan.
- Khi admin approve:
  - `ban` -> cap nhat member `status=left` de user co the join lai.
  - `mute` -> xoa `mutedUntil`, member active lai.
  - `message` -> restore message neu phu hop.
- Khi reject: chi cap nhat appeal status va audit action.

Admin UI co section xem appeal dang mo va filter de xem history `open/approved/rejected`.

---

## 8. AI moderation

### 8.1 Cau hinh

Bien moi truong:

| Env | Default | Mo ta |
|-----|---------|-------|
| `AI_MODERATION_ENABLED` | `false` | Bat auto enqueue khi user gui message |
| `AI_MODERATION_BASE_URL` | - | OpenAI-compatible base URL, vi du `http://localhost:8001/v1` |
| `AI_MODERATION_MODEL` | `gemma-4-e4b-it.gguf` | Model name |
| `AI_MODERATION_API_KEY` | - | Bearer token neu provider can |
| `AI_MODERATION_MOCK` | `false` | Mock deterministic cho test/e2e |
| `AI_MODERATION_TIMEOUT_MS` | `12000` | Timeout call provider |
| `AI_MODERATION_MAX_ATTEMPTS` | `3` | So lan retry toi da |
| `AI_MODERATION_WORKER_INTERVAL_MS` | `5000` | Worker interval |
| `AI_MODERATION_HIDE_CONFIDENCE` | `0.78` | Nguong auto hide |
| `AI_MODERATION_REVIEW_CONFIDENCE` | `0.55` | Nguong tao finding review |

Fallback env duoc ho tro:

- `CUSTOM_LLM_BASE_URL`
- `CUSTOM_LLM_API_KEY`
- `CUSTOM_LLM_MODEL`

Khuyen nghi staging/prod:

- Bat `AI_MODERATION_ENABLED=true` chi khi provider on dinh.
- Neu model co cold start, tang `AI_MODERATION_TIMEOUT_MS` len `60000`.
- Khong bat `AI_MODERATION_MOCK` ngoai test/e2e.

### 8.2 AI job lifecycle

Collection: `moderationAiJobs`

| Status | Mo ta |
|--------|-------|
| `pending` | Dang cho worker xu ly |
| `running` | Dang lock va call provider |
| `succeeded` | Da co ket qua va da apply |
| `failed` | Provider/parse/apply loi, co `lastError` da sanitize |

Flow:

1. `enqueueMessageReview()` upsert job theo unique key `messageId + promptVersion`.
2. Worker `processPendingJobs()` lock job bang `lockedUntil`.
3. `reviewText()` build prompt, redact email/phone trong message, call `/chat/completions`.
4. Parse JSON AI response va normalize fields.
5. `applyResult()` update message `moderated.ai`.
6. Neu AI severity/confidence dat nguong:
   - Auto hide message.
   - Tao/merge moderation finding `trigger=ai`.
   - Emit realtime cho room/admin/user.
7. Update job `succeeded` hoac `failed`.

AI response expected:

```json
{
  "severity": "low | medium | high | critical",
  "categories": ["pii", "spam", "toxic", "medical_harm", "harassment", "unsafe_advice", "self_harm", "other"],
  "confidence": 0.0,
  "shouldHide": false,
  "requiresHumanReview": false,
  "reason": "short reason",
  "suggestedAction": "none | review | hide"
}
```

### 8.3 Privacy va safety

Da ap dung:

- Prompt gui cho LLM dung `redactText()` de thay email/phone bang `[email]`, `[phone]`.
- Khong luu prompt raw.
- `lastError` luu DB duoc sanitize Bearer token/API key va cat 500 ky tu.
- AI result chi la signal; admin van co queue/action/appeal de sua sai.

Rui ro con lai:

- Message content goc van nam trong DB vi day la chat feature.
- AI co the false positive/false negative.
- Neu provider ngoai he thong, can review DPA/privacy policy truoc khi bat prod.

### 8.4 Mock mode cho e2e

Khi `AI_MODERATION_MOCK=true`:

- Khong call provider.
- Content co `[ai-hide]` hoac `AI_E2E_HIDE` -> high, `medical_harm`, confidence `0.95`, auto hide.
- Content co `[ai-review]` hoac `AI_E2E_REVIEW` -> medium, review.
- Content khac -> low/safe.

Dung de chay Playwright e2e on dinh.

---

## 9. Realtime events

Socket.IO room:

- Personal room: `user:{userId}`
- Admin room: `admins`
- Community room: `community:room:{roomId}`

Client join community room bang event:

- `community:room:join`
- `community:room:leave`

Server events:

| Event | Receiver | Mo ta |
|-------|----------|-------|
| `community:message:new` | room | Message moi visible |
| `community:message:hidden` | room/user | Message bi hidden |
| `community:message:deleted` | room/user | Message bi deleted |
| `community:member:joined` | room | Member join |
| `community:member:left` | room | Member leave |
| `community:member:updated` | room/user | Admin update member |
| `community:member:requested` | admins | Co join request private room |
| `community:member:invited` | user | User duoc invite |
| `community:room:read` | user | User mark read |
| `community:moderation:queued` | admins | Finding moi can review |
| `community:appeal:created` | user/admin flow | Appeal moi |
| `community:appeal:resolved` | user | Appeal da xu ly |

Realtime count hien duoc FE cap nhat tu message/member/read events va fallback bang fetch/list.

---

## 10. Indexes va collections

Indexes duoc tao trong `databaseService.createIndexes()`:

| Collection | Index |
|------------|-------|
| `communityRooms` | `{ slug: 1 } unique` |
| `communityRooms` | `{ visibility: 1, status: 1, createdAt: -1 }` |
| `communityRoomMembers` | `{ roomId: 1, userId: 1 } unique` |
| `communityRoomMembers` | `{ roomId: 1, status: 1, updatedAt: -1 }` |
| `communityRoomMembers` | `{ userId: 1, status: 1, updatedAt: -1 }` |
| `communityMessages` | `{ roomId: 1, createdAt: -1 }` |
| `communityMessages` | `{ senderId: 1, createdAt: -1 }` |
| `communityMessages` | `{ status: 1, createdAt: -1 }` |
| `moderationFindings` | `{ status: 1, createdAt: -1 }` |
| `moderationFindings` | `{ roomId: 1, status: 1, createdAt: -1 }` |
| `moderationFindings` | `{ messageId: 1 } unique` |
| `moderationReports` | `{ messageId: 1, createdAt: -1 }` |
| `moderationActions` | `{ messageId: 1, createdAt: -1 }` |
| `moderationAppeals` | `{ status: 1, createdAt: -1 }` |
| `moderationAppeals` | `{ roomId: 1, userId: 1, status: 1, createdAt: -1 }` |
| `moderationAiJobs` | `{ status: 1, lockedUntil: 1, createdAt: 1 }` |
| `moderationAiJobs` | `{ messageId: 1, promptVersion: 1 } unique` |

---

## 11. Admin UI va FE surface

Backend docs nay lien quan cac man FE sau:

| FE page/spec | Vai tro |
|--------------|---------|
| `AdminCommunityPage` | Tao/sua/archive room, member management, invite |
| `AdminModerationPage` | Queue, actions, appeals, AI jobs |
| Community pages | Room list, private request status, chat room, unread/member count |
| Playwright `community-moderation.spec.ts` | Private join, approve, realtime count, ban/appeal |
| Playwright `community-ai-moderation.spec.ts` | AI review job + auto hide + admin audit UI |

UX state da co:

- Join/request button disable theo member status.
- Trang thai da gui request/appeal.
- Search/filter server-side trong admin room, moderation queue, actions, appeals, AI jobs.
- Appeal history co the xem bang status filter.

---

## 12. Test va verification

### 12.1 Backend

```bash
npm run build
npm test -- --run
```

Focused AI moderation:

```bash
npm test -- --run src/tests/aiModeration.services.test.ts
```

### 12.2 Frontend e2e thong thuong

Chay seed truoc:

```bash
cd ../MEDISPACE_ECommerce_BE
npm run seed:e2e
```

Chay FE e2e:

```bash
cd ../MEDISPACE_ECommerce_FE
npm run test:e2e -- --reporter=list
```

### 12.3 AI moderation e2e on dinh

Can backend rieng voi mock:

```bash
cd ../MEDISPACE_ECommerce_BE
PORT=8010 AI_MODERATION_MOCK=true AI_MODERATION_ENABLED=true npm run dev
```

FE dung API mock backend:

```bash
cd ../MEDISPACE_ECommerce_FE
VITE_API_URL=http://localhost:8010 npm run dev -- --port 3000
```

Chay spec:

```bash
E2E_AI_MODERATION=true \
E2E_API_URL=http://localhost:8010 \
E2E_BASE_URL=http://localhost:3000 \
npm run test:e2e -- --reporter=list tests/e2e/specs/community-ai-moderation.spec.ts
```

### 12.4 Smoke AI provider that

Khong in key/base URL ra log. Chi can xac nhan provider tra result:

```bash
AI_MODERATION_BASE_URL=http://your-provider/v1 \
AI_MODERATION_MODEL=your-model \
AI_MODERATION_TIMEOUT_MS=60000 \
npx tsx -e "import aiModerationService from './src/services/aiModeration.services'; (async()=>{ const r=await aiModerationService.reviewText('Toi bi ho nhe, co nen uong thuoc theo huong dan bac si khong?'); console.log({severity:r.severity, confidence:r.confidence, shouldHide:r.shouldHide, suggestedAction:r.suggestedAction}); })()"
```

---

## 13. Van hanh va monitoring

Nen theo doi:

- So AI jobs `pending/running/failed/succeeded`.
- AI latency (`latencyMs`).
- Ty le auto hidden.
- So finding open qua lau.
- So appeal approved/rejected.
- So report/room/message theo ngay.
- Socket join error cho private room.

Can canh bao:

- AI job failed lien tuc.
- Pending jobs ton qua nguong.
- Auto hide tang bat thuong.
- Provider timeout tang sau deploy.

---

## 14. Gioi han hien tai va viec nen lam tiep

Gioi han:

- Rule-based moderation con don gian, can tuning bang du lieu that.
- AI moderation chua co dashboard metric rieng, moi co job audit list.
- Appeal flow la admin-driven, chua co SLA/notification day du cho admin.
- Private room invite theo email can dam bao email ton tai hoac co flow invite external neu mo rong.

De xuat tiep:

1. Them dashboard metric cho AI moderation: success rate, failed rate, latency p50/p95.
2. Them scheduled cleanup/retry cho AI jobs bi lock qua lau.
3. Them audit export cho moderation actions/appeals.
4. Them configurable rule set cho moderation engine.
5. Them notification admin khi co private join request/appeal moi.
6. Review privacy neu bat provider AI ben ngoai o production.

