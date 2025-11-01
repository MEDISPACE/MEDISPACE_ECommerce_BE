import databaseService from './services/database.services'
import Category from './models/schemas/Category.schema'
import Brand from './models/schemas/Brand.schema'
import Product from './models/schemas/Product.schema'
import ProductMedia from './models/schemas/ProductMedia.schema'
import { ObjectId } from 'mongodb'

// Seed categories - Phân cấp theo Long Châu
const categoriesData = [
  // Level 1: Danh mục chính
  {
    name: 'Thực phẩm chức năng',
    slug: 'thuc-pham-chuc-nang',
    description: 'Vitamin, khoáng chất và thực phẩm bổ sung',
    parentId: null,
    level: 1,
    path: 'thuc-pham-chuc-nang',
    isActive: true,
    sortOrder: 1
  },
  {
    name: 'Dược mỹ phẩm',
    slug: 'duoc-my-pham',
    description: 'Sản phẩm chăm sóc da và làm đẹp',
    parentId: null,
    level: 1,
    path: 'duoc-my-pham',
    isActive: true,
    sortOrder: 2
  },
  {
    name: 'Thuốc',
    slug: 'thuoc',
    description: 'Thuốc kê đơn và không kê đơn',
    parentId: null,
    level: 1,
    path: 'thuoc',
    isActive: true,
    sortOrder: 3
  },
  {
    name: 'Chăm sóc cá nhân',
    slug: 'cham-soc-ca-nhan',
    description: 'Sản phẩm vệ sinh và chăm sóc cá nhân',
    parentId: null,
    level: 1,
    path: 'cham-soc-ca-nhan',
    isActive: true,
    sortOrder: 4
  },
  {
    name: 'Trang thiết bị y tế',
    slug: 'trang-thiet-bi-y-te',
    description: 'Thiết bị y tế và dụng cụ y khoa',
    parentId: null,
    level: 1,
    path: 'trang-thiet-bi-y-te',
    isActive: true,
    sortOrder: 5
  },

  // Level 2: Subcategories cho Thực phẩm chức năng
  {
    name: 'Vitamin & Khoáng chất',
    slug: 'vitamin-khoang-chat',
    description: 'Vitamin tổng hợp, canxi, sắt, kẽm',
    parentId: null, // sẽ được set sau
    level: 2,
    path: 'thuc-pham-chuc-nang/vitamin-khoang-chat',
    isActive: true,
    sortOrder: 1
  },
  {
    name: 'Thần kinh não',
    slug: 'than-kinh-nao',
    description: 'Bổ não, cải thiện trí nhớ',
    parentId: null,
    level: 2,
    path: 'thuc-pham-chuc-nang/than-kinh-nao',
    isActive: true,
    sortOrder: 2
  },
  {
    name: 'Sức khỏe tim mạch',
    slug: 'suc-khoe-tim-mach',
    description: 'Bổ tim mạch, huyết áp',
    parentId: null,
    level: 2,
    path: 'thuc-pham-chuc-nang/suc-khoe-tim-mach',
    isActive: true,
    sortOrder: 3
  },
  {
    name: 'Tăng sức đề kháng, miễn dịch',
    slug: 'tang-suc-de-khang-mien-dich',
    description: 'Tăng cường miễn dịch',
    parentId: null,
    level: 2,
    path: 'thuc-pham-chuc-nang/tang-suc-de-khang-mien-dich',
    isActive: true,
    sortOrder: 4
  },
  {
    name: 'Hỗ trợ tiêu hóa',
    slug: 'ho-tro-tieu-hoa',
    description: 'Men vi sinh, tiêu hóa',
    parentId: null,
    level: 2,
    path: 'thuc-pham-chuc-nang/ho-tro-tieu-hoa',
    isActive: true,
    sortOrder: 5
  },
  {
    name: 'Hỗ trợ sinh sản',
    slug: 'ho-tro-sinh-san',
    description: 'Hỗ trợ sinh sản, nam khoa, nữ khoa',
    parentId: null,
    level: 2,
    path: 'thuc-pham-chuc-nang/ho-tro-sinh-san',
    isActive: true,
    sortOrder: 6
  },
  {
    name: 'Giảm cân',
    slug: 'giam-can',
    description: 'Thực phẩm hỗ trợ giảm cân',
    parentId: null,
    level: 2,
    path: 'thuc-pham-chuc-nang/giam-can',
    isActive: true,
    sortOrder: 7
  },
  {
    name: 'Chăm sóc tóc da móng',
    slug: 'cham-soc-toc-da-mong',
    description: 'Biotin, collagen cho tóc da móng',
    parentId: null,
    level: 2,
    path: 'thuc-pham-chuc-nang/cham-soc-toc-da-mong',
    isActive: true,
    sortOrder: 8
  },

  // Level 2: Subcategories cho Dược mỹ phẩm
  {
    name: 'Chăm sóc da mặt',
    slug: 'cham-soc-da-mat',
    description: 'Kem dưỡng, sữa rửa mặt, mặt nạ',
    parentId: null,
    level: 2,
    path: 'duoc-my-pham/cham-soc-da-mat',
    isActive: true,
    sortOrder: 1
  },
  {
    name: 'Trang điểm',
    slug: 'trang-diem',
    description: 'Phấn mắt, son môi, kem nền',
    parentId: null,
    level: 2,
    path: 'duoc-my-pham/trang-diem',
    isActive: true,
    sortOrder: 2
  },
  {
    name: 'Chăm sóc tóc',
    slug: 'cham-soc-toc',
    description: 'Dầu gội, dầu xả, dưỡng tóc',
    parentId: null,
    level: 2,
    path: 'duoc-my-pham/cham-soc-toc',
    isActive: true,
    sortOrder: 3
  },
  {
    name: 'Nước hoa',
    slug: 'nuoc-hoa',
    description: 'Nước hoa nam, nữ, unisex',
    parentId: null,
    level: 2,
    path: 'duoc-my-pham/nuoc-hoa',
    isActive: true,
    sortOrder: 4
  },
  {
    name: 'Dưỡng thể',
    slug: 'duong-the',
    description: 'Kem dưỡng thể, sữa tắm',
    parentId: null,
    level: 2,
    path: 'duoc-my-pham/duong-the',
    isActive: true,
    sortOrder: 5
  },
  {
    name: 'Chống nắng',
    slug: 'chong-nang',
    description: 'Kem chống nắng, dưỡng chống nắng',
    parentId: null,
    level: 2,
    path: 'duoc-my-pham/chong-nang',
    isActive: true,
    sortOrder: 6
  },
  {
    name: 'Dụng cụ làm đẹp',
    slug: 'dung-cu-lam-dep',
    description: 'Cọ trang điểm, dụng cụ skincare',
    parentId: null,
    level: 2,
    path: 'duoc-my-pham/dung-cu-lam-dep',
    isActive: true,
    sortOrder: 7
  },

  // Level 2: Subcategories cho Thuốc
  {
    name: 'Thuốc cảm cúm',
    slug: 'thuoc-cam-cum',
    description: 'Thuốc trị cảm cúm, ho, sốt',
    parentId: null,
    level: 2,
    path: 'thuoc/thuoc-cam-cum',
    isActive: true,
    sortOrder: 1
  },
  {
    name: 'Thuốc giảm đau',
    slug: 'thuoc-giam-dau',
    description: 'Thuốc giảm đau đầu, khớp',
    parentId: null,
    level: 2,
    path: 'thuoc/thuoc-giam-dau',
    isActive: true,
    sortOrder: 2
  },
  {
    name: 'Thuốc kháng sinh',
    slug: 'thuoc-khang-sinh',
    description: 'Kháng sinh điều trị nhiễm trùng',
    parentId: null,
    level: 2,
    path: 'thuoc/thuoc-khang-sinh',
    isActive: true,
    sortOrder: 3
  },
  {
    name: 'Thuốc huyết áp',
    slug: 'thuoc-huyet-ap',
    description: 'Thuốc điều trị cao huyết áp',
    parentId: null,
    level: 2,
    path: 'thuoc/thuoc-huyet-ap',
    isActive: true,
    sortOrder: 4
  },
  {
    name: 'Thuốc tiểu đường',
    slug: 'thuoc-tieu-duong',
    description: 'Thuốc điều trị đái tháo đường',
    parentId: null,
    level: 2,
    path: 'thuoc/thuoc-tieu-duong',
    isActive: true,
    sortOrder: 5
  },
  {
    name: 'Thuốc tiêu hóa',
    slug: 'thuoc-tieu-hoa',
    description: 'Thuốc dạ dày, trào ngược',
    parentId: null,
    level: 2,
    path: 'thuoc/thuoc-tieu-hoa',
    isActive: true,
    sortOrder: 6
  },
  {
    name: 'Thuốc da liễu',
    slug: 'thuoc-da-lieu',
    description: 'Thuốc trị mụn, nấm, eczema',
    parentId: null,
    level: 2,
    path: 'thuoc/thuoc-da-lieu',
    isActive: true,
    sortOrder: 7
  },
  {
    name: 'Thuốc mắt',
    slug: 'thuoc-mat',
    description: 'Thuốc nhỏ mắt, kính áp tròng',
    parentId: null,
    level: 2,
    path: 'thuoc/thuoc-mat',
    isActive: true,
    sortOrder: 8
  },

  // Level 2: Subcategories cho Chăm sóc cá nhân
  {
    name: 'Vệ sinh cá nhân',
    slug: 've-sinh-ca-nhan',
    description: 'Khăn giấy, băng vệ sinh, dụng cụ vệ sinh',
    parentId: null,
    level: 2,
    path: 'cham-soc-ca-nhan/ve-sinh-ca-nhan',
    isActive: true,
    sortOrder: 1
  },
  {
    name: 'Chăm sóc răng miệng',
    slug: 'cham-soc-rang-mieng',
    description: 'Bàn chải, kem đánh răng, nước súc miệng',
    parentId: null,
    level: 2,
    path: 'cham-soc-ca-nhan/cham-soc-rang-mieng',
    isActive: true,
    sortOrder: 2
  },
  {
    name: 'Dầu gội xả',
    slug: 'dau-goi-xa',
    description: 'Dầu gội, dầu xả, chăm sóc tóc',
    parentId: null,
    level: 2,
    path: 'cham-soc-ca-nhan/dau-goi-xa',
    isActive: true,
    sortOrder: 3
  },
  {
    name: 'Sữa tắm',
    slug: 'sua-tam',
    description: 'Sữa tắm, xà phòng, gel tắm',
    parentId: null,
    level: 2,
    path: 'cham-soc-ca-nhan/sua-tam',
    isActive: true,
    sortOrder: 4
  },
  {
    name: 'Khử mùi',
    slug: 'khu-mui',
    description: 'Lăn khử mùi, xịt khử mùi',
    parentId: null,
    level: 2,
    path: 'cham-soc-ca-nhan/khu-mui',
    isActive: true,
    sortOrder: 5
  },
  {
    name: 'Dụng cụ vệ sinh',
    slug: 'dung-cu-ve-sinh',
    description: 'Bông tẩy trang, khăn mặt, dụng cụ cá nhân',
    parentId: null,
    level: 2,
    path: 'cham-soc-ca-nhan/dung-cu-ve-sinh',
    isActive: true,
    sortOrder: 6
  },

  // Level 2: Subcategories cho Trang thiết bị y tế
  {
    name: 'Máy đo huyết áp',
    slug: 'may-do-huyet-ap',
    description: 'Máy đo huyết áp điện tử, tay áo',
    parentId: null,
    level: 2,
    path: 'trang-thiet-bi-y-te/may-do-huyet-ap',
    isActive: true,
    sortOrder: 1
  },
  {
    name: 'Máy đo đường huyết',
    slug: 'may-do-duong-huyet',
    description: 'Máy đo đường huyết, que thử',
    parentId: null,
    level: 2,
    path: 'trang-thiet-bi-y-te/may-do-duong-huyet',
    isActive: true,
    sortOrder: 2
  },
  {
    name: 'Nhiệt kế',
    slug: 'nhiet-ke',
    description: 'Nhiệt kế điện tử, thủy ngân',
    parentId: null,
    level: 2,
    path: 'trang-thiet-bi-y-te/nhiet-ke',
    isActive: true,
    sortOrder: 3
  },
  {
    name: 'Dụng cụ sơ cứu',
    slug: 'dung-cu-so-cuu',
    description: 'Băng cá nhân, gạc, băng dính',
    parentId: null,
    level: 2,
    path: 'trang-thiet-bi-y-te/dung-cu-so-cuu',
    isActive: true,
    sortOrder: 4
  },
  {
    name: 'Máy xông mũi họng',
    slug: 'may-xong-mui-hong',
    description: 'Máy xông khí dung, máy tạo ẩm',
    parentId: null,
    level: 2,
    path: 'trang-thiet-bi-y-te/may-xong-mui-hong',
    isActive: true,
    sortOrder: 5
  },
  {
    name: 'Khẩu trang y tế',
    slug: 'khau-trang-y-te',
    description: 'Khẩu trang y tế, khẩu trang N95',
    parentId: null,
    level: 2,
    path: 'trang-thiet-bi-y-te/khau-trang-y-te',
    isActive: true,
    sortOrder: 6
  },
  {
    name: 'Dụng cụ massage',
    slug: 'dung-cu-massage',
    description: 'Máy massage, dụng cụ vật lý trị liệu',
    parentId: null,
    level: 2,
    path: 'trang-thiet-bi-y-te/dung-cu-massage',
    isActive: true,
    sortOrder: 7
  },
  {
    name: 'Thiết bị hỗ trợ vận động',
    slug: 'thiet-bi-ho-tro-van-dong',
    description: 'Nạng, xe lăn, khung tập đi',
    parentId: null,
    level: 2,
    path: 'trang-thiet-bi-y-te/thiet-bi-ho-tro-van-dong',
    isActive: true,
    sortOrder: 8
  }
]

// Seed brands - Thương hiệu dược phẩm Việt Nam
const brandsData = [
  {
    name: 'Jpanwell',
    slug: 'jpanwell',
    description: 'Thương hiệu thực phẩm chức năng Nhật Bản',
    logo: 'https://example.com/jpanwell-logo.png',
    country: 'Nhật Bản',
    isActive: true
  },
  {
    name: 'Ocavill',
    slug: 'ocavill',
    description: 'Thương hiệu vitamin và khoáng chất',
    logo: 'https://example.com/ocavill-logo.png',
    country: 'Việt Nam',
    isActive: true
  },
  {
    name: 'ErgoPharm',
    slug: 'ergopharm',
    description: 'Thương hiệu dược phẩm Việt Nam',
    logo: 'https://example.com/ergopharm-logo.png',
    country: 'Việt Nam',
    isActive: true
  },
  {
    name: 'Abbott',
    slug: 'abbott',
    description: 'Công ty chăm sóc sức khỏe toàn cầu',
    logo: 'https://example.com/abbott-logo.png',
    country: 'Mỹ',
    isActive: true
  },
  {
    name: 'Dược Hậu Giang',
    slug: 'duoc-hau-giang',
    description: 'Công ty dược phẩm Việt Nam',
    logo: 'https://example.com/duoc-hau-giang-logo.png',
    country: 'Việt Nam',
    isActive: true
  },
  {
    name: 'Traphaco',
    slug: 'traphaco',
    description: 'Tổng công ty dược Việt Nam',
    logo: 'https://example.com/traphaco-logo.png',
    country: 'Việt Nam',
    isActive: true
  },
  {
    name: 'DHG Pharma',
    slug: 'dhg-pharma',
    description: 'Công ty dược phẩm Hà Nội',
    logo: 'https://example.com/dhg-logo.png',
    country: 'Việt Nam',
    isActive: true
  },
  {
    name: 'Imexpharm',
    slug: 'imexpharm',
    description: 'Công ty dược phẩm Việt Nam',
    logo: 'https://example.com/imexpharm-logo.png',
    country: 'Việt Nam',
    isActive: true
  },
  {
    name: 'Pymepharco',
    slug: 'pymepharco',
    description: 'Công ty dược phẩm Việt Nam',
    logo: 'https://example.com/pymepharco-logo.png',
    country: 'Việt Nam',
    isActive: true
  },
  {
    name: 'Pharmedic',
    slug: 'pharmedic',
    description: 'Thương hiệu dược phẩm Việt Nam',
    logo: 'https://example.com/pharmedic-logo.png',
    country: 'Việt Nam',
    isActive: true
  },
  {
    name: 'Viên sủi Vit C',
    slug: 'vien-sui-vit-c',
    description: 'Vitamin C sủi bọt',
    logo: 'https://example.com/vien-sui-vit-c-logo.png',
    country: 'Việt Nam',
    isActive: true
  },
  {
    name: 'Olimp',
    slug: 'olimp',
    description: 'Thương hiệu thực phẩm bổ sung Ba Lan',
    logo: 'https://example.com/olimp-logo.png',
    country: 'Ba Lan',
    isActive: true
  },
  {
    name: 'Nature Made',
    slug: 'nature-made',
    description: 'Vitamin và khoáng chất tự nhiên',
    logo: 'https://example.com/nature-made-logo.png',
    country: 'Mỹ',
    isActive: true
  },
  {
    name: 'Blackmores',
    slug: 'blackmores',
    description: 'Thương hiệu vitamin Úc',
    logo: 'https://example.com/blackmores-logo.png',
    country: 'Úc',
    isActive: true
  },
  {
    name: 'Swisse',
    slug: 'swisse',
    description: 'Thương hiệu vitamin Úc',
    logo: 'https://example.com/swisse-logo.png',
    country: 'Úc',
    isActive: true
  }
]

// Seed products - Generate products for all categories
const generateProducts = () => {
  const productsData: Array<{
    name: string
    slug: string
    sku: string
    shortDescription: string
    categorySlug: string
    brandSlug: string
    stockQuantity: number
    maxOrderQuantity: number
    status: string
    isActive: boolean
    requiresPrescription: boolean
    featuredImage: string
    price: number
    dosageForm: string
    packSize: string
    manufacturer: string
    indications: string
    dosageInstructions: string
  }> = []
  const brandSlugs = brandsData.map((b) => b.slug)

  // Get all categories from database (will be populated after seeding categories)
  // For now, we'll use the categoriesData array to generate products

  // Base product templates for each category type - Sản phẩm thực tế từ Long Châu
  const productTemplates: Record<
    string,
    Array<{
      name: string
      shortDesc: string
      price: number
      dosageForm: string
      packSize: string
      indications: string
      dosageInstructions: string
    }>
  > = {
    // Thực phẩm chức năng
    'vitamin-khoang-chat': [
      {
        name: 'Viên uống Vitamin C 500mg {brand}',
        shortDesc: 'Vitamin C tăng cường miễn dịch, chống oxy hóa',
        price: 85000,
        dosageForm: 'tablet',
        packSize: '100 viên',
        indications: 'Tăng cường miễn dịch, chống oxy hóa',
        dosageInstructions: 'Uống 1 viên/ngày'
      },
      {
        name: 'Viên uống Canxi D3 500mg {brand}',
        shortDesc: 'Canxi và Vitamin D3 cho xương chắc khỏe',
        price: 120000,
        dosageForm: 'tablet',
        packSize: '90 viên',
        indications: 'Bổ sung canxi, vitamin D3 cho xương',
        dosageInstructions: 'Uống 1-2 viên/ngày'
      },
      {
        name: 'Viên uống Sắt 18mg {brand}',
        shortDesc: 'Bổ sung sắt chống thiếu máu',
        price: 95000,
        dosageForm: 'tablet',
        packSize: '60 viên',
        indications: 'Chống thiếu máu do thiếu sắt',
        dosageInstructions: 'Uống 1 viên/ngày'
      },
      {
        name: 'Viên uống Kẽm 15mg {brand}',
        shortDesc: 'Kẽm tăng cường miễn dịch và sinh sản',
        price: 78000,
        dosageForm: 'tablet',
        packSize: '60 viên',
        indications: 'Tăng cường miễn dịch, hỗ trợ sinh sản',
        dosageInstructions: 'Uống 1 viên/ngày'
      }
    ],
    'than-kinh-nao': [
      {
        name: 'Viên uống Bổ não {brand}',
        shortDesc: 'Cải thiện trí nhớ, tập trung',
        price: 150000,
        dosageForm: 'capsule',
        packSize: '60 viên',
        indications: 'Cải thiện trí nhớ, tập trung',
        dosageInstructions: 'Uống 2 viên/ngày'
      },
      {
        name: 'Viên uống Ginkgo Biloba {brand}',
        shortDesc: 'Tăng cường tuần hoàn máu não',
        price: 180000,
        dosageForm: 'tablet',
        packSize: '60 viên',
        indications: 'Tăng tuần hoàn máu não',
        dosageInstructions: 'Uống 1 viên/ngày'
      }
    ],
    'suc-khoe-tim-mach': [
      {
        name: 'Viên uống Omega 3 {brand}',
        shortDesc: 'Bảo vệ tim mạch, giảm cholesterol',
        price: 220000,
        dosageForm: 'capsule',
        packSize: '60 viên',
        indications: 'Bảo vệ tim mạch, giảm cholesterol',
        dosageInstructions: 'Uống 1-2 viên/ngày'
      },
      {
        name: 'Viên uống Coenzyme Q10 {brand}',
        shortDesc: 'Bổ tim, tăng cường năng lượng',
        price: 350000,
        dosageForm: 'capsule',
        packSize: '30 viên',
        indications: 'Bổ tim, tăng cường năng lượng',
        dosageInstructions: 'Uống 1 viên/ngày'
      }
    ],
    'tang-suc-de-khang-mien-dich': [
      {
        name: 'Viên uống Tăng đề kháng {brand}',
        shortDesc: 'Tăng cường hệ miễn dịch tự nhiên',
        price: 135000,
        dosageForm: 'tablet',
        packSize: '60 viên',
        indications: 'Tăng cường miễn dịch',
        dosageInstructions: 'Uống 2 viên/ngày'
      },
      {
        name: 'Viên uống Echinacea {brand}',
        shortDesc: 'Tăng cường đề kháng, chống cảm cúm',
        price: 165000,
        dosageForm: 'tablet',
        packSize: '60 viên',
        indications: 'Chống cảm cúm, tăng đề kháng',
        dosageInstructions: 'Uống 1 viên/ngày'
      }
    ],
    'ho-tro-tieu-hoa': [
      {
        name: 'Viên uống Men vi sinh {brand}',
        shortDesc: 'Cân bằng hệ vi sinh đường ruột',
        price: 195000,
        dosageForm: 'capsule',
        packSize: '30 viên',
        indications: 'Cải thiện tiêu hóa, cân bằng vi sinh',
        dosageInstructions: 'Uống 1 viên/ngày'
      },
      {
        name: 'Viên uống Tỏi đen {brand}',
        shortDesc: 'Hỗ trợ tiêu hóa, giảm cholesterol',
        price: 280000,
        dosageForm: 'tablet',
        packSize: '60 viên',
        indications: 'Hỗ trợ tiêu hóa, giảm cholesterol',
        dosageInstructions: 'Uống 1 viên/ngày'
      }
    ],
    'ho-tro-sinh-san': [
      {
        name: 'Viên uống Hỗ trợ sinh sản nam {brand}',
        shortDesc: 'Tăng cường sinh lực nam giới',
        price: 320000,
        dosageForm: 'capsule',
        packSize: '60 viên',
        indications: 'Hỗ trợ sinh sản nam',
        dosageInstructions: 'Uống 2 viên/ngày'
      },
      {
        name: 'Viên uống Hỗ trợ sinh sản nữ {brand}',
        shortDesc: 'Hỗ trợ thụ thai, cân bằng nội tiết',
        price: 280000,
        dosageForm: 'tablet',
        packSize: '60 viên',
        indications: 'Hỗ trợ sinh sản nữ',
        dosageInstructions: 'Uống 1 viên/ngày'
      }
    ],
    'giam-can': [
      {
        name: 'Viên uống Giảm cân {brand}',
        shortDesc: 'Hỗ trợ giảm cân, kiểm soát cân nặng',
        price: 250000,
        dosageForm: 'capsule',
        packSize: '60 viên',
        indications: 'Hỗ trợ giảm cân',
        dosageInstructions: 'Uống 2 viên/ngày'
      }
    ],
    'cham-soc-toc-da-mong': [
      {
        name: 'Viên uống Biotin {brand}',
        shortDesc: 'Biotin cho tóc, da, móng khỏe mạnh',
        price: 180000,
        dosageForm: 'tablet',
        packSize: '60 viên',
        indications: 'Chăm sóc tóc, da, móng',
        dosageInstructions: 'Uống 1 viên/ngày'
      },
      {
        name: 'Viên uống Collagen {brand}',
        shortDesc: 'Collagen cho da căng mịn, tóc chắc khỏe',
        price: 350000,
        dosageForm: 'capsule',
        packSize: '60 viên',
        indications: 'Chăm sóc da, tóc',
        dosageInstructions: 'Uống 2 viên/ngày'
      }
    ],

    // Dược mỹ phẩm
    'cham-soc-da-mat': [
      {
        name: 'Kem dưỡng da {brand}',
        shortDesc: 'Kem dưỡng ẩm cho da mặt',
        price: 250000,
        dosageForm: 'cream',
        packSize: '50ml',
        indications: 'Dưỡng ẩm da mặt',
        dosageInstructions: 'Thoa 2 lần/ngày'
      },
      {
        name: 'Sữa rửa mặt {brand}',
        shortDesc: 'Sữa rửa mặt dịu nhẹ',
        price: 180000,
        dosageForm: 'cleanser',
        packSize: '150ml',
        indications: 'Làm sạch da mặt',
        dosageInstructions: 'Rửa mặt 2 lần/ngày'
      }
    ],
    'trang-diem': [
      {
        name: 'Son môi {brand}',
        shortDesc: 'Son dưỡng môi màu tự nhiên',
        price: 150000,
        dosageForm: 'lipstick',
        packSize: '4g',
        indications: 'Trang điểm môi',
        dosageInstructions: 'Thoa trực tiếp lên môi'
      }
    ],
    'cham-soc-toc': [
      {
        name: 'Dầu gội {brand}',
        shortDesc: 'Dầu gội cho tóc khỏe mạnh',
        price: 220000,
        dosageForm: 'shampoo',
        packSize: '400ml',
        indications: 'Chăm sóc tóc',
        dosageInstructions: 'Gội đầu 2-3 lần/tuần'
      }
    ],
    'nuoc-hoa': [
      {
        name: 'Nước hoa {brand}',
        shortDesc: 'Nước hoa nam/nữ thời trang',
        price: 450000,
        dosageForm: 'perfume',
        packSize: '100ml',
        indications: 'Thơm cơ thể',
        dosageInstructions: 'Xịt lên da'
      }
    ],
    'duong-the': [
      {
        name: 'Kem dưỡng thể {brand}',
        shortDesc: 'Kem dưỡng ẩm cho toàn thân',
        price: 280000,
        dosageForm: 'lotion',
        packSize: '200ml',
        indications: 'Dưỡng ẩm da body',
        dosageInstructions: 'Thoa sau khi tắm'
      }
    ],
    'chong-nang': [
      {
        name: 'Kem chống nắng {brand}',
        shortDesc: 'Kem chống nắng SPF 50+',
        price: 320000,
        dosageForm: 'sunscreen',
        packSize: '50ml',
        indications: 'Bảo vệ da khỏi tia UV',
        dosageInstructions: 'Thoa trước khi ra nắng'
      }
    ],

    // Thuốc
    'thuoc-cam-cum': [
      {
        name: 'Thuốc cảm cúm Paracetamol {brand}',
        shortDesc: 'Giảm đau, hạ sốt, trị cảm cúm',
        price: 25000,
        dosageForm: 'tablet',
        packSize: '20 viên',
        indications: 'Giảm đau, hạ sốt, trị cảm cúm',
        dosageInstructions: 'Uống 1-2 viên/lần, 3-4 lần/ngày'
      },
      {
        name: 'Si rô ho trẻ em {brand}',
        shortDesc: 'Trị ho, long đờm cho trẻ em',
        price: 45000,
        dosageForm: 'syrup',
        packSize: '100ml',
        indications: 'Trị ho, long đờm trẻ em',
        dosageInstructions: 'Uống 5ml x 3 lần/ngày'
      }
    ],
    'thuoc-giam-dau': [
      {
        name: 'Thuốc giảm đau Ibuprofen {brand}',
        shortDesc: 'Giảm đau, chống viêm',
        price: 35000,
        dosageForm: 'tablet',
        packSize: '20 viên',
        indications: 'Giảm đau, chống viêm',
        dosageInstructions: 'Uống 1 viên/lần, 3 lần/ngày'
      }
    ],
    'thuoc-khang-sinh': [
      {
        name: 'Amoxicillin 500mg {brand}',
        shortDesc: 'Kháng sinh điều trị nhiễm trùng',
        price: 75000,
        dosageForm: 'capsule',
        packSize: '21 viên',
        indications: 'Điều trị nhiễm trùng đường hô hấp',
        dosageInstructions: 'Uống theo đơn bác sĩ'
      }
    ],
    'thuoc-huyet-ap': [
      {
        name: 'Thuốc hạ áp Amlodipine {brand}',
        shortDesc: 'Điều trị cao huyết áp',
        price: 60000,
        dosageForm: 'tablet',
        packSize: '30 viên',
        indications: 'Điều trị cao huyết áp',
        dosageInstructions: 'Uống 1 viên/ngày'
      }
    ],
    'thuoc-tieu-duong': [
      {
        name: 'Thuốc tiểu đường Metformin {brand}',
        shortDesc: 'Điều trị đái tháo đường type 2',
        price: 45000,
        dosageForm: 'tablet',
        packSize: '30 viên',
        indications: 'Kiểm soát đường huyết',
        dosageInstructions: 'Uống theo đơn bác sĩ'
      }
    ],
    'thuoc-tieu-hoa': [
      {
        name: 'Thuốc dạ dày Omeprazole {brand}',
        shortDesc: 'Điều trị trào ngược dạ dày',
        price: 85000,
        dosageForm: 'capsule',
        packSize: '30 viên',
        indications: 'Điều trị trào ngược dạ dày',
        dosageInstructions: 'Uống 1 viên/ngày'
      }
    ],
    'thuoc-da-lieu': [
      {
        name: 'Thuốc trị mụn Acne {brand}',
        shortDesc: 'Điều trị mụn trứng cá',
        price: 120000,
        dosageForm: 'gel',
        packSize: '15g',
        indications: 'Điều trị mụn',
        dosageInstructions: 'Thoa 2 lần/ngày'
      }
    ],
    'thuoc-mat': [
      {
        name: 'Thuốc nhỏ mắt {brand}',
        shortDesc: 'Thuốc nhỏ mắt giảm mỏi mắt',
        price: 55000,
        dosageForm: 'eye drops',
        packSize: '10ml',
        indications: 'Giảm mỏi mắt, khô mắt',
        dosageInstructions: 'Nhỏ 1-2 giọt/lần'
      }
    ],

    // Chăm sóc cá nhân
    've-sinh-ca-nhan': [
      {
        name: 'Băng vệ sinh {brand}',
        shortDesc: 'Băng vệ sinh hàng ngày',
        price: 65000,
        dosageForm: 'sanitary pads',
        packSize: '20 miếng',
        indications: 'Vệ sinh phụ nữ',
        dosageInstructions: 'Thay băng 4-6 giờ/lần'
      }
    ],
    'cham-soc-rang-mieng': [
      {
        name: 'Bàn chải đánh răng {brand}',
        shortDesc: 'Bàn chải đánh răng điện tử',
        price: 350000,
        dosageForm: 'toothbrush',
        packSize: '1 cái',
        indications: 'Chăm sóc răng miệng',
        dosageInstructions: 'Đánh răng 2 lần/ngày'
      },
      {
        name: 'Kem đánh răng {brand}',
        shortDesc: 'Kem đánh răng chống sâu răng',
        price: 45000,
        dosageForm: 'toothpaste',
        packSize: '150g',
        indications: 'Chăm sóc răng miệng',
        dosageInstructions: 'Đánh răng 2 lần/ngày'
      }
    ],
    'dau-goi-xa': [
      {
        name: 'Dầu gội {brand}',
        shortDesc: 'Dầu gội cho tóc khỏe mạnh',
        price: 220000,
        dosageForm: 'shampoo',
        packSize: '400ml',
        indications: 'Chăm sóc tóc',
        dosageInstructions: 'Gội đầu 2-3 lần/tuần'
      }
    ],
    'sua-tam': [
      {
        name: 'Sữa tắm {brand}',
        shortDesc: 'Sữa tắm cho da nhạy cảm',
        price: 180000,
        dosageForm: 'body wash',
        packSize: '500ml',
        indications: 'Tắm rửa cơ thể',
        dosageInstructions: 'Tắm 1 lần/ngày'
      }
    ],
    'khu-mui': [
      {
        name: 'Lăn khử mùi {brand}',
        shortDesc: 'Lăn khử mùi 48h',
        price: 95000,
        dosageForm: 'deodorant',
        packSize: '50ml',
        indications: 'Khử mùi cơ thể',
        dosageInstructions: 'Thoa sau khi tắm'
      }
    ],

    // Trang thiết bị y tế
    'may-do-huyet-ap': [
      {
        name: 'Máy đo huyết áp điện tử {brand}',
        shortDesc: 'Máy đo huyết áp tự động',
        price: 850000,
        dosageForm: 'device',
        packSize: '1 máy',
        indications: 'Đo huyết áp',
        dosageInstructions: 'Đo theo hướng dẫn'
      }
    ],
    'may-do-duong-huyet': [
      {
        name: 'Máy đo đường huyết {brand}',
        shortDesc: 'Máy đo đường huyết điện tử',
        price: 650000,
        dosageForm: 'device',
        packSize: '1 máy',
        indications: 'Đo đường huyết',
        dosageInstructions: 'Đo theo hướng dẫn'
      },
      {
        name: 'Que thử đường huyết {brand}',
        shortDesc: 'Que thử đường huyết',
        price: 180000,
        dosageForm: 'strips',
        packSize: '50 que',
        indications: 'Đo đường huyết',
        dosageInstructions: 'Sử dụng với máy đo'
      }
    ],
    'nhiet-ke': [
      {
        name: 'Nhiệt kế điện tử {brand}',
        shortDesc: 'Nhiệt kế điện tử đo trán',
        price: 250000,
        dosageForm: 'thermometer',
        packSize: '1 cái',
        indications: 'Đo thân nhiệt',
        dosageInstructions: 'Đo trán hoặc nách'
      }
    ],
    'dung-cu-so-cuu': [
      {
        name: 'Băng cá nhân {brand}',
        shortDesc: 'Băng cá nhân y tế',
        price: 15000,
        dosageForm: 'bandage',
        packSize: '1 cuộn',
        indications: 'Băng bó vết thương',
        dosageInstructions: 'Quấn quanh vết thương'
      }
    ],
    'khau-trang-y-te': [
      {
        name: 'Khẩu trang y tế {brand}',
        shortDesc: 'Khẩu trang y tế 4 lớp',
        price: 35000,
        dosageForm: 'mask',
        packSize: '50 cái',
        indications: 'Bảo vệ đường hô hấp',
        dosageInstructions: 'Đeo khi ra ngoài'
      }
    ]
  }

  let productId = 1
  // Get all subcategories (level 2)
  const subCategories = categoriesData.filter((cat) => cat.level === 2)

  subCategories.forEach((category) => {
    const templates = productTemplates[category.slug] || []
    if (templates.length === 0) {
      // Default template for categories without specific templates
      templates.push({
        name: 'Sản phẩm {category} {brand}',
        shortDesc: 'Sản phẩm chất lượng cao',
        price: 100000,
        dosageForm: 'general',
        packSize: '1 sản phẩm',
        indications: 'Sử dụng theo hướng dẫn',
        dosageInstructions: 'Theo hướng dẫn'
      })
    }

    // Create 2-4 products per category per brand
    brandSlugs.slice(0, 3).forEach((brandSlug) => {
      // Use only first 3 brands to avoid too many products
      templates.forEach((template) => {
        if (productsData.length >= 500) return // Limit to 500 products total

        const brand = brandsData.find((b) => b.slug === brandSlug)
        const categoryName = category.name

        const name = template.name.replace('{brand}', brand?.name || brandSlug).replace('{category}', categoryName)

        const slug = `${category.slug}-${brandSlug}-${productId}`.toLowerCase().replace(/\s+/g, '-')
        const sku = `${brandSlug.toUpperCase()}-${category.slug.toUpperCase()}-${productId.toString().padStart(3, '0')}`

        productsData.push({
          name,
          slug,
          sku,
          shortDescription: template.shortDesc,
          categorySlug: category.slug,
          brandSlug,
          stockQuantity: Math.floor(Math.random() * 200) + 50,
          maxOrderQuantity: Math.floor(Math.random() * 10) + 5,
          status: 'active',
          isActive: true,
          requiresPrescription: ['thuoc-khang-sinh', 'thuoc-huyet-ap', 'thuoc-tieu-duong', 'thuoc-tim-mach'].includes(
            category.slug
          ),
          featuredImage: `https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=600&h=600&fit=crop&crop=center&q=80`,
          price: template.price + Math.floor(Math.random() * 20000),
          dosageForm: template.dosageForm,
          packSize: template.packSize,
          manufacturer: brand?.name || 'Various',
          indications: template.indications,
          dosageInstructions: template.dosageInstructions
        })
        productId++
      })
    })
  })

  return productsData
}

const productsData = generateProducts()

async function seedDatabase() {
  try {
    await databaseService.connect()

    // Clear existing data
    try {
      await databaseService.categories.deleteMany({})
      console.log('Cleared categories')
    } catch {
      console.log('Categories collection might not exist, skipping delete')
    }

    try {
      await databaseService.brands.deleteMany({})
      console.log('Cleared brands')
    } catch {
      console.log('Brands collection might not exist, skipping delete')
    }

    try {
      await databaseService.products.deleteMany({})
      console.log('Cleared products')
    } catch {
      console.log('Products collection might not exist, skipping delete')
    }

    try {
      await databaseService.productMedia.deleteMany({})
      console.log('Cleared product media')
    } catch {
      console.log('Product media collection might not exist, skipping delete')
    }

    // Insert categories with proper hierarchy
    const insertedCategories = []

    // First, insert level 1 categories
    const level1Categories = categoriesData.filter((cat) => cat.level === 1)
    for (const cat of level1Categories) {
      const category = new Category({
        name: cat.name,
        slug: cat.slug,
        description: cat.description,
        isActive: cat.isActive,
        level: cat.level,
        path: cat.path,
        productCount: 0,
        sortOrder: cat.sortOrder
      })
      const result = await databaseService.categories.insertOne(category)
      insertedCategories.push({ ...category, _id: result.insertedId })
    }

    // Then, insert level 2 categories with parentId
    const level2Categories = categoriesData.filter((cat) => cat.level === 2)
    for (const cat of level2Categories) {
      // Find parent category based on path prefix
      const parentPath = cat.path.split('/').slice(0, -1).join('/')
      const parent: Category | undefined = insertedCategories.find((c) => c.path === parentPath)

      if (!parent) {
        console.log(`Parent not found for category ${cat.name}`)
        continue
      }

      const category: Category = new Category({
        name: cat.name,
        slug: cat.slug,
        description: cat.description,
        parentId: parent._id,
        isActive: cat.isActive,
        level: cat.level,
        path: cat.path,
        productCount: 0,
        sortOrder: cat.sortOrder
      })
      const result = await databaseService.categories.insertOne(category)
      insertedCategories.push({ ...category, _id: result.insertedId })
    }

    console.log('Inserted categories:', insertedCategories.length)

    // Insert brands
    const insertedBrands = []
    for (const br of brandsData) {
      const brand = new Brand({
        name: br.name,
        slug: br.slug,
        description: br.description,
        logo: br.logo,
        country: br.country,
        isActive: br.isActive,
        productCount: 0
      })
      const result = await databaseService.brands.insertOne(brand)
      insertedBrands.push({ ...brand, _id: result.insertedId })
    }
    console.log('Inserted brands:', insertedBrands.length)

    // Insert products
    const insertedProducts = []
    for (const prod of productsData) {
      const category = insertedCategories.find((c) => c.slug === prod.categorySlug)
      const brand = insertedBrands.find((b) => b.slug === prod.brandSlug)

      if (!category || !brand) {
        console.log(`Skipping product ${prod.name}: category or brand not found`)
        continue
      }

      const product = new Product({
        name: prod.name,
        slug: prod.slug,
        sku: prod.sku,
        shortDescription: prod.shortDescription,
        categoryId: category._id,
        brandId: brand._id,
        price: prod.price,
        stockQuantity: prod.stockQuantity,
        maxOrderQuantity: prod.maxOrderQuantity,
        status: prod.status,
        isActive: prod.isActive,
        requiresPrescription: prod.requiresPrescription,
        featuredImage: prod.featuredImage,
        createdBy: new ObjectId() // Placeholder
      })

      const result = await databaseService.products.insertOne(product)
      insertedProducts.push({ ...product, _id: result.insertedId })
    }
    console.log('Inserted products:', insertedProducts.length)

    // Debug: Check first few products and their categories
    console.log('Checking first few products and their categories...')
    for (let i = 0; i < 5; i++) {
      const product = insertedProducts[i]
      const category = await databaseService.categories.findOne({ _id: product.categoryId })
      console.log(
        `Product ${product.name}: categoryId ${product.categoryId}, category found: ${!!category}, category name: ${category?.name}`
      )
    }

    // Update productCount for categories
    console.log('Updating productCount for categories...')
    for (const category of insertedCategories) {
      const productCount = insertedProducts.filter((p) => p.categoryId.toString() === category._id.toString()).length
      await databaseService.categories.updateOne({ _id: category._id }, { $set: { productCount } })
    }

    // Update insertedCategories with the new productCount
    for (const category of insertedCategories) {
      const dbCategory = await databaseService.categories.findOne({ _id: category._id })
      category.productCount = dbCategory?.productCount || 0
    }

    // Aggregate productCount for parent categories
    console.log('Aggregating productCount for parent categories...')
    const categoriesMap = new Map(insertedCategories.map((c) => [c._id.toString(), c]))

    // Sort by level descending to update parents after children
    const sortedCategories = insertedCategories.sort((a, b) => b.level - a.level)

    for (const category of sortedCategories) {
      if (category.parentId) {
        const parent = categoriesMap.get(category.parentId.toString())
        console.log(
          `Processing ${category.name} (level ${category.level}), parentId: ${category.parentId}, parent found: ${!!parent}, parent name: ${parent?.name}`
        )
        if (parent) {
          const currentCount = parent.productCount || 0
          const childCount = category.productCount || 0
          console.log(`Updating parent ${parent.name} from ${currentCount} to ${currentCount + childCount}`)
          await databaseService.categories.updateOne(
            { _id: parent._id },
            { $set: { productCount: currentCount + childCount } }
          )
          // Update the map
          parent.productCount = currentCount + childCount
        }
      }
    }

    console.log('Updated productCount for all categories')

    // Debug: Check final productCount for level 1 categories
    console.log('Checking final productCount for level 1 categories...')
    for (const category of insertedCategories.filter((c) => c.level === 1)) {
      const cat = await databaseService.categories.findOne({ _id: category._id })
      console.log(`${category.name}: ${cat?.productCount}`)
    }

    console.log('Checking productCount for level 2 categories...')
    for (const category of insertedCategories.filter((c) => c.level === 2)) {
      const cat = await databaseService.categories.findOne({ _id: category._id })
      console.log(`${category.name}: ${cat?.productCount}`)
    }

    // Update productCount for brands
    console.log('Updating productCount for brands...')
    for (const brand of insertedBrands) {
      const productCount = insertedProducts.filter(
        (p) => p.brandId && p.brandId.toString() === brand._id.toString()
      ).length
      await databaseService.brands.updateOne({ _id: brand._id }, { $set: { productCount } })
    }
    console.log('Updated productCount for all brands')

    // Insert product media
    for (const product of insertedProducts) {
      // Generate realistic image URLs based on product type
      const images = []
      // Main product image
      images.push({
        url: `https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=400&h=400&fit=crop&crop=center&q=80`,
        alt: `${product.name} - Hình ảnh chính`,
        type: 'main' as const,
        sortOrder: 1
      })

      // Gallery images (2-3 additional images)
      const galleryUrls = [
        `https://images.unsplash.com/photo-1559757148-5c350d0d3c56?w=400&h=400&fit=crop&crop=center&q=80`,
        `https://images.unsplash.com/photo-1587854692152-cbe660dbde88?w=400&h=400&fit=crop&crop=center&q=80`,
        `https://images.unsplash.com/photo-1550572017-edd951aa8ca9?w=400&h=400&fit=crop&crop=center&q=80`
      ]

      galleryUrls.slice(0, Math.floor(Math.random() * 3) + 1).forEach((url, index) => {
        images.push({
          url,
          alt: `${product.name} - Hình ảnh ${index + 2}`,
          type: 'gallery' as const,
          sortOrder: index + 2
        })
      })

      // Packaging image
      if (Math.random() > 0.5) {
        images.push({
          url: `https://images.unsplash.com/photo-1594736797933-d0401ba2fe65?w=400&h=400&fit=crop&crop=center&q=80`,
          alt: `${product.name} - Hình ảnh bao bì`,
          type: 'packaging' as const,
          sortOrder: images.length + 1
        })
      }

      const productMedia = new ProductMedia({
        productId: product._id,
        images,
        videos: [],
        documents: []
      })

      await databaseService.productMedia.insertOne(productMedia)
    }
    console.log('Inserted product media')

    console.log('Seeding completed successfully!')
  } catch (error) {
    console.error('Seeding failed:', error)
  } finally {
    process.exit(0)
  }
}

seedDatabase()
