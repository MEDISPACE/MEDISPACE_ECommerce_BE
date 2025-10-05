import { ObjectId } from 'mongodb'

interface ProductDetailType {
  _id?: ObjectId
  productId: ObjectId

  // Medical Information
  activeIngredients?: string
  dosageForm: string // 'tablet' | 'capsule' | 'syrup' | 'injection' | 'cream' | 'drops'
  packSize: string // e.g., '30 tablets', '100ml bottle'
  strength?: string // e.g., '500mg', '10mg/ml'
  manufacturer: string

  // Medical Usage
  indications?: string // What it treats
  dosageInstructions: string // How to use
  storageInstructions: string // Storage requirements

  // Timestamps
  createdAt?: Date
  updatedAt?: Date
}

export default class ProductDetail {
  _id?: ObjectId
  productId: ObjectId

  // Medical Information
  activeIngredients?: string
  dosageForm: string
  packSize: string
  strength?: string
  manufacturer: string

  // Medical Usage
  indications?: string
  dosageInstructions: string
  storageInstructions: string

  // Timestamps
  createdAt?: Date
  updatedAt?: Date

  constructor(productDetail: ProductDetailType) {
    const date = new Date()
    this._id = productDetail._id
    this.productId = productDetail.productId

    this.activeIngredients = productDetail.activeIngredients
    this.dosageForm = productDetail.dosageForm
    this.packSize = productDetail.packSize
    this.strength = productDetail.strength
    this.manufacturer = productDetail.manufacturer

    this.indications = productDetail.indications
    this.dosageInstructions = productDetail.dosageInstructions
    this.storageInstructions = productDetail.storageInstructions

    this.createdAt = productDetail.createdAt || date
    this.updatedAt = productDetail.updatedAt || date
  }
}
