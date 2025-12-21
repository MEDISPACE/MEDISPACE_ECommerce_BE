import { MongoClient, Db, Collection } from 'mongodb'
import { config } from 'dotenv'
import User from '~/models/schemas/User.schema'
import RefreshToken from '~/models/schemas/RefreshToken.schema'
import Category from '~/models/schemas/Category.schema'
import Brand from '~/models/schemas/Brand.schema'
import Product from '~/models/schemas/Product.schema'
import ProductMedia from '~/models/schemas/ProductMedia.schema'
import Cart from '~/models/schemas/Cart.schema'
import Order from '~/models/schemas/Order.schema'
import Prescription from '~/models/schemas/Prescription.schema'
import PatientMedicalInfo from '~/models/schemas/PatientMedicalInfo.schema'
import PatientNote from '~/models/schemas/PatientNote.schema'
import Review from '~/models/schemas/Review.schema'
import ProductDetail from '~/models/schemas/ProductDetail.schema'
import Conversation from '~/models/schemas/Conversation.schema'
import Message from '~/models/schemas/Message.schema'
import Article from '~/models/schemas/Article.schema'
import HealthCategory from '~/models/schemas/HealthCategory.schema'

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
    } catch (error) {
      // Reference error silently to satisfy linters, then exit
      void error
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
  get carts(): Collection<Cart> {
    return this.db.collection(process.env.DB_CARTS_COLLECTION as string)
  }
  get orders(): Collection<Order> {
    return this.db.collection(process.env.DB_ORDERS_COLLECTION as string)
  }
  get prescriptions(): Collection<Prescription> {
    return this.db.collection(process.env.DB_PRESCRIPTIONS_COLLECTION as string)
  }
  get patientMedicalInfos(): Collection<PatientMedicalInfo> {
    return this.db.collection(process.env.DB_PATIENT_MEDICAL_INFOS_COLLECTION as string)
  }
  get patientNotes(): Collection<PatientNote> {
    return this.db.collection(process.env.DB_PATIENT_NOTES_COLLECTION as string)
  }
  get reviews(): Collection<Review> {
    return this.db.collection(process.env.DB_REVIEWS_COLLECTION as string)
  }
  get productDetails(): Collection<ProductDetail> {
    return this.db.collection(process.env.DB_PRODUCT_DETAILS_COLLECTION as string)
  }
  get conversations(): Collection<Conversation> {
    return this.db.collection(process.env.DB_CONVERSATIONS_COLLECTION as string)
  }
  get messages(): Collection<Message> {
    return this.db.collection(process.env.DB_MESSAGES_COLLECTION as string)
  }
  get articles(): Collection<Article> {
    return this.db.collection(process.env.DB_ARTICLES_COLLECTION as string)
  }
  get healthCategories(): Collection<HealthCategory> {
    return this.db.collection(process.env.DB_HEALTH_CATEGORIES_COLLECTION as string)
  }
}

//Tao Object tu Class DatabaseService
const databaseService = new DatabaseService()
export default databaseService
