import { Router } from 'express'
import { wrapRequestHandler } from '~/utils/handlers'
import {
  suggestController,
  searchProductsController,
  searchArticlesController,
  searchStatusController
} from '~/controllers/search.controllers'

const searchRouter = Router()

/**
 * GET /search/suggest?q=
 * Autocomplete nhanh — trả về gợi ý sản phẩm khi user đang gõ
 */
searchRouter.get('/suggest', wrapRequestHandler(suggestController))

/**
 * GET /search/products?q=&page=&limit=&categoryId=&brandId=&requiresPrescription=&inStock=&priceMin=&priceMax=&ratingMin=&sortBy=
 * Full-text search sản phẩm với filter và facet counts
 */
searchRouter.get('/products', wrapRequestHandler(searchProductsController))

/**
 * GET /search/articles?q=&page=&limit=&categoryId=
 * Full-text search bài viết sức khỏe
 */
searchRouter.get('/articles', wrapRequestHandler(searchArticlesController))

/**
 * GET /search/status
 * Kiểm tra trạng thái Typesense
 */
searchRouter.get('/status', wrapRequestHandler(searchStatusController))

export default searchRouter
