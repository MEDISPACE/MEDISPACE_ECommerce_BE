import databaseService from './services/database.services'
import Category from './models/schemas/Category.schema'
import Brand from './models/schemas/Brand.schema'
import Product from './models/schemas/Product.schema'
import { ObjectId } from 'mongodb'

// Seed categories
const categoriesData = [
  {
    name: 'Thuốc cảm cúm',
    slug: 'thuoc-cam-cum',
    description: 'Các loại thuốc điều trị cảm cúm, ho, sốt',
    isActive: true
  },
  {
    name: 'Thuốc đau đầu',
    slug: 'thuoc-dau-dau',
    description: 'Thuốc giảm đau đầu, migraine',
    isActive: true
  },
  {
    name: 'Vitamin & Khoáng chất',
    slug: 'vitamin-khoang-chat',
    description: 'Vitamin tổng hợp, canxi, sắt',
    isActive: true
  },
  {
    name: 'Thuốc tiêu hóa',
    slug: 'thuoc-tieu-hoa',
    description: 'Thuốc trị đau bụng, đầy hơi, tiêu chảy',
    isActive: true
  },
  {
    name: 'Thuốc da liễu',
    slug: 'thuoc-da-lieu',
    description: 'Thuốc trị mụn, nấm da, dị ứng',
    isActive: true
  },
  {
    name: 'Thuốc hạ sốt',
    slug: 'thuoc-ha-sot',
    description: 'Thuốc hạ sốt cho trẻ em và người lớn',
    isActive: true
  },
  {
    name: 'Thuốc kháng sinh',
    slug: 'thuoc-khang-sinh',
    description: 'Thuốc kháng sinh điều trị nhiễm trùng',
    isActive: true
  },
  {
    name: 'Thuốc tim mạch',
    slug: 'thuoc-tim-mach',
    description: 'Thuốc điều trị bệnh tim mạch, huyết áp',
    isActive: true
  },
  {
    name: 'Thuốc tiểu đường',
    slug: 'thuoc-tieu-duong',
    description: 'Thuốc điều trị đái tháo đường',
    isActive: true
  },
  {
    name: 'Thuốc huyết áp',
    slug: 'thuoc-huyet-ap',
    description: 'Thuốc điều trị cao huyết áp',
    isActive: true
  },
  {
    name: 'Thuốc giảm cân',
    slug: 'thuoc-giam-can',
    description: 'Thuốc hỗ trợ giảm cân',
    isActive: true
  },
  {
    name: 'Thuốc bổ mắt',
    slug: 'thuoc-bo-mat',
    description: 'Vitamin và thuốc bổ mắt',
    isActive: true
  },
  {
    name: 'Thuốc bổ gan',
    slug: 'thuoc-bo-gan',
    description: 'Thuốc bảo vệ và bổ gan',
    isActive: true
  },
  {
    name: 'Thuốc bổ thận',
    slug: 'thuoc-bo-than',
    description: 'Thuốc bổ thận, điều trị thận yếu',
    isActive: true
  },
  {
    name: 'Thuốc chống dị ứng',
    slug: 'thuoc-chong-di-ung',
    description: 'Thuốc trị dị ứng, mề đay',
    isActive: true
  },
  {
    name: 'Thuốc trị ho',
    slug: 'thuoc-tri-ho',
    description: 'Thuốc long đờm, trị ho',
    isActive: true
  },
  {
    name: 'Thuốc an thần',
    slug: 'thuoc-an-than',
    description: 'Thuốc an thần, giảm stress',
    isActive: true
  },
  {
    name: 'Thuốc bổ máu',
    slug: 'thuoc-bo-mau',
    description: 'Thuốc bổ máu, tăng hồng cầu',
    isActive: true
  },
  {
    name: 'Thuốc chống đông máu',
    slug: 'thuoc-chong-dong-mau',
    description: 'Thuốc chống đông máu, ngừa đột quỵ',
    isActive: true
  },
  {
    name: 'Thuốc giảm đau khớp',
    slug: 'thuoc-giam-dau-khop',
    description: 'Thuốc giảm đau khớp, viêm khớp',
    isActive: true
  }
]

// Seed brands
const brandsData = [
  {
    name: 'Panadol',
    slug: 'panadol',
    description: 'Thương hiệu thuốc giảm đau nổi tiếng',
    logo: 'https://example.com/panadol-logo.png',
    country: 'Úc',
    isActive: true
  },
  {
    name: 'Efferalgan',
    slug: 'efferalgan',
    description: 'Thuốc hạ sốt và giảm đau',
    logo: 'https://example.com/efferalgan-logo.png',
    country: 'Pháp',
    isActive: true
  },
  {
    name: 'Blackmores',
    slug: 'blackmores',
    description: 'Thương hiệu vitamin và thực phẩm bổ sung',
    logo: 'https://example.com/blackmores-logo.png',
    country: 'Úc',
    isActive: true
  },
  {
    name: 'Otrivin',
    slug: 'otrivin',
    description: 'Thuốc trị nghẹt mũi',
    logo: 'https://example.com/otrivin-logo.png',
    country: 'Thụy Sĩ',
    isActive: true
  },
  {
    name: 'Pfizer',
    slug: 'pfizer',
    description: 'Công ty dược phẩm hàng đầu thế giới',
    logo: 'https://example.com/pfizer-logo.png',
    country: 'Mỹ',
    isActive: true
  },
  {
    name: 'Johnson & Johnson',
    slug: 'johnson-johnson',
    description: 'Thương hiệu chăm sóc sức khỏe toàn cầu',
    logo: 'https://example.com/jnj-logo.png',
    country: 'Mỹ',
    isActive: true
  },
  {
    name: 'Bayer',
    slug: 'bayer',
    description: 'Công ty dược phẩm Đức',
    logo: 'https://example.com/bayer-logo.png',
    country: 'Đức',
    isActive: true
  },
  {
    name: 'Roche',
    slug: 'roche',
    description: 'Công ty dược phẩm Thụy Sĩ',
    logo: 'https://example.com/roche-logo.png',
    country: 'Thụy Sĩ',
    isActive: true
  },
  {
    name: 'Merck',
    slug: 'merck',
    description: 'Công ty dược phẩm Mỹ',
    logo: 'https://example.com/merck-logo.png',
    country: 'Mỹ',
    isActive: true
  },
  {
    name: 'Novartis',
    slug: 'novartis',
    description: 'Công ty dược phẩm Thụy Sĩ',
    logo: 'https://example.com/novartis-logo.png',
    country: 'Thụy Sĩ',
    isActive: true
  },
  {
    name: 'Sanofi',
    slug: 'sanofi',
    description: 'Công ty dược phẩm Pháp',
    logo: 'https://example.com/sanofi-logo.png',
    country: 'Pháp',
    isActive: true
  },
  {
    name: 'GSK',
    slug: 'gsk',
    description: 'GlaxoSmithKline - công ty dược phẩm Anh',
    logo: 'https://example.com/gsk-logo.png',
    country: 'Anh',
    isActive: true
  },
  {
    name: 'Abbott',
    slug: 'abbott',
    description: 'Công ty chăm sóc sức khỏe Mỹ',
    logo: 'https://example.com/abbott-logo.png',
    country: 'Mỹ',
    isActive: true
  },
  {
    name: 'AstraZeneca',
    slug: 'astrazeneca',
    description: 'Công ty dược phẩm Anh-Thụy Điển',
    logo: 'https://example.com/astrazeneca-logo.png',
    country: 'Anh',
    isActive: true
  },
  {
    name: 'Boehringer Ingelheim',
    slug: 'boehringer-ingelheim',
    description: 'Công ty dược phẩm Đức',
    logo: 'https://example.com/boehringer-logo.png',
    country: 'Đức',
    isActive: true
  }
]

// Seed products - Generate 100 products
const generateProducts = () => {
  const productsData: any[] = []
  const categorySlugs = categoriesData.map((c) => c.slug)
  const brandSlugs = brandsData.map((b) => b.slug)

  // Base product templates for each category
  const productTemplates: Record<string, Array<{
    name: string
    shortDesc: string
    price: number
    dosageForm: string
    packSize: string
    indications: string
    dosageInstructions: string
  }>> = {
    'thuoc-cam-cum': [
      {
        name: 'Thuốc cảm cúm {brand}',
        shortDesc: 'Thuốc điều trị cảm cúm hiệu quả',
        price: 35000,
        dosageForm: 'tablet',
        packSize: '20 viên',
        indications: 'Giảm triệu chứng cảm cúm',
        dosageInstructions: 'Uống 1 viên/ngày'
      },
      {
        name: 'Si rô cảm cúm {brand}',
        shortDesc: 'Si rô trị ho, sổ mũi',
        price: 45000,
        dosageForm: 'syrup',
        packSize: '100ml',
        indications: 'Trị ho, sổ mũi',
        dosageInstructions: 'Uống 5ml x 3 lần/ngày'
      },
      {
        name: 'Thuốc xịt mũi {brand}',
        shortDesc: 'Xịt mũi giảm nghẹt mũi',
        price: 55000,
        dosageForm: 'spray',
        packSize: '15ml',
        indications: 'Giảm nghẹt mũi',
        dosageInstructions: 'Xịt 2 lần mỗi bên'
      }
    ],
    'thuoc-dau-dau': [
      {
        name: 'Thuốc giảm đau {brand}',
        shortDesc: 'Giảm đau đầu nhanh',
        price: 25000,
        dosageForm: 'tablet',
        packSize: '20 viên',
        indications: 'Giảm đau đầu',
        dosageInstructions: 'Uống 1 viên khi đau'
      },
      {
        name: 'Thuốc migraine {brand}',
        shortDesc: 'Điều trị migraine',
        price: 65000,
        dosageForm: 'tablet',
        packSize: '10 viên',
        indications: 'Điều trị migraine',
        dosageInstructions: 'Uống theo hướng dẫn bác sĩ'
      }
    ],
    'vitamin-khoang-chat': [
      {
        name: 'Vitamin C {brand}',
        shortDesc: 'Vitamin C tăng cường miễn dịch',
        price: 30000,
        dosageForm: 'tablet',
        packSize: '60 viên',
        indications: 'Tăng cường miễn dịch',
        dosageInstructions: 'Uống 1 viên/ngày'
      },
      {
        name: 'Canxi {brand}',
        shortDesc: 'Bổ sung canxi cho xương',
        price: 40000,
        dosageForm: 'tablet',
        packSize: '90 viên',
        indications: 'Bổ sung canxi',
        dosageInstructions: 'Uống 2 viên/ngày'
      },
      {
        name: 'Sắt {brand}',
        shortDesc: 'Bổ sung sắt chống thiếu máu',
        price: 35000,
        dosageForm: 'tablet',
        packSize: '30 viên',
        indications: 'Chống thiếu máu',
        dosageInstructions: 'Uống 1 viên/ngày'
      }
    ],
    'thuoc-tieu-hoa': [
      {
        name: 'Thuốc trị tiêu chảy {brand}',
        shortDesc: 'Điều trị tiêu chảy cấp',
        price: 20000,
        dosageForm: 'powder',
        packSize: '20 gói',
        indications: 'Trị tiêu chảy',
        dosageInstructions: 'Hòa tan uống 3 gói/ngày'
      },
      {
        name: 'Thuốc đầy bụng {brand}',
        shortDesc: 'Giảm đầy bụng, chướng hơi',
        price: 25000,
        dosageForm: 'capsule',
        packSize: '30 viên',
        indications: 'Giảm đầy bụng',
        dosageInstructions: 'Uống 1 viên sau ăn'
      }
    ],
    'thuoc-da-lieu': [
      {
        name: 'Kem trị mụn {brand}',
        shortDesc: 'Kem dưỡng trị mụn',
        price: 50000,
        dosageForm: 'cream',
        packSize: '50g',
        indications: 'Trị mụn',
        dosageInstructions: 'Thoa 2 lần/ngày'
      },
      {
        name: 'Thuốc nấm da {brand}',
        shortDesc: 'Điều trị nấm da',
        price: 45000,
        dosageForm: 'cream',
        packSize: '30g',
        indications: 'Trị nấm da',
        dosageInstructions: 'Thoa vùng da bị'
      }
    ],
    'thuoc-ha-sot': [
      {
        name: 'Thuốc hạ sốt {brand}',
        shortDesc: 'Hạ sốt nhanh',
        price: 18000,
        dosageForm: 'tablet',
        packSize: '20 viên',
        indications: 'Hạ sốt',
        dosageInstructions: 'Uống 1 viên mỗi 4 giờ'
      },
      {
        name: 'Si rô hạ sốt {brand}',
        shortDesc: 'Si rô hạ sốt cho trẻ',
        price: 28000,
        dosageForm: 'syrup',
        packSize: '60ml',
        indications: 'Hạ sốt trẻ em',
        dosageInstructions: 'Uống theo tuổi'
      }
    ],
    'thuoc-khang-sinh': [
      {
        name: 'Amoxicillin {brand}',
        shortDesc: 'Kháng sinh phổ rộng',
        price: 75000,
        dosageForm: 'capsule',
        packSize: '21 viên',
        indications: 'Điều trị nhiễm trùng',
        dosageInstructions: 'Uống theo đơn bác sĩ'
      },
      {
        name: 'Azithromycin {brand}',
        shortDesc: 'Kháng sinh điều trị nhiễm trùng',
        price: 85000,
        dosageForm: 'tablet',
        packSize: '6 viên',
        indications: 'Nhiễm trùng đường hô hấp',
        dosageInstructions: 'Uống 1 viên/ngày x 3 ngày'
      }
    ],
    'thuoc-tim-mach': [
      {
        name: 'Thuốc huyết áp {brand}',
        shortDesc: 'Điều trị cao huyết áp',
        price: 60000,
        dosageForm: 'tablet',
        packSize: '30 viên',
        indications: 'Hạ huyết áp',
        dosageInstructions: 'Uống 1 viên/ngày'
      },
      {
        name: 'Thuốc tim mạch {brand}',
        shortDesc: 'Bảo vệ tim mạch',
        price: 95000,
        dosageForm: 'tablet',
        packSize: '28 viên',
        indications: 'Bảo vệ tim mạch',
        dosageInstructions: 'Uống 1 viên/ngày'
      }
    ],
    'thuoc-tieu-duong': [
      {
        name: 'Thuốc tiểu đường {brand}',
        shortDesc: 'Điều trị đái tháo đường type 2',
        price: 120000,
        dosageForm: 'tablet',
        packSize: '30 viên',
        indications: 'Kiểm soát đường huyết',
        dosageInstructions: 'Uống theo đơn bác sĩ'
      }
    ],
    'thuoc-huyet-ap': [
      {
        name: 'Thuốc hạ áp {brand}',
        shortDesc: 'Điều trị cao huyết áp',
        price: 55000,
        dosageForm: 'tablet',
        packSize: '30 viên',
        indications: 'Hạ huyết áp',
        dosageInstructions: 'Uống 1 viên/ngày'
      }
    ],
    'thuoc-giam-can': [
      {
        name: 'Thuốc giảm cân {brand}',
        shortDesc: 'Hỗ trợ giảm cân',
        price: 80000,
        dosageForm: 'capsule',
        packSize: '60 viên',
        indications: 'Giảm cân',
        dosageInstructions: 'Uống 1 viên/ngày'
      }
    ],
    'thuoc-bo-mat': [
      {
        name: 'Vitamin mắt {brand}',
        shortDesc: 'Bổ mắt, cải thiện thị lực',
        price: 45000,
        dosageForm: 'tablet',
        packSize: '60 viên',
        indications: 'Bổ mắt',
        dosageInstructions: 'Uống 1 viên/ngày'
      }
    ],
    'thuoc-bo-gan': [
      {
        name: 'Thuốc bổ gan {brand}',
        shortDesc: 'Bảo vệ gan',
        price: 65000,
        dosageForm: 'tablet',
        packSize: '60 viên',
        indications: 'Bảo vệ gan',
        dosageInstructions: 'Uống 2 viên/ngày'
      }
    ],
    'thuoc-bo-than': [
      {
        name: 'Thuốc bổ thận {brand}',
        shortDesc: 'Bổ thận, tăng cường chức năng thận',
        price: 70000,
        dosageForm: 'capsule',
        packSize: '60 viên',
        indications: 'Bổ thận',
        dosageInstructions: 'Uống 1 viên/ngày'
      }
    ],
    'thuoc-chong-di-ung': [
      {
        name: 'Thuốc dị ứng {brand}',
        shortDesc: 'Điều trị dị ứng',
        price: 35000,
        dosageForm: 'tablet',
        packSize: '10 viên',
        indications: 'Trị dị ứng',
        dosageInstructions: 'Uống 1 viên/ngày'
      }
    ],
    'thuoc-tri-ho': [
      {
        name: 'Thuốc long đờm {brand}',
        shortDesc: 'Long đờm, trị ho',
        price: 30000,
        dosageForm: 'syrup',
        packSize: '120ml',
        indications: 'Trị ho có đờm',
        dosageInstructions: 'Uống 10ml x 3 lần/ngày'
      }
    ],
    'thuoc-an-than': [
      {
        name: 'Thuốc an thần {brand}',
        shortDesc: 'Giảm stress, an thần',
        price: 40000,
        dosageForm: 'tablet',
        packSize: '30 viên',
        indications: 'An thần',
        dosageInstructions: 'Uống 1 viên/ngày'
      }
    ],
    'thuoc-bo-mau': [
      {
        name: 'Thuốc bổ máu {brand}',
        shortDesc: 'Tăng hồng cầu',
        price: 55000,
        dosageForm: 'tablet',
        packSize: '30 viên',
        indications: 'Bổ máu',
        dosageInstructions: 'Uống 1 viên/ngày'
      }
    ],
    'thuoc-chong-dong-mau': [
      {
        name: 'Thuốc chống đông {brand}',
        shortDesc: 'Ngừa đông máu',
        price: 85000,
        dosageForm: 'tablet',
        packSize: '30 viên',
        indications: 'Ngừa đột quỵ',
        dosageInstructions: 'Uống theo đơn bác sĩ'
      }
    ],
    'thuoc-giam-dau-khop': [
      {
        name: 'Thuốc khớp {brand}',
        shortDesc: 'Giảm đau khớp',
        price: 60000,
        dosageForm: 'tablet',
        packSize: '30 viên',
        indications: 'Giảm đau khớp',
        dosageInstructions: 'Uống 1 viên/ngày'
      }
    ]
  }

  let productId = 1
  categorySlugs.forEach((categorySlug) => {
    const templates = productTemplates[categorySlug] || []
    brandSlugs.forEach((brandSlug) => {
      const brand = brandsData.find((b) => b.slug === brandSlug)
      templates.forEach((template) => {
        if (productsData.length >= 100) return
        const name = template.name.replace('{brand}', brand?.name || brandSlug)
        const slug = `${categorySlug}-${brandSlug}-${productId}`.toLowerCase().replace(/\s+/g, '-')
        const sku = `${brandSlug.toUpperCase()}-${productId.toString().padStart(3, '0')}`
        productsData.push({
          name,
          slug,
          sku,
          shortDescription: template.shortDesc,
          categorySlug,
          brandSlug,
          stockQuantity: Math.floor(Math.random() * 200) + 50,
          maxOrderQuantity: Math.floor(Math.random() * 10) + 5,
          status: 'active',
          isActive: true,
          requiresPrescription: ['thuoc-khang-sinh', 'thuoc-tim-mach', 'thuoc-tieu-duong', 'thuoc-chong-dong-mau'].includes(categorySlug),
          featuredImage: `https://example.com/${slug}.jpg`,
          price: template.price + Math.floor(Math.random() * 10000),
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
    await databaseService.categories.deleteMany({})
    await databaseService.brands.deleteMany({})
    await databaseService.products.deleteMany({})

    // Insert categories
    const insertedCategories = []
    for (const cat of categoriesData) {
      const category = new Category({
        name: cat.name,
        slug: cat.slug,
        description: cat.description,
        isActive: cat.isActive,
        level: 1,
        path: cat.slug,
        productCount: 0,
        sortOrder: 0
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
        stockQuantity: prod.stockQuantity,
        maxOrderQuantity: prod.maxOrderQuantity,
        status: prod.status,
        isActive: prod.isActive,
        requiresPrescription: prod.requiresPrescription,
        featuredImage: prod.featuredImage,
        createdBy: new ObjectId() // Placeholder
      })

      await databaseService.products.insertOne(product)

      // Note: Product details can be added later if needed
    }
    console.log('Inserted products')

    console.log('Seeding completed successfully!')
  } catch (error) {
    console.error('Seeding failed:', error)
  } finally {
    process.exit(0)
  }
}

seedDatabase()
