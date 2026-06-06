import { ObjectId } from 'mongodb'
import databaseService from './database.services'
import HealthCategory from '~/models/schemas/HealthCategory.schema'
import Article, { ArticleReference } from '~/models/schemas/Article.schema'

type BlogArticleSeed = {
  categorySlug: string
  title: string
  slug: string
  excerpt: string
  content: string
  featuredImage: string
  images?: string[]
  tags: string[]
  metaTitle: string
  metaDescription: string
  metaKeywords: string[]
  references: ArticleReference[]
  reviewedBy: string
  reviewedByTitle: string
  isFeatured: boolean
  isPinned: boolean
  productSearchTerms: string[]
  viewCount: number
}

const img = (id: string, w = 1400, h = 820) =>
  `https://images.unsplash.com/${id}?w=${w}&h=${h}&fit=crop&crop=center&q=82`

export const healthCategoriesData = [
  {
    name: 'Tim mạch',
    slug: 'tim-mach',
    description: 'Huyết áp, cholesterol, bệnh tim và phòng ngừa nguy cơ tim mạch',
    icon: 'Heart',
    color: 'text-red-500 bg-red-50',
    order: 1,
    isActive: true,
    articleCount: 0
  },
  {
    name: 'Hô hấp',
    slug: 'ho-hap',
    description: 'Cảm cúm, ho, viêm mũi dị ứng và chăm sóc đường thở',
    icon: 'Stethoscope',
    color: 'text-blue-500 bg-blue-50',
    order: 2,
    isActive: true,
    articleCount: 0
  },
  {
    name: 'Tiêu hóa',
    slug: 'tieu-hoa',
    description: 'Đầy hơi, tiêu chảy, táo bón, men vi sinh và bù nước',
    icon: 'Stethoscope',
    color: 'text-emerald-600 bg-emerald-50',
    order: 3,
    isActive: true,
    articleCount: 0
  },
  {
    name: 'Xương khớp',
    slug: 'xuong-khop',
    description: 'Đau lưng, gout, thoái hóa khớp và vận động an toàn',
    icon: 'Bone',
    color: 'text-orange-500 bg-orange-50',
    order: 4,
    isActive: true,
    articleCount: 0
  },
  {
    name: 'Da liễu',
    slug: 'da-lieu',
    description: 'Mụn, dị ứng da, chống nắng và chăm sóc hàng rào bảo vệ da',
    icon: 'Stethoscope',
    color: 'text-pink-500 bg-pink-50',
    order: 5,
    isActive: true,
    articleCount: 0
  },
  {
    name: 'Mắt',
    slug: 'mat',
    description: 'Khô mắt, mỏi mắt, kính áp tròng và vệ sinh mắt',
    icon: 'Eye',
    color: 'text-green-500 bg-green-50',
    order: 6,
    isActive: true,
    articleCount: 0
  },
  {
    name: 'Dinh dưỡng',
    slug: 'dinh-duong',
    description: 'Vitamin, khoáng chất, ăn uống lành mạnh và bổ sung đúng cách',
    icon: 'Heart',
    color: 'text-cyan-600 bg-cyan-50',
    order: 7,
    isActive: true,
    articleCount: 0
  },
  {
    name: 'Dùng thuốc an toàn',
    slug: 'dung-thuoc-an-toan',
    description: 'Kháng sinh, thuốc kê đơn, tương tác thuốc và đọc nhãn thuốc',
    icon: 'Stethoscope',
    color: 'text-indigo-600 bg-indigo-50',
    order: 8,
    isActive: true,
    articleCount: 0
  }
]

export const articlesDataTemplate: BlogArticleSeed[] = [
  {
    categorySlug: 'tim-mach',
    title: '10 dấu hiệu cảnh báo bệnh tim bạn không nên bỏ qua',
    slug: '10-dau-hieu-canh-bao-benh-tim',
    excerpt:
      'Nhận biết sớm đau ngực, khó thở, hồi hộp và các dấu hiệu nguy cơ để đi khám kịp thời, đặc biệt ở người có bệnh nền.',
    featuredImage: img('photo-1559757148-5c350d0d3c56'),
    images: [img('photo-1576091160550-2173dba999ef', 900, 520), img('photo-1584308666744-24d5c474f2ae', 900, 520)],
    tags: ['tim-mach', 'đau-ngực', 'khó-thở', 'huyết-áp', 'cấp-cứu'],
    metaTitle: '10 dấu hiệu cảnh báo bệnh tim cần đi khám sớm',
    metaDescription:
      'Tìm hiểu dấu hiệu cảnh báo bệnh tim, khi nào cần đi cấp cứu và các bước phòng ngừa nguy cơ tim mạch.',
    metaKeywords: ['bệnh tim', 'đau ngực', 'khó thở', 'huyết áp', 'tim mạch'],
    references: [
      {
        title: 'WHO - Cardiovascular diseases fact sheet',
        url: 'https://www.who.int/news-room/fact-sheets/detail/cardiovascular-diseases-(cvds)'
      },
      { title: 'CDC - High Blood Pressure', url: 'https://www.cdc.gov/high-blood-pressure/' }
    ],
    reviewedBy: 'DS. Nguyễn Minh Anh',
    reviewedByTitle: 'Dược sĩ lâm sàng',
    isFeatured: true,
    isPinned: true,
    productSearchTerms: ['huyết áp', 'tim mạch', 'omega', 'máy đo huyết áp'],
    viewCount: 1248,
    content: `
      <h2>Vì sao cần nhận biết sớm?</h2>
      <p>Bệnh tim mạch thường tiến triển âm thầm. Một số dấu hiệu như đau ngực, khó thở hoặc hồi hộp có thể xuất hiện thoáng qua nhưng vẫn cần được chú ý, nhất là ở người có tăng huyết áp, đái tháo đường, rối loạn mỡ máu hoặc tiền sử gia đình.</p>
      <h2>Dấu hiệu cần đi khám sớm</h2>
      <ol>
        <li><strong>Đau tức ngực:</strong> cảm giác bị đè nặng, bóp nghẹt hoặc nóng rát ở vùng ngực.</li>
        <li><strong>Khó thở:</strong> xảy ra khi gắng sức, khi nằm hoặc đi kèm mệt bất thường.</li>
        <li><strong>Đau lan:</strong> đau lan lên vai, cổ, hàm, lưng hoặc tay trái.</li>
        <li><strong>Hồi hộp, nhịp tim không đều:</strong> tim đập nhanh, bỏ nhịp hoặc kèm chóng mặt.</li>
        <li><strong>Phù chân:</strong> sưng bàn chân, cổ chân, tăng về chiều.</li>
      </ol>
      <h2>Khi nào cần xử trí khẩn cấp?</h2>
      <p>Nếu đau ngực kéo dài, khó thở nặng, vã mồ hôi lạnh, ngất, yếu liệt một bên người hoặc nói khó, hãy gọi cấp cứu hoặc đến cơ sở y tế ngay. Không tự mua thuốc để trì hoãn thăm khám.</p>
      <h2>Phòng ngừa nguy cơ tim mạch</h2>
      <ul>
        <li>Đo huyết áp định kỳ và ghi lại kết quả.</li>
        <li>Giảm muối, hạn chế chất béo bão hòa và tăng rau quả.</li>
        <li>Duy trì vận động phù hợp ít nhất 150 phút mỗi tuần nếu bác sĩ cho phép.</li>
        <li>Không hút thuốc, hạn chế rượu bia và ngủ đủ.</li>
      </ul>
    `
  },
  {
    categorySlug: 'tim-mach',
    title: 'Đo huyết áp tại nhà: cách đọc chỉ số và sai lầm thường gặp',
    slug: 'do-huyet-ap-tai-nha-cach-doc-chi-so',
    excerpt:
      'Hướng dẫn chuẩn bị, tư thế đo, cách ghi nhật ký huyết áp và thời điểm nên hỏi dược sĩ hoặc bác sĩ.',
    featuredImage: img('photo-1612277795421-9bc7706a4a34'),
    images: [img('photo-1588776814546-1ffcf47267a5', 900, 520)],
    tags: ['huyết-áp', 'máy-đo-huyết-áp', 'tim-mach', 'theo-dõi-tại-nhà'],
    metaTitle: 'Cách đo huyết áp tại nhà đúng và đọc chỉ số',
    metaDescription: 'Hướng dẫn đo huyết áp tại nhà, tránh lỗi phổ biến và biết khi nào cần tư vấn y tế.',
    metaKeywords: ['đo huyết áp', 'máy đo huyết áp', 'tăng huyết áp', 'nhật ký huyết áp'],
    references: [
      { title: 'CDC - Preventing High Blood Pressure', url: 'https://www.cdc.gov/high-blood-pressure/prevention/' },
      { title: 'CDC - High Blood Pressure Risk Factors', url: 'https://www.cdc.gov/high-blood-pressure/risk-factors/' }
    ],
    reviewedBy: 'DS. Nguyễn Minh Anh',
    reviewedByTitle: 'Dược sĩ lâm sàng',
    isFeatured: false,
    isPinned: false,
    productSearchTerms: ['máy đo huyết áp', 'huyết áp', 'tim mạch'],
    viewCount: 912,
    content: `
      <h2>Chuẩn bị trước khi đo</h2>
      <p>Nghỉ yên ít nhất 5 phút, tránh cà phê, thuốc lá, vận động mạnh trước khi đo. Ngồi thẳng lưng, chân đặt trên sàn, vòng bít ngang tim và không nói chuyện trong lúc đo.</p>
      <h2>Cách ghi nhật ký huyết áp</h2>
      <p>Ghi ngày giờ, chỉ số tâm thu/tâm trương, nhịp tim và hoàn cảnh đo. Đo lặp lại sau 1-2 phút nếu kết quả bất thường, sau đó lấy trung bình theo hướng dẫn của nhân viên y tế.</p>
      <h2>Sai lầm thường gặp</h2>
      <ul>
        <li>Dùng vòng bít không đúng kích cỡ.</li>
        <li>Đo ngay sau khi leo cầu thang, uống cà phê hoặc lo lắng.</li>
        <li>Chỉ đo khi thấy mệt nên dữ liệu không đại diện.</li>
      </ul>
      <h2>Khi nào cần hỏi dược sĩ?</h2>
      <p>Nếu chỉ số thường xuyên cao, có chóng mặt, đau ngực, khó thở hoặc đang dùng nhiều thuốc cùng lúc, hãy hỏi dược sĩ/bác sĩ để được đánh giá an toàn.</p>
    `
  },
  {
    categorySlug: 'ho-hap',
    title: 'Cảm cúm mùa lạnh: chăm sóc tại nhà và dấu hiệu cần đi khám',
    slug: 'cam-cum-mua-lanh-cham-soc-tai-nha',
    excerpt:
      'Phân biệt triệu chứng thường gặp, cách nghỉ ngơi, bù nước, vệ sinh hô hấp và các dấu hiệu cảnh báo biến chứng.',
    featuredImage: img('photo-1589578527966-fdac0f44566c'),
    images: [img('photo-1589739900243-4b52cd9b104e', 900, 520)],
    tags: ['cảm-cúm', 'ho', 'sốt', 'hô-hấp', 'phòng-bệnh'],
    metaTitle: 'Cảm cúm mùa lạnh: chăm sóc tại nhà và khi nào đi khám',
    metaDescription:
      'Cách chăm sóc cảm cúm tại nhà, phòng lây nhiễm và nhận biết dấu hiệu cảnh báo cần đi khám.',
    metaKeywords: ['cảm cúm', 'sốt', 'ho', 'viêm đường hô hấp', 'phòng cúm'],
    references: [
      { title: 'CDC - Signs and Symptoms of Flu', url: 'https://www.cdc.gov/flu/signs-symptoms/index.html' },
      { title: 'CDC - Flu: What To Do If You Get Sick', url: 'https://www.cdc.gov/flu/takingcare/' }
    ],
    reviewedBy: 'DS. Trần Hoàng Nam',
    reviewedByTitle: 'Dược sĩ tư vấn thuốc OTC',
    isFeatured: true,
    isPinned: false,
    productSearchTerms: ['cảm cúm', 'vitamin c', 'nước muối', 'khẩu trang', 'hạ sốt'],
    viewCount: 1576,
    content: `
      <h2>Triệu chứng cảm cúm thường gặp</h2>
      <p>Cúm thường gây sốt, ớn lạnh, đau nhức, mệt mỏi, ho, đau họng, nghẹt mũi hoặc chảy mũi. Một số người có thể buồn nôn hoặc tiêu chảy, thường gặp hơn ở trẻ em.</p>
      <h2>Chăm sóc tại nhà</h2>
      <ul>
        <li>Nghỉ ngơi, uống đủ nước và ăn thức ăn dễ tiêu.</li>
        <li>Đeo khẩu trang, che miệng khi ho và rửa tay thường xuyên.</li>
        <li>Dùng thuốc hạ sốt/giảm đau đúng hướng dẫn trên nhãn hoặc theo tư vấn dược sĩ.</li>
        <li>Không tự ý dùng kháng sinh vì cúm là bệnh do virus.</li>
      </ul>
      <h2>Dấu hiệu cần đi khám ngay</h2>
      <p>Khó thở, đau ngực, lơ mơ, mất nước, sốt cao kéo dài, triệu chứng giảm rồi nặng trở lại hoặc người bệnh thuộc nhóm nguy cơ cao cần liên hệ cơ sở y tế.</p>
    `
  },
  {
    categorySlug: 'ho-hap',
    title: 'Viêm mũi dị ứng: cách giảm nghẹt mũi mà không lạm dụng thuốc xịt',
    slug: 'viem-mui-di-ung-giam-nghet-mui-khong-lam-dung-thuoc-xit',
    excerpt:
      'Nhận biết viêm mũi dị ứng, vệ sinh mũi đúng cách và lưu ý khi dùng thuốc kháng histamine hoặc thuốc xịt mũi.',
    featuredImage: img('photo-1504813184591-01572f98c85f'),
    images: [img('photo-1603398938378-e54eab446dde', 900, 520)],
    tags: ['viêm-mũi-dị-ứng', 'nghẹt-mũi', 'nước-muối-sinh-lý', 'kháng-histamine'],
    metaTitle: 'Viêm mũi dị ứng: giảm nghẹt mũi an toàn',
    metaDescription: 'Cách kiểm soát viêm mũi dị ứng, tránh lạm dụng thuốc xịt mũi và khi nào cần tư vấn.',
    metaKeywords: ['viêm mũi dị ứng', 'nghẹt mũi', 'nước muối sinh lý', 'thuốc xịt mũi'],
    references: [
      { title: 'Mayo Clinic - Hay fever', url: 'https://www.mayoclinic.org/diseases-conditions/hay-fever/' },
      { title: 'MedlinePlus - Allergic rhinitis', url: 'https://medlineplus.gov/ency/article/000813.htm' }
    ],
    reviewedBy: 'DS. Trần Hoàng Nam',
    reviewedByTitle: 'Dược sĩ tư vấn thuốc OTC',
    isFeatured: false,
    isPinned: false,
    productSearchTerms: ['nước muối', 'khẩu trang', 'dị ứng', 'xịt mũi'],
    viewCount: 834,
    content: `
      <h2>Viêm mũi dị ứng là gì?</h2>
      <p>Viêm mũi dị ứng xảy ra khi niêm mạc mũi phản ứng với dị nguyên như bụi nhà, phấn hoa, lông thú hoặc thay đổi thời tiết. Triệu chứng thường là hắt hơi, chảy mũi trong, ngứa mũi và nghẹt mũi.</p>
      <h2>Biện pháp không dùng thuốc</h2>
      <ul>
        <li>Rửa mũi bằng nước muối sinh lý đúng cách.</li>
        <li>Giặt ga gối định kỳ, hút bụi và hạn chế dị nguyên trong phòng ngủ.</li>
        <li>Đeo khẩu trang khi ra ngoài hoặc dọn dẹp nhà cửa.</li>
      </ul>
      <h2>Lưu ý khi dùng thuốc</h2>
      <p>Thuốc kháng histamine có thể gây buồn ngủ ở một số người. Thuốc xịt co mạch không nên dùng kéo dài vì có thể gây nghẹt mũi hồi ứng. Hãy hỏi dược sĩ nếu đang mang thai, cho con bú, có bệnh nền hoặc dùng nhiều thuốc.</p>
    `
  },
  {
    categorySlug: 'tieu-hoa',
    title: 'Tiêu chảy cấp: bù nước đúng và khi nào cần đi khám',
    slug: 'tieu-chay-cap-bu-nuoc-dung-khi-nao-di-kham',
    excerpt:
      'Ưu tiên bù nước, nhận biết dấu hiệu mất nước và tránh tự ý dùng thuốc cầm tiêu chảy trong tình huống không phù hợp.',
    featuredImage: img('photo-1512621776951-a57141f2eefd'),
    images: [img('photo-1576671081837-49000212a370', 900, 520)],
    tags: ['tiêu-chảy', 'oresol', 'mất-nước', 'tiêu-hóa', 'bù-nước'],
    metaTitle: 'Tiêu chảy cấp: cách bù nước và dấu hiệu cần đi khám',
    metaDescription: 'Hướng dẫn bù nước khi tiêu chảy, ăn uống phù hợp và dấu hiệu cảnh báo mất nước.',
    metaKeywords: ['tiêu chảy', 'oresol', 'bù nước', 'mất nước', 'rối loạn tiêu hóa'],
    references: [
      { title: 'WHO - Diarrhoeal disease', url: 'https://www.who.int/news-room/fact-sheets/detail/diarrhoeal-disease' },
      { title: 'MedlinePlus - Diarrhea', url: 'https://medlineplus.gov/diarrhea.html' }
    ],
    reviewedBy: 'DS. Lê Bảo Châu',
    reviewedByTitle: 'Dược sĩ lâm sàng',
    isFeatured: true,
    isPinned: false,
    productSearchTerms: ['oresol', 'men vi sinh', 'tiêu hóa', 'bù nước'],
    viewCount: 1132,
    content: `
      <h2>Việc quan trọng nhất là bù nước</h2>
      <p>Tiêu chảy cấp có thể làm mất nước và điện giải. Dung dịch bù nước đường uống cần được pha đúng lượng nước theo hướng dẫn trên gói. Pha quá đặc hoặc quá loãng đều không phù hợp.</p>
      <h2>Nên ăn uống thế nào?</h2>
      <ul>
        <li>Ăn thức ăn mềm, dễ tiêu, chia nhỏ bữa.</li>
        <li>Tránh rượu bia, đồ nhiều dầu mỡ và nước ngọt có gas.</li>
        <li>Tiếp tục uống nước, oresol hoặc dung dịch bù điện giải phù hợp.</li>
      </ul>
      <h2>Dấu hiệu cần đi khám</h2>
      <p>Đi khám nếu có sốt cao, phân máu, đau bụng dữ dội, nôn nhiều, khát nhiều, tiểu ít, lừ đừ hoặc tiêu chảy ở trẻ nhỏ/người cao tuổi/người có bệnh nền.</p>
    `
  },
  {
    categorySlug: 'tieu-hoa',
    title: 'Men vi sinh và chất xơ: dùng thế nào khi đầy hơi, táo bón?',
    slug: 'men-vi-sinh-chat-xo-day-hoi-tao-bon',
    excerpt:
      'Phân biệt men vi sinh, prebiotic và chất xơ; cách bắt đầu từ liều thấp để giảm khó chịu đường tiêu hóa.',
    featuredImage: img('photo-1490645935967-10de6ba17061'),
    images: [img('photo-1498837167922-ddd27525d352', 900, 520)],
    tags: ['men-vi-sinh', 'chất-xơ', 'táo-bón', 'đầy-hơi', 'tiêu-hóa'],
    metaTitle: 'Men vi sinh và chất xơ cho đầy hơi, táo bón',
    metaDescription: 'Cách dùng men vi sinh, prebiotic và chất xơ an toàn hơn khi đầy hơi hoặc táo bón.',
    metaKeywords: ['men vi sinh', 'chất xơ', 'prebiotic', 'táo bón', 'đầy hơi'],
    references: [
      { title: 'NCCIH - Probiotics', url: 'https://www.nccih.nih.gov/health/probiotics-what-you-need-to-know' },
      { title: 'MedlinePlus - Constipation', url: 'https://medlineplus.gov/constipation.html' }
    ],
    reviewedBy: 'DS. Lê Bảo Châu',
    reviewedByTitle: 'Dược sĩ lâm sàng',
    isFeatured: false,
    isPinned: false,
    productSearchTerms: ['men vi sinh', 'probiotic', 'chất xơ', 'tiêu hóa'],
    viewCount: 647,
    content: `
      <h2>Men vi sinh khác gì chất xơ?</h2>
      <p>Men vi sinh là vi sinh vật có lợi, còn chất xơ/prebiotic là nguồn thức ăn hỗ trợ hệ vi sinh đường ruột. Hai nhóm này có thể hỗ trợ tiêu hóa nhưng không thay thế điều trị nếu có triệu chứng nặng.</p>
      <h2>Cách bắt đầu an toàn hơn</h2>
      <ul>
        <li>Bắt đầu từ lượng thấp, tăng dần để giảm đầy hơi.</li>
        <li>Uống đủ nước khi bổ sung chất xơ.</li>
        <li>Đọc kỹ thành phần nếu dị ứng lactose, đạm sữa hoặc gluten.</li>
      </ul>
      <h2>Khi nào cần hỏi dược sĩ?</h2>
      <p>Nếu đang suy giảm miễn dịch, dùng kháng sinh, có bệnh đường ruột mạn tính hoặc táo bón kéo dài, hãy hỏi dược sĩ/bác sĩ trước khi dùng sản phẩm bổ sung.</p>
    `
  },
  {
    categorySlug: 'xuong-khop',
    title: 'Đau lưng do ngồi nhiều: bài tập nhẹ và dấu hiệu không nên bỏ qua',
    slug: 'dau-lung-do-ngoi-nhieu-bai-tap-nhe',
    excerpt:
      'Gợi ý giãn cơ nhẹ, chỉnh tư thế làm việc và các dấu hiệu đau lưng cần được khám trực tiếp.',
    featuredImage: img('photo-1571019613454-1cb2f99b2d8b'),
    images: [img('photo-1599058917212-d750089bc07e', 900, 520)],
    tags: ['đau-lưng', 'xương-khớp', 'tư-thế', 'vận-động', 'giảm-đau'],
    metaTitle: 'Đau lưng do ngồi nhiều: bài tập nhẹ và lưu ý',
    metaDescription: 'Cách giảm đau lưng do ngồi nhiều, bài tập giãn cơ và dấu hiệu cần đi khám.',
    metaKeywords: ['đau lưng', 'ngồi nhiều', 'giãn cơ', 'xương khớp', 'tư thế'],
    references: [
      { title: 'NHS - Back pain', url: 'https://www.nhs.uk/conditions/back-pain/' },
      { title: 'MedlinePlus - Low back pain', url: 'https://medlineplus.gov/lowbackpain.html' }
    ],
    reviewedBy: 'DS. Phạm Quang Huy',
    reviewedByTitle: 'Dược sĩ tư vấn xương khớp',
    isFeatured: true,
    isPinned: false,
    productSearchTerms: ['đau lưng', 'xương khớp', 'giảm đau', 'canxi'],
    viewCount: 1394,
    content: `
      <h2>Vì sao ngồi lâu dễ đau lưng?</h2>
      <p>Ngồi lâu làm cơ lưng, cơ mông và gân kheo bị căng hoặc yếu, đồng thời tăng áp lực lên cột sống. Tư thế gù vai, màn hình quá thấp hoặc ghế không phù hợp cũng làm đau tăng.</p>
      <h2>Ba thói quen nên thử</h2>
      <ul>
        <li>Đứng dậy đi lại 2-3 phút sau mỗi 45-60 phút làm việc.</li>
        <li>Giãn cơ lưng, hông và đùi sau nhẹ nhàng, không nảy người.</li>
        <li>Đặt màn hình ngang tầm mắt, bàn chân chạm sàn.</li>
      </ul>
      <h2>Dấu hiệu cần khám</h2>
      <p>Đau sau chấn thương, đau lan xuống chân kèm tê yếu, rối loạn tiểu tiện, sốt hoặc đau kéo dài trên vài tuần cần được khám trực tiếp.</p>
    `
  },
  {
    categorySlug: 'xuong-khop',
    title: 'Gout và acid uric: ăn uống, thuốc và điều cần hỏi trước khi mua',
    slug: 'gout-acid-uric-an-uong-thuoc-can-hoi',
    excerpt:
      'Tổng quan về cơn gout, thực phẩm nên hạn chế và lý do không tự ý mua thuốc giảm đau/kê đơn khi có bệnh nền.',
    featuredImage: img('photo-1519823551278-64ac92734fb1'),
    images: [img('photo-1498837167922-ddd27525d352', 900, 520)],
    tags: ['gout', 'acid-uric', 'đau-khớp', 'xương-khớp', 'thuốc-kê-đơn'],
    metaTitle: 'Gout và acid uric: ăn uống và dùng thuốc an toàn',
    metaDescription: 'Thông tin nền về gout, acid uric, chế độ ăn và lưu ý trước khi dùng thuốc.',
    metaKeywords: ['gout', 'acid uric', 'đau khớp', 'thuốc gout', 'chế độ ăn'],
    references: [
      { title: 'NIAMS - Gout', url: 'https://www.niams.nih.gov/health-topics/gout' },
      { title: 'MedlinePlus - Gout', url: 'https://medlineplus.gov/gout.html' }
    ],
    reviewedBy: 'DS. Phạm Quang Huy',
    reviewedByTitle: 'Dược sĩ tư vấn xương khớp',
    isFeatured: false,
    isPinned: false,
    productSearchTerms: ['gout', 'acid uric', 'giảm đau', 'xương khớp'],
    viewCount: 729,
    content: `
      <h2>Gout thường biểu hiện như thế nào?</h2>
      <p>Cơn gout cấp thường gây đau, sưng, nóng, đỏ ở khớp, hay gặp ở ngón chân cái nhưng cũng có thể ở cổ chân, gối hoặc bàn tay. Cơn đau có thể đến đột ngột và rất dữ dội.</p>
      <h2>Ăn uống cần lưu ý</h2>
      <ul>
        <li>Hạn chế rượu bia, nước ngọt nhiều đường và thực phẩm giàu purin.</li>
        <li>Uống đủ nước nếu không có chống chỉ định.</li>
        <li>Duy trì cân nặng hợp lý, tránh giảm cân quá nhanh.</li>
      </ul>
      <h2>Không tự ý dùng thuốc kê đơn</h2>
      <p>Một số thuốc gout hoặc thuốc giảm đau có thể không phù hợp nếu có bệnh thận, dạ dày, tim mạch hoặc đang dùng thuốc chống đông. Hãy hỏi dược sĩ/bác sĩ trước khi mua.</p>
    `
  },
  {
    categorySlug: 'da-lieu',
    title: 'Chống nắng đúng cách: SPF, PA và lượng bôi bao nhiêu là đủ?',
    slug: 'chong-nang-dung-cach-spf-pa-luong-boi',
    excerpt:
      'Cách chọn kem chống nắng theo hoạt động, loại da và mẹo bôi lại để bảo vệ da tốt hơn mỗi ngày.',
    featuredImage: img('photo-1556228578-8c89e6adf883'),
    images: [img('photo-1620916566398-39f1143ab7be', 900, 520)],
    tags: ['chống-nắng', 'spf', 'da-liễu', 'chăm-sóc-da', 'uv'],
    metaTitle: 'Chống nắng đúng cách: SPF, PA và lượng bôi',
    metaDescription: 'Hướng dẫn chọn và dùng kem chống nắng theo loại da, hoạt động và thời gian bôi lại.',
    metaKeywords: ['chống nắng', 'SPF', 'PA', 'kem chống nắng', 'da liễu'],
    references: [
      { title: 'FDA - Sunscreen: How to Help Protect Your Skin from the Sun', url: 'https://www.fda.gov/drugs/understanding-over-counter-medicines/sunscreen-how-help-protect-your-skin-sun' },
      { title: 'AAD - Sunscreen FAQs', url: 'https://www.aad.org/media/stats-sunscreen' }
    ],
    reviewedBy: 'DS. Vũ Thảo Linh',
    reviewedByTitle: 'Dược sĩ tư vấn dược mỹ phẩm',
    isFeatured: true,
    isPinned: false,
    productSearchTerms: ['chống nắng', 'spf', 'da liễu', 'dược mỹ phẩm'],
    viewCount: 1881,
    content: `
      <h2>SPF và PA nói lên điều gì?</h2>
      <p>SPF liên quan đến khả năng bảo vệ trước UVB, còn PA thường được dùng để biểu thị bảo vệ trước UVA. Với sinh hoạt hằng ngày, nên chọn sản phẩm phổ rộng và phù hợp loại da.</p>
      <h2>Lượng bôi và bôi lại</h2>
      <ul>
        <li>Dùng đủ lượng cho vùng mặt và cổ, bôi trước khi ra nắng.</li>
        <li>Bôi lại sau khi đổ mồ hôi, bơi hoặc lau mặt nhiều.</li>
        <li>Kết hợp mũ, kính râm, áo chống nắng và tránh nắng gắt.</li>
      </ul>
      <h2>Da nhạy cảm nên chọn gì?</h2>
      <p>Nếu dễ kích ứng, hãy thử trên vùng nhỏ trước. Người đang điều trị da liễu, phụ nữ mang thai hoặc trẻ nhỏ nên hỏi dược sĩ/bác sĩ để chọn sản phẩm phù hợp.</p>
    `
  },
  {
    categorySlug: 'da-lieu',
    title: 'Mụn viêm nhẹ: chăm sóc nền da và khi nào cần thuốc kê đơn',
    slug: 'mun-viem-nhe-cham-soc-nen-da-khi-nao-can-thuoc',
    excerpt:
      'Routine đơn giản cho da mụn, cách tránh kích ứng và dấu hiệu cần khám da liễu thay vì tự mua thuốc mạnh.',
    featuredImage: img('photo-1570172619644-dfd03ed5d881'),
    images: [img('photo-1556229010-6c3f2c9ca5f8', 900, 520)],
    tags: ['mụn', 'da-liễu', 'benzoyl-peroxide', 'retinoid', 'chăm-sóc-da'],
    metaTitle: 'Mụn viêm nhẹ: chăm sóc da và khi nào cần khám',
    metaDescription: 'Gợi ý routine nền cho da mụn và lưu ý khi dùng hoạt chất dễ kích ứng.',
    metaKeywords: ['mụn viêm', 'chăm sóc da mụn', 'benzoyl peroxide', 'retinoid'],
    references: [
      { title: 'AAD - Acne: Diagnosis and treatment', url: 'https://www.aad.org/public/diseases/acne/derm-treat' },
      { title: 'MedlinePlus - Acne', url: 'https://medlineplus.gov/acne.html' }
    ],
    reviewedBy: 'DS. Vũ Thảo Linh',
    reviewedByTitle: 'Dược sĩ tư vấn dược mỹ phẩm',
    isFeatured: false,
    isPinned: false,
    productSearchTerms: ['mụn', 'da liễu', 'sữa rửa mặt', 'dược mỹ phẩm'],
    viewCount: 1048,
    content: `
      <h2>Routine nền cho da mụn</h2>
      <p>Da mụn cần làm sạch dịu nhẹ, dưỡng ẩm phù hợp và chống nắng đều. Tránh chà xát mạnh hoặc dùng quá nhiều hoạt chất cùng lúc vì có thể làm hàng rào da yếu hơn.</p>
      <h2>Hoạt chất cần dùng thận trọng</h2>
      <p>Benzoyl peroxide, acid salicylic hoặc retinoid có thể hữu ích trong một số trường hợp nhưng cũng dễ gây khô, rát hoặc bong tróc. Không tự ý dùng thuốc kê đơn, thuốc bôi chứa corticoid hoặc kháng sinh kéo dài.</p>
      <h2>Khi nào nên khám?</h2>
      <p>Mụn viêm nhiều, mụn bọc, sẹo, đau nhiều, mụn ở phụ nữ có rối loạn kinh nguyệt hoặc không cải thiện sau chăm sóc cơ bản nên được bác sĩ da liễu đánh giá.</p>
    `
  },
  {
    categorySlug: 'mat',
    title: 'Khô mắt do màn hình: quy tắc 20-20-20 và chọn nước mắt nhân tạo',
    slug: 'kho-mat-do-man-hinh-quy-tac-20-20-20',
    excerpt:
      'Giảm mỏi mắt khi làm việc với máy tính, điều chỉnh môi trường và lưu ý khi chọn nước mắt nhân tạo.',
    featuredImage: img('photo-1581166397057-235af2b3c6dd'),
    images: [img('photo-1516321318423-f06f85e504b3', 900, 520)],
    tags: ['khô-mắt', 'mỏi-mắt', 'màn-hình', 'nước-mắt-nhân-tạo', 'mắt'],
    metaTitle: 'Khô mắt do màn hình: quy tắc 20-20-20',
    metaDescription: 'Cách giảm khô mắt, mỏi mắt khi dùng máy tính và lưu ý chọn nước mắt nhân tạo.',
    metaKeywords: ['khô mắt', 'mỏi mắt', 'nước mắt nhân tạo', 'màn hình', '20-20-20'],
    references: [
      { title: 'AAO - Computer vision syndrome', url: 'https://www.aao.org/eye-health/tips-prevention/computer-usage' },
      { title: 'MedlinePlus - Dry eye', url: 'https://medlineplus.gov/ency/article/000426.htm' }
    ],
    reviewedBy: 'DS. Mai Gia Hân',
    reviewedByTitle: 'Dược sĩ tư vấn chăm sóc mắt',
    isFeatured: false,
    isPinned: false,
    productSearchTerms: ['nước mắt nhân tạo', 'khô mắt', 'mắt'],
    viewCount: 693,
    content: `
      <h2>Vì sao dùng màn hình gây khô mắt?</h2>
      <p>Khi tập trung nhìn màn hình, số lần chớp mắt thường giảm. Không khí khô, điều hòa, ánh sáng chói và kính áp tròng cũng có thể làm khô mắt tăng.</p>
      <h2>Quy tắc 20-20-20</h2>
      <p>Sau mỗi 20 phút, nhìn ra xa khoảng 20 feet trong 20 giây. Điều chỉnh màn hình thấp hơn tầm mắt một chút và tránh luồng gió thổi trực tiếp vào mặt.</p>
      <h2>Chọn nước mắt nhân tạo</h2>
      <p>Nếu phải dùng nhiều lần trong ngày hoặc có mắt nhạy cảm, hãy hỏi dược sĩ về sản phẩm phù hợp. Đau mắt, nhìn mờ kéo dài, đỏ nhiều hoặc tiết dịch cần đi khám.</p>
    `
  },
  {
    categorySlug: 'dinh-duong',
    title: 'Vitamin C, D, kẽm: bổ sung khi nào và tránh lạm dụng ra sao?',
    slug: 'vitamin-c-d-kem-bo-sung-khi-nao-tranh-lam-dung',
    excerpt:
      'Cách nhìn thực tế về bổ sung vitamin/khoáng chất, nhóm dễ thiếu hụt và lưu ý tương tác thuốc.',
    featuredImage: img('photo-1471864190281-a93a3070b6de'),
    images: [img('photo-1505751172876-fa1923c5c528', 900, 520)],
    tags: ['vitamin-c', 'vitamin-d', 'kẽm', 'dinh-dưỡng', 'miễn-dịch'],
    metaTitle: 'Vitamin C, D, kẽm: bổ sung đúng và tránh lạm dụng',
    metaDescription: 'Thông tin nền về vitamin C, vitamin D, kẽm và khi nào nên hỏi dược sĩ trước khi bổ sung.',
    metaKeywords: ['vitamin C', 'vitamin D', 'kẽm', 'dinh dưỡng', 'miễn dịch'],
    references: [
      { title: 'NIH ODS - Vitamin C', url: 'https://ods.od.nih.gov/factsheets/VitaminC-Consumer/' },
      { title: 'NIH ODS - Vitamin D', url: 'https://ods.od.nih.gov/factsheets/VitaminD-Consumer/' },
      { title: 'NIH ODS - Zinc', url: 'https://ods.od.nih.gov/factsheets/Zinc-Consumer/' }
    ],
    reviewedBy: 'DS. Hoàng Phương Nhi',
    reviewedByTitle: 'Dược sĩ tư vấn dinh dưỡng',
    isFeatured: true,
    isPinned: false,
    productSearchTerms: ['vitamin c', 'vitamin d', 'kẽm', 'miễn dịch'],
    viewCount: 2110,
    content: `
      <h2>Bổ sung không thay thế ăn uống cân bằng</h2>
      <p>Vitamin và khoáng chất hỗ trợ cơ thể khi khẩu phần thiếu hụt hoặc nhu cầu tăng. Tuy nhiên, dùng liều cao kéo dài không phải lúc nào cũng tốt và có thể gây tác dụng không mong muốn.</p>
      <h2>Ai nên hỏi trước khi bổ sung?</h2>
      <ul>
        <li>Phụ nữ mang thai, cho con bú hoặc trẻ nhỏ.</li>
        <li>Người bệnh thận, sỏi thận, bệnh gan hoặc đang dùng thuốc chống đông.</li>
        <li>Người đang dùng nhiều sản phẩm bổ sung cùng lúc.</li>
      </ul>
      <h2>Cách dùng thực tế</h2>
      <p>Đọc hàm lượng trên nhãn, tránh dùng trùng lặp nhiều sản phẩm có cùng thành phần. Nếu mục tiêu là phòng thiếu hụt, hãy hỏi dược sĩ để chọn hàm lượng phù hợp.</p>
    `
  },
  {
    categorySlug: 'dung-thuoc-an-toan',
    title: 'Kháng sinh không dùng cho cảm cúm: vì sao và khi nào cần đơn thuốc?',
    slug: 'khang-sinh-khong-dung-cho-cam-cum',
    excerpt:
      'Giải thích vì sao cảm cúm do virus không tự dùng kháng sinh, rủi ro kháng thuốc và cách hỏi dược sĩ đúng thông tin.',
    featuredImage: img('photo-1584308666744-24d5c474f2ae'),
    images: [img('photo-1587854692152-cbe660dbde88', 900, 520)],
    tags: ['kháng-sinh', 'cảm-cúm', 'dùng-thuốc-an-toàn', 'thuốc-kê-đơn', 'kháng-thuốc'],
    metaTitle: 'Kháng sinh không dùng cho cảm cúm: dùng thuốc an toàn',
    metaDescription: 'Vì sao không tự dùng kháng sinh khi cảm cúm, rủi ro kháng thuốc và khi nào cần đơn thuốc.',
    metaKeywords: ['kháng sinh', 'cảm cúm', 'kháng thuốc', 'thuốc kê đơn', 'dùng thuốc an toàn'],
    references: [
      { title: 'CDC - Antibiotic Use', url: 'https://www.cdc.gov/antibiotic-use/' },
      {
        title: 'FDA - Antibiotics and Antibiotic Resistance',
        url: 'https://www.fda.gov/drugs/buying-using-medicine-safely/antibiotics-and-antibiotic-resistance'
      }
    ],
    reviewedBy: 'DS. Nguyễn Minh Anh',
    reviewedByTitle: 'Dược sĩ lâm sàng',
    isFeatured: true,
    isPinned: true,
    productSearchTerms: ['kháng sinh', 'cảm cúm', 'thuốc kê đơn', 'hạ sốt'],
    viewCount: 1762,
    content: `
      <h2>Cảm cúm thường do virus</h2>
      <p>Kháng sinh tác động lên vi khuẩn, không điều trị trực tiếp nhiễm virus như cảm cúm thông thường. Tự dùng kháng sinh khi không cần thiết có thể gây tác dụng phụ và góp phần làm tăng kháng thuốc.</p>
      <h2>Khi nào có thể cần đánh giá thêm?</h2>
      <p>Sốt cao kéo dài, khó thở, đau ngực, triệu chứng nặng lên, người có bệnh nền hoặc nghi ngờ nhiễm khuẩn cần được nhân viên y tế đánh giá trước khi quyết định thuốc.</p>
      <h2>Cần cung cấp gì khi hỏi dược sĩ?</h2>
      <ul>
        <li>Tuổi, cân nặng, bệnh nền và dị ứng thuốc.</li>
        <li>Triệu chứng, thời gian bệnh và thuốc đã dùng.</li>
        <li>Đơn thuốc hoặc kết quả khám nếu có.</li>
      </ul>
    `
  },
  {
    categorySlug: 'dung-thuoc-an-toan',
    title: 'Đọc nhãn thuốc OTC: hoạt chất, liều tối đa và tương tác cần biết',
    slug: 'doc-nhan-thuoc-otc-hoat-chat-lieu-toi-da-tuong-tac',
    excerpt:
      'Checklist đọc nhãn thuốc không kê đơn để tránh dùng trùng hoạt chất, quá liều hoặc tương tác với thuốc đang dùng.',
    featuredImage: img('photo-1550572017-edd951aa8ca9'),
    images: [img('photo-1563213126-a4273aed2016', 900, 520)],
    tags: ['thuốc-otc', 'đọc-nhãn-thuốc', 'tương-tác-thuốc', 'dùng-thuốc-an-toàn'],
    metaTitle: 'Đọc nhãn thuốc OTC: tránh quá liều và tương tác',
    metaDescription: 'Cách đọc nhãn thuốc không kê đơn, nhận biết hoạt chất trùng lặp và khi nào cần hỏi dược sĩ.',
    metaKeywords: ['thuốc OTC', 'đọc nhãn thuốc', 'tương tác thuốc', 'quá liều', 'dược sĩ'],
    references: [
      { title: 'FDA - Understanding Over-the-Counter Medicines', url: 'https://www.fda.gov/drugs/buying-using-medicine-safely/understanding-over-counter-medicines' },
      { title: 'MedlinePlus - Drug Reactions', url: 'https://medlineplus.gov/drugreactions.html' }
    ],
    reviewedBy: 'DS. Nguyễn Minh Anh',
    reviewedByTitle: 'Dược sĩ lâm sàng',
    isFeatured: false,
    isPinned: false,
    productSearchTerms: ['otc', 'hạ sốt', 'giảm đau', 'dị ứng'],
    viewCount: 845,
    content: `
      <h2>Đừng chỉ nhìn tên thương mại</h2>
      <p>Nhiều thuốc khác tên nhưng có cùng hoạt chất. Dùng trùng hoạt chất có thể làm tăng nguy cơ quá liều, đặc biệt với thuốc hạ sốt, giảm đau, cảm cúm phối hợp hoặc thuốc dị ứng.</p>
      <h2>Checklist trước khi mua</h2>
      <ul>
        <li>Hoạt chất chính là gì?</li>
        <li>Liều tối đa trong ngày và khoảng cách giữa các lần dùng?</li>
        <li>Ai không nên dùng: trẻ nhỏ, thai kỳ, bệnh gan thận, tăng huyết áp?</li>
        <li>Có đang dùng thuốc kê đơn hoặc thực phẩm bổ sung nào khác không?</li>
      </ul>
      <h2>Khi nào nên hỏi dược sĩ?</h2>
      <p>Nếu dùng nhiều thuốc, có bệnh nền, đang mang thai/cho con bú hoặc triệu chứng không rõ nguyên nhân, hãy hỏi dược sĩ trước khi mua.</p>
    `
  }
]

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, ' ')
}

function includesAny(values: string[], keywords: string[]) {
  const source = values.join(' ').toLowerCase()
  return keywords.some((keyword) => source.includes(keyword))
}

function inferRiskLevel(article: BlogArticleSeed): Article['riskLevel'] {
  const values = [article.title, article.excerpt, article.categorySlug, ...article.tags, ...article.metaKeywords]
  if (includesAny(values, ['cấp-cứu', 'đau ngực', 'khó thở', 'sốc', 'kháng sinh'])) return 'emergency-sensitive'
  if (includesAny(values, ['thuốc', 'hoạt chất', 'otc', 'kháng sinh', 'liều', 'tương tác'])) return 'medication'
  if (includesAny(values, ['bệnh', 'tim mạch', 'tiểu đường', 'huyết áp', 'dị ứng'])) return 'disease'
  return 'general'
}

function inferArticleTaxonomy(article: BlogArticleSeed) {
  const values = [article.title, article.excerpt, article.categorySlug, ...article.tags, ...article.metaKeywords, ...article.productSearchTerms]
  const topics = Array.from(new Set([article.categorySlug, ...article.tags, ...article.metaKeywords].slice(0, 12)))
  const symptoms = values.filter((value) =>
    includesAny([value], ['ho', 'sốt', 'đau', 'khó thở', 'dị ứng', 'tiêu chảy', 'táo bón', 'khô mắt', 'mỏi mắt', 'huyết áp'])
  )
  const activeIngredients = values.filter((value) =>
    includesAny([value], ['paracetamol', 'ibuprofen', 'vitamin', 'kháng sinh', 'kháng histamine', 'men vi sinh', 'omega'])
  )
  const targetAudiences = values.filter((value) =>
    includesAny([value], ['trẻ em', 'người cao tuổi', 'phụ nữ', 'thai', 'bệnh nền', 'dùng thuốc dài ngày'])
  )

  return {
    healthTopics: Array.from(new Set(topics)).slice(0, 12),
    symptoms: Array.from(new Set(symptoms)).slice(0, 8),
    activeIngredients: Array.from(new Set(activeIngredients)).slice(0, 8),
    targetAudiences: Array.from(new Set(targetAudiences)).slice(0, 8)
  }
}

async function findRelatedProductIds(terms: string[], limit = 4) {
  const normalizedTerms = terms.map((term) => term.trim()).filter((term) => term.length >= 2)
  if (!normalizedTerms.length) return []

  const products = await databaseService.products
    .find({
      isActive: true,
      $or: normalizedTerms.flatMap((term) => [
        { name: { $regex: escapeRegex(term), $options: 'i' } },
        { shortDescription: { $regex: escapeRegex(term), $options: 'i' } },
        { activeIngredients: { $regex: escapeRegex(term), $options: 'i' } },
        { activeIngredients: { $elemMatch: { $regex: escapeRegex(term), $options: 'i' } } }
      ])
    })
    .project({ _id: 1 })
    .limit(limit)
    .toArray()

  return products.map((product) => product._id as ObjectId)
}

async function cleanupLegacyBlogArticles() {
  if (process.env.BLOG_SEED_CLEANUP !== 'true') {
    console.log('ℹ️  Skipped legacy blog cleanup. Set BLOG_SEED_CLEANUP=true to enable it.')
    return
  }

  const legacySlugs = [
    'cach-phong-ngua-cam-cum-mua-dong',
    'tap-the-duc-dung-cach-de-giam-dau-lung',
    'sdf-cach-phong-ngua-cam-cum-mua-dong-hieu-qua'
  ]

  const result = await databaseService.articles.deleteMany({
    $or: [
      { slug: { $in: legacySlugs } },
      { title: { $regex: '^sdf\\s+', $options: 'i' } },
      { title: { $regex: '^[0-9\\s]+$' } }
    ]
  })

  if (result.deletedCount > 0) {
    console.log(`🧹 Removed ${result.deletedCount} legacy/test blog articles`)
  }
}

export async function seedHealthCategories() {
  console.log('🌱 Upserting health categories...')
  const seededSlugs = healthCategoriesData.map((category) => category.slug)

  if (process.env.BLOG_SEED_CLEANUP === 'true') {
    const cleanupResult = await databaseService.healthCategories.deleteMany({
      slug: { $nin: seededSlugs },
      articleCount: { $lte: 0 }
    })
    if (cleanupResult.deletedCount > 0) {
      console.log(`🧹 Removed ${cleanupResult.deletedCount} empty legacy health categories`)
    }
  } else {
    console.log('ℹ️  Skipped health category cleanup. Set BLOG_SEED_CLEANUP=true to enable it.')
  }

  for (const categoryData of healthCategoriesData) {
    await databaseService.healthCategories.updateOne(
      { slug: categoryData.slug },
      {
        $set: {
          ...categoryData,
          updatedAt: new Date()
        },
        $setOnInsert: {
          createdAt: new Date()
        }
      },
      { upsert: true }
    )
  }

  console.log(`✅ Upserted ${healthCategoriesData.length} health categories`)
}

export async function seedArticles() {
  console.log('🌱 Upserting health articles...')
  await cleanupLegacyBlogArticles()

  const adminUser = await databaseService.users.findOne({ role: 2 })
  if (!adminUser) {
    console.log('⚠️  No admin user found, skipping articles seed')
    return
  }

  const authorId = adminUser._id!
  const authorName = `${adminUser.firstName || ''} ${adminUser.lastName || ''}`.trim() || 'Medispace Editorial'
  const authorTitle = 'Biên tập viên y tế'
  const categories = await databaseService.healthCategories.find().toArray()
  const categoryMap = new Map(categories.map((cat) => [cat.slug, cat]))
  const insertedArticleIdsBySlug = new Map<string, ObjectId>()
  const publishedAtBase = new Date('2026-06-01T03:00:00.000Z')

  for (const [index, articleData] of articlesDataTemplate.entries()) {
    const category = categoryMap.get(articleData.categorySlug)
    if (!category?._id) {
      console.log(`⚠️  Category ${articleData.categorySlug} not found`)
      continue
    }

    const relatedProductIds = await findRelatedProductIds(articleData.productSearchTerms)
    const publishedAt = new Date(publishedAtBase.getTime() - index * 36 * 60 * 60 * 1000)
    const reviewDate = new Date(publishedAt.getTime() + 3 * 60 * 60 * 1000)
    const existing = await databaseService.articles.findOne({ slug: articleData.slug })
    const articleId = existing?._id || new ObjectId()
    const taxonomy = inferArticleTaxonomy(articleData)
    insertedArticleIdsBySlug.set(articleData.slug, articleId)

    const article = new Article({
      _id: articleId,
      title: articleData.title,
      slug: articleData.slug,
      excerpt: articleData.excerpt,
      content: articleData.content,
      featuredImage: articleData.featuredImage,
      images: articleData.images || [],
      categoryId: category._id,
      tags: articleData.tags,
      authorId,
      authorName,
      authorTitle,
      viewCount: articleData.viewCount,
      metaTitle: articleData.metaTitle,
      metaDescription: articleData.metaDescription,
      metaKeywords: articleData.metaKeywords,
      references: articleData.references,
      reviewedBy: articleData.reviewedBy,
      reviewedByTitle: articleData.reviewedByTitle,
      reviewedAt: reviewDate,
      lastMedicallyReviewedAt: reviewDate,
      contentVersion: 1,
      riskLevel: inferRiskLevel(articleData),
      targetAudiences: taxonomy.targetAudiences,
      symptoms: taxonomy.symptoms,
      activeIngredients: taxonomy.activeIngredients,
      healthTopics: taxonomy.healthTopics,
      status: 'published',
      isPublished: true,
      isFeatured: articleData.isFeatured,
      isPinned: articleData.isPinned,
      publishedAt,
      relatedProductIds,
      createdAt: existing?.createdAt || publishedAt,
      updatedAt: new Date()
    })

    await databaseService.articles.updateOne({ slug: articleData.slug }, { $set: article }, { upsert: true })
  }

  const articles = await databaseService.articles.find({ slug: { $in: articlesDataTemplate.map((article) => article.slug) } }).toArray()
  for (const article of articles) {
    const relatedArticleIds = articles
      .filter((candidate) => candidate._id?.toString() !== article._id?.toString() && candidate.categoryId.toString() === article.categoryId.toString())
      .slice(0, 3)
      .map((candidate) => candidate._id as ObjectId)

    await databaseService.articles.updateOne({ _id: article._id }, { $set: { relatedArticleIds } })
  }

  await databaseService.healthCategories.updateMany({}, { $set: { articleCount: 0, updatedAt: new Date() } })
  const articleCounts = await databaseService.articles
    .aggregate([
      { $match: { isPublished: true, status: 'published' } },
      { $group: { _id: '$categoryId', count: { $sum: 1 } } }
    ])
    .toArray()

  for (const item of articleCounts) {
    await databaseService.healthCategories.updateOne({ _id: item._id }, { $set: { articleCount: item.count } })
  }

  console.log(`✅ Upserted ${insertedArticleIdsBySlug.size} health articles`)
}

export async function seedBlogData() {
  await seedHealthCategories()
  await seedArticles()
  console.log('✅ Blog data seeding completed!')
}
