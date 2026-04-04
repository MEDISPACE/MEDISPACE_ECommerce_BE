import { ObjectId } from 'mongodb'
import Campaign from '~/models/schemas/Campaign.schema'
import databaseService from './database.services'
import { ErrorWithStatus } from '~/models/Error'
import HTTP_STATUS from '~/constants/httpStatus'

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

    // Build query: tìm campaign đang active, trong thời gian hiệu lực
    const baseCriteria = {
      status: 'active' as const,
      startDate: { $lte: now },
      endDate: { $gte: now }
    }

    // Tìm tất cả campaign phù hợp
    const campaigns = await databaseService.campaigns.find({
      ...baseCriteria,
      $or: [
        { scope: 'all' },
        { scope: 'products', productIds: productId },
        { scope: 'categories', categoryIds: categoryId },
        ...(brandId ? [{ scope: 'brands' as const, brandIds: brandId }] : [])
      ]
    }).sort({ priority: -1 }).toArray()

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
      let discount = Math.floor(originalPrice * (campaign.discountValue / 100))
      if (campaign.maxDiscountAmount) {
        discount = Math.min(discount, campaign.maxDiscountAmount)
      }
      salePrice = originalPrice - discount
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
        let discount = Math.floor(variant.price * (campaign.discountValue / 100))
        if (campaign.maxDiscountAmount) {
          discount = Math.min(discount, campaign.maxDiscountAmount)
        }
        salePrice = variant.price - discount
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

    return {
      ...product,
      priceVariants: enrichedVariants,
      campaign: {
        _id: campaign._id,
        name: campaign.name,
        badgeText: campaign.badgeText || `Giảm ${campaign.discountValue}${campaign.discountType === 'percentage' ? '%' : 'đ'}`,
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

    const now = new Date()

    // Load tất cả active campaigns 1 lần
    const activeCampaigns = await databaseService.campaigns.find({
      status: 'active',
      startDate: { $lte: now },
      endDate: { $gte: now }
    }).sort({ priority: -1 }).toArray()

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
          let discount = Math.floor(variant.price * (campaign.discountValue / 100))
          if (campaign.maxDiscountAmount) discount = Math.min(discount, campaign.maxDiscountAmount)
          salePrice = variant.price - discount
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

      return {
        ...product,
        priceVariants: enrichedVariants,
        campaign: {
          _id: campaign._id,
          name: campaign.name,
          badgeText: campaign.badgeText || `Giảm ${campaign.discountValue}${campaign.discountType === 'percentage' ? '%' : 'đ'}`,
          badgeColor: campaign.badgeColor || '#FF5722',
          endDate: campaign.endDate
        }
      }
    })
  }

  // ============================
  // PUBLIC APIs
  // ============================

  async getActiveCampaigns() {
    const now = new Date()
    return databaseService.campaigns.find({
      status: 'active',
      isPublic: true,
      startDate: { $lte: now },
      endDate: { $gte: now }
    }).sort({ priority: -1 }).toArray()
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
    const existing = await databaseService.campaigns.findOne({ slug: data.slug })
    if (existing) {
      throw new ErrorWithStatus({ message: 'Slug chiến dịch đã tồn tại.', status: HTTP_STATUS.BAD_REQUEST })
    }

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
      status,
      productIds: data.productIds?.map((id: string) => new ObjectId(id)),
      categoryIds: data.categoryIds?.map((id: string) => new ObjectId(id)),
      brandIds: data.brandIds?.map((id: string) => new ObjectId(id)),
      excludeProductIds: data.excludeProductIds?.map((id: string) => new ObjectId(id)),
      createdBy: adminId
    })

    const result = await databaseService.campaigns.insertOne(campaign as any)
    return { ...campaign, _id: result.insertedId }
  }

  async updateCampaign(campaignId: ObjectId, data: any) {
    const campaign = await databaseService.campaigns.findOne({ _id: campaignId })
    if (!campaign) {
      throw new ErrorWithStatus({ message: 'Không tìm thấy chiến dịch.', status: HTTP_STATUS.NOT_FOUND })
    }

    const { createdBy: _by, createdAt: _at, _id: _id, ...updateData } = data

    // Convert string IDs to ObjectIds
    if (updateData.productIds) updateData.productIds = updateData.productIds.map((id: string) => new ObjectId(id))
    if (updateData.categoryIds) updateData.categoryIds = updateData.categoryIds.map((id: string) => new ObjectId(id))
    if (updateData.brandIds) updateData.brandIds = updateData.brandIds.map((id: string) => new ObjectId(id))
    if (updateData.excludeProductIds) updateData.excludeProductIds = updateData.excludeProductIds.map((id: string) => new ObjectId(id))

    await databaseService.campaigns.updateOne(
      { _id: campaignId },
      { $set: { ...updateData, updatedAt: new Date() } }
    )

    return databaseService.campaigns.findOne({ _id: campaignId })
  }

  async deleteCampaign(campaignId: ObjectId) {
    const result = await databaseService.campaigns.deleteOne({ _id: campaignId })
    if (result.deletedCount === 0) {
      throw new ErrorWithStatus({ message: 'Không tìm thấy chiến dịch.', status: HTTP_STATUS.NOT_FOUND })
    }
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

    const newStatus = (campaign.status === 'active' || campaign.status === 'scheduled') ? 'ended' : 'active'
    
    await databaseService.campaigns.updateOne(
      { _id: campaignId },
      { $set: { status: newStatus as any, updatedAt: new Date() } }
    )

    return databaseService.campaigns.findOne({ _id: campaignId })
  }
}

const campaignService = new CampaignService()
export default campaignService
