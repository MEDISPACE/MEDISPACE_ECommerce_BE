import express from 'express'

import cors from 'cors'
import cookieParser from 'cookie-parser'
import databaseService from './services/database.services'
import cleanupService from './services/cleanup.services'
import { config } from 'dotenv'
import usersRouter from './routes/users.routes'
import categoriesRouter from './routes/categories.routes'
import brandsRouter from './routes/brands.routes'
import productsRouter from './routes/products.routes'
import cartsRouter from './routes/carts.routes'
import ordersRouter from './routes/orders.routes'
import addressesRouter from './routes/addresses.routes'
import notificationsRouter from './routes/notifications.routes'
import prescriptionsRouter from './routes/prescriptions.routes'
import pharmacistRouter from './routes/pharmacist.routes'
import paymentRouter from './routes/payment.routes'
import adminRouter from './routes/admin.routes'
import mediasRouter from './routes/medias.route'
import reviewsRouter from './routes/reviews.routes'
import chatsRouter from './routes/chats.routes'
import articlesRouter from './routes/articles.routes'
import healthCategoriesRouter from './routes/healthCategories.routes'
import ghnRouter from './routes/ghn.routes'
import returnRequestsRouter from './routes/returnRequests.routes'
import searchRouter from './routes/search.routes'
import typesenseService from './services/typesense.services'
import { defaultErrorHandler } from '~/middlewares/error.middlewares'

import { initFolder } from './utils/file'

config()

const app = express()

databaseService.connect()
cleanupService.startCartCleanup()
cleanupService.startAbandonedOrderCleanup() // Cleanup abandoned orders every hour
cleanupService.startStaleConversationReassign() // Re-queue stale chat conversations every 5 minutes
initFolder() // Tạo thư mục temp cho upload
typesenseService.initCollections() // Initialize Typesense search index

// Parse cookies
app.use(cookieParser())

// CORS configuration - Allow frontend to connect
const allowedOrigins = process.env.FRONTEND_URLS?.split(',').map((url) => url.trim()) || []
app.use(
  cors({
    origin: allowedOrigins.length > 0 ? allowedOrigins : true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
  })
)

app.use(express.json())
app.use('/users', usersRouter)
app.use('/categories', categoriesRouter)
app.use('/brands', brandsRouter)
app.use('/products', productsRouter)
app.use('/cart', cartsRouter)
app.use('/orders', ordersRouter)
app.use('/addresses', addressesRouter)
app.use('/notifications', notificationsRouter)
app.use('/prescriptions', prescriptionsRouter)
app.use('/pharmacist', pharmacistRouter)
app.use('/payment', paymentRouter)
app.use('/admin', adminRouter)
app.use('/medias', mediasRouter)
app.use('/reviews', reviewsRouter)
app.use('/chats', chatsRouter)
app.use('/articles', articlesRouter)
app.use('/health-categories', healthCategoriesRouter)
app.use('/ghn', ghnRouter)
app.use('/returns', returnRequestsRouter)
app.use('/search', searchRouter)

// Register central error handler so validation and other errors return JSON
app.use(defaultErrorHandler)

// Create HTTP server for Socket.IO
import { createServer } from 'http'
import { initChatSocket } from './sockets/chat.socket'

const httpServer = createServer(app)

// Initialize Socket.IO for chat
initChatSocket(httpServer)

const port = Number(process.env.PORT) || 8000
httpServer.listen(port, '0.0.0.0', () => {
  console.log(`Server is running on port ${port}`)
  console.log(`Socket.IO is ready for chat connections`)
})
