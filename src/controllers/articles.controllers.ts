import { Request, Response } from 'express'
import { ParamsDictionary } from 'express-serve-static-core'
import articlesService from '~/services/articles.services'
import {
  CreateArticleReqBody,
  UpdateArticleReqBody,
  GetArticlesQuery,
  TrackArticleJourneyEventReqBody,
  ArticleAiAssistReqBody,
  ArticleAskReqBody
} from '~/models/requests/Article.request'
import { ARTICLES_MESSAGES } from '~/constants/message'
import HTTP_STATUS from '~/constants/httpStatus'
import { TokenPayload } from '~/models/requests/User.request'
import { ObjectId } from 'mongodb'
import databaseService from '~/services/database.services'
import { UserRole } from '~/constants/enum'

// Create article (Pharmacist/Admin)
export const createArticleController = async (
  req: Request<ParamsDictionary, unknown, CreateArticleReqBody>,
  res: Response
) => {
  const { userId, role } = req.decoded_authorization as TokenPayload & { role?: UserRole }
  const user = await databaseService.users.findOne({
    _id: new ObjectId(userId)
  })

  const authorName = `${user?.firstName || ''} ${user?.lastName || ''}`.trim()
  const authorTitle = user?.lisenseNumber ? 'Dược sĩ' : undefined
  const isAdmin = (role ?? user?.role) === UserRole.Admin

  const result = await articlesService.createArticle(
    req.body,
    new ObjectId(userId),
    authorName,
    authorTitle,
    isAdmin
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
  const { userId, role } = req.decoded_authorization as TokenPayload & { role?: UserRole }
  const result = await articlesService.updateArticle(
    req.params.articleId,
    req.body,
    new ObjectId(userId),
    role === UserRole.Admin
  )
  return res.status(HTTP_STATUS.OK).json({
    message: ARTICLES_MESSAGES.UPDATE_ARTICLE_SUCCESS,
    result
  })
}

// Delete article (Pharmacist for draft, Admin for all)
export const deleteArticleController = async (req: Request<{ articleId: string }>, res: Response) => {
  const { userId, role } = req.decoded_authorization as TokenPayload & { role?: UserRole }
  const result = await articlesService.deleteArticle(req.params.articleId, new ObjectId(userId), role === UserRole.Admin)
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

// Get related products for an article (Public)
export const getRelatedProductsController = async (req: Request<{ articleId: string }>, res: Response) => {
  const limit = req.query.limit ? parseInt(req.query.limit as string) : 8
  const result = await articlesService.getRelatedProducts(req.params.articleId, limit)
  return res.status(HTTP_STATUS.OK).json({
    message: ARTICLES_MESSAGES.GET_RELATED_PRODUCTS_SUCCESS,
    result
  })
}

export const trackArticleJourneyEventController = async (
  req: Request<{ articleId: string }, unknown, TrackArticleJourneyEventReqBody>,
  res: Response
) => {
  const result = await articlesService.trackJourneyEvent(req.params.articleId, req.body, {
    ip: req.ip,
    userAgent: req.headers['user-agent']
  })
  return res.status(HTTP_STATUS.CREATED).json({
    message: ARTICLES_MESSAGES.TRACK_JOURNEY_EVENT_SUCCESS,
    result
  })
}

export const getArticleJourneyAnalyticsController = async (req: Request<{ articleId: string }>, res: Response) => {
  const result = await articlesService.getJourneyAnalytics(req.params.articleId)
  return res.status(HTTP_STATUS.OK).json({
    message: ARTICLES_MESSAGES.GET_JOURNEY_ANALYTICS_SUCCESS,
    result
  })
}

export const getArticleAdminInsightsController = async (req: Request, res: Response) => {
  const days = req.query.days ? parseInt(req.query.days as string) : 30
  const result = await articlesService.getAdminInsights(days)
  return res.status(HTTP_STATUS.OK).json({
    message: ARTICLES_MESSAGES.GET_ADMIN_INSIGHTS_SUCCESS,
    result
  })
}

export const articleAiAssistController = async (
  req: Request<ParamsDictionary, unknown, ArticleAiAssistReqBody>,
  res: Response
) => {
  const result = await articlesService.generateAiAssistance(req.body)
  return res.status(HTTP_STATUS.OK).json({
    message: ARTICLES_MESSAGES.ARTICLE_AI_ASSIST_SUCCESS,
    result
  })
}

export const askArticleAiController = async (
  req: Request<{ articleId: string }, unknown, ArticleAskReqBody>,
  res: Response
) => {
  const result = await articlesService.askArticle(req.params.articleId, req.body)
  return res.status(HTTP_STATUS.OK).json({
    message: ARTICLES_MESSAGES.ARTICLE_AI_ASK_SUCCESS,
    result
  })
}

export const getPersonalizedArticlesController = async (req: Request, res: Response) => {
  const { userId } = req.decoded_authorization as TokenPayload
  const limit = req.query.limit ? parseInt(req.query.limit as string) : 8
  const result = await articlesService.getPersonalizedArticles(new ObjectId(userId), limit)
  return res.status(HTTP_STATUS.OK).json({
    message: ARTICLES_MESSAGES.GET_PERSONALIZED_ARTICLES_SUCCESS,
    result
  })
}

export const getArticlePreferencesController = async (req: Request, res: Response) => {
  const { userId } = req.decoded_authorization as TokenPayload
  const result = await articlesService.getArticlePreferences(new ObjectId(userId))
  return res.status(HTTP_STATUS.OK).json({
    message: 'Get article preferences successfully',
    result
  })
}

export const setSavedArticleController = async (
  req: Request<{ articleId: string }, unknown, { saved?: boolean }>,
  res: Response
) => {
  const { userId } = req.decoded_authorization as TokenPayload
  const result = await articlesService.setSavedArticle(new ObjectId(userId), req.params.articleId, req.body.saved !== false)
  return res.status(HTTP_STATUS.OK).json({
    message: 'Set saved article successfully',
    result
  })
}

export const setFollowedHealthTopicController = async (
  req: Request<{ topicId: string }, unknown, { following?: boolean }>,
  res: Response
) => {
  const { userId } = req.decoded_authorization as TokenPayload
  const result = await articlesService.setFollowedHealthTopic(new ObjectId(userId), req.params.topicId, req.body.following !== false)
  return res.status(HTTP_STATUS.OK).json({
    message: 'Set followed health topic successfully',
    result
  })
}
