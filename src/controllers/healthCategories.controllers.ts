import { Request, Response } from 'express'
import { ParamsDictionary } from 'express-serve-static-core'
import healthCategoriesService from '~/services/healthCategories.services'
import { CreateHealthCategoryReqBody, UpdateHealthCategoryReqBody, GetHealthCategoriesQuery } from '~/models/requests/Article.request'
import { HEALTH_CATEGORIES_MESSAGES } from '~/constants/message'
import HTTP_STATUS from '~/constants/httpStatus'

// Create health category (Admin only)
export const createHealthCategoryController = async (
    req: Request<ParamsDictionary, unknown, CreateHealthCategoryReqBody>,
    res: Response
) => {
    const result = await healthCategoriesService.createCategory(req.body)
    return res.status(HTTP_STATUS.CREATED).json({
        message: HEALTH_CATEGORIES_MESSAGES.CREATE_CATEGORY_SUCCESS,
        result
    })
}

// Get health categories (Public)
export const getHealthCategoriesController = async (
    req: Request<ParamsDictionary, unknown, unknown, GetHealthCategoriesQuery>,
    res: Response
) => {
    const result = await healthCategoriesService.getCategories(req.query)
    return res.status(HTTP_STATUS.OK).json({
        message: HEALTH_CATEGORIES_MESSAGES.GET_CATEGORIES_SUCCESS,
        result
    })
}

// Get health category by ID or slug (Public)
export const getHealthCategoryController = async (req: Request<{ categoryId: string }>, res: Response) => {
    const param = req.params.categoryId
    const result = require('mongodb').ObjectId.isValid(param)
        ? await healthCategoriesService.getCategoryById(param)
        : await healthCategoriesService.getCategoryBySlug(param)
    return res.status(HTTP_STATUS.OK).json({
        message: HEALTH_CATEGORIES_MESSAGES.GET_CATEGORY_SUCCESS,
        result
    })
}

// Update health category (Admin only)
export const updateHealthCategoryController = async (
    req: Request<{ categoryId: string }, unknown, UpdateHealthCategoryReqBody>,
    res: Response
) => {
    const result = await healthCategoriesService.updateCategory(req.params.categoryId, req.body)
    return res.status(HTTP_STATUS.OK).json({
        message: HEALTH_CATEGORIES_MESSAGES.UPDATE_CATEGORY_SUCCESS,
        result
    })
}

// Delete health category (Admin only)
export const deleteHealthCategoryController = async (req: Request<{ categoryId: string }>, res: Response) => {
    const result = await healthCategoriesService.deleteCategory(req.params.categoryId)
    return res.status(HTTP_STATUS.OK).json(result)
}
