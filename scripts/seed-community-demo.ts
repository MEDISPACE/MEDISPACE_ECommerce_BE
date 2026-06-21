import { config } from 'dotenv'
config({ quiet: true })

import { createHash } from 'crypto'
import { MongoClient, ObjectId } from 'mongodb'
import Typesense from 'typesense'

const DEMO_SEED_TAG = 'community-beautiful-demo-v1'
const LEGACY_DEMO_SEED_TAGS = ['community-demo-v1', DEMO_SEED_TAG]
const KNOWN_E2E_PRODUCT_IDS = ['6a29a0a4864e6a2592b86630', '6a29a0a5864e6a2592b86631']

type DemoUser = {
  email: string
  password: string
  firstName: string
  lastName: string
  role: number
  phoneNumber: string
}

type RoomSeed = {
  key: string
  name: string
  slug: string
  visibility: 'public' | 'private'
  diseaseKey: string
  topicLabel: string
  iconKey: string
  coverImage: string
  description: string
  guidelines: string[]
  pinnedMessage: string
  featured: boolean
  sortOrder: number
  tags: string[]
}

const DEFAULT_USERS: DemoUser[] = [
  {
    email: process.env.E2E_ADMIN_EMAIL || 'e2e.admin@medispace.local',
    password: process.env.E2E_ADMIN_PASSWORD || 'Admin123!aA',
    firstName: 'MediSpace',
    lastName: 'Admin',
    role: 2,
    phoneNumber: '0900000000'
  },
  {
    email: process.env.E2E_CUSTOMER_EMAIL || 'e2e.customer@medispace.local',
    password: process.env.E2E_CUSTOMER_PASSWORD || 'Customer123!aA',
    firstName: 'Minh',
    lastName: 'An',
    role: 0,
    phoneNumber: '0900000001'
  },
  {
    email: process.env.E2E_CUSTOMER2_EMAIL || 'e2e.customer2@medispace.local',
    password: process.env.E2E_CUSTOMER2_PASSWORD || 'Customer123!aA',
    firstName: 'Thanh',
    lastName: 'Lam',
    role: 0,
    phoneNumber: '0900000002'
  }
]

const ROOM_SEEDS: RoomSeed[] = [
  {
    key: 'diabetes',
    name: 'Cộng đồng Đái tháo đường',
    slug: 'cong-dong-dai-thao-duong',
    visibility: 'public',
    diseaseKey: 'diabetes',
    topicLabel: 'Đái tháo đường',
    iconKey: 'diabetes',
    coverImage: 'https://images.unsplash.com/photo-1505751172876-fa1923c5c528?auto=format&fit=crop&w=1400&q=80',
    description: 'Theo dõi đường huyết, chế độ ăn và kinh nghiệm dùng thuốc an toàn trong sinh hoạt hằng ngày.',
    guidelines: [
      'Không chia sẻ hình ảnh xét nghiệm có thông tin cá nhân.',
      'Ưu tiên mô tả bối cảnh chung: bữa ăn, vận động, thuốc đang dùng.',
      'Không tự ý đổi liều thuốc nếu chưa trao đổi với bác sĩ hoặc dược sĩ.'
    ],
    pinnedMessage:
      'Khi đặt câu hỏi, hãy ghi rõ thời điểm đo đường huyết và bối cảnh bữa ăn để mọi người hỗ trợ chính xác hơn.',
    featured: true,
    sortOrder: 1,
    tags: ['duong huyet', 'dinh duong', 'thuoc']
  },
  {
    key: 'cardiovascular',
    name: 'Chăm sóc tim mạch',
    slug: 'cham-soc-tim-mach',
    visibility: 'public',
    diseaseKey: 'cardiovascular',
    topicLabel: 'Tim mạch',
    iconKey: 'heart-pulse',
    coverImage: 'https://images.unsplash.com/photo-1559757175-0eb30cd8c063?auto=format&fit=crop&w=1400&q=80',
    description: 'Cùng xây dựng thói quen theo dõi huyết áp, vận động và chăm sóc sức khỏe tim mạch tại nhà.',
    guidelines: [
      'Ghi lại chỉ số huyết áp theo ngày thay vì chỉ một lần đo đơn lẻ.',
      'Đi khám ngay nếu có đau ngực, khó thở, vã mồ hôi hoặc triệu chứng nặng.',
      'Trao đổi lịch dùng thuốc với nhân viên y tế trước khi thay đổi.'
    ],
    pinnedMessage:
      'Bạn có thể chia sẻ nhật ký huyết áp theo buổi sáng/tối, nhưng hãy che thông tin cá nhân trước khi đăng ảnh.',
    featured: true,
    sortOrder: 2,
    tags: ['huyet ap', 'cholesterol', 'van dong']
  },
  {
    key: 'mother-baby',
    name: 'Mẹ và bé khỏe mạnh',
    slug: 'me-va-be-khoe-manh',
    visibility: 'public',
    diseaseKey: 'mother_baby',
    topicLabel: 'Mẹ và bé',
    iconKey: 'baby',
    coverImage: 'https://images.unsplash.com/photo-1515488042361-ee00e0ddd4e4?auto=format&fit=crop&w=1400&q=80',
    description: 'Không gian trao đổi về thai kỳ, chăm sóc sau sinh, dinh dưỡng và lịch tiêm chủng cho bé.',
    guidelines: [
      'Không dùng thuốc trong thai kỳ hoặc cho con bú nếu chưa được tư vấn.',
      'Mọi dấu hiệu bất thường của mẹ hoặc bé cần được đánh giá trực tiếp.',
      'Chia sẻ kinh nghiệm theo hướng hỗ trợ, không phán xét.'
    ],
    pinnedMessage:
      'Các câu hỏi về vitamin, sữa, thuốc cho mẹ và bé nên kèm tuổi thai hoặc độ tuổi của bé để dễ tư vấn.',
    featured: true,
    sortOrder: 3,
    tags: ['thai ky', 'sau sinh', 'em be']
  },
  {
    key: 'dermatology',
    name: 'Da liễu và chăm sóc da',
    slug: 'da-lieu-va-cham-soc-da',
    visibility: 'public',
    diseaseKey: 'dermatology',
    topicLabel: 'Da liễu',
    iconKey: 'sparkles',
    coverImage: 'https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?auto=format&fit=crop&w=1400&q=80',
    description: 'Trao đổi về chăm sóc da khoa học, phục hồi hàng rào bảo vệ da và sử dụng treatment an toàn.',
    guidelines: [
      'Không đăng ảnh vùng nhạy cảm hoặc thông tin nhận diện cá nhân.',
      'Nêu rõ sản phẩm đang dùng và thời gian sử dụng khi hỏi về kích ứng.',
      'Ngưng sản phẩm nghi ngờ gây kích ứng nặng và gặp bác sĩ khi cần.'
    ],
    pinnedMessage: 'Routine mẫu nên ghi theo thứ tự sáng/tối để mọi người dễ góp ý và tránh hoạt chất xung đột.',
    featured: false,
    sortOrder: 4,
    tags: ['mun', 'cham soc da', 'treatment']
  },
  {
    key: 'mental-health',
    name: 'Sức khỏe tinh thần',
    slug: 'suc-khoe-tinh-than',
    visibility: 'public',
    diseaseKey: 'mental_health',
    topicLabel: 'Tinh thần',
    iconKey: 'brain',
    coverImage: 'https://images.unsplash.com/photo-1493836512294-502baa1986e2?auto=format&fit=crop&w=1400&q=80',
    description: 'Góc trò chuyện nhẹ nhàng về giấc ngủ, căng thẳng, thói quen hồi phục và tìm kiếm hỗ trợ phù hợp.',
    guidelines: [
      'Tôn trọng cảm xúc và quyền riêng tư của người chia sẻ.',
      'Không đưa ra chẩn đoán; khuyến khích tìm hỗ trợ chuyên môn khi cần.',
      'Nếu có nguy cơ tự hại, hãy liên hệ người thân hoặc dịch vụ khẩn cấp ngay.'
    ],
    pinnedMessage:
      'Bạn có thể chia sẻ mức độ căng thẳng, giấc ngủ và điều đã thử; cộng đồng sẽ hỗ trợ bằng trải nghiệm an toàn.',
    featured: false,
    sortOrder: 5,
    tags: ['giac ngu', 'stress', 'mindfulness']
  },
  {
    key: 'nutrition',
    name: 'Dinh dưỡng và kiểm soát cân nặng',
    slug: 'dinh-duong-va-kiem-soat-can-nang',
    visibility: 'public',
    diseaseKey: 'nutrition',
    topicLabel: 'Dinh dưỡng',
    iconKey: 'apple',
    coverImage: 'https://images.unsplash.com/photo-1490645935967-10de6ba17061?auto=format&fit=crop&w=1400&q=80',
    description: 'Lên kế hoạch bữa ăn, đọc nhãn dinh dưỡng và duy trì cân nặng theo cách bền vững.',
    guidelines: [
      'Không khuyến khích nhịn ăn cực đoan hoặc dùng sản phẩm không rõ nguồn gốc.',
      'Chia sẻ mục tiêu, bệnh nền và mức vận động ở mức tổng quan.',
      'Ưu tiên thay đổi nhỏ, theo dõi được và phù hợp sức khỏe cá nhân.'
    ],
    pinnedMessage: 'Mẫu chia sẻ hữu ích: mục tiêu, lịch sinh hoạt, khẩu phần thường ngày và khó khăn đang gặp.',
    featured: false,
    sortOrder: 6,
    tags: ['bua an', 'can nang', 'doc nhan']
  },
  {
    key: 'private-care',
    name: 'Phòng riêng: Theo dõi điều trị',
    slug: 'phong-rieng-theo-doi-dieu-tri',
    visibility: 'private',
    diseaseKey: 'care_followup',
    topicLabel: 'Theo dõi riêng',
    iconKey: 'shield-check',
    coverImage: 'https://images.unsplash.com/photo-1584515933487-779824d29309?auto=format&fit=crop&w=1400&q=80',
    description: 'Phòng riêng dành cho nhóm cần theo dõi lịch dùng thuốc, triệu chứng và hẹn tư vấn định kỳ.',
    guidelines: [
      'Chỉ thành viên được duyệt mới nhìn thấy nội dung phòng.',
      'Không thay thế hồ sơ bệnh án hoặc tư vấn trực tiếp.',
      'Tóm tắt thay đổi triệu chứng theo ngày để nhân sự phụ trách dễ theo dõi.'
    ],
    pinnedMessage: 'Phòng riêng dùng để ghi chú tiến triển chung; các dấu hiệu cấp cứu cần đi khám ngay.',
    featured: false,
    sortOrder: 7,
    tags: ['private', 'follow-up', 'care-plan']
  }
]

function requireEnv(name: string) {
  const value = process.env[name]
  if (!value) throw new Error(`Missing ${name} in env`)
  return value
}

function hashPassword(password: string) {
  const secret = requireEnv('PASSWORD_SECRET')
  return createHash('sha256')
    .update(password + secret)
    .digest('hex')
}

function collectionName(envName: string, fallback: string) {
  return process.env[envName] || fallback
}

function buildMongoUri() {
  if (process.env.MONGODB_URI) return process.env.MONGODB_URI
  const username = encodeURIComponent(requireEnv('DB_USERNAME'))
  const password = encodeURIComponent(requireEnv('DB_PASSWORD'))
  return `mongodb+srv://${username}:${password}@medispacedb.35qkwso.mongodb.net/?retryWrites=true&w=majority&appName=MediSpaceDB`
}

async function ensureUsers(db: ReturnType<MongoClient['db']>) {
  const users = db.collection(collectionName('USERS_COLLECTION', 'users'))
  const now = new Date()
  const userIds: Record<string, ObjectId> = {}

  for (const user of DEFAULT_USERS) {
    const existing = await users.findOne<{ _id: ObjectId }>({ email: user.email })
    const baseDoc = {
      email: user.email,
      password: hashPassword(user.password),
      role: user.role,
      status: 1,
      firstName: user.firstName,
      lastName: user.lastName,
      phoneNumber: user.phoneNumber,
      dateOfBirth: new Date('1990-01-01'),
      gender: 1,
      avatar: '',
      addresses: [],
      medicalProfile: {},
      lisenseNumber: '',
      isOnline: false,
      onlineCount: 0,
      emailVerifyToken: '',
      forgotPasswordToken: '',
      updatedAt: now,
      wishlist: []
    }

    if (existing?._id) {
      await users.updateOne({ _id: existing._id }, { $set: baseDoc })
      userIds[user.email] = existing._id
    } else {
      const _id = new ObjectId()
      await users.insertOne({ _id, ...baseDoc, createdAt: now, created_by: _id })
      userIds[user.email] = _id
    }
  }

  return {
    adminId: userIds[DEFAULT_USERS[0].email],
    customerId: userIds[DEFAULT_USERS[1].email],
    customer2Id: userIds[DEFAULT_USERS[2].email]
  }
}

async function cleanupProducts(db: ReturnType<MongoClient['db']>) {
  const products = db.collection(collectionName('DB_PRODUCTS_COLLECTION', 'products'))
  const productDetails = db.collection(collectionName('DB_PRODUCT_DETAILS_COLLECTION', 'productDetails'))
  const productMedia = db.collection(collectionName('DB_PRODUCT_MEDIA_COLLECTION', 'productMedia'))
  const reviews = db.collection(collectionName('DB_REVIEWS_COLLECTION', 'reviews'))
  const carts = db.collection(collectionName('DB_CARTS_COLLECTION', 'carts'))
  const users = db.collection(collectionName('USERS_COLLECTION', 'users'))

  const e2eProducts = await products
    .find({ $or: [{ sku: /^E2E/i }, { slug: /^e2e-/i }, { name: /^\[E2E\]/i }] })
    .project({ _id: 1, sku: 1, slug: 1, name: 1 })
    .toArray()
  const productIds = e2eProducts.map((product) => product._id).filter((id): id is ObjectId => id instanceof ObjectId)
  const typesenseResult = await cleanupTypesenseProducts(productIds.map((id) => id.toString()))

  if (productIds.length === 0) {
    return {
      products: 0,
      productDetails: 0,
      productMedia: 0,
      reviews: 0,
      cartsUpdated: 0,
      wishlistsUpdated: 0,
      ...typesenseResult
    }
  }

  const [detailsResult, mediaResult, reviewsResult, cartsResult, usersResult, productsResult] = await Promise.all([
    productDetails.deleteMany({ productId: { $in: productIds } }),
    productMedia.deleteMany({ productId: { $in: productIds } }),
    reviews.deleteMany({ productId: { $in: productIds } }),
    carts.updateMany({ 'items.productId': { $in: productIds } }, {
      $pull: { items: { productId: { $in: productIds } } },
      $set: { updatedAt: new Date() }
    } as any),
    users.updateMany({ wishlist: { $in: productIds } }, {
      $pull: { wishlist: { $in: productIds } },
      $set: { updatedAt: new Date() }
    } as any),
    products.deleteMany({ _id: { $in: productIds } })
  ])

  return {
    products: productsResult.deletedCount,
    productDetails: detailsResult.deletedCount,
    productMedia: mediaResult.deletedCount,
    reviews: reviewsResult.deletedCount,
    cartsUpdated: cartsResult.modifiedCount,
    wishlistsUpdated: usersResult.modifiedCount,
    ...typesenseResult
  }
}

async function cleanupTypesenseProducts(productIds: string[]) {
  const client = new Typesense.Client({
    nodes: [
      {
        host: process.env.TYPESENSE_HOST || 'localhost',
        port: Number(process.env.TYPESENSE_PORT) || 7700,
        protocol: process.env.TYPESENSE_PROTOCOL || 'http'
      }
    ],
    apiKey: process.env.TYPESENSE_API_KEY || 'medispace-ts-secret',
    connectionTimeoutSeconds: 10
  })

  try {
    await client.collections('products').retrieve()
  } catch {
    return { typesenseProductsDeleted: 0, typesenseAvailable: false }
  }

  const ids = new Set([...KNOWN_E2E_PRODUCT_IDS, ...productIds])
  try {
    const searchResult: any = await client.collections('products').documents().search({
      q: 'E2E e2e',
      query_by: 'name,shortDescription,sku,activeIngredients,indications,categoryName,brandName,searchTextNormalized',
      per_page: 100,
      include_fields: 'id,mongoId,name,slug,sku'
    })
    for (const hit of searchResult?.hits || []) {
      const doc = hit.document || {}
      const name = String(doc.name || '')
      const slug = String(doc.slug || '')
      const sku = String(doc.sku || '')
      if (/^e2e-/i.test(slug) || /^E2E/i.test(sku) || /\[E2E\]/i.test(name)) {
        ids.add(String(doc.id || doc.mongoId || ''))
      }
    }
  } catch {
    // Known Mongo IDs still cover the historical E2E product documents.
  }

  let deleted = 0
  for (const id of ids) {
    if (!id) continue
    try {
      await client.collections('products').documents(id).delete()
      deleted += 1
    } catch {
      // Already deleted or absent from this Typesense instance.
    }
  }

  return { typesenseProductsDeleted: deleted, typesenseAvailable: true }
}

async function cleanupCommunity(db: ReturnType<MongoClient['db']>) {
  const communityRooms = db.collection(collectionName('DB_COMMUNITY_ROOMS_COLLECTION', 'communityRooms'))
  const communityRoomMembers = db.collection(
    collectionName('DB_COMMUNITY_ROOM_MEMBERS_COLLECTION', 'communityRoomMembers')
  )
  const communityMessages = db.collection(collectionName('DB_COMMUNITY_MESSAGES_COLLECTION', 'communityMessages'))
  const moderationFindings = db.collection(collectionName('DB_MODERATION_FINDINGS_COLLECTION', 'moderationFindings'))
  const moderationReports = db.collection(collectionName('DB_MODERATION_REPORTS_COLLECTION', 'moderationReports'))
  const moderationActions = db.collection(collectionName('DB_MODERATION_ACTIONS_COLLECTION', 'moderationActions'))
  const moderationAppeals = db.collection(collectionName('DB_MODERATION_APPEALS_COLLECTION', 'moderationAppeals'))
  const moderationAiJobs = db.collection(collectionName('DB_MODERATION_AI_JOBS_COLLECTION', 'moderationAiJobs'))
  const videoEvents = db.collection(collectionName('DB_COMMUNITY_VIDEO_EVENTS_COLLECTION', 'communityVideoEvents'))
  const videoRegistrations = db.collection(
    collectionName('DB_COMMUNITY_VIDEO_EVENT_REGISTRATIONS_COLLECTION', 'communityVideoEventRegistrations')
  )

  const demoSlugs = ROOM_SEEDS.map((room) => room.slug)
  const roomTestPatterns = [
    /^E2E/i,
    /E2E Video Room/i,
    /Rapid meeting/i,
    /^ACL/i,
    /REPORT-FLOW/i,
    /BAN-FLOW/i,
    /MUTE-FLOW/i,
    /Updated Room/i,
    /Debug AI/i,
    /__pwned/i,
    /<script/i,
    /script/i,
    /\b\d{13}\b/
  ]
  const eventTestPatterns = [
    /^E2E/i,
    /E2E Community Video Event/i,
    /Rapid meeting/i,
    /^ACL/i,
    /REPORT-FLOW/i,
    /BAN-FLOW/i,
    /MUTE-FLOW/i,
    /\b\d{13}\b/
  ]
  const messageTestPatterns = [
    /^E2E/i,
    /MUTE-TEST/i,
    /BAN-TEST/i,
    /REPORT-FLOW/i,
    /BAN-FLOW/i,
    /MUTE-FLOW/i,
    /Rapid meeting/i,
    /^ACL/i,
    /__pwned/i,
    /<script/i
  ]

  const roomOr = [
    { seedTag: { $in: LEGACY_DEMO_SEED_TAGS } },
    { slug: { $in: demoSlugs } },
    { diseaseKey: /^(e2e|e2e-ai|community-test)$/i },
    { topicLabel: /^(e2e|e2e ai|community test)$/i },
    ...roomTestPatterns.flatMap((pattern) => [
      { name: pattern },
      { slug: pattern },
      { diseaseKey: pattern },
      { topicLabel: pattern },
      { description: pattern }
    ])
  ]
  const roomsToDelete = await communityRooms.find({ $or: roomOr }).project({ _id: 1 }).toArray()
  const roomIds = roomsToDelete.map((room) => room._id).filter((id): id is ObjectId => id instanceof ObjectId)

  const eventOr = [
    { seedTag: { $in: LEGACY_DEMO_SEED_TAGS } },
    ...(roomIds.length > 0 ? [{ roomId: { $in: roomIds } }] : []),
    ...eventTestPatterns.flatMap((pattern) => [{ title: pattern }, { description: pattern }, { agenda: pattern }])
  ]
  const eventsToDelete = await videoEvents.find({ $or: eventOr }).project({ _id: 1 }).toArray()
  const eventIds = eventsToDelete.map((event) => event._id).filter((id): id is ObjectId => id instanceof ObjectId)

  const messageOr = [
    { seedTag: { $in: LEGACY_DEMO_SEED_TAGS } },
    ...(roomIds.length > 0 ? [{ roomId: { $in: roomIds } }] : []),
    ...messageTestPatterns.map((pattern) => ({ content: pattern }))
  ]
  const messagesToDelete = await communityMessages.find({ $or: messageOr }).project({ _id: 1 }).toArray()
  const messageIds = messagesToDelete
    .map((message) => message._id)
    .filter((id): id is ObjectId => id instanceof ObjectId)

  const [
    registrationsResult,
    eventsResult,
    membersResult,
    reportsResult,
    actionsResult,
    findingsResult,
    appealsResult,
    jobsResult,
    messagesResult,
    roomsResult
  ] = await Promise.all([
    eventIds.length > 0
      ? videoRegistrations.deleteMany({ eventId: { $in: eventIds } })
      : Promise.resolve({ deletedCount: 0 }),
    eventIds.length > 0 ? videoEvents.deleteMany({ _id: { $in: eventIds } }) : Promise.resolve({ deletedCount: 0 }),
    roomIds.length > 0
      ? communityRoomMembers.deleteMany({ roomId: { $in: roomIds } })
      : Promise.resolve({ deletedCount: 0 }),
    messageIds.length > 0
      ? moderationReports.deleteMany({ messageId: { $in: messageIds } })
      : Promise.resolve({ deletedCount: 0 }),
    messageIds.length > 0
      ? moderationActions.deleteMany({ messageId: { $in: messageIds } })
      : Promise.resolve({ deletedCount: 0 }),
    roomIds.length > 0 || messageIds.length > 0
      ? moderationFindings.deleteMany({
          $or: [
            ...(roomIds.length > 0 ? [{ roomId: { $in: roomIds } }] : []),
            ...(messageIds.length > 0 ? [{ messageId: { $in: messageIds } }] : [])
          ]
        })
      : Promise.resolve({ deletedCount: 0 }),
    roomIds.length > 0
      ? moderationAppeals.deleteMany({ roomId: { $in: roomIds } })
      : Promise.resolve({ deletedCount: 0 }),
    messageIds.length > 0
      ? moderationAiJobs.deleteMany({ messageId: { $in: messageIds } })
      : Promise.resolve({ deletedCount: 0 }),
    messageIds.length > 0
      ? communityMessages.deleteMany({ _id: { $in: messageIds } })
      : Promise.resolve({ deletedCount: 0 }),
    roomIds.length > 0 ? communityRooms.deleteMany({ _id: { $in: roomIds } }) : Promise.resolve({ deletedCount: 0 })
  ])

  return {
    rooms: roomsResult.deletedCount,
    members: membersResult.deletedCount,
    messages: messagesResult.deletedCount,
    moderationFindings: findingsResult.deletedCount,
    moderationReports: reportsResult.deletedCount,
    moderationActions: actionsResult.deletedCount,
    moderationAppeals: appealsResult.deletedCount,
    moderationAiJobs: jobsResult.deletedCount,
    videoEvents: eventsResult.deletedCount,
    videoRegistrations: registrationsResult.deletedCount
  }
}

function daysFromNow(days: number, hour: number, minute = 0) {
  const date = new Date()
  date.setDate(date.getDate() + days)
  date.setHours(hour, minute, 0, 0)
  return date
}

async function seedCommunity(
  db: ReturnType<MongoClient['db']>,
  users: { adminId: ObjectId; customerId: ObjectId; customer2Id: ObjectId }
) {
  const communityRooms = db.collection(collectionName('DB_COMMUNITY_ROOMS_COLLECTION', 'communityRooms'))
  const communityRoomMembers = db.collection(
    collectionName('DB_COMMUNITY_ROOM_MEMBERS_COLLECTION', 'communityRoomMembers')
  )
  const communityMessages = db.collection(collectionName('DB_COMMUNITY_MESSAGES_COLLECTION', 'communityMessages'))
  const videoEvents = db.collection(collectionName('DB_COMMUNITY_VIDEO_EVENTS_COLLECTION', 'communityVideoEvents'))
  const videoRegistrations = db.collection(
    collectionName('DB_COMMUNITY_VIDEO_EVENT_REGISTRATIONS_COLLECTION', 'communityVideoEventRegistrations')
  )

  const now = new Date()
  const roomDocs = ROOM_SEEDS.map(({ key: _key, ...room }) => ({
    ...room,
    status: 'active',
    createdBy: users.adminId,
    createdAt: now,
    updatedAt: now,
    seedTag: DEMO_SEED_TAG
  }))
  const roomInsert = await communityRooms.insertMany(roomDocs)
  const roomByKey = new Map<string, ObjectId>()
  ROOM_SEEDS.forEach((room, index) => roomByKey.set(room.key, roomInsert.insertedIds[index]))

  const memberDocs = ROOM_SEEDS.flatMap((room, index) => {
    const roomId = roomByKey.get(room.key) as ObjectId
    const joinedAt = new Date(now.getTime() - (ROOM_SEEDS.length - index) * 36 * 60 * 60 * 1000)
    const members = [
      {
        roomId,
        userId: users.adminId,
        role: 'moderator',
        status: 'active',
        joinedAt,
        lastReadAt: now,
        mutedUntil: null,
        updatedAt: now,
        seedTag: DEMO_SEED_TAG
      },
      {
        roomId,
        userId: users.customerId,
        role: 'member',
        status: 'active',
        joinedAt,
        lastReadAt: new Date(now.getTime() - 30 * 60 * 1000),
        mutedUntil: null,
        updatedAt: now,
        seedTag: DEMO_SEED_TAG
      }
    ]
    if (room.visibility === 'public') {
      members.push({
        roomId,
        userId: users.customer2Id,
        role: 'member',
        status: 'active',
        joinedAt,
        lastReadAt: new Date(now.getTime() - 90 * 60 * 1000),
        mutedUntil: null,
        updatedAt: now,
        seedTag: DEMO_SEED_TAG
      })
    }
    return members
  })

  type MessageSeed = { key?: string; replyToKey?: string; senderId: ObjectId; content: string; hoursAgo: number }
  const messageTemplates: Record<string, MessageSeed[]> = {
    diabetes: [
      {
        senderId: users.customerId,
        content: 'Mọi người thường chuẩn bị bữa sáng thế nào để đường huyết sau ăn ổn định hơn?',
        hoursAgo: 9
      },
      {
        senderId: users.adminId,
        content:
          'Bạn có thể thử ghi lại khẩu phần tinh bột, rau, đạm và chỉ số sau ăn 2 giờ trong vài ngày để nhìn xu hướng.',
        hoursAgo: 8.5
      },
      {
        senderId: users.customer2Id,
        content: 'Mình thấy đi bộ nhẹ 10-15 phút sau bữa tối giúp chỉ số dễ kiểm soát hơn, nhưng vẫn theo dõi đều.',
        hoursAgo: 7.5
      }
    ],
    cardiovascular: [
      {
        senderId: users.customer2Id,
        content: 'Có nên đo huyết áp nhiều lần liên tiếp không? Sáng nay mình đo ba lần hơi lệch nhau.',
        hoursAgo: 12
      },
      {
        senderId: users.adminId,
        content:
          'Nên nghỉ yên 5 phút, ngồi đúng tư thế rồi đo 2 lần cách nhau 1-2 phút. Quan trọng là theo dõi xu hướng nhiều ngày.',
        hoursAgo: 11.5
      },
      {
        senderId: users.customerId,
        content: 'Mình dùng sổ ghi sáng/tối, khi đi khám đưa bác sĩ xem rất tiện.',
        hoursAgo: 10.5
      }
    ],
    'mother-baby': [
      {
        senderId: users.customerId,
        content: 'Vitamin tổng hợp cho mẹ bầu nên uống lúc nào để đỡ buồn nôn?',
        hoursAgo: 18
      },
      {
        senderId: users.adminId,
        content:
          'Nhiều người dễ chịu hơn khi uống sau ăn. Nếu đang dùng thêm sắt/canxi, bạn nên hỏi dược sĩ để sắp xếp thời điểm hợp lý.',
        hoursAgo: 17.2
      },
      { senderId: users.customer2Id, content: 'Mình chia lịch bằng nhắc nhở điện thoại nên ít quên hơn.', hoursAgo: 16 }
    ],
    dermatology: [
      {
        senderId: users.customer2Id,
        content: 'Da mình hơi châm chích khi dùng treatment buổi tối. Có nên giảm tần suất trước không?',
        hoursAgo: 22
      },
      {
        senderId: users.adminId,
        content:
          'Bạn nên mô tả hoạt chất, nồng độ và tần suất đang dùng. Nếu đỏ rát nhiều, hãy ngưng và ưu tiên phục hồi da.',
        hoursAgo: 21.5
      },
      {
        senderId: users.customerId,
        content: 'Routine tối giản với sữa rửa mặt dịu nhẹ, dưỡng ẩm và chống nắng ban ngày thường dễ theo dõi hơn.',
        hoursAgo: 20
      }
    ],
    'mental-health': [
      {
        senderId: users.customerId,
        content:
          'Dạo này mình khó ngủ vì công việc. Có cách nào theo dõi để biết yếu tố nào ảnh hưởng nhiều nhất không?',
        hoursAgo: 28
      },
      {
        senderId: users.adminId,
        content:
          'Bạn có thể ghi giờ ngủ, caffeine, vận động, thời gian dùng màn hình và mức căng thẳng mỗi ngày trong 1-2 tuần.',
        hoursAgo: 27.3
      },
      {
        senderId: users.customer2Id,
        content: 'Mình đặt giờ tắt thông báo buổi tối, sau vài ngày thấy dễ vào giấc hơn.',
        hoursAgo: 26
      }
    ],
    nutrition: [
      {
        senderId: users.customer2Id,
        content: 'Có công thức bữa trưa nào dễ chuẩn bị, đủ no nhưng không quá nhiều năng lượng không?',
        hoursAgo: 34
      },
      {
        senderId: users.adminId,
        content:
          'Một khung dễ bắt đầu là nửa đĩa rau, một phần đạm nạc, một phần tinh bột nguyên hạt và nước không đường.',
        hoursAgo: 33
      },
      {
        senderId: users.customerId,
        content: 'Mình chuẩn bị sẵn rau củ và thịt áp chảo cuối tuần, đi làm chỉ cần ghép hộp.',
        hoursAgo: 31
      }
    ],
    'private-care': [
      {
        key: 'private-update',
        senderId: users.customerId,
        content:
          'Mình đã cập nhật lịch uống thuốc tuần này và ghi chú triệu chứng buổi sáng. Hôm qua hơi mệt sau bữa tối.',
        hoursAgo: 9
      },
      {
        key: 'private-warning',
        replyToKey: 'private-update',
        senderId: users.adminId,
        content:
          'Cảm ơn bạn đã cập nhật. Bạn theo dõi thêm thời điểm mệt, bữa ăn trước đó và mức độ kéo dài bao lâu nhé.',
        hoursAgo: 8.5
      },
      {
        key: 'private-checklist',
        senderId: users.adminId,
        content:
          'Checklist hôm nay: uống thuốc đúng giờ, ghi lại triệu chứng bất thường, đo chỉ số buổi sáng/tối và chuẩn bị câu hỏi cho buổi tư vấn.',
        hoursAgo: 7
      },
      {
        replyToKey: 'private-checklist',
        senderId: users.customerId,
        content: 'Mình đã đo buổi sáng và thêm vào ghi chú. Tối nay mình sẽ cập nhật tiếp trước 21:00.',
        hoursAgo: 5.5
      },
      {
        replyToKey: 'private-warning',
        senderId: users.adminId,
        content:
          'Nếu có chóng mặt, khó thở hoặc đau tăng lên, hãy liên hệ cơ sở y tế ngay thay vì chờ lịch hẹn định kỳ.',
        hoursAgo: 4.5
      },
      {
        senderId: users.customerId,
        content: 'Cho mình hỏi buổi tư vấn riêng ngày mai có cần chuẩn bị danh sách thuốc đang dùng không?',
        hoursAgo: 2.5
      },
      {
        senderId: users.adminId,
        content:
          'Có nhé. Bạn chuẩn bị tên thuốc, hàm lượng, thời điểm uống và sản phẩm bổ sung nếu có để rà soát nhanh hơn.',
        hoursAgo: 2
      }
    ]
  }

  const messageIdsByKey = new Map<string, ObjectId>()
  const messageDocs = Object.entries(messageTemplates).flatMap(([roomKey, messages]) => {
    const roomId = roomByKey.get(roomKey) as ObjectId
    return messages.map((message) => {
      const _id = new ObjectId()
      if (message.key) messageIdsByKey.set(message.key, _id)
      const createdAt = new Date(now.getTime() - message.hoursAgo * 60 * 60 * 1000)
      return {
        _id,
        roomId,
        senderId: message.senderId,
        content: message.content,
        ...(message.replyToKey && messageIdsByKey.has(message.replyToKey)
          ? { replyToMessageId: messageIdsByKey.get(message.replyToKey) }
          : {}),
        status: 'visible',
        moderated: {
          autoHidden: false,
          at: createdAt,
          severity: 'none',
          categories: [],
          confidence: 0,
          reasons: []
        },
        createdAt,
        updatedAt: createdAt,
        seedTag: DEMO_SEED_TAG
      }
    })
  })

  const eventSeeds = [
    {
      roomKey: 'diabetes',
      title: 'Kiểm soát đường huyết sau bữa ăn',
      description: 'Cách đọc chỉ số sau ăn, ghi nhật ký và điều chỉnh thói quen sinh hoạt an toàn.',
      agenda: '19:30 mở phòng, 19:40 chia sẻ từ dược sĩ, 20:10 hỏi đáp, 20:25 tổng kết checklist theo dõi.',
      status: 'scheduled',
      visibility: 'public',
      start: daysFromNow(1, 19, 30),
      end: daysFromNow(1, 20, 30),
      capacity: 80,
      tags: ['duong huyet', 'an uong']
    },
    {
      roomKey: 'cardiovascular',
      title: 'Hỏi đáp chăm sóc tim mạch tại nhà',
      description: 'Thực hành đo huyết áp đúng cách và nhận diện dấu hiệu cần đi khám sớm.',
      agenda: 'Checklist đo huyết áp, nhật ký triệu chứng, phần hỏi đáp cùng chuyên gia.',
      status: 'scheduled',
      visibility: 'public',
      start: daysFromNow(3, 20, 0),
      end: daysFromNow(3, 21, 0),
      capacity: 100,
      tags: ['huyet ap', 'tim mach']
    },
    {
      roomKey: 'dermatology',
      title: 'Chăm sóc da mụn an toàn khi dùng treatment',
      description: 'Xây dựng routine tối giản, giảm kích ứng và phối hợp hoạt chất hợp lý.',
      agenda: 'Routine nền tảng, các lỗi thường gặp, cách theo dõi phản ứng của da.',
      status: 'scheduled',
      visibility: 'public',
      start: daysFromNow(5, 19, 0),
      end: daysFromNow(5, 20, 0),
      capacity: 60,
      tags: ['da lieu', 'mun']
    },
    {
      roomKey: 'mental-health',
      title: 'Livestream: Giấc ngủ và căng thẳng',
      description: 'Phiên trò chuyện mở về vệ sinh giấc ngủ, căng thẳng công việc và cách tìm hỗ trợ phù hợp.',
      agenda: 'Đang diễn ra: chia sẻ thói quen buổi tối, bài tập thở ngắn và hỏi đáp.',
      status: 'live',
      visibility: 'public',
      start: new Date(now.getTime() - 20 * 60 * 1000),
      end: new Date(now.getTime() + 40 * 60 * 1000),
      capacity: 120,
      tags: ['giac ngu', 'stress']
    },
    {
      roomKey: 'private-care',
      title: 'Theo dõi kế hoạch điều trị tuần này',
      description: 'Phiên riêng để rà soát triệu chứng, lịch dùng thuốc và câu hỏi trước buổi tái khám.',
      agenda: 'Cập nhật tiến triển, rà soát cảnh báo, thống nhất việc cần chuẩn bị trước lịch hẹn.',
      status: 'scheduled',
      visibility: 'private',
      start: daysFromNow(2, 18, 30),
      end: daysFromNow(2, 19, 15),
      capacity: 12,
      tags: ['private', 'follow-up']
    }
  ]

  const eventDocs = eventSeeds.map((event) => ({
    roomId: roomByKey.get(event.roomKey) as ObjectId,
    title: event.title,
    description: event.description,
    agenda: event.agenda,
    visibility: event.visibility,
    status: event.status,
    scheduledStartAt: event.start,
    scheduledEndAt: event.end,
    startedAt: event.status === 'live' ? event.start : null,
    endedAt: null,
    hostIds: [users.adminId],
    speakerProfiles: [
      { name: 'DS. MediSpace', title: 'Dược sĩ lâm sàng', avatar: '' },
      { name: 'MediSpace Care Team', title: 'Đội ngũ chăm sóc khách hàng', avatar: '' }
    ],
    registrationRequired: true,
    capacity: event.capacity,
    provider: 'livekit',
    providerMeetingId: null,
    meetingUrl: null,
    recordingUrl: null,
    recordingStatus: 'none',
    materials: [],
    tags: event.tags,
    reminders: { fifteenMinutesSentAt: null, oneHourSentAt: null },
    activeRegistrationCount: event.visibility === 'private' ? 1 : 2,
    createdBy: users.adminId,
    createdAt: now,
    updatedAt: now,
    seedTag: DEMO_SEED_TAG
  }))

  const eventInsert = await videoEvents.insertMany(eventDocs)
  const registrationDocs = Object.values(eventInsert.insertedIds).flatMap((eventId: ObjectId, index) => {
    const event = eventDocs[index]
    const baseRegistration = {
      eventId,
      roomId: event.roomId,
      role: 'attendee',
      status: 'registered',
      registeredAt: now,
      cancelledAt: null,
      updatedAt: now,
      seedTag: DEMO_SEED_TAG
    }
    const registrations = [{ ...baseRegistration, userId: users.customerId }]
    if (event.visibility === 'public') registrations.push({ ...baseRegistration, userId: users.customer2Id })
    return registrations
  })

  await Promise.all([
    communityRoomMembers.insertMany(memberDocs),
    communityMessages.insertMany(messageDocs),
    videoRegistrations.insertMany(registrationDocs)
  ])

  await Promise.all(
    Object.entries(eventInsert.insertedIds).map(([index, eventId]) =>
      videoEvents.updateOne(
        { _id: eventId },
        {
          $set: { meetingUrl: `/community/video-events/${eventId.toString()}`, roomId: eventDocs[Number(index)].roomId }
        }
      )
    )
  )

  return {
    rooms: roomDocs.length,
    members: memberDocs.length,
    messages: messageDocs.length,
    videoEvents: eventDocs.length,
    videoRegistrations: registrationDocs.length
  }
}

async function verifyCommunity(db: ReturnType<MongoClient['db']>) {
  const communityRooms = db.collection(collectionName('DB_COMMUNITY_ROOMS_COLLECTION', 'communityRooms'))
  const communityMessages = db.collection(collectionName('DB_COMMUNITY_MESSAGES_COLLECTION', 'communityMessages'))
  const videoEvents = db.collection(collectionName('DB_COMMUNITY_VIDEO_EVENTS_COLLECTION', 'communityVideoEvents'))
  const dirtyRoomCount = await communityRooms.countDocuments({
    $or: [
      { name: /^E2E/i },
      { name: /E2E Video Room/i },
      { name: /Rapid meeting/i },
      { name: /REPORT-FLOW|BAN-FLOW|MUTE-FLOW|Updated Room|Debug AI/i },
      { name: /\b\d{13}\b/ },
      { slug: /^e2e/i },
      { slug: /report-flow|ban-flow|mute-flow|updated-room|debug-ai/i },
      { diseaseKey: /^(e2e|e2e-ai|community-test)$/i },
      { topicLabel: /^(e2e|e2e ai|community test)$/i }
    ]
  })
  const dirtyMessageCount = await communityMessages.countDocuments({
    $or: [
      { content: /^E2E/i },
      { content: /Rapid meeting/i },
      { content: /REPORT-FLOW|BAN-FLOW|MUTE-FLOW/i },
      { content: /__pwned/i },
      { content: /<script/i }
    ]
  })
  const dirtyEventCount = await videoEvents.countDocuments({
    $or: [
      { title: /^E2E/i },
      { title: /E2E Community Video Event/i },
      { title: /Rapid meeting/i },
      { title: /REPORT-FLOW|BAN-FLOW|MUTE-FLOW/i },
      { title: /\b\d{13}\b/ }
    ]
  })
  const demoRoomCount = await communityRooms.countDocuments({ seedTag: DEMO_SEED_TAG })
  const demoEventCount = await videoEvents.countDocuments({ seedTag: DEMO_SEED_TAG })
  return { dirtyRoomCount, dirtyMessageCount, dirtyEventCount, demoRoomCount, demoEventCount }
}

async function main() {
  const dbName = requireEnv('DB_NAME')
  const client = new MongoClient(buildMongoUri())
  await client.connect()

  try {
    const db = client.db(dbName)
    const users = await ensureUsers(db)
    const deletedProducts = await cleanupProducts(db)
    const deletedCommunity = await cleanupCommunity(db)
    const insertedCommunity = await seedCommunity(db, users)
    const verification = await verifyCommunity(db)

    console.log('[seed-community-demo] done')
    console.log(JSON.stringify({ deletedProducts, deletedCommunity, insertedCommunity, verification }, null, 2))
  } finally {
    await client.close()
  }
}

main().catch((error) => {
  console.error('[seed-community-demo] failed', error)
  process.exit(1)
})
