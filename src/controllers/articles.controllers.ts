import { Request, Response } from 'express'
import { ParamsDictionary } from 'express-serve-static-core'
import articlesService from '~/services/articles.services'
import { CreateArticleReqBody, UpdateArticleReqBody, GetArticlesQuery } from '~/models/requests/Article.request'
import { ARTICLES_MESSAGES } from '~/constants/message'
import HTTP_STATUS from '~/constants/httpStatus'
import { TokenPayload } from '~/models/requests/User.request'

// Create article (Pharmacist/Admin)
export const createArticleController = async (
  req: Request<ParamsDictionary, unknown, CreateArticleReqBody>,
  res: Response
) => {
  const { userId } = req.decoded_authorization as TokenPayload
  const user = await require('~/services/database.services').default.users.findOne({
    _id: new (require('mongodb').ObjectId)(userId)
  })

  const authorName = `${user.firstName} ${user.lastName}`.trim()
  const authorTitle = user.lisenseNumber ? 'Dược sĩ' : undefined

  const result = await articlesService.createArticle(
    req.body,
    new (require('mongodb').ObjectId)(userId),
    authorName,
    authorTitle
  )

  return res.status(HTTP_STATUS.CREATED).json({
    message: ARTICLES_MESSAGES.CREATE_ARTICLE_SUCCESS,
    result
  })
}

// Get articles (Public)
export const getArticlesController = async (
  req: Request<ParamsDictionary, unknown, unknown, GetArticlesQuery>,
  res: Response
) => {
  const result = await articlesService.getArticles(req.query)
  return res.status(HTTP_STATUS.OK).json({
    message: ARTICLES_MESSAGES.GET_ARTICLES_SUCCESS,
    result
  })
}

// Get article by ID or slug (Public)
export const getArticleController = async (req: Request<{ articleId: string }>, res: Response) => {
  const result = await articlesService.getArticle(req.params.articleId)
  return res.status(HTTP_STATUS.OK).json({
    message: ARTICLES_MESSAGES.GET_ARTICLE_SUCCESS,
    result
  })
}

// Update article (Pharmacist/Admin)
export const updateArticleController = async (
  req: Request<{ articleId: string }, unknown, UpdateArticleReqBody>,
  res: Response
) => {
  const { userId } = req.decoded_authorization as TokenPayload
  const result = await articlesService.updateArticle(
    req.params.articleId,
    req.body,
    new (require('mongodb').ObjectId)(userId)
  )
  return res.status(HTTP_STATUS.OK).json({
    message: ARTICLES_MESSAGES.UPDATE_ARTICLE_SUCCESS,
    result
  })
}

// Delete article (Pharmacist for draft, Admin for all)
export const deleteArticleController = async (req: Request<{ articleId: string }>, res: Response) => {
  const result = await articlesService.deleteArticle(req.params.articleId)
  return res.status(HTTP_STATUS.OK).json(result)
}

// Increment view count (Public)
export const incrementViewController = async (req: Request<{ articleId: string }>, res: Response) => {
  await articlesService.incrementView(req.params.articleId)
  return res.status(HTTP_STATUS.OK).json({
    message: ARTICLES_MESSAGES.INCREMENT_VIEW_SUCCESS
  })
}

// Publish article (Admin only)
export const publishArticleController = async (req: Request<{ articleId: string }>, res: Response) => {
  const result = await articlesService.publishArticle(req.params.articleId)
  return res.status(HTTP_STATUS.OK).json({
    message: ARTICLES_MESSAGES.PUBLISH_ARTICLE_SUCCESS,
    result
  })
}

// Archive article (Admin only)
export const archiveArticleController = async (req: Request<{ articleId: string }>, res: Response) => {
  const result = await articlesService.archiveArticle(req.params.articleId)
  return res.status(HTTP_STATUS.OK).json({
    message: ARTICLES_MESSAGES.ARCHIVE_ARTICLE_SUCCESS,
    result
  })
}

// Get related articles (Public)
export const getRelatedArticlesController = async (req: Request<{ articleId: string }>, res: Response) => {
  const limit = req.query.limit ? parseInt(req.query.limit as string) : 6
  const result = await articlesService.getRelatedArticles(req.params.articleId, limit)
  return res.status(HTTP_STATUS.OK).json({
    message: ARTICLES_MESSAGES.GET_RELATED_ARTICLES_SUCCESS,
    result
  })
}
