// Product Request Types
export interface CreateProductReqBody {
  name: string
  slug?: string
  sku: string
  barcode?: string
  shortDescription: string
  categoryId: string
  brandId?: string
  price?: number
  originalPrice?: number
  costPrice?: number
  stockQuantity?: number
  maxOrderQuantity?: number
  status?: 'active' | 'discontinued' | 'out_of_stock'
  isActive?: boolean
  requiresPrescription?: boolean
  featuredImage?: string
}

export interface UpdateProductReqBody {
  name?: string
  slug?: string
  sku?: string
  barcode?: string
  shortDescription?: string
  categoryId?: string
  brandId?: string
  price?: number
  originalPrice?: number
  costPrice?: number
  stockQuantity?: number
  maxOrderQuantity?: number
  status?: 'active' | 'discontinued' | 'out_of_stock'
  isActive?: boolean
  requiresPrescription?: boolean
  featuredImage?: string
}

export interface GetProductsQuery {
  page?: string
  limit?: string
  categoryId?: string
  brandId?: string
  status?: string
  isActive?: string
  requiresPrescription?: string
  search?: string
  sortBy?: 'name' | 'createdAt' | 'stockQuantity' | 'sku'
  sortOrder?: 'asc' | 'desc'
  minStock?: string
  maxStock?: string
}

// Product Detail Request Types
export interface CreateProductDetailReqBody {
  productId: string
  activeIngredients?: string
  dosageForm: 'tablet' | 'capsule' | 'syrup' | 'injection' | 'cream' | 'drops'
  packSize: string
  strength?: string
  manufacturer: string
  indications?: string
  dosageInstructions: string
  storageInstructions: string
}

export interface UpdateProductDetailReqBody {
  activeIngredients?: string
  dosageForm?: 'tablet' | 'capsule' | 'syrup' | 'injection' | 'cream' | 'drops'
  packSize?: string
  strength?: string
  manufacturer?: string
  indications?: string
  dosageInstructions?: string
  storageInstructions?: string
}

// Brand Request Types
export interface CreateBrandReqBody {
  name: string
  slug?: string
  logo?: string
  description?: string
  website?: string
  country?: string
  isActive?: boolean
}

export interface UpdateBrandReqBody {
  name?: string
  slug?: string
  logo?: string
  description?: string
  website?: string
  country?: string
  isActive?: boolean
}

export interface GetBrandsQuery {
  page?: string
  limit?: string
  isActive?: string
  search?: string
  country?: string
  sortBy?: 'name' | 'createdAt' | 'productCount'
  sortOrder?: 'asc' | 'desc'
}

// Product Media Request Types
export interface MediaItem {
  url: string
  alt?: string
  type: 'main' | 'gallery' | 'packaging'
  sortOrder: number
}

export interface DocumentItem {
  name: string
  url: string
  type: 'leaflet' | 'certificate' | 'manual'
}

export interface CreateProductMediaReqBody {
  productId: string
  images?: MediaItem[]
  videos?: string[]
  documents?: DocumentItem[]
}

export interface UpdateProductMediaReqBody {
  images?: MediaItem[]
  videos?: string[]
  documents?: DocumentItem[]
}
