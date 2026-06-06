import { Router } from 'express'
import { wrapRequestHandler } from '~/utils/handlers'
import {
  suggestController,
  searchProductsController,
  searchArticlesController,
  searchStatusController
} from '~/controllers/search.controllers'
import { searchRateLimit } from '~/middlewares/search.middlewares'

const searchRouter = Router()

/**
 * GET /search/suggest?q=
 * Autocomplete nhanh — trả về gợi ý sản phẩm khi user đang gõ
 */
searchRouter.get('/suggest', searchRateLimit(30, 60_000), wrapRequestHandler(suggestController))

/**
 * GET /search/products?q=&page=&limit=&categoryId=&brandId=&requiresPrescription=&inStock=&priceMin=&priceMax=&ratingMin=&sortBy=
 * Full-text search sản phẩm với filter và facet counts
 */
searchRouter.get('/products', searchRateLimit(60, 60_000), wrapRequestHandler(searchProductsController))

/**
 * GET /search/articles?q=&page=&limit=&categoryId=
 * Full-text search bài viết sức khỏe
 */
searchRouter.get('/articles', searchRateLimit(60, 60_000), wrapRequestHandler(searchArticlesController))

/**
 * GET /search/status
 * Kiểm tra trạng thái Typesense
 */
searchRouter.get('/status', wrapRequestHandler(searchStatusController))

export default searchRouter
