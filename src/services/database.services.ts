import { MongoClient, Db, Collection } from 'mongodb'
import { config } from 'dotenv'
import User from '~/models/schemas/User.schema'
import RefreshToken from '~/models/schemas/RefreshToken.schema'
import Category from '~/models/schemas/Category.schema'
import Brand from '~/models/schemas/Brand.schema'
import Product from '~/models/schemas/Product.schema'
import ProductMedia from '~/models/schemas/ProductMedia.schema'
config()

const uri = `mongodb+srv://${process.env.DB_USERNAME}:${process.env.DB_PASSWORD}@medispacedb.35qkwso.mongodb.net/?retryWrites=true&w=majority&appName=MediSpaceDB`

class DatabaseService {
  private client: MongoClient
  private db: Db
  constructor() {
    this.client = new MongoClient(uri)
    this.db = this.client.db(process.env.DB_NAME)
  }
  async connect() {
    try {
      await this.client.connect()
      await this.db.command({ ping: 1 })
      console.log('You successfully connected to MongoDB!')
    } catch (error) {
      console.error('Error connecting to MongoDB:', error)
      process.exit(1)
    }
  }
  get users(): Collection<User> {
    return this.db.collection(process.env.USERS_COLLECTION as string)
  }
  get refreshTokens(): Collection<RefreshToken> {
    return this.db.collection(process.env.DB_REFRESH_TOKENS_COLLECTION as string)
  }
  get categories(): Collection<Category> {
    return this.db.collection(process.env.DB_CATEGORIES_COLLECTION as string)
  }
  get brands(): Collection<Brand> {
    return this.db.collection(process.env.DB_BRANDS_COLLECTION as string)
  }
  get products(): Collection<Product> {
    return this.db.collection(process.env.DB_PRODUCTS_COLLECTION as string)
  }
  get productMedia(): Collection<ProductMedia> {
    return this.db.collection(process.env.DB_PRODUCT_MEDIA_COLLECTION as string)
  }
}

//Tao Object tu Class DatabaseService
const databaseService = new DatabaseService()
export default databaseService
