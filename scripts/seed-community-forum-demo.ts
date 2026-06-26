import { config } from 'dotenv'
config({ quiet: true })

import { MongoClient, ObjectId } from 'mongodb'

const SEED_TAG = 'community-forum-thread-demo-v1'

type UserDoc = {
  _id: ObjectId
  firstName?: string
  lastName?: string
  email?: string
  role?: number
}

type RoomDoc = {
  _id: ObjectId
  name: string
  slug?: string
  diseaseKey?: string
  topicLabel?: string
  visibility?: 'public' | 'private'
}

type ThreadSeed = {
  roomMatch: string[]
  prefix: 'question' | 'review' | 'warning' | 'story' | 'experience' | 'pharmacist'
  title: string
  content: string
  tags: string[]
  sticky?: boolean
  answered?: boolean
  videoMeeting?: {
    provider?: string
    status: 'scheduled' | 'live' | 'ended'
    startsInHours?: number
    title?: string
    note?: string
  }
  hoursAgo: number
  replies: Array<{
    by: 'admin' | 'customer' | 'customer2'
    content: string
    hoursAfter: number
    accepted?: boolean
  }>
}

function collectionName(envKey: string, fallback: string) {
  return process.env[envKey] || fallback
}

function mongoUri() {
  return (
    process.env.MONGODB_URI ||
    `mongodb+srv://${process.env.DB_USERNAME}:${process.env.DB_PASSWORD}@medispacedb.35qkwso.mongodb.net/?retryWrites=true&w=majority&appName=MediSpaceDB`
  )
}

function slugify(input: string) {
  return input
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

function dateHoursAgo(hours: number) {
  return new Date(Date.now() - hours * 60 * 60 * 1000)
}

const THREAD_SEEDS: ThreadSeed[] = [
  {
    roomMatch: ['diabetes', 'dai-thao-duong', 'duong'],
    prefix: 'question',
    title: 'Sau bữa tối đường huyết hay tăng, mọi người ghi nhật ký thế nào cho dễ theo dõi?',
    content:
      'Mình đang thử ghi lại món ăn, giờ ăn và chỉ số sau ăn 2 giờ nhưng hơi rối. Có mẫu ghi chép nào đơn giản để nhìn ra món nào làm chỉ số tăng mạnh không? Mình muốn chuẩn bị trước khi trao đổi với bác sĩ trong lần tái khám tới.',
    tags: ['duong-huyet', 'nhat-ky', 'bua-an'],
    sticky: true,
    answered: true,
    videoMeeting: {
      status: 'live',
      startsInHours: -0.5,
      title: 'Phòng thảo luận đường huyết sau bữa ăn',
      note: 'Trao đổi nhanh theo thread, không chia sẻ thông tin cá nhân nhạy cảm trong phòng cộng đồng.'
    },
    hoursAgo: 32,
    replies: [
      {
        by: 'admin',
        accepted: true,
        hoursAfter: 1.2,
        content:
          'Bạn có thể dùng bảng 4 cột: thời điểm ăn, món chính/tinh bột, vận động sau ăn, chỉ số sau 2 giờ. Sau 5-7 ngày sẽ dễ thấy xu hướng hơn. Nếu chỉ số tăng bất thường nhiều lần, hãy mang bảng này khi tái khám để được điều chỉnh phù hợp.'
      },
      {
        by: 'customer2',
        hoursAfter: 3,
        content:
          'Mình thêm một cột ghi “ngủ đủ hay thiếu ngủ” nữa, vì có ngày ăn giống nhau nhưng ngủ ít thì chỉ số cũng cao hơn.'
      },
      {
        by: 'customer',
        hoursAfter: 5,
        content:
          'Cảm ơn mọi người. Mình sẽ thử mẫu 4 cột trước, có gì cuối tuần quay lại update kết quả.'
      }
    ]
  },
  {
    roomMatch: ['diabetes', 'dai-thao-duong', 'duong'],
    prefix: 'experience',
    title: 'Kinh nghiệm chuẩn bị hộp ăn trưa ít ngán khi cần kiểm soát tinh bột',
    content:
      'Mình thấy nếu chuẩn bị sẵn theo từng nhóm nguyên liệu thì dễ duy trì hơn: rau luộc hoặc salad riêng, đạm nạc riêng, tinh bột chia phần nhỏ. Cách này không thay thế tư vấn dinh dưỡng, nhưng giúp mình đỡ gọi đồ ăn nhanh vào buổi trưa.',
    tags: ['meal-prep', 'dinh-duong'],
    hoursAgo: 20,
    replies: [
      {
        by: 'customer2',
        hoursAfter: 1.5,
        content: 'Mình cũng làm vậy, thêm hũ nước sốt riêng để rau không bị mềm. Có tuần đổi cá/ức gà/trứng cho đỡ chán.'
      },
      {
        by: 'admin',
        hoursAfter: 2.3,
        content:
          'Ý tưởng chia nhóm nguyên liệu khá dễ áp dụng. Mọi người nhớ theo dõi phản ứng cơ thể và chỉ số cá nhân, vì nhu cầu mỗi người khác nhau.'
      }
    ]
  },
  {
    roomMatch: ['cardio', 'heart', 'tim-mach', 'huyet-ap'],
    prefix: 'question',
    title: 'Đo huyết áp ở nhà nên lấy chỉ số lần nào nếu hai lần đo lệch nhau?',
    content:
      'Sáng nay mình nghỉ khoảng 5 phút rồi đo, lần đầu 136/84, lần sau 128/80. Mình không biết nên ghi lần đầu, lần hai hay trung bình. Mọi người đang theo dõi ở nhà như thế nào?',
    tags: ['huyet-ap', 'theo-doi-tai-nha'],
    answered: true,
    videoMeeting: {
      status: 'scheduled',
      startsInHours: 4,
      title: 'Trao đổi cộng đồng về đo huyết áp tại nhà',
      note: 'Mở phòng Google Meet để mọi người hỏi thêm về cách ghi chỉ số và theo dõi xu hướng.'
    },
    hoursAgo: 28,
    replies: [
      {
        by: 'admin',
        accepted: true,
        hoursAfter: 0.8,
        content:
          'Bạn nên đo đúng tư thế, nghỉ yên, tránh cà phê/vận động trước đó. Thường có thể đo 2 lần cách nhau 1-2 phút và ghi cả hai hoặc trung bình, quan trọng là xu hướng nhiều ngày. Nếu chỉ số cao lặp lại hoặc có triệu chứng như đau ngực, khó thở, chóng mặt, hãy đi khám sớm.'
      },
      {
        by: 'customer',
        hoursAfter: 2,
        content: 'Mình dùng app ghi sáng/tối, cuối tuần xuất ảnh đưa bác sĩ xem khá tiện.'
      }
    ]
  },
  {
    roomMatch: ['cardio', 'heart', 'tim-mach', 'huyet-ap'],
    prefix: 'warning',
    title: 'Nhắc nhẹ: đừng tự ngưng thuốc huyết áp chỉ vì vài ngày đo đẹp',
    content:
      'Nhà mình có người thấy huyết áp ổn vài hôm nên tự bỏ thuốc, sau đó chỉ số tăng lại. Mình đăng để mọi người cẩn thận: các thay đổi về thuốc nên trao đổi với bác sĩ/dược sĩ, đừng tự quyết khi chưa có hướng dẫn.',
    tags: ['an-toan-thuoc', 'huyet-ap'],
    hoursAgo: 14,
    replies: [
      {
        by: 'admin',
        hoursAfter: 1,
        content:
          'Cảm ơn bạn đã nhắc. Đây là điểm rất quan trọng: chỉ số ổn có thể là nhờ thuốc đang phát huy tác dụng. Tự ngưng hoặc đổi liều có thể gây rủi ro.'
      },
      {
        by: 'customer2',
        hoursAfter: 2.4,
        content: 'Mình sẽ gửi thread này cho ba mẹ đọc, vì người lớn hay có tâm lý thấy khỏe là bỏ thuốc.'
      }
    ]
  },
  {
    roomMatch: ['dermatology', 'da-lieu', 'da'],
    prefix: 'review',
    title: 'Review routine phục hồi da sau khi dùng treatment hơi quá tay',
    content:
      'Mình từng dùng nhiều hoạt chất cùng lúc nên da rát và bong nhẹ. Hai tuần vừa rồi mình tối giản còn sữa rửa mặt dịu nhẹ, dưỡng ẩm và chống nắng. Da ổn hơn khá rõ. Mình không khuyên ai làm giống y hệt, chỉ chia sẻ để mọi người đừng nóng vội khi dùng treatment.',
    tags: ['cham-soc-da', 'phuc-hoi-da', 'treatment'],
    videoMeeting: {
      status: 'ended',
      startsInHours: -18,
      title: 'Phòng trao đổi routine phục hồi da',
      note: 'Buổi trao đổi đã kết thúc, thread vẫn mở để mọi người tiếp tục chia sẻ kinh nghiệm chung.'
    },
    hoursAgo: 22,
    replies: [
      {
        by: 'customer',
        hoursAfter: 1.2,
        content: 'Bạn mất bao lâu thì hết châm chích? Mình cũng đang muốn giảm tần suất retinoid.'
      },
      {
        by: 'admin',
        hoursAfter: 2.1,
        content:
          'Nếu đang đỏ rát nhiều, nên ưu tiên phục hồi và tránh thêm hoạt chất mạnh. Với retinoid hoặc acid, tăng tần suất cần từ từ; nếu kích ứng kéo dài nên gặp bác sĩ da liễu.'
      }
    ]
  },
  {
    roomMatch: ['mother', 'baby', 'me-va-be', 'me', 'be'],
    prefix: 'question',
    title: 'Mẹ bầu uống sắt và canxi cùng ngày thì nên tách thời điểm ra sao?',
    content:
      'Mình đang được kê sắt và canxi nhưng hay quên lịch. Có cách sắp xếp giờ uống dễ nhớ hơn không? Mình sẽ hỏi lại bác sĩ ở lần khám tới, nhưng muốn chuẩn bị câu hỏi trước.',
    tags: ['me-bau', 'sat', 'canxi'],
    answered: true,
    hoursAgo: 18,
    replies: [
      {
        by: 'admin',
        accepted: true,
        hoursAfter: 0.7,
        content:
          'Sắt và canxi thường nên tách thời điểm để tránh ảnh hưởng hấp thu. Bạn có thể đặt nhắc nhở riêng theo hướng dẫn bác sĩ/dược sĩ, ví dụ một loại sau ăn sáng và một loại sau ăn trưa/tối tùy đơn cụ thể. Không tự thêm liều nếu quên uống.'
      },
      {
        by: 'customer2',
        hoursAfter: 2,
        content: 'Mình dán lịch uống lên tủ lạnh, dễ nhớ hơn app vì sáng nào cũng nhìn thấy.'
      }
    ]
  },
  {
    roomMatch: ['mental', 'suc-khoe-tinh-than', 'tinh-than'],
    prefix: 'story',
    title: 'Một tuần thử ghi nhật ký ngủ: hóa ra cà phê sau 15h ảnh hưởng khá rõ',
    content:
      'Mình ghi giờ uống cà phê, giờ tắt màn hình, mức căng thẳng và giờ ngủ trong 7 ngày. Chưa phải kết luận y khoa gì, nhưng mình nhận ra hôm nào uống cà phê muộn thì khó ngủ hơn. Thread này để mọi người chia sẻ cách theo dõi giấc ngủ nhẹ nhàng.',
    tags: ['giac-ngu', 'nhat-ky', 'stress'],
    hoursAgo: 12,
    replies: [
      {
        by: 'admin',
        hoursAfter: 1.4,
        content:
          'Cách theo dõi của bạn rất thực tế. Nếu mất ngủ kéo dài, ảnh hưởng sinh hoạt hoặc kèm lo âu nặng, nên trao đổi với chuyên gia để được hỗ trợ đúng cách.'
      },
      {
        by: 'customer',
        hoursAfter: 3,
        content: 'Mình sẽ thử thêm cột “tập thể dục trong ngày” xem có ảnh hưởng không.'
      }
    ]
  },
  {
    roomMatch: ['nutrition', 'dinh-duong'],
    prefix: 'experience',
    title: 'Công thức bữa sáng nhanh: yến mạch, sữa chua không đường và trái cây ít ngọt',
    content:
      'Mình cần bữa sáng nhanh để đi làm nên chuẩn bị yến mạch qua đêm với sữa chua không đường, thêm hạt và một ít trái cây. Ăn khá no, ít phải mua bánh ngọt ngoài đường. Ai có công thức dễ chuẩn bị khác thì chia sẻ nhé.',
    tags: ['bua-sang', 'dinh-duong', 'meal-prep'],
    hoursAgo: 9,
    replies: [
      {
        by: 'customer2',
        hoursAfter: 1,
        content: 'Mình thay trái cây bằng táo cắt nhỏ và quế, để qua đêm ăn cũng ổn.'
      },
      {
        by: 'admin',
        hoursAfter: 2,
        content:
          'Mọi người lưu ý khẩu phần và nhu cầu cá nhân khác nhau. Nếu có bệnh nền cần kiểm soát đường huyết hoặc mỡ máu, nên theo dõi phản ứng sau ăn.'
      }
    ]
  }
]

async function pickUsers(db: ReturnType<MongoClient['db']>) {
  const users = db.collection<UserDoc>(collectionName('USERS_COLLECTION', 'users'))
  const admin = await users.findOne({ role: 2 })
  const customers = await users.find({ role: 0 }).limit(2).toArray()

  if (!admin?._id || customers.length < 2) {
    throw new Error('Cần ít nhất 1 admin và 2 customer trong users collection để seed forum demo.')
  }

  return { admin, customer: customers[0], customer2: customers[1] }
}

function matchesRoom(room: RoomDoc, keys: string[]) {
  const haystack = [room.slug, room.diseaseKey, room.topicLabel, room.name].filter(Boolean).join(' ').toLowerCase()
  return keys.some((key) => haystack.includes(key.toLowerCase()))
}

async function ensureMemberships(db: ReturnType<MongoClient['db']>, rooms: RoomDoc[], users: Awaited<ReturnType<typeof pickUsers>>) {
  const members = db.collection(collectionName('DB_COMMUNITY_ROOM_MEMBERS_COLLECTION', 'communityRoomMembers'))
  const now = new Date()

  for (const room of rooms) {
    const docs = [
      { roomId: room._id, userId: users.admin._id, role: 'moderator', status: 'active' },
      { roomId: room._id, userId: users.customer._id, role: 'member', status: 'active' },
      { roomId: room._id, userId: users.customer2._id, role: 'member', status: 'active' }
    ]
    for (const doc of docs) {
      await members.updateOne(
        { roomId: doc.roomId, userId: doc.userId },
        {
          $setOnInsert: { roomId: doc.roomId, userId: doc.userId, joinedAt: now },
          $set: { role: doc.role, status: doc.status, mutedUntil: null, lastReadAt: now, updatedAt: now }
        },
        { upsert: true }
      )
    }
  }
}

async function cleanup(db: ReturnType<MongoClient['db']>) {
  const threads = db.collection(collectionName('DB_COMMUNITY_THREADS_COLLECTION', 'communityThreads'))
  const messages = db.collection(collectionName('DB_COMMUNITY_MESSAGES_COLLECTION', 'communityMessages'))
  const moderationFindings = db.collection(collectionName('DB_MODERATION_FINDINGS_COLLECTION', 'moderationFindings'))
  const moderationReports = db.collection(collectionName('DB_MODERATION_REPORTS_COLLECTION', 'moderationReports'))
  const moderationActions = db.collection(collectionName('DB_MODERATION_ACTIONS_COLLECTION', 'moderationActions'))
  const videoEvents = db.collection(collectionName('DB_COMMUNITY_VIDEO_EVENTS_COLLECTION', 'communityVideoEvents'))
  const seededMessages = await messages.find({ seedTag: SEED_TAG }).project({ _id: 1 }).toArray()
  const messageIds = seededMessages.map((message) => message._id)

  if (messageIds.length) {
    await Promise.all([
      moderationFindings.deleteMany({ messageId: { $in: messageIds } }),
      moderationReports.deleteMany({ messageId: { $in: messageIds } }),
      moderationActions.deleteMany({ messageId: { $in: messageIds } })
    ])
  }

  const [threadResult, messageResult] = await Promise.all([
    threads.deleteMany({ seedTag: SEED_TAG }),
    messages.deleteMany({ seedTag: SEED_TAG }),
    videoEvents.deleteMany({ seedTag: SEED_TAG })
  ])
  return { threads: threadResult.deletedCount, messages: messageResult.deletedCount }
}

async function seedForum(db: ReturnType<MongoClient['db']>) {
  const roomsCollection = db.collection<RoomDoc>(collectionName('DB_COMMUNITY_ROOMS_COLLECTION', 'communityRooms'))
  const threadsCollection = db.collection(collectionName('DB_COMMUNITY_THREADS_COLLECTION', 'communityThreads'))
  const messagesCollection = db.collection(collectionName('DB_COMMUNITY_MESSAGES_COLLECTION', 'communityMessages'))
  const videoEventsCollection = db.collection(collectionName('DB_COMMUNITY_VIDEO_EVENTS_COLLECTION', 'communityVideoEvents'))
  const rooms = await roomsCollection.find({ status: 'active' }).toArray()
  if (!rooms.length) throw new Error('Không tìm thấy community room active để seed forum.')

  const users = await pickUsers(db)
  const usedRooms = new Map<string, RoomDoc>()
  const threadDocs: any[] = []
  const messageDocs: any[] = []
  const videoEventDocs: any[] = []

  for (const seed of THREAD_SEEDS) {
    const room = rooms.find((item) => matchesRoom(item, seed.roomMatch)) || rooms[threadDocs.length % rooms.length]
    usedRooms.set(room._id.toString(), room)
    const threadId = new ObjectId()
    const starterMessageId = new ObjectId()
    const videoEventId = seed.videoMeeting ? new ObjectId() : undefined
    const createdAt = dateHoursAgo(seed.hoursAgo)
    let lastReplyAt = createdAt
    let lastReplyId: ObjectId | undefined
    let acceptedReplyId: ObjectId | undefined

    const starterDoc = {
      _id: starterMessageId,
      roomId: room._id,
      threadId,
      senderId: users.customer._id,
      content: seed.content,
      isThreadStarter: true,
      status: 'visible',
      moderated: { autoHidden: false, at: createdAt, severity: 'none', categories: [], confidence: 0, reasons: [] },
      createdAt,
      updatedAt: createdAt,
      seedTag: SEED_TAG
    }
    messageDocs.push(starterDoc)

    for (const replySeed of seed.replies) {
      const replyId = new ObjectId()
      const replyAt = new Date(createdAt.getTime() + replySeed.hoursAfter * 60 * 60 * 1000)
      const sender = replySeed.by === 'admin' ? users.admin : replySeed.by === 'customer2' ? users.customer2 : users.customer
      messageDocs.push({
        _id: replyId,
        roomId: room._id,
        threadId,
        senderId: sender._id,
        content: replySeed.content,
        status: 'visible',
        moderated: { autoHidden: false, at: replyAt, severity: 'none', categories: [], confidence: 0, reasons: [] },
        createdAt: replyAt,
        updatedAt: replyAt,
        seedTag: SEED_TAG
      })
      lastReplyAt = replyAt
      lastReplyId = replyId
      if (replySeed.accepted) acceptedReplyId = replyId
    }

    threadDocs.push({
      _id: threadId,
      roomId: room._id,
      title: seed.title,
      slug: `${slugify(seed.title)}-${threadId.toString().slice(-6)}`,
      prefix: seed.prefix,
      authorId: users.customer._id,
      isAnonymous: false,
      content: seed.content,
      ...(seed.videoMeeting
        ? {
            videoMeeting: {
              eventId: videoEventId,
              url: `/community/video-events/${videoEventId!.toString()}`,
              provider: 'livekit',
              status: seed.videoMeeting.status,
              startsAt: new Date(Date.now() + (seed.videoMeeting.startsInHours || 0) * 60 * 60 * 1000),
              title: seed.videoMeeting.title || seed.title,
              note: seed.videoMeeting.note || 'Phòng thảo luận trực tuyến gắn với thread cộng đồng MediSpace.',
              updatedBy: users.admin._id,
              updatedAt: lastReplyAt
            }
          }
        : {}),
      tags: seed.tags,
      status: seed.answered ? 'answered' : 'open',
      sticky: Boolean(seed.sticky),
      locked: false,
      starterMessageId,
      ...(acceptedReplyId ? { acceptedReplyId } : {}),
      viewCount: 18 + Math.floor(Math.random() * 120),
      replyCount: seed.replies.length,
      lastReplyAt,
      ...(lastReplyId ? { lastReplyId } : {}),
      createdAt,
      updatedAt: lastReplyAt,
      seedTag: SEED_TAG
    })

    if (seed.videoMeeting && videoEventId) {
      const scheduledStartAt = new Date(Date.now() + (seed.videoMeeting.startsInHours || 0) * 60 * 60 * 1000)
      const scheduledEndAt = new Date(scheduledStartAt.getTime() + 60 * 60 * 1000)
      videoEventDocs.push({
        _id: videoEventId,
        roomId: room._id,
        title: seed.videoMeeting.title || seed.title,
        description: seed.videoMeeting.note || 'Phòng LiveKit nội bộ gắn với thread cộng đồng MediSpace.',
        agenda: seed.videoMeeting.note || null,
        visibility: room.visibility || 'public',
        status: seed.videoMeeting.status,
        scheduledStartAt,
        scheduledEndAt,
        startedAt: seed.videoMeeting.status === 'live' ? scheduledStartAt : null,
        endedAt: seed.videoMeeting.status === 'ended' ? scheduledEndAt : null,
        hostIds: [users.admin._id],
        speakerProfiles: [],
        registrationRequired: false,
        capacity: null,
        provider: 'livekit',
        providerMeetingId: null,
        meetingUrl: `/community/video-events/${videoEventId.toString()}`,
        recordingUrl: null,
        recordingStatus: 'none',
        materials: [],
        tags: ['thread-video', threadId.toString()],
        reminders: { fifteenMinutesSentAt: null, oneHourSentAt: null },
        activeRegistrationCount: 0,
        createdBy: users.admin._id,
        createdAt,
        updatedAt: lastReplyAt,
        seedTag: SEED_TAG
      })
    }
  }

  await ensureMemberships(db, Array.from(usedRooms.values()), users)
  await Promise.all([
    threadsCollection.insertMany(threadDocs),
    messagesCollection.insertMany(messageDocs),
    videoEventDocs.length ? videoEventsCollection.insertMany(videoEventDocs) : Promise.resolve()
  ])

  return { threads: threadDocs.length, messages: messageDocs.length, videoEvents: videoEventDocs.length, rooms: usedRooms.size }
}

async function main() {
  const client = new MongoClient(mongoUri())
  await client.connect()
  try {
    const db = client.db(process.env.DB_NAME)
    const cleaned = await cleanup(db)
    const seeded = await seedForum(db)
    console.log('[seed-community-forum-demo] cleaned', cleaned)
    console.log('[seed-community-forum-demo] seeded', seeded)
  } finally {
    await client.close()
  }
}

main().catch((error) => {
  console.error('[seed-community-forum-demo] failed', error)
  process.exit(1)
})
