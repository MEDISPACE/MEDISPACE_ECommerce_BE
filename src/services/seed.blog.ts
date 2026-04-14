import { ObjectId } from 'mongodb'
import databaseService from './database.services'
import HealthCategory from '~/models/schemas/HealthCategory.schema'
import Article from '~/models/schemas/Article.schema'

// Health Categories Data
export const healthCategoriesData = [
  {
    name: 'Tim mạch',
    slug: 'tim-mach',
    description: 'Bệnh tim, huyết áp, mạch máu',
    icon: 'Heart',
    color: 'text-red-500 bg-red-50',
    order: 1,
    isActive: true,
    articleCount: 0
  },
  {
    name: 'Thần kinh',
    slug: 'than-kinh',
    description: 'Đau đầu, mất ngủ, căng thẳng',
    icon: 'Brain',
    color: 'text-purple-500 bg-purple-50',
    order: 2,
    isActive: true,
    articleCount: 0
  },
  {
    name: 'Hô hấp',
    slug: 'ho-hap',
    description: 'Cảm cúm, ho, hen suyễn',
    icon: 'Stethoscope',
    color: 'text-blue-500 bg-blue-50',
    order: 3,
    isActive: true,
    articleCount: 0
  },
  {
    name: 'Mắt',
    slug: 'mat',
    description: 'Cận thị, khô mắt, đau mắt',
    icon: 'Eye',
    color: 'text-green-500 bg-green-50',
    order: 4,
    isActive: true,
    articleCount: 0
  },
  {
    name: 'Xương khớp',
    slug: 'xuong-khop',
    description: 'Viêm khớp, đau lưng, gout',
    icon: 'Bone',
    color: 'text-orange-500 bg-orange-50',
    order: 5,
    isActive: true,
    articleCount: 0
  }
]

// Sample Articles Data (will use actual category IDs after seeding)
export const articlesDataTemplate = [
  {
    categorySlug: 'tim-mach',
    title: '10 dấu hiệu cảnh báo bệnh tim bạn không nên bỏ qua',
    slug: '10-dau-hieu-canh-bao-benh-tim',
    excerpt: 'Nhận biết sớm các triệu chứng bệnh tim để có biện pháp điều trị kịp thời và hiệu quả nhất.',
    content: `
      <h2>Giới thiệu</h2>
      <p>Bệnh tim mạch là một trong những nguyên nhân gây tử vong hàng đầu trên thế giới. Việc nhận biết sớm các dấu hiệu cảnh báo có thể giúp bạn có biện pháp điều trị kịp thời.</p>
      
      <h2>10 dấu hiệu cần chú ý</h2>
      <ol>
        <li><strong>Đau ngực:</strong> Cảm giác đau, tức, nặng ở ngực là dấu hiệu phổ biến nhất.</li>
        <li><strong>Khó thở:</strong> Thở gấp, khó thở khi vận động hoặc nằm.</li>
        <li><strong>Mệt mỏi bất thường:</strong> Cảm thấy kiệt sức ngay cả khi nghỉ ngơi.</li>
        <li><strong>Đau lan ra tay trái:</strong> Đau từ ngực lan ra vai, tay trái.</li>
        <li><strong>Chóng mặt, xây xẩm:</strong> Mất thăng bằng, choáng váng.</li>
        <li><strong>Nhịp tim bất thường:</strong> Tim đập nhanh hoặc không đều.</li>
        <li><strong>Đổ mồ hôi lạnh:</strong> Đổ mồ hôi nhiều đột ngột.</li>
        <li><strong>Buồn nôn:</strong> Cảm giác khó chịu ở dạ dày.</li>
        <li><strong>Sưng bàn chân, cổ chân:</strong> Do tim không bơm máu hiệu quả.</li>
        <li><strong>Ho dai dẳng:</strong> Ho kéo dài, có đờm hồng.</li>
      </ol>
      
      <h2>Khi nào cần đến bác sĩ?</h2>
      <p>Nếu bạn gặp bất kỳ dấu hiệu nào trên, đặc biệt là đau ngực kéo dài trên 5 phút, hãy đến bệnh viện ngay lập tức.</p>
      
      <h2>Phòng ngừa bệnh tim</h2>
      <ul>
        <li>Ăn uống lành mạnh</li>
        <li>Tập thể dục đều đặn</li>
        <li>Kiểm soát cân nặng</li>
        <li>Không hút thuốc</li>
        <li>Kiểm tra sức khỏe định kỳ</li>
      </ul>
    `,
    featuredImage: '/images/heart-health.jpg',
    tags: ['tim-mach', 'sức-khỏe', 'phòng-bệnh'],
    isFeatured: true,
    isPinned: false
  },
  {
    categorySlug: 'ho-hap',
    title: 'Cách phòng ngừa cảm cúm mùa đông hiệu quả',
    slug: 'cach-phong-ngua-cam-cum-mua-dong',
    excerpt: 'Hướng dẫn chi tiết các biện pháp phòng ngừa cảm cúm trong mùa lạnh để bảo vệ sức khỏe gia đình.',
    content: `
      <h2>Tại sao cúm hay xuất hiện vào mùa đông?</h2>
      <p>Vi rút cúm phát triển mạnh trong điều kiện lạnh và khô. Ngoài ra, mùa đông người ta thường ở trong nhà đông người, tăng nguy cơ lây lan.</p>
      
      <h2>Các biện pháp phòng ngừa hiệu quả</h2>
      
      <h3>1. Tiêm phòng vắc xin</h3>
      <p>Tiêm vắc xin cúm hàng năm là cách tốt nhất để phòng bệnh, đặc biệt với người cao tuổi và trẻ em.</p>
      
      <h3>2. Giữ ấm cơ thể</h3>
      <ul>
        <li>Mặc đủ ấm khi ra ngoài</li>
        <li>Đội mũ, quàng khăn</li>
        <li>Tránh thay đổi nhiệt độ đột ngột</li>
      </ul>
      
      <h3>3. Vệ sinh cá nhân</h3>
      <ul>
        <li>Rửa tay thường xuyên bằng xà phòng</li>
        <li>Không chạm tay vào mắt, mũi, miệng</li>
        <li>Đeo khẩu trang nơi đông người</li>
      </ul>
      
      <h3>4. Tăng cường sức đề kháng</h3>
      <ul>
        <li>Ăn nhiều rau xanh, trái cây</li>
        <li>Bổ sung vitamin C</li>
        <li>Ngủ đủ giấc</li>
        <li>Tập thể dục đều đặn</li>
      </ul>
      
      <h2>Dấu hiệu cần đi khám</h2>
      <p>Nếu sốt cao trên 39°C, khó thở, đau ngực, hãy đến bệnh viện ngay.</p>
    `,
    featuredImage: '/images/flu-prevention.jpg',
    tags: ['cảm-cúm', 'phòng-bệnh', 'mùa-đông'],
    isFeatured: false,
    isPinned: false
  },
  {
    categorySlug: 'xuong-khop',
    title: 'Tập thể dục đúng cách để giảm đau lưng',
    slug: 'tap-the-duc-dung-cach-de-giam-dau-lung',
    excerpt: 'Những bài tập đơn giản giúp giảm đau lưng và tăng cường sức khỏe cột sống hiệu quả.',
    content: `
      <h2>Nguyên nhân đau lưng</h2>
      <p>Đau lưng có thể do nhiều nguyên nhân: tư thế ngồi sai, ít vận động, căng thẳng, hoặc thoái hóa cột sống.</p>
      
      <h2>Các bài tập giảm đau lưng</h2>
      
      <h3>1. Bài tập kéo giãn mèo-bò</h3>
      <p><strong>Cách thực hiện:</strong></p>
      <ol>
        <li>Quỳ bốn chân, tay thẳng góc với vai</li>
        <li>Hít vào, võng lưng xuống (tư thế bò)</li>
        <li>Thở ra, gù lưng lên (tư thế mèo)</li>
        <li>Lặp lại 10-15 lần</li>
      </ol>
      
      <h3>2. Bài tập cầu nối</h3>
      <p><strong>Cách thực hiện:</strong></p>
      <ol>
        <li>Nằm ngửa, gập đầu gối</li>
        <li>Nâng hông lên cao, giữ 5 giây</li>
        <li>Hạ xuống từ từ</li>
        <li>Lặp lại 10-12 lần</li>
      </ol>
      
      <h3>3. Bài tập xoay lưng</h3>
      <p><strong>Cách thực hiện:</strong></p>
      <ol>
        <li>Nằm ngửa, hai tay dang ra</li>
        <li>Gập một đầu gối, xoay sang bên</li>
        <li>Giữ 20-30 giây</li>
        <li>Đổi bên, lặp lại 3-5 lần</li>
      </ol>
      
      <h2>Lưu ý khi tập</h2>
      <ul>
        <li>Tập từ từ, không gượng ép</li>
        <li>Thở đều trong khi tập</li>
        <li>Dừng nếu đau tăng</li>
        <li>Tập đều đặn mỗi ngày</li>
      </ul>
      
      <h2>Khi nào cần gặp bác sĩ?</h2>
      <p>Nếu đau lưng kéo dài trên 2 tuần, tê chân, hoặc đau lan xuống chân, hãy đi khám.</p>
    `,
    featuredImage: '/images/back-pain-exercise.jpg',
    tags: ['đau-lưng', 'tập-luyện', 'xương-khớp'],
    isFeatured: true,
    isPinned: false
  }
]

export async function seedHealthCategories() {
  console.log('🌱 Seeding health categories...')

  // Check if categories already exist
  const existingCount = await databaseService.healthCategories.countDocuments()
  if (existingCount > 0) {
    console.log(`⚠️  Already have ${existingCount} health categories, skipping...`)
    return
  }

  const categories = healthCategoriesData.map((cat) => new HealthCategory(cat))
  await databaseService.healthCategories.insertMany(categories)

  console.log(`✅ Seeded ${categories.length} health categories`)
}

export async function seedArticles() {
  console.log('🌱 Seeding articles...')

  // Check if articles already exist
  const existingCount = await databaseService.articles.countDocuments()
  if (existingCount > 0) {
    console.log(`⚠️  Already have ${existingCount} articles, skipping...`)
    return
  }

  // Get admin user for author
  const adminUser = await databaseService.users.findOne({ role: 2 }) // Admin role
  if (!adminUser) {
    console.log('⚠️  No admin user found, skipping articles seed')
    return
  }

  const authorId = adminUser._id!
  const authorName = `${adminUser.firstName} ${adminUser.lastName}`.trim()
  const authorTitle = 'Biên tập viên'

  // Get categories
  const categories = await databaseService.healthCategories.find().toArray()
  const categoryMap = new Map(categories.map((cat) => [cat.slug, cat]))

  const articles = articlesDataTemplate
    .map((articleData) => {
      const category = categoryMap.get(articleData.categorySlug)
      if (!category) {
        console.log(`⚠️  Category ${articleData.categorySlug} not found`)
        return null
      }

      return new Article({
        title: articleData.title,
        slug: articleData.slug,
        excerpt: articleData.excerpt,
        content: articleData.content,
        featuredImage: articleData.featuredImage,
        categoryId: category._id!,
        tags: articleData.tags,
        authorId,
        authorName,
        authorTitle,
        viewCount: Math.floor(Math.random() * 1000), // Random views for demo
        status: 'published',
        isPublished: true,
        isFeatured: articleData.isFeatured,
        isPinned: articleData.isPinned,
        publishedAt: new Date()
      })
    })
    .filter(Boolean) as Article[]

  if (articles.length > 0) {
    await databaseService.articles.insertMany(articles)

    // Update category article counts
    for (const article of articles) {
      await databaseService.healthCategories.updateOne({ _id: article.categoryId }, { $inc: { articleCount: 1 } })
    }

    console.log(`✅ Seeded ${articles.length} articles`)
  }
}

export async function seedBlogData() {
  await seedHealthCategories()
  await seedArticles()
  console.log('✅ Blog data seeding completed!')
}
