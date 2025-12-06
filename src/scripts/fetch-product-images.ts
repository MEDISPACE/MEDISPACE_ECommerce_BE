import axios from 'axios'
import * as fs from 'fs'
import * as path from 'path'
import * as crypto from 'crypto'

/**
 * Search và download ảnh sản phẩm thực tế từ Google Images
 * Sử dụng SerpAPI (free tier: 100 searches/month)
 */

interface ProductImageResult {
    productName: string
    imageUrl: string
    localPath: string
    source: string
}

/**
 * Search ảnh sản phẩm qua Google Images
 * Sử dụng custom search hoặc scraping
 */
async function searchProductImage(productName: string): Promise<string | null> {
    try {
        // CÁCH 1: Sử dụng Google Custom Search API (Free tier: 100 queries/day)
        // Đăng ký tại: https://developers.google.com/custom-search/v1/overview
        const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY || ''
        const SEARCH_ENGINE_ID = process.env.GOOGLE_SEARCH_ENGINE_ID || ''

        if (GOOGLE_API_KEY && SEARCH_ENGINE_ID) {
            const searchQuery = `${productName} thuốc hộp`
            const url = `https://www.googleapis.com/customsearch/v1?key=${GOOGLE_API_KEY}&cx=${SEARCH_ENGINE_ID}&q=${encodeURIComponent(searchQuery)}&searchType=image&num=1&imgSize=medium`

            const response = await axios.get(url)

            if (response.data.items && response.data.items.length > 0) {
                return response.data.items[0].link
            }
        }

        // CÁCH 2: Fallback - Tìm từ các nguồn công khai
        // Tìm trên Wikimedia Commons (ảnh miễn phí)
        const wikiUrl = `https://commons.wikimedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(productName)}&srnamespace=6&format=json`
        const wikiResponse = await axios.get(wikiUrl)

        if (wikiResponse.data.query?.search?.length > 0) {
            const fileName = wikiResponse.data.query.search[0].title
            // Get actual image URL from Wikimedia
            const imageInfoUrl = `https://commons.wikimedia.org/w/api.php?action=query&titles=${encodeURIComponent(fileName)}&prop=imageinfo&iiprop=url&format=json`
            const imageInfo = await axios.get(imageInfoUrl)
            const pages = imageInfo.data.query.pages
            const pageId = Object.keys(pages)[0]

            if (pages[pageId].imageinfo) {
                return pages[pageId].imageinfo[0].url
            }
        }

        return null
    } catch (error) {
        console.error(`Lỗi khi search ảnh cho "${productName}":`, error)
        return null
    }
}

/**
 * Download ảnh về local
 */
async function downloadImage(imageUrl: string, productName: string): Promise<string> {
    try {
        const response = await axios.get(imageUrl, {
            responseType: 'arraybuffer',
            timeout: 10000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
            },
        })

        // Tạo tên file từ product name
        const hash = crypto.createHash('md5').update(productName).digest('hex').substring(0, 8)
        const ext = imageUrl.split('.').pop()?.split('?')[0] || 'jpg'
        const filename = `${productName.toLowerCase().replace(/[^a-z0-9]/g, '-').substring(0, 50)}-${hash}.${ext}`

        // Lưu vào thư mục public/products
        const dir = path.join(__dirname, '../../public/products')
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true })
        }

        const filepath = path.join(dir, filename)
        fs.writeFileSync(filepath, response.data)

        return `/products/${filename}`
    } catch (error) {
        console.error(`Lỗi khi download ảnh:`, error)
        throw error
    }
}

/**
 * Lấy ảnh cho danh sách sản phẩm
 */
async function fetchProductImages(products: Array<{ name: string; sku: string }>): Promise<ProductImageResult[]> {
    const results: ProductImageResult[] = []

    console.log(`🖼️  Bắt đầu tìm ảnh cho ${products.length} sản phẩm...\n`)

    for (const product of products) {
        try {
            console.log(`🔍 Tìm ảnh: ${product.name}`)

            // Search ảnh
            const imageUrl = await searchProductImage(product.name)

            if (imageUrl) {
                console.log(`  ✓ Tìm thấy: ${imageUrl.substring(0, 80)}...`)

                // Download ảnh
                const localPath = await downloadImage(imageUrl, product.sku)
                console.log(`  ✓ Đã lưu: ${localPath}`)

                results.push({
                    productName: product.name,
                    imageUrl,
                    localPath,
                    source: 'google',
                })
            } else {
                console.log(`  ✗ Không tìm thấy ảnh`)

                // Fallback: Dùng placeholder
                const placeholderUrl = `https://placehold.co/400x400/0066CC/white?text=${encodeURIComponent(product.name.substring(0, 20))}`
                results.push({
                    productName: product.name,
                    imageUrl: placeholderUrl,
                    localPath: placeholderUrl,
                    source: 'placeholder',
                })
            }

            // Delay để tránh rate limit
            await new Promise(resolve => setTimeout(resolve, 1000))
        } catch (error) {
            console.error(`  ✗ Lỗi: ${error}`)
        }
    }

    return results
}

/**
 * Lưu mapping vào JSON
 */
function saveImageMapping(results: ProductImageResult[], filename: string = 'product-images.json') {
    const filepath = path.join(__dirname, '../../data', filename)
    const dir = path.dirname(filepath)

    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
    }

    fs.writeFileSync(filepath, JSON.stringify(results, null, 2), 'utf-8')
    console.log(`\n💾 Đã lưu mapping vào ${filepath}`)
}

/**
 * Main function
 */
async function main() {
    try {
        console.log('🚀 Bắt đầu tìm và download ảnh sản phẩm...\n')

        // Load danh sách sản phẩm từ seed data
        const seedData = require('../seed')
        const products = seedData.default || []

        // Lấy 20 sản phẩm đầu tiên để test
        const testProducts = products.slice(0, 20).map((p: any) => ({
            name: p.name,
            sku: p.sku,
        }))

        console.log(`📦 Sẽ tìm ảnh cho ${testProducts.length} sản phẩm\n`)

        // Kiểm tra API key
        if (!process.env.GOOGLE_API_KEY) {
            console.log('⚠️  Chưa có GOOGLE_API_KEY')
            console.log('💡 Hướng dẫn lấy API key:')
            console.log('   1. Truy cập: https://console.cloud.google.com/')
            console.log('   2. Tạo project mới')
            console.log('   3. Enable Custom Search API')
            console.log('   4. Tạo credentials (API key)')
            console.log('   5. Thêm vào .env: GOOGLE_API_KEY=your_key')
            console.log('   6. Tạo Search Engine: https://programmablesearchengine.google.com/')
            console.log('   7. Thêm vào .env: GOOGLE_SEARCH_ENGINE_ID=your_id\n')
            console.log('🔄 Sẽ dùng placeholder images thay thế...\n')
        }

        // Fetch images
        const results = await fetchProductImages(testProducts)

        // Save mapping
        saveImageMapping(results)

        // Statistics
        const downloaded = results.filter(r => r.source === 'google').length
        const placeholders = results.filter(r => r.source === 'placeholder').length

        console.log('\n✨ Hoàn thành!')
        console.log(`📊 Thống kê:`)
        console.log(`   - Tổng số: ${results.length}`)
        console.log(`   - Đã download: ${downloaded}`)
        console.log(`   - Placeholder: ${placeholders}`)
    } catch (error) {
        console.error('❌ Lỗi:', error)
        process.exit(1)
    }
}

if (require.main === module) {
    main()
}

export { fetchProductImages, searchProductImage, downloadImage }
