import { ObjectId } from 'mongodb'

export type CampaignDiscountType = 'percentage' | 'fixed_amount'
export type CampaignStatus = 'draft' | 'scheduled' | 'active' | 'ended' | 'cancelled'

export interface CampaignType_Schema {
  _id?: ObjectId
  name: string // VD: "Flash Sale Cuối Tuần", "Giảm giá Mùa Hè"
  slug: string
  description?: string
  bannerImage?: string // Ảnh banner chiến dịch

  // Loại giảm giá
  discountType: CampaignDiscountType
  discountValue: number // % hoặc VNĐ
  maxDiscountAmount?: number // Giới hạn tối đa (cho percentage)

  // Phạm vi áp dụng
  scope: 'all' | 'products' | 'categories' | 'brands'
  productIds?: ObjectId[] // Nếu scope = 'products'
  categoryIds?: ObjectId[] // Nếu scope = 'categories'
  brandIds?: ObjectId[] // Nếu scope = 'brands'
  excludeProductIds?: ObjectId[] // Sản phẩm loại trừ
  excludePrescription?: boolean // Không áp dụng cho thuốc kê đơn

  // Thời gian
  startDate: Date
  endDate: Date
  status: CampaignStatus

  // Hiển thị
  priority: number // Campaign có priority cao hơn sẽ được ưu tiên (nếu trùng sản phẩm)
  isPublic: boolean // Hiển thị trên storefront
  badgeText?: string // VD: "SALE 50%", "Flash Sale", "Mùa Hè"
  badgeColor?: string // VD: "#FF5722"

  createdBy: ObjectId
  createdAt?: Date
  updatedAt?: Date
}

export default class Campaign {
  _id?: ObjectId
  name: string
  slug: string
  description?: string
  bannerImage?: string

  discountType: CampaignDiscountType
  discountValue: number
  maxDiscountAmount?: number

  scope: 'all' | 'products' | 'categories' | 'brands'
  productIds?: ObjectId[]
  categoryIds?: ObjectId[]
  brandIds?: ObjectId[]
  excludeProductIds?: ObjectId[]
  excludePrescription: boolean

  startDate: Date
  endDate: Date
  status: CampaignStatus

  priority: number
  isPublic: boolean
  badgeText?: string
  badgeColor?: string

  createdBy: ObjectId
  createdAt: Date
  updatedAt: Date

  constructor(campaign: CampaignType_Schema) {
    const date = new Date()
    this._id = campaign._id || new ObjectId()
    this.name = campaign.name
    this.slug = campaign.slug
    this.description = campaign.description
    this.bannerImage = campaign.bannerImage

    this.discountType = campaign.discountType
    this.discountValue = campaign.discountValue
    this.maxDiscountAmount = campaign.maxDiscountAmount

    this.scope = campaign.scope || 'all'
    this.productIds = campaign.productIds
    this.categoryIds = campaign.categoryIds
    this.brandIds = campaign.brandIds
    this.excludeProductIds = campaign.excludeProductIds
    this.excludePrescription = campaign.excludePrescription || false

    this.startDate = campaign.startDate ? new Date(campaign.startDate) : new Date()
    this.endDate = campaign.endDate ? new Date(campaign.endDate) : new Date()
    this.status = campaign.status || 'draft'

    this.priority = campaign.priority || 0
    this.isPublic = campaign.isPublic !== undefined ? campaign.isPublic : true
    this.badgeText = campaign.badgeText
    this.badgeColor = campaign.badgeColor

    this.createdBy = campaign.createdBy
    this.createdAt = campaign.createdAt || date
    this.updatedAt = campaign.updatedAt || date
  }
}
