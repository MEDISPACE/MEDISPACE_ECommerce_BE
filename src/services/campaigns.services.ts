import { ObjectId } from 'mongodb'
import Campaign from '~/models/schemas/Campaign.schema'
import databaseService from './database.services'
import cacheService from './cache.services'
import { ErrorWithStatus } from '~/models/Error'
import HTTP_STATUS from '~/constants/httpStatus'

// Cache keys & TTLs
const CACHE_KEYS = {
  ACTIVE_CAMPAIGNS: 'campaigns:active',
  PUBLIC_CAMPAIGNS: 'campaigns:public',
} as const
const CAMPAIGN_TTL = 120 // 2 minutes

export interface CampaignPriceResult {
  hasCampaign: boolean
  campaignName?: string
  badgeText?: string
  badgeColor?: string
  originalPrice: number
  salePrice: number
  discountPercent: number // Phần trăm giảm thực tế
  campaignId?: ObjectId
}

class CampaignService {
  private async syncSearchPrices(reason: string): Promise<void> {
    try {
      const typesenseModule = await import('./typesense.services.js')
      const typesenseService = (typesenseModule.default as any)?.default ?? typesenseModule.default
      await typesenseService.requestReconciliation(reason)
    } catch (err) {
      console.error('[Campaign] Could not request Typesense reconciliation:', (err as Error)?.message)
    }
  }

  // ============================
  // CORE: Tính giá sale cho 1 sản phẩm
  // ============================

  /**
   * Tìm campaign đang active áp dụng cho sản phẩm cụ thể.
   * Trả về campaign có priority cao nhất nếu có nhiều campaign trùng.
   */
  async getActiveCampaignForProduct(
    productId: ObjectId,
    categoryId: ObjectId,
    brandId?: ObjectId,
    requiresPrescription: boolean = false
  ): Promise<Campaign | null> {
    const now = new Date()

    // Build query: chỉ lọc status ở DB, date validation xử lý ở code
    // (tránh BSON type mismatch nếu startDate/endDate lưu dạng string)
    const baseCriteria = {
      status: 'active' as const
    }

    // Tìm tất cả campaign phù hợp — dùng string so sánh để tránh ObjectId type mismatch
    const productIdStr = productId.toString()
    const categoryIdStr = categoryId.toString()
    const brandIdStr = brandId?.toString()

    // ✅ Cache: reuse cached active campaigns instead of querying MongoDB each time
    const allActive = await this.getActiveCampaignsCached()

    const campaigns = allActive.filter(c => {
      // Kiểm tra thời gian hiệu lực (cast sang Date để xử lý cả string)
      const start = new Date(c.startDate)
      const end = new Date(c.endDate)
      if (now < start || now > end) return false

      if (c.scope === 'all') return true
      if (c.scope === 'products') return c.productIds?.some((id: any) => id.toString() === productIdStr)
      if (c.scope === 'categories') return c.categoryIds?.some((id: any) => id.toString() === categoryIdStr)
      if (c.scope === 'brands' && brandIdStr) return c.brandIds?.some((id: any) => id.toString() === brandIdStr)
      return false
    })

    // Lọc: loại trừ sản phẩm nằm trong excludeProductIds hoặc thuốc kê đơn
    for (const campaign of campaigns) {
      if (campaign.excludeProductIds?.some((id: ObjectId) => id.toString() === productId.toString())) {
        continue
      }
      if (campaign.excludePrescription && requiresPrescription) {
        continue
      }
      return campaign as unknown as Campaign
    }

    return null
  }

  /**
   * Helper tính giá sau discount dựa trên campaign.
   * Dùng chung cho cart, order (Direct Buy, Cart Checkout).
   */
  applyDiscountToPrice(originalPrice: number, campaign: any): number {
    if (!campaign) return originalPrice
    if (campaign.discountType === 'percentage') {
      let discount = Math.round(originalPrice * (campaign.discountValue / 100))
      if (campaign.maxDiscountAmount) {
        discount = Math.min(discount, campaign.maxDiscountAmount)
      }
      return Math.max(0, originalPrice - discount)
    } else {
      // fixed_amount
      return Math.max(0, originalPrice - campaign.discountValue)
    }
  }

  /**
   * Tính giá sale cho 1 sản phẩm dựa trên campaign đang active
   */
  async calculateCampaignPrice(
    product: any
  ): Promise<CampaignPriceResult> {
    const defaultVariant = product.priceVariants?.find((v: any) => v.isDefault) || product.priceVariants?.[0]
    const originalPrice = defaultVariant?.price || 0

    const campaign = await this.getActiveCampaignForProduct(
      product._id,
      product.categoryId,
      product.brandId,
      product.requiresPrescription
    )

    if (!campaign) {
      return {
        hasCampaign: false,
        originalPrice,
        salePrice: originalPrice,
        discountPercent: 0
      }
    }

    let salePrice: number

    if (campaign.discountType === 'percentage') {
      let discount = Math.round(originalPrice * (campaign.discountValue / 100))
      if (campaign.maxDiscountAmount) {
        discount = Math.min(discount, campaign.maxDiscountAmount)
      }
      salePrice = Math.max(0, originalPrice - discount) // ✅ không cho giá âm
    } else {
      // fixed_amount
      salePrice = Math.max(0, originalPrice - campaign.discountValue)
    }

    const discountPercent = originalPrice > 0
      ? Math.round(((originalPrice - salePrice) / originalPrice) * 100)
      : 0

    return {
      hasCampaign: true,
      campaignName: campaign.name,
      badgeText: campaign.badgeText || `Giảm ${discountPercent}%`,
      badgeColor: campaign.badgeColor || '#FF5722',
      originalPrice,
      salePrice,
      discountPercent,
      campaignId: campaign._id
    }
  }

  /**
   * Tính giá sale cho TẤT CẢ price variants của 1 sản phẩm
   */
  async enrichProductWithCampaign(product: any): Promise<any> {
    const campaign = await this.getActiveCampaignForProduct(
      product._id,
      product.categoryId,
      product.brandId,
      product.requiresPrescription
    )

    if (!campaign) {
      return { ...product, campaign: null }
    }

    // Tính giá sale cho mỗi variant
    const enrichedVariants = (product.priceVariants || []).map((variant: any) => {
      let salePrice: number

      if (campaign.discountType === 'percentage') {
        let discount = Math.round(variant.price * (campaign.discountValue / 100))
        if (campaign.maxDiscountAmount) {
          discount = Math.min(discount, campaign.maxDiscountAmount)
        }
        salePrice = Math.max(0, variant.price - discount)
      } else {
        salePrice = Math.max(0, variant.price - campaign.discountValue)
      }

      return {
        ...variant,
        originalPrice: variant.price,
        salePrice,
        discountPercent: variant.price > 0
          ? Math.round(((variant.price - salePrice) / variant.price) * 100)
          : 0
      }
    })

    // Tính discountPercent thực tế từ variant default cho badgeText
    const defaultVariant = enrichedVariants.find((v: any) => v.isDefault) || enrichedVariants[0]
    const actualDiscountPercent = defaultVariant
      ? Math.round(((defaultVariant.originalPrice - defaultVariant.salePrice) / defaultVariant.originalPrice) * 100)
      : 0

    // Badge text: ưu tiên dùng % thực tế (sau khi tính maxDiscountAmount) thay vì raw discountValue
    const badgeText = campaign.badgeText
      || (actualDiscountPercent > 0 ? `-${actualDiscountPercent}%` : `Giảm ${campaign.discountValue}${campaign.discountType === 'percentage' ? '%' : 'đ'}`)

    return {
      ...product,
      priceVariants: enrichedVariants,
      campaign: {
        _id: campaign._id,
        name: campaign.name,
        badgeText,
        badgeColor: campaign.badgeColor || '#FF5722',
        endDate: campaign.endDate
      }
    }
  }

  /**
   * Enrich danh sách sản phẩm (cho product listing page)
   * Tối ưu: load tất cả active campaigns 1 lần rồi map
   */
  async enrichProductsWithCampaigns(products: any[]): Promise<any[]> {
    if (!products.length) return products

    // ✅ Cache: load active campaigns from Redis instead of MongoDB
    const activeCampaigns = await this.getActiveCampaignsCached()

    if (!activeCampaigns.length) return products

    return products.map(product => {
      // Tìm campaign phù hợp (priority cao nhất)
      const campaign = activeCampaigns.find(c => {
        // Check exclusions
        if (c.excludeProductIds?.some((id: ObjectId) => id.toString() === product._id.toString())) return false
        if (c.excludePrescription && product.requiresPrescription) return false

        // Check scope
        if (c.scope === 'all') return true
        if (c.scope === 'products' && c.productIds?.some((id: ObjectId) => id.toString() === product._id.toString())) return true
        if (c.scope === 'categories' && c.categoryIds?.some((id: ObjectId) => id.toString() === product.categoryId?.toString())) return true
        if (c.scope === 'brands' && product.brandId && c.brandIds?.some((id: ObjectId) => id.toString() === product.brandId?.toString())) return true

        return false
      })

      if (!campaign) return product

      // Enrich variants
      const enrichedVariants = (product.priceVariants || []).map((variant: any) => {
        let salePrice: number
        if (campaign.discountType === 'percentage') {
          let discount = Math.round(variant.price * (campaign.discountValue / 100))
          if (campaign.maxDiscountAmount) discount = Math.min(discount, campaign.maxDiscountAmount)
          salePrice = Math.max(0, variant.price - discount)
        } else {
          salePrice = Math.max(0, variant.price - campaign.discountValue)
        }

        return {
          ...variant,
          originalPrice: variant.price,
          salePrice,
          discountPercent: variant.price > 0
            ? Math.round(((variant.price - salePrice) / variant.price) * 100)
            : 0
        }
      })

      // Tính discountPercent thực tế từ variant default
      const defaultV = enrichedVariants.find((v: any) => v.isDefault) || enrichedVariants[0]
      const actualPct = defaultV
        ? Math.round(((defaultV.originalPrice - defaultV.salePrice) / defaultV.originalPrice) * 100)
        : 0
      const badgeText = campaign.badgeText
        || (actualPct > 0 ? `-${actualPct}%` : `Giảm ${campaign.discountValue}${campaign.discountType === 'percentage' ? '%' : 'đ'}`)

      return {
        ...product,
        priceVariants: enrichedVariants,
        campaign: {
          _id: campaign._id,
          name: campaign.name,
          badgeText,
          badgeColor: campaign.badgeColor || '#FF5722',
          endDate: campaign.endDate
        }
      }
    })
  }

  // ============================
  // CACHED HELPERS
  // ============================

  /**
   * Cached list of all active campaigns (sorted by priority).
   * This is the single source of truth for campaign lookups — used by:
   * - getActiveCampaignForProduct()
   * - enrichProductsWithCampaigns()
   * - getActiveCampaigns() (public API)
   */
  private async getActiveCampaignsCached(): Promise<any[]> {
    return cacheService.getOrSet(CACHE_KEYS.ACTIVE_CAMPAIGNS, async () => {
      const now = new Date()
      const allActive = await databaseService.campaigns.find({
        status: 'active'
      }).sort({ priority: -1 }).toArray()

      return allActive.filter(c => {
        const start = new Date(c.startDate)
        const end = new Date(c.endDate)
        return now >= start && now <= end
      })
    }, CAMPAIGN_TTL)
  }

  /**
   * Invalidate all campaign-related caches.
   * Called after every CRUD operation on campaigns.
   */
  private async invalidateCampaignCache(): Promise<void> {
    await cacheService.invalidate(
      CACHE_KEYS.ACTIVE_CAMPAIGNS,
      CACHE_KEYS.PUBLIC_CAMPAIGNS,
      'products:*' // Products embedding campaign data need refresh too
    )
  }

  // ============================
  // PUBLIC APIs
  // ============================

  async getActiveCampaigns() {
    return cacheService.getOrSet(CACHE_KEYS.PUBLIC_CAMPAIGNS, async () => {
      const now = new Date()
      const allActive = await databaseService.campaigns.find({
        status: 'active',
        isPublic: true
      }).sort({ priority: -1 }).toArray()

      return allActive.filter(c => {
        const start = new Date(c.startDate)
        const end = new Date(c.endDate)
        return now >= start && now <= end
      })
    }, CAMPAIGN_TTL)
  }

  async getCampaignBySlug(slug: string) {
    const campaign = await databaseService.campaigns.findOne({ slug })
    if (!campaign) {
      throw new ErrorWithStatus({ message: 'Không tìm thấy chiến dịch.', status: HTTP_STATUS.NOT_FOUND })
    }
    return campaign
  }

  // ============================
  // ADMIN CRUD
  // ============================

  async createCampaign(data: any, adminId: ObjectId) {
    // ─── Validate input ───
    if (!data.discountValue || data.discountValue <= 0) {
      throw new ErrorWithStatus({ message: 'Giá trị giảm phải lớn hơn 0.', status: HTTP_STATUS.BAD_REQUEST })
    }
    if (data.discountType === 'percentage' && data.discountValue > 100) {
      throw new ErrorWithStatus({ message: 'Phần trăm giảm phải từ 1–100%.', status: HTTP_STATUS.BAD_REQUEST })
    }
    if (data.startDate && data.endDate && new Date(data.endDate) <= new Date(data.startDate)) {
      throw new ErrorWithStatus({ message: 'Ngày kết thúc phải sau ngày bắt đầu.', status: HTTP_STATUS.BAD_REQUEST })
    }
    if (data.maxDiscountAmount !== undefined && data.maxDiscountAmount !== null && data.maxDiscountAmount < 0) {
      throw new ErrorWithStatus({ message: 'Giới hạn giảm tối đa không thể âm.', status: HTTP_STATUS.BAD_REQUEST })
    }

    // Auto-generate unique slug: base slug + timestamp to prevent collision
    const baseSlug = data.slug || data.name
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim()
    
    // Check if base slug exists, if so add timestamp suffix
    const existing = await databaseService.campaigns.findOne({ slug: baseSlug })
    const slug = existing ? `${baseSlug}-${Date.now()}` : baseSlug

    // Auto-set status dựa vào thời gian
    let status = data.status || 'draft'
    const now = new Date()
    if (status === 'active' || status === 'scheduled') {
      if (new Date(data.startDate) > now) status = 'scheduled'
      else if (new Date(data.endDate) < now) status = 'ended'
      else status = 'active'
    }

    const campaign = new Campaign({
      ...data,
      slug,
      status,
      productIds: data.productIds?.map((id: string) => new ObjectId(id)),
      categoryIds: data.categoryIds?.map((id: string) => new ObjectId(id)),
      brandIds: data.brandIds?.map((id: string) => new ObjectId(id)),
      excludeProductIds: data.excludeProductIds?.map((id: string) => new ObjectId(id)),
      createdBy: adminId
    })

    const result = await databaseService.campaigns.insertOne(campaign as any)
    await this.invalidateCampaignCache()
    void this.syncSearchPrices(`campaign created: ${result.insertedId.toString()}`)
    return { ...campaign, _id: result.insertedId }
  }

  async updateCampaign(campaignId: ObjectId, data: any) {
    const campaign = await databaseService.campaigns.findOne({ _id: campaignId })
    if (!campaign) {
      throw new ErrorWithStatus({ message: 'Không tìm thấy chiến dịch.', status: HTTP_STATUS.NOT_FOUND })
    }

    // ─── Validate input ───
    if (data.discountValue !== undefined) {
      if (data.discountValue <= 0) {
        throw new ErrorWithStatus({ message: 'Giá trị giảm phải lớn hơn 0.', status: HTTP_STATUS.BAD_REQUEST })
      }
      const type = data.discountType || campaign.discountType
      if (type === 'percentage' && data.discountValue > 100) {
        throw new ErrorWithStatus({ message: 'Phần trăm giảm phải từ 1–100%.', status: HTTP_STATUS.BAD_REQUEST })
      }
    }
    const startDate = data.startDate ? new Date(data.startDate) : new Date(campaign.startDate)
    const endDate = data.endDate ? new Date(data.endDate) : new Date(campaign.endDate)
    if (endDate <= startDate) {
      throw new ErrorWithStatus({ message: 'Ngày kết thúc phải sau ngày bắt đầu.', status: HTTP_STATUS.BAD_REQUEST })
    }

    const { createdBy: _by, createdAt: _at, _id: _id, ...updateData } = data

    // Convert string IDs to ObjectIds
    if (updateData.productIds) updateData.productIds = updateData.productIds.map((id: string) => new ObjectId(id))
    if (updateData.categoryIds) updateData.categoryIds = updateData.categoryIds.map((id: string) => new ObjectId(id))
    if (updateData.brandIds) updateData.brandIds = updateData.brandIds.map((id: string) => new ObjectId(id))
    if (updateData.excludeProductIds) updateData.excludeProductIds = updateData.excludeProductIds.map((id: string) => new ObjectId(id))

    // Tách các field cần xóa (gửi lên null/undefined/empty string) khỏi $set
    const unsetFields: Record<string, ''> = {}
    if (updateData.badgeText === '' || updateData.badgeText === null || updateData.badgeText === undefined) {
      unsetFields['badgeText'] = ''
      unsetFields['badgeColor'] = ''
      delete updateData.badgeText
      delete updateData.badgeColor
    }

    const updateOp: any = { $set: { ...updateData, updatedAt: new Date() } }
    if (Object.keys(unsetFields).length > 0) {
      updateOp.$unset = unsetFields
    }

    await databaseService.campaigns.updateOne({ _id: campaignId }, updateOp)
    await this.invalidateCampaignCache()
    void this.syncSearchPrices(`campaign updated: ${campaignId.toString()}`)

    return databaseService.campaigns.findOne({ _id: campaignId })
  }

  async deleteCampaign(campaignId: ObjectId) {
    const result = await databaseService.campaigns.deleteOne({ _id: campaignId })
    if (result.deletedCount === 0) {
      throw new ErrorWithStatus({ message: 'Không tìm thấy chiến dịch.', status: HTTP_STATUS.NOT_FOUND })
    }
    await this.invalidateCampaignCache()
    void this.syncSearchPrices(`campaign deleted: ${campaignId.toString()}`)
    return { message: 'Đã xóa chiến dịch.' }
  }

  async getCampaigns(page: number = 1, limit: number = 20, filter: any = {}) {
    const skip = (page - 1) * limit
    const query: any = {}

    if (filter.status) query.status = filter.status
    if (filter.search) {
      query.$or = [
        { name: { $regex: filter.search, $options: 'i' } },
        { slug: { $regex: filter.search, $options: 'i' } }
      ]
    }

    const [campaigns, total] = await Promise.all([
      databaseService.campaigns.find(query).sort({ priority: -1, createdAt: -1 }).skip(skip).limit(limit).toArray(),
      databaseService.campaigns.countDocuments(query)
    ])

    return { campaigns, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } }
  }

  async getCampaignById(campaignId: ObjectId) {
    const campaign = await databaseService.campaigns.findOne({ _id: campaignId })
    if (!campaign) {
      throw new ErrorWithStatus({ message: 'Không tìm thấy chiến dịch.', status: HTTP_STATUS.NOT_FOUND })
    }
    return campaign
  }

  async toggleCampaign(campaignId: ObjectId) {
    const campaign = await databaseService.campaigns.findOne({ _id: campaignId })
    if (!campaign) {
      throw new ErrorWithStatus({ message: 'Không tìm thấy chiến dịch.', status: HTTP_STATUS.NOT_FOUND })
    }

    // Toggle: active → inactive, mọi trạng thái khác → active
    const newStatus = campaign.status === 'active' ? 'inactive' : 'active'

    await databaseService.campaigns.updateOne(
      { _id: campaignId },
      { $set: { status: newStatus as any, updatedAt: new Date() } }
    )
    await this.invalidateCampaignCache()
    void this.syncSearchPrices(`campaign toggled: ${campaignId.toString()}`)

    return databaseService.campaigns.findOne({ _id: campaignId })
  }
}

const campaignService = new CampaignService()
export default campaignService
