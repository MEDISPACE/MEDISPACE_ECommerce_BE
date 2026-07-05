# LiveKit trong MediSpace - Giải thích thuật ngữ và luồng hoạt động

Tài liệu này giải thích LiveKit theo cách dễ hiểu, tập trung vào **thuật ngữ** và **luồng hoạt động trong dự án MediSpace**. Mục tiêu là để bạn hiểu bản chất: ai làm gì, dữ liệu đi qua đâu, vì sao cần backend cấp token, và LiveKit nằm ở vị trí nào trong hệ thống.

## 1. LiveKit là gì?

LiveKit là một nền tảng realtime audio/video dựa trên WebRTC.

Nói đơn giản:

```text
WebRTC = công nghệ giúp trình duyệt truyền camera, micro, chia sẻ màn hình realtime.
LiveKit = server + SDK giúp dùng WebRTC dễ hơn, ổn định hơn, phù hợp nhiều người tham gia.
```

Nếu tự dùng WebRTC thuần, ta phải tự xử lý rất nhiều thứ: tạo phòng, kết nối peer, signaling, reconnect, track audio/video, NAT/firewall, chất lượng mạng. LiveKit gom những phần phức tạp đó lại thành một hệ thống dễ dùng hơn.

Trong MediSpace, LiveKit được dùng cho tính năng:

```text
Community Video Events / Hội thảo video cộng đồng
```

Admin tạo hội thảo, bắt đầu buổi live, người dùng bấm tham gia và vào phòng video có camera, micro, chia sẻ màn hình.

## 2. Vì sao MediSpace cần LiveKit?

MediSpace đã có Socket.IO cho realtime, nhưng Socket.IO phù hợp với dữ liệu dạng text/event hơn là media.

Socket.IO phù hợp cho:

```text
chat
thông báo realtime
cập nhật trạng thái hội thảo
cập nhật tin nhắn mới
```

LiveKit phù hợp cho:

```text
camera
micro
chia sẻ màn hình
audio/video realtime độ trễ thấp
```

Vì vậy trong dự án này có thể hiểu:

```text
Socket.IO = realtime dữ liệu của app MediSpace
LiveKit = realtime âm thanh/hình ảnh
```

Một ví dụ dễ hình dung:

```text
User gửi tin nhắn trong phòng họp -> đi qua hệ thống chat MediSpace + Socket.IO.
User bật camera/micro -> đi qua LiveKit.
```

## 3. Các thuật ngữ LiveKit cần hiểu

### Room

Room là phòng họp video.

Trong MediSpace, mỗi hội thảo video tương ứng với một LiveKit room. Tên room được tạo theo công thức:

```text
medispace-event-{eventId}
```

Ví dụ:

```text
eventId = 665abc123
room LiveKit = medispace-event-665abc123
```

Điều này giúp hệ thống không cần tạo tên phòng thủ công. Chỉ cần biết `eventId`, backend suy ra được room LiveKit.

### Participant

Participant là người tham gia phòng LiveKit.

Trong MediSpace, participant chính là user đang vào hội thảo. Khi backend tạo token LiveKit, identity của participant là `userId` của MediSpace.

```text
MediSpace userId = LiveKit participant identity
```

Nhờ vậy khi admin muốn mute/kick một người, backend biết dùng `userId` nào để gọi LiveKit.

### Track

Track là một luồng media riêng lẻ.

Một user có thể có nhiều track:

```text
microphone track
camera track
screen share track
screen share audio track
```

Ví dụ bạn bật micro và camera, bạn đang gửi lên LiveKit hai track:

```text
1 track micro
1 track camera
```

Khi admin mute micro, hệ thống tìm microphone track của participant rồi yêu cầu LiveKit tắt track đó.

### Publish

Publish nghĩa là gửi media của mình lên phòng.

Ví dụ:

```text
Bật micro -> publish microphone track
Bật camera -> publish camera track
Chia sẻ màn hình -> publish screen share track
```

Trong MediSpace hiện tại, người đã được join phòng đều có quyền publish. Nghĩa là attendee cũng có thể bật micro, camera và chia sẻ màn hình.

### Subscribe

Subscribe nghĩa là nhận media từ người khác.

Ví dụ bạn thấy video của host, tức là trình duyệt của bạn đang subscribe camera track của host.

Trong MediSpace, user join phòng được quyền subscribe để xem/nghe những người khác.

### Token / JWT

Token là vé vào phòng LiveKit.

Frontend không tự ý vào LiveKit room được. Nó phải xin backend một token hợp lệ. Backend sẽ kiểm tra quyền trước, sau đó mới ký token.

Token thường chứa:

```text
user là ai
được vào room nào
được publish không
được subscribe không
token hết hạn khi nào
```

Trong MediSpace, token LiveKit mặc định hết hạn sau khoảng 2 giờ.

### API Key và API Secret

Đây là cặp khóa để backend ký token LiveKit.

```text
LIVEKIT_API_KEY
LIVEKIT_API_SECRET
LIVEKIT_WS_URL
```

Điểm cực kỳ quan trọng:

```text
API secret chỉ được nằm ở backend, không đưa lên frontend.
```

Nếu frontend biết secret, người dùng có thể tự ký token, tự vào phòng, hoặc giả danh người khác.

### Signaling

Signaling là quá trình trình duyệt trao đổi với LiveKit server để thiết lập kết nối WebRTC.

Trong MediSpace, signaling đi qua endpoint:

```text
wss://livekit.medispace.io.vn
```

`wss://` là WebSocket bảo mật. Đây là đường mà trình duyệt dùng để nói chuyện với LiveKit server.

### Media ports

Sau khi signaling xong, audio/video thực tế cần các cổng mạng media để truyền dữ liệu ổn định.

Trong ghi chú deploy của dự án, LiveKit cần mở các cổng kiểu:

```text
TCP 7880
TCP 7881
UDP 50000-60000
```

Nếu signaling hoạt động nhưng media port bị chặn, user có thể thấy giao diện phòng họp nhưng âm thanh/video không ổn định hoặc không truyền được.

### TURN

TURN là server hỗ trợ WebRTC trong các mạng khó, ví dụ mạng công ty, firewall chặt, NAT phức tạp.

Không phải lúc nào TURN cũng được dùng, nhưng trong production video call, TURN rất quan trọng để tăng tỷ lệ kết nối thành công.

## 4. Vai trò từng thành phần trong MediSpace

Bạn có thể chia hệ thống thành 4 phần:

```text
Frontend MediSpace
Backend MediSpace
Socket.IO MediSpace
LiveKit Server
```

### Frontend MediSpace

Frontend là nơi user thao tác:

```text
xem danh sách hội thảo
xem chi tiết hội thảo
bấm tham gia
bật/tắt micro, camera
xem video người khác
chat trong phòng
```

Frontend không tự tạo LiveKit token. Nó chỉ gọi backend để xin token.

### Backend MediSpace

Backend là nơi quyết định user có được vào phòng hay không.

Backend kiểm tra:

```text
user đã đăng nhập chưa
hội thảo có tồn tại không
hội thảo đã live chưa
user có quyền vào room không
user có bị banned không
sức chứa còn không
user là host hay attendee
```

Nếu mọi thứ hợp lệ, backend ký LiveKit token rồi trả về frontend.

### Socket.IO MediSpace

Socket.IO xử lý realtime của app, ví dụ:

```text
event chuyển sang live
event kết thúc
tin nhắn chat mới
tin nhắn bị ẩn/xóa
attendee vừa join theo logic app
```

Socket.IO không truyền camera/micro.

### LiveKit Server

LiveKit server xử lý media:

```text
camera
micro
chia sẻ màn hình
subscribe video/audio giữa các participant
mute/kick participant ở tầng media
```

LiveKit không biết business logic của MediSpace. Nó chỉ biết token có hợp lệ không và token đó cho phép user vào room nào.

## 5. Luồng tổng thể trong MediSpace

Đây là luồng đầy đủ từ lúc admin tạo hội thảo đến lúc user vào phòng.

```text
Admin tạo hội thảo
  -> Backend lưu lịch hội thảo trong MediSpace

Admin bấm bắt đầu
  -> Backend đổi trạng thái hội thảo sang live
  -> Socket.IO thông báo hội thảo đang live

User bấm tham gia
  -> Frontend gọi backend xin join
  -> Backend kiểm tra quyền và trạng thái
  -> Backend ký LiveKit token
  -> Frontend nhận token + wsUrl
  -> Frontend kết nối LiveKit room
  -> User vào phòng video

Trong lúc họp
  -> Camera/micro/screen share đi qua LiveKit
  -> Chat đi qua MediSpace Community Chat + Socket.IO

Admin kết thúc
  -> Backend đổi trạng thái hội thảo sang ended
  -> User không lấy token join mới được nữa
```

## 6. Luồng tạo hội thảo

Khi admin tạo hội thảo, hệ thống MediSpace tạo một sự kiện video trong app.

Ở bước này cần hiểu:

```text
Chưa nhất thiết có ai vào LiveKit.
Chưa cần truyền video.
Chỉ là tạo lịch hội thảo trong MediSpace.
```

Thông tin thường có:

```text
tiêu đề
mô tả
thời gian bắt đầu
thời gian kết thúc
room cộng đồng liên quan
host
sức chứa
visibility public/private
provider = livekit
```

Sau khi tạo, hội thảo thường ở trạng thái:

```text
scheduled
```

Người dùng có thể thấy link hội thảo, nhưng chưa chắc join được nếu hội thảo chưa live.

## 7. Luồng start hội thảo

Khi admin bấm bắt đầu, backend đổi trạng thái hội thảo sang:

```text
live
```

Từ thời điểm này, user hợp lệ mới có thể xin token LiveKit để vào phòng.

Điểm cần nhớ:

```text
MediSpace dùng trạng thái live để kiểm soát khi nào user được cấp token.
```

LiveKit không tự biết hội thảo đã bắt đầu hay chưa. Backend MediSpace là nơi quyết định.

## 8. Luồng user join phòng

Đây là luồng quan trọng nhất.

```text
User bấm "Tham gia"
  -> Frontend gọi backend
  -> Backend kiểm tra quyền
  -> Backend tạo token LiveKit
  -> Frontend dùng token kết nối LiveKit
```

Chi tiết hơn:

### Bước 1: Frontend gọi backend

Frontend không gọi LiveKit ngay. Nó gọi backend trước:

```text
Tôi là user này, tôi muốn tham gia event này, tôi có được vào không?
```

### Bước 2: Backend kiểm tra quyền

Backend kiểm tra các điều kiện như:

```text
user đã đăng nhập chưa
event có tồn tại không
event có đang live không
user có bị banned khỏi community room không
event private thì user có quyền vào room không
sức chứa còn không
```

Nếu không đạt, backend trả lỗi và không cấp token.

### Bước 3: Backend tạo LiveKit token

Nếu hợp lệ, backend tạo token với thông tin kiểu:

```text
identity = userId
room = medispace-event-{eventId}
role = host hoặc attendee
canPublish = true
canSubscribe = true
ttl = 2h
```

Token này giống vé vào đúng một phòng cụ thể.

### Bước 4: Backend trả payload cho frontend

Frontend nhận về:

```text
provider = livekit
wsUrl = wss://livekit.medispace.io.vn
token = JWT
role = host hoặc attendee
expiresAt = thời điểm hết hạn
```

### Bước 5: Frontend kết nối LiveKit

Frontend dùng token và wsUrl để mount LiveKit room.

Từ đây camera/micro/screen share bắt đầu đi qua LiveKit.

## 9. Vì sao không để frontend tự tạo token?

Đây là điểm thiết kế rất quan trọng.

Không nên để frontend tự tạo token vì frontend nằm trên máy người dùng. Nếu frontend có quyền ký token, user có thể can thiệp và tự tạo vé vào bất kỳ phòng nào.

Thiết kế đúng là:

```text
Frontend xin quyền
Backend kiểm tra quyền
Backend ký token
Frontend dùng token
```

Backend mới biết đầy đủ business logic của MediSpace:

```text
user là ai
role gì
có bị banned không
event đã live chưa
room private hay public
capacity còn không
```

LiveKit chỉ kiểm tra token. Nó không biết các quy tắc nghiệp vụ của MediSpace.

## 10. Luồng chat trong phòng họp

Một điểm dễ nhầm: chat trong phòng họp MediSpace không dùng LiveKit chat.

Trong MediSpace:

```text
Video/audio -> LiveKit
Chat -> Community Message của MediSpace + Socket.IO
```

LiveKit có component chat riêng, nhưng dự án đang ẩn phần đó. Lý do hợp lý là chat của MediSpace đã có:

```text
lưu database
moderation
ẩn/xóa tin nhắn
report
đồng bộ với community room
```

Nếu dùng LiveKit chat, dữ liệu chat sẽ bị tách khỏi hệ thống community hiện tại.

## 11. Luồng admin mute/kick participant

Admin có thể quản lý người đang trong phòng LiveKit.

### List participant

Backend hỏi LiveKit:

```text
Trong room medispace-event-{eventId} hiện có những participant nào?
```

LiveKit trả về danh sách participant, metadata và các track đang publish.

### Mute microphone

Khi admin mute một người:

```text
Backend tìm participant theo userId
Backend tìm microphone track của participant đó
Backend yêu cầu LiveKit mute track đó
```

Nếu người đó chưa bật micro, sẽ không có microphone track để mute.

### Kick participant

Khi admin kick một người:

```text
Backend yêu cầu LiveKit remove participant khỏi room hiện tại
```

Nhưng cần nhớ:

```text
Kick không phải ban vĩnh viễn.
Nếu backend vẫn cho phép user join, user có thể xin token mới và vào lại.
```

Muốn ban thật sự thì phải thêm rule ở tầng MediSpace trước khi cấp token.

## 12. Luồng kết thúc hội thảo

Khi admin kết thúc hội thảo, backend đổi trạng thái event sang:

```text
ended
```

Sau đó:

```text
user không xin token join mới được nữa
registration được cập nhật theo logic MediSpace
Socket.IO thông báo trạng thái event thay đổi
```

LiveKit room có thể tự rỗng khi participant rời đi. Phần trạng thái nghiệp vụ `ended` vẫn do MediSpace quản lý.

## 13. Triển khai production đang được hiểu như thế nào?

Trong dự án, endpoint LiveKit là:

```text
wss://livekit.medispace.io.vn
```

Nginx proxy domain này về LiveKit server chạy local trên server:

```text
livekit.medispace.io.vn -> localhost:7880
```

Vì vậy có thể hiểu production theo hướng:

```text
MediSpace app chạy backend/frontend riêng.
LiveKit server chạy như một service riêng.
Nginx đứng trước để expose domain bảo mật cho LiveKit.
```

Trong Docker Compose của app hiện không thấy service LiveKit, nên LiveKit không nằm chung container stack chính của MediSpace.

## 14. Một câu tóm tắt dễ nhớ

Bạn có thể ghi nhớ LiveKit trong MediSpace bằng câu này:

> MediSpace quyết định ai được vào hội thảo và khi nào được vào; LiveKit chỉ xử lý việc truyền camera, micro và chia sẻ màn hình sau khi user có token hợp lệ.

Hoặc chi tiết hơn:

```text
Backend MediSpace = người soát vé
LiveKit token = vé vào phòng
LiveKit server = phòng họp video thật
Socket.IO = kênh realtime cho chat/trạng thái app
Frontend = nơi user thao tác và hiển thị phòng họp
```

## 15. Các lỗi tư duy thường gặp

### Nhầm Socket.IO với LiveKit

Socket.IO không truyền video/audio. Nó chỉ truyền dữ liệu realtime của app.

### Nghĩ frontend tự vào LiveKit được

Frontend phải có token do backend ký. Không có token thì không nên vào được phòng.

### Nghĩ LiveKit biết user có quyền hay không

LiveKit không biết logic MediSpace. Backend phải kiểm tra quyền trước khi cấp token.

### Nghĩ kick là ban

Kick chỉ đá khỏi phiên hiện tại. Ban phải làm ở backend bằng cách không cấp token mới.

### Nghĩ chat đi qua LiveKit

Trong MediSpace, chat đi qua hệ thống community chat riêng, không dùng LiveKit chat.

### Nghĩ event scheduled là vào phòng được

User chỉ lấy được token khi event đã chuyển sang `live`.

## 16. Checklist hiểu đúng luồng

Nếu bạn trả lời được các câu này, bạn đã nắm được cách MediSpace dùng LiveKit:

1. LiveKit xử lý phần nào của hội thảo?
2. Socket.IO xử lý phần nào?
3. Vì sao backend phải cấp token?
4. Room name được tạo theo quy tắc nào?
5. Participant identity trong LiveKit tương ứng với gì trong MediSpace?
6. Chat trong phòng họp đi qua LiveKit hay MediSpace?
7. Khi nào user được join?
8. Kick khác ban như thế nào?
9. Nếu LiveKit signaling được nhưng video lỗi, cần nghĩ tới điều gì?
10. Vì sao không đưa `LIVEKIT_API_SECRET` lên frontend?
