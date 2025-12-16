import { ObjectId } from 'mongodb'
import databaseService from './database.services'

// Danh sách Categories thực tế
const categories = [
    {
        _id: new ObjectId(),
        name: 'Thuốc kê đơn',
        slug: 'thuoc-ke-don',
        description: 'Thuốc cần có đơn của bác sĩ',
        level: 1,
        path: '/thuoc-ke-don',
        productCount: 0,
        sortOrder: 1,
        isActive: true,
    },
    {
        _id: new ObjectId(),
        name: 'Thuốc không kê đơn',
        slug: 'thuoc-khong-ke-don',
        description: 'Thuốc có thể mua tự do',
        level: 1,
        path: '/thuoc-khong-ke-don',
        productCount: 0,
        sortOrder: 2,
        isActive: true,
    },
    {
        _id: new ObjectId(),
        name: 'Thực phẩm chức năng',
        slug: 'thuc-pham-chuc-nang',
        description: 'Vitamin, khoáng chất, thực phẩm bổ sung',
        level: 1,
        path: '/thuc-pham-chuc-nang',
        productCount: 0,
        sortOrder: 3,
        isActive: true,
    },
    {
        _id: new ObjectId(),
        name: 'Chăm sóc cá nhân',
        slug: 'cham-soc-ca-nhan',
        description: 'Sản phẩm chăm sóc sức khỏe và làm đẹp',
        level: 1,
        path: '/cham-soc-ca-nhan',
        productCount: 0,
        sortOrder: 4,
        isActive: true,
    },
    {
        _id: new ObjectId(),
        name: 'Thiết bị y tế',
        slug: 'thiet-bi-y-te',
        description: 'Máy đo, dụng cụ y tế gia đình',
        level: 1,
        path: '/thiet-bi-y-te',
        productCount: 0,
        sortOrder: 5,
        isActive: true,
    },
]

// Danh sách Brands thực tế
const brands = [
    {
        _id: new ObjectId(),
        name: 'Domesco',
        slug: 'domesco',
        description: 'Công ty Dược phẩm Domesco - Việt Nam',
        country: 'Việt Nam',
        isActive: true,
        productCount: 0,
    },
    {
        _id: new ObjectId(),
        name: 'Traphaco',
        slug: 'traphaco',
        description: 'Công ty Dược phẩm Traphaco',
        country: 'Việt Nam',
        isActive: true,
        productCount: 0,
    },
    {
        _id: new ObjectId(),
        name: 'Abbott',
        slug: 'abbott',
        description: 'Abbott Laboratories',
        country: 'Hoa Kỳ',
        isActive: true,
        productCount: 0,
    },
    {
        _id: new ObjectId(),
        name: 'Sanofi',
        slug: 'sanofi',
        description: 'Sanofi-Aventis',
        country: 'Pháp',
        isActive: true,
        productCount: 0,
    },
    {
        _id: new ObjectId(),
        name: 'Blackmores',
        slug: 'blackmores',
        description: 'Blackmores Limited',
        country: 'Úc',
        isActive: true,
        productCount: 0,
    },
    {
        _id: new ObjectId(),
        name: 'Omron',
        slug: 'omron',
        description: 'Omron Healthcare',
        country: 'Nhật Bản',
        isActive: true,
        productCount: 0,
    },
]

// Admin user ID (cần thay bằng ID thực tế của admin)
const adminId = new ObjectId()

// Danh sách sản phẩm thực tế
const products = [
    // THUỐC KÊ ĐƠN
    {
        name: 'Amoxicillin 500mg',
        slug: 'amoxicillin-500mg',
        sku: 'AMX-500-30',
        barcode: '8936036000123',
        shortDescription: 'Kháng sinh điều trị nhiễm khuẩn đường hô hấp, tai mũi họng',
        categoryId: categories[0]._id,
        brandId: brands[0]._id, // Domesco
        price: 45000,
        stockQuantity: 150,
        maxOrderQuantity: 5,
        status: 'active',
        isActive: true,
        requiresPrescription: true,
        createdBy: adminId,
    },
    {
        name: 'Metformin 850mg',
        slug: 'metformin-850mg',
        sku: 'MET-850-60',
        barcode: '8936036000456',
        shortDescription: 'Thuốc điều trị tiểu đường type 2',
        categoryId: categories[0]._id,
        brandId: brands[3]._id, // Sanofi
        price: 85000,
        stockQuantity: 200,
        maxOrderQuantity: 3,
        status: 'active',
        isActive: true,
        requiresPrescription: true,
        createdBy: adminId,
    },
    {
        name: 'Losartan 50mg',
        slug: 'losartan-50mg',
        sku: 'LOS-50-30',
        barcode: '8936036000789',
        shortDescription: 'Thuốc điều trị tăng huyết áp',
        categoryId: categories[0]._id,
        brandId: brands[3]._id, // Sanofi
        price: 120000,
        stockQuantity: 180,
        maxOrderQuantity: 3,
        status: 'active',
        isActive: true,
        requiresPrescription: true,
        createdBy: adminId,
    },

    // THUỐC KHÔNG KÊ ĐƠN
    {
        name: 'Paracetamol 500mg',
        slug: 'paracetamol-500mg',
        sku: 'PAR-500-100',
        barcode: '8936036001234',
        shortDescription: 'Giảm đau, hạ sốt hiệu quả',
        categoryId: categories[1]._id,
        brandId: brands[0]._id, // Domesco
        price: 15000,
        stockQuantity: 500,
        maxOrderQuantity: 10,
        status: 'active',
        isActive: true,
        requiresPrescription: false,
        createdBy: adminId,
    },
    {
        name: 'Vitamin C Redoxon 1000mg',
        slug: 'vitamin-c-redoxon-1000mg',
        sku: 'VTC-1000-30',
        barcode: '8936036001567',
        shortDescription: 'Tăng cường sức đề kháng, bổ sung vitamin C',
        categoryId: categories[1]._id,
        brandId: brands[2]._id, // Abbott
        price: 180000,
        stockQuantity: 300,
        maxOrderQuantity: 10,
        status: 'active',
        isActive: true,
        requiresPrescription: false,
        createdBy: adminId,
    },
    {
        name: 'Thuốc nhỏ mắt Systane Ultra',
        slug: 'thuoc-nho-mat-systane-ultra',
        sku: 'SYS-10ML',
        barcode: '8936036001890',
        shortDescription: 'Giảm khô mắt, mỏi mắt do làm việc với máy tính',
        categoryId: categories[1]._id,
        brandId: brands[2]._id, // Abbott
        price: 95000,
        stockQuantity: 250,
        maxOrderQuantity: 5,
        status: 'active',
        isActive: true,
        requiresPrescription: false,
        createdBy: adminId,
    },

    // THỰC PHẨM CHỨC NĂNG
    {
        name: 'Blackmores Omega 3 Fish Oil 1000mg',
        slug: 'blackmores-omega-3-fish-oil',
        sku: 'OMG-1000-100',
        barcode: '9300807280119',
        shortDescription: 'Hỗ trợ tim mạch, tăng cường trí nhớ',
        categoryId: categories[2]._id,
        brandId: brands[4]._id, // Blackmores
        price: 320000,
        stockQuantity: 150,
        maxOrderQuantity: 5,
        status: 'active',
        isActive: true,
        requiresPrescription: false,
        createdBy: adminId,
    },
    {
        name: 'Blackmores Vitamin D3 1000IU',
        slug: 'blackmores-vitamin-d3-1000iu',
        sku: 'VTD-1000-60',
        barcode: '9300807280225',
        shortDescription: 'Bổ sung vitamin D3, hỗ trợ xương khớp',
        categoryId: categories[2]._id,
        brandId: brands[4]._id, // Blackmores
        price: 280000,
        stockQuantity: 200,
        maxOrderQuantity: 5,
        status: 'active',
        isActive: true,
        requiresPrescription: false,
        createdBy: adminId,
    },
    {
        name: 'Traphaco Hoạt Huyết Dưỡng Não',
        slug: 'traphaco-hoat-huyet-duong-nao',
        sku: 'HHDN-60',
        barcode: '8936036002123',
        shortDescription: 'Hỗ trợ tuần hoàn máu não, giảm đau đầu, chóng mặt',
        categoryId: categories[2]._id,
        brandId: brands[1]._id, // Traphaco
        price: 150000,
        stockQuantity: 180,
        maxOrderQuantity: 5,
        status: 'active',
        isActive: true,
        requiresPrescription: false,
        createdBy: adminId,
    },

    // CHĂM SÓC CÁ NHÂN
    {
        name: 'Kem chống nắng La Roche-Posay Anthelios SPF50+',
        slug: 'kem-chong-nang-la-roche-posay-spf50',
        sku: 'LRP-SPF50-50ML',
        barcode: '3337875545693',
        shortDescription: 'Kem chống nắng phổ rộng, bảo vệ da tối ưu',
        categoryId: categories[3]._id,
        brandId: brands[3]._id, // Sanofi (La Roche-Posay thuộc Sanofi)
        price: 380000,
        stockQuantity: 120,
        maxOrderQuantity: 5,
        status: 'active',
        isActive: true,
        requiresPrescription: false,
        createdBy: adminId,
    },
    {
        name: 'Gel rửa tay khô Purell Advanced 500ml',
        slug: 'gel-rua-tay-kho-purell-500ml',
        sku: 'PUR-500ML',
        barcode: '7350061821018',
        shortDescription: 'Diệt khuẩn 99.99%, không cần nước',
        categoryId: categories[3]._id,
        price: 85000,
        stockQuantity: 300,
        maxOrderQuantity: 10,
        status: 'active',
        isActive: true,
        requiresPrescription: false,
        createdBy: adminId,
    },

    // THIẾT BỊ Y TẾ
    {
        name: 'Máy đo huyết áp Omron HEM-7156',
        slug: 'may-do-huyet-ap-omron-hem-7156',
        sku: 'OMR-7156',
        barcode: '4975479417566',
        shortDescription: 'Máy đo huyết áp tự động, công nghệ Intellisense',
        categoryId: categories[4]._id,
        brandId: brands[5]._id, // Omron
        price: 950000,
        stockQuantity: 50,
        maxOrderQuantity: 2,
        status: 'active',
        isActive: true,
        requiresPrescription: false,
        createdBy: adminId,
    },
    {
        name: 'Nhiệt kế điện tử Omron MC-246',
        slug: 'nhiet-ke-dien-tu-omron-mc-246',
        sku: 'OMR-MC246',
        barcode: '4975479417894',
        shortDescription: 'Nhiệt kế điện tử đo nhanh, chính xác',
        categoryId: categories[4]._id,
        brandId: brands[5]._id, // Omron
        price: 120000,
        stockQuantity: 200,
        maxOrderQuantity: 5,
        status: 'active',
        isActive: true,
        requiresPrescription: false,
        createdBy: adminId,
    },
    {
        name: 'Máy đo đường huyết Accu-Chek Active',
        slug: 'may-do-duong-huyet-accu-chek-active',
        sku: 'ACC-ACT',
        barcode: '4015630055913',
        shortDescription: 'Máy đo đường huyết chính xác, dễ sử dụng',
        categoryId: categories[4]._id,
        price: 450000,
        stockQuantity: 80,
        maxOrderQuantity: 2,
        status: 'active',
        isActive: true,
        requiresPrescription: false,
        createdBy: adminId,
    },
]

// Function để seed data
export async function seedProducts() {
    try {
        console.log('🌱 Starting seed products...')

        // 1. Seed Categories
        console.log('📁 Seeding categories...')
        await databaseService.categories.insertMany(categories)
        console.log(`✅ Inserted ${categories.length} categories`)

        // 2. Seed Brands
        console.log('🏢 Seeding brands...')
        await databaseService.brands.insertMany(brands)
        console.log(`✅ Inserted ${brands.length} brands`)

        // 3. Seed Products
        console.log('📦 Seeding products...')
        await databaseService.products.insertMany(products)
        console.log(`✅ Inserted ${products.length} products`)

        console.log('🎉 Seed completed successfully!')
    } catch (error) {
        console.error('❌ Seed failed:', error)
        throw error
    }
}

// Export data để có thể import vào file khác
export { categories, brands, products, adminId }
