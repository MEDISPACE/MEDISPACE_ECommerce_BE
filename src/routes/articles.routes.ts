import { Router } from 'express'
import {
  createArticleController,
  getArticlesController,
  getArticleController,
  updateArticleController,
  deleteArticleController,
  incrementViewController,
  publishArticleController,
  archiveArticleController,
  getRelatedArticlesController
} from '~/controllers/articles.controllers'
import {
  createArticleValidator,
  updateArticleValidator,
  getArticlesValidator,
  articleIdValidator
} from '~/middlewares/articles.middlewares'
import { wrapRequestHandler } from '~/utils/handlers'
import { accessTokenValidator } from '~/middlewares/users.middlewares'
import { adminValidator, pharmacistOrAdminValidator } from '~/middlewares/common.middlewares'

const articlesRouter = Router()

/**
 * Description: Get articles with pagination and filters (Public)
 * Path: /articles
 * Method: GET
 * Query: { page?, limit?, categoryId?, status?, isPublished?, isFeatured?, search?, tags?, sortBy?, sortOrder?, authorId? }
 */
articlesRouter.get('/', getArticlesValidator, wrapRequestHandler(getArticlesController))

/**
 * Description: Get article by ID or slug (Public)
 * Path: /articles/:articleId
 * Method: GET
 * Params: { articleId: string } (ObjectId or slug)
 */
articlesRouter.get('/:articleId', articleIdValidator, wrapRequestHandler(getArticleController))

/**
 * Description: Get related articles (Public)
 * Path: /articles/:articleId/related
 * Method: GET
 * Params: { articleId: string }
 * Query: { limit?: number }
 */
articlesRouter.get('/:articleId/related', articleIdValidator, wrapRequestHandler(getRelatedArticlesController))

/**
 * Description: Increment view count (Public)
 * Path: /articles/:articleId/view
 * Method: POST
 * Params: { articleId: string }
 */
articlesRouter.post('/:articleId/view', articleIdValidator, wrapRequestHandler(incrementViewController))

/**
 * Description: Create article (Pharmacist/Admin)
 * Path: /articles
 * Method: POST
 * Body: CreateArticleReqBody
 * Headers: { Authorization: Bearer <access_token> }
 */
articlesRouter.post(
  '/',
  accessTokenValidator,
  pharmacistOrAdminValidator,
  createArticleValidator,
  wrapRequestHandler(createArticleController)
)

/**
 * Description: Update article (Pharmacist/Admin)
 * Path: /articles/:articleId
 * Method: PATCH
 * Params: { articleId: string }
 * Body: UpdateArticleReqBody
 * Headers: { Authorization: Bearer <access_token> }
 */
articlesRouter.patch(
  '/:articleId',
  accessTokenValidator,
  pharmacistOrAdminValidator,
  articleIdValidator,
  updateArticleValidator,
  wrapRequestHandler(updateArticleController)
)

/**
 * Description: Delete article (Pharmacist for draft, Admin for all)
 * Path: /articles/:articleId
 * Method: DELETE
 * Params: { articleId: string }
 * Headers: { Authorization: Bearer <access_token> }
 */
articlesRouter.delete(
  '/:articleId',
  accessTokenValidator,
  pharmacistOrAdminValidator,
  articleIdValidator,
  wrapRequestHandler(deleteArticleController)
)

/**
 * Description: Publish article (Admin only)
 * Path: /articles/:articleId/publish
 * Method: PATCH
 * Params: { articleId: string }
 * Headers: { Authorization: Bearer <access_token> }
 */
articlesRouter.patch(
  '/:articleId/publish',
  accessTokenValidator,
  adminValidator,
  articleIdValidator,
  wrapRequestHandler(publishArticleController)
)

/**
 * Description: Archive article (Admin only)
 * Path: /articles/:articleId/archive
 * Method: PATCH
 * Params: { articleId: string }
 * Headers: { Authorization: Bearer <access_token> }
 */
articlesRouter.patch(
  '/:articleId/archive',
  accessTokenValidator,
  adminValidator,
  articleIdValidator,
  wrapRequestHandler(archiveArticleController)
)

export default articlesRouter
