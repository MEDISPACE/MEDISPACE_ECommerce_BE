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
import { defaultErrorHandler } from '~/middlewares/error.middlewares'

config()

const app = express()
databaseService.connect()
cleanupService.startCartCleanup()

// Parse cookies
app.use(cookieParser())

// CORS configuration - Allow frontend to connect
app.use(
  cors({
    origin: process.env.FRONTEND_URLS, // Frontend URL from env
    credentials: true, // Allow cookies/auth headers
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

// Register central error handler so validation and other errors return JSON
app.use(defaultErrorHandler)

app.listen(process.env.PORT, () => {
  console.log(`Server is running on port ${process.env.PORT}`)
})
