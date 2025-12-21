import { ObjectId } from 'mongodb'
import databaseService from './database.services'
import Category from '~/models/schemas/Category.schema'
import { CreateCategoryReqBody, UpdateCategoryReqBody, GetCategoriesQuery } from '~/models/requests/Category.request'
import { ErrorWithStatus } from '~/models/Error'
import { CATEGORIES_MESSAGES } from '~/constants/message'
import HTTP_STATUS from '~/constants/httpStatus'

class CategoriesService {
  // Tạo slug từ name
  private generateSlug(name: string): string {
    return name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Remove diacritics
      .replace(/[đĐ]/g, 'd')
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim()
  }

  // Tạo materialized path
  private async generatePath(parentId?: ObjectId): Promise<{ path: string; level: number }> {
    if (!parentId) {
      return { path: '/', level: 0 }
    }

    const parent = await databaseService.categories.findOne({ _id: parentId })
    if (!parent) {
      throw new ErrorWithStatus({
        message: CATEGORIES_MESSAGES.PARENT_CATEGORY_NOT_FOUND,
        status: HTTP_STATUS.NOT_FOUND
      })
    }

    const level = parent.level + 1
    if (level > 3) {
      throw new ErrorWithStatus({
        message: CATEGORIES_MESSAGES.MAX_LEVEL_EXCEEDED,
        status: HTTP_STATUS.BAD_REQUEST
      })
    }

    const path = parent.path === '/' ? `/${parent.slug}` : `${parent.path}/${parent.slug}`
    return { path, level }
  }

  // Kiểm tra category tồn tại
  async checkCategoryExists(name: string, slug: string, excludeId?: ObjectId) {
    const query: { $or: Array<{ name?: string; slug?: string }>; _id?: { $ne: ObjectId } } = {
      $or: [{ name }, { slug }]
    }
    if (excludeId) {
      query._id = { $ne: excludeId }
    }

    const existingCategory = await databaseService.categories.findOne(query)
    if (existingCategory) {
      throw new ErrorWithStatus({
        message: CATEGORIES_MESSAGES.CATEGORY_ALREADY_EXISTS,
        status: HTTP_STATUS.CONFLICT
      })
    }
  }

  // Kiểm tra circular reference
  private async checkCircularReference(categoryId: ObjectId, parentId: ObjectId): Promise<void> {
    if (categoryId.equals(parentId)) {
      throw new ErrorWithStatus({
        message: CATEGORIES_MESSAGES.INVALID_PARENT_CATEGORY,
        status: HTTP_STATUS.BAD_REQUEST
      })
    }

    let currentParent = await databaseService.categories.findOne({ _id: parentId })
    while (currentParent) {
      if (currentParent._id?.equals(categoryId)) {
        throw new ErrorWithStatus({
          message: CATEGORIES_MESSAGES.INVALID_PARENT_CATEGORY,
          status: HTTP_STATUS.BAD_REQUEST
        })
      }
      if (!currentParent.parentId) break
      currentParent = await databaseService.categories.findOne({ _id: currentParent.parentId })
    }
  }

  // Tạo category mới
  async createCategory(payload: CreateCategoryReqBody) {
    const slug = payload.slug || this.generateSlug(payload.name)

    // Kiểm tra category đã tồn tại
    await this.checkCategoryExists(payload.name, slug)

    const parentId = payload.parentId ? new ObjectId(payload.parentId) : undefined
    const { path, level } = await this.generatePath(parentId)

    const categoryId = new ObjectId()
    const category = new Category({
      _id: categoryId,
      name: payload.name,
      slug,
      description: payload.description,
      parentId,
      level,
      path,
      productCount: 0,
      icon: payload.icon,
      thumbnailImage: payload.thumbnailImage,
      sortOrder: payload.sortOrder || 0,
      isActive: payload.isActive !== undefined ? payload.isActive : true
    })

    await databaseService.categories.insertOne(category)
    return category
  }

  // Lấy danh sách categories
  async getCategories(query: GetCategoriesQuery) {
    const page = parseInt(query.page || '1')
    const limit = parseInt(query.limit || '20')
    const skip = (page - 1) * limit

    // Build filter
    const filter: Record<string, unknown> = {}

    if (query.parentId) {
      filter.parentId = query.parentId === 'null' ? null : new ObjectId(query.parentId)
    }

    if (query.level) {
      filter.level = parseInt(query.level)
    }

    if (query.isActive) {
      filter.isActive = query.isActive === 'true'
    }

    if (query.search) {
      filter.$or = [
        { name: { $regex: query.search, $options: 'i' } },
        { description: { $regex: query.search, $options: 'i' } }
      ]
    }

    // Get categories với pagination
    const [categories, totalCount] = await Promise.all([
      databaseService.categories
        .find(filter)
        .sort({ level: 1, sortOrder: 1, name: 1 })
        .skip(skip)
        .limit(limit)
        .toArray(),
      databaseService.categories.countDocuments(filter)
    ])

    return {
      categories,
      pagination: {
        page,
        limit,
        totalPages: Math.ceil(totalCount / limit),
        totalCount
      }
    }
  }

  // Lấy category tree (hierarchical)
  async getCategoryTree({ includeInactive = false }: { includeInactive?: boolean } = {}) {
    const filter: Record<string, any> = {}
    if (!includeInactive) {
      filter.isActive = true
    }

    const categories = await databaseService.categories
      .find(filter)
      .sort({ level: 1, sortOrder: 1, name: 1 })
      .toArray()

    // Build tree structure
    const categoryMap = new Map()
    const rootCategories: Array<Category & { children: Array<Category & { children: unknown[] }> }> = []

    // Tạo map và thêm children array
    categories.forEach((category) => {
      categoryMap.set(category._id!.toString(), { ...category, children: [] })
    })

    // Build tree
    categories.forEach((category) => {
      const categoryWithChildren = categoryMap.get(category._id!.toString())
      if (category.parentId) {
        const parent = categoryMap.get(category.parentId.toString())
        if (parent) {
          parent.children.push(categoryWithChildren)
        }
      } else {
        rootCategories.push(categoryWithChildren)
      }
    })

    return rootCategories
  }

  // Lấy chi tiết category
  async getCategoryById(categoryId: string) {
    // Support both string and ObjectId _id (imported data may have string IDs)
    const category = await databaseService.categories.findOne({
      $or: [
        { _id: categoryId as unknown as ObjectId }, // String ID
        { _id: new ObjectId(categoryId) } // ObjectId
      ]
    })
    if (!category) {
      throw new ErrorWithStatus({
        message: CATEGORIES_MESSAGES.CATEGORY_NOT_FOUND,
        status: HTTP_STATUS.NOT_FOUND
      })
    }
    return category
  }


  // Lấy chi tiết category theo slug
  async getCategoryBySlug(slug: string) {
    const category = await databaseService.categories.findOne({ slug })
    if (!category) {
      throw new ErrorWithStatus({
        message: CATEGORIES_MESSAGES.CATEGORY_NOT_FOUND,
        status: HTTP_STATUS.NOT_FOUND
      })
    }
    return category
  }

  // Lấy breadcrumb
  async getCategoryBreadcrumb(categoryId: string) {
    const category = await this.getCategoryById(categoryId)
    const breadcrumb = [category]

    let currentCategory = category
    while (currentCategory.parentId) {
      const parentCategory = await databaseService.categories.findOne({ _id: currentCategory.parentId })
      if (parentCategory) {
        breadcrumb.unshift(parentCategory)
        currentCategory = parentCategory
      } else {
        break
      }
    }

    return breadcrumb
  }

  // Lấy children categories
  async getCategoryChildren(categoryId: string) {
    return await databaseService.categories
      .find({ parentId: new ObjectId(categoryId), isActive: true })
      .sort({ sortOrder: 1, name: 1 })
      .toArray()
  }

  // Cập nhật category
  async updateCategory(categoryId: string, payload: UpdateCategoryReqBody) {
    const category = await this.getCategoryById(categoryId)

    // Kiểm tra tên và slug mới có trùng không
    if (payload.name || payload.slug) {
      const newName = payload.name || category.name
      const newSlug = payload.slug || this.generateSlug(newName)
      await this.checkCategoryExists(newName, newSlug, new ObjectId(categoryId))
    }

    // Kiểm tra circular reference nếu thay đổi parent
    if (payload.parentId && payload.parentId !== category.parentId?.toString()) {
      const newParentId = new ObjectId(payload.parentId)
      await this.checkCircularReference(new ObjectId(categoryId), newParentId)
    }

    // Tính toán path và level mới nếu thay đổi parent
    let newPath = category.path
    let newLevel = category.level

    if (payload.parentId !== undefined) {
      const parentId = payload.parentId ? new ObjectId(payload.parentId) : undefined
      const pathData = await this.generatePath(parentId)
      newPath = pathData.path
      newLevel = pathData.level
    }

    const updateData: Record<string, unknown> = {
      ...payload,
      updatedAt: new Date()
    }

    if (payload.parentId !== undefined) {
      updateData.parentId = payload.parentId ? new ObjectId(payload.parentId) : null
      updateData.path = newPath
      updateData.level = newLevel
    }

    if (payload.name && !payload.slug) {
      updateData.slug = this.generateSlug(payload.name)
    }

    await databaseService.categories.updateOne({ _id: new ObjectId(categoryId) }, { $set: updateData })

    return await this.getCategoryById(categoryId)
  }

  // Toggle active status
  async toggleCategoryStatus(categoryId: string, isActive: boolean) {
    await this.getCategoryById(categoryId) // Check exists

    await databaseService.categories.updateOne(
      { _id: new ObjectId(categoryId) },
      {
        $set: {
          isActive,
          updatedAt: new Date()
        }
      }
    )

    return await this.getCategoryById(categoryId)
  }

  // Xóa category
  async deleteCategory(categoryId: string) {
    const category = await this.getCategoryById(categoryId)

    // Kiểm tra có children không
    const childrenCount = await databaseService.categories.countDocuments({
      parentId: new ObjectId(categoryId)
    })

    if (childrenCount > 0) {
      throw new ErrorWithStatus({
        message: CATEGORIES_MESSAGES.CANNOT_DELETE_CATEGORY_WITH_CHILDREN,
        status: HTTP_STATUS.BAD_REQUEST
      })
    }

    // Kiểm tra có products không (nếu đã có products collection)
    if (category.productCount > 0) {
      throw new ErrorWithStatus({
        message: CATEGORIES_MESSAGES.CANNOT_DELETE_CATEGORY_WITH_PRODUCTS,
        status: HTTP_STATUS.BAD_REQUEST
      })
    }

    await databaseService.categories.deleteOne({ _id: new ObjectId(categoryId) })
    return { message: CATEGORIES_MESSAGES.DELETE_CATEGORY_SUCCESS }
  }
}

const categoriesService = new CategoriesService()
export default categoriesService
