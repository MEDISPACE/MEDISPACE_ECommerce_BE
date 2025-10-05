import { ObjectId } from 'mongodb'

interface MediaItem {
  url: string
  alt?: string
  type: 'main' | 'gallery' | 'packaging'
  sortOrder: number
}

interface DocumentItem {
  name: string
  url: string
  type: 'leaflet' | 'certificate' | 'manual'
}

interface ProductMediaType {
  _id?: ObjectId
  productId: ObjectId

  // Media & Documentation
  images: MediaItem[]
  videos: string[]
  documents: DocumentItem[]

  createdAt?: Date
  updatedAt?: Date
}

export default class ProductMedia {
  _id?: ObjectId
  productId: ObjectId

  // Media & Documentation
  images: MediaItem[]
  videos: string[]
  documents: DocumentItem[]

  createdAt?: Date
  updatedAt?: Date

  constructor(productMedia: ProductMediaType) {
    const date = new Date()
    this._id = productMedia._id
    this.productId = productMedia.productId

    this.images = productMedia.images || []
    this.videos = productMedia.videos || []
    this.documents = productMedia.documents || []

    this.createdAt = productMedia.createdAt || date
    this.updatedAt = productMedia.updatedAt || date
  }
}
