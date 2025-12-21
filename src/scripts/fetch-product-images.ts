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
        throw error
    }
}

/**
 * Lấy ảnh cho danh sách sản phẩm
 */
async function fetchProductImages(products: Array<{ name: string; sku: string }>): Promise<ProductImageResult[]> {
    const results: ProductImageResult[] = []

    for (const product of products) {
        try {

            // Search ảnh
            const imageUrl = await searchProductImage(product.name)

            if (imageUrl) {

                // Download ảnh
                const localPath = await downloadImage(imageUrl, product.sku)

                results.push({
                    productName: product.name,
                    imageUrl,
                    localPath,
                    source: 'google',
                })
            } else {

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
    fs.writeFileSync(filepath, JSON.stringify(results, null, 2), 'utf-8')
}

/**
 * Main function
 */
async function main() {
    try {
        // Load danh sách sản phẩm từ seed data
        const seedData = require('../seed')
        const products = seedData.default || []

        // Lấy 20 sản phẩm đầu tiên để test
        const testProducts = products.slice(0, 20).map((p: any) => ({
            name: p.name,
            sku: p.sku,
        }))

        // Fetch images
        const results = await fetchProductImages(testProducts)

        // Save mapping
        saveImageMapping(results)

    } catch (error) {
        process.exit(1)
    }
}

if (require.main === module) {
    main()
}

export { fetchProductImages, searchProductImage, downloadImage }
