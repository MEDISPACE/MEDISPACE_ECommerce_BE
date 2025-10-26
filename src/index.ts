import express from 'express'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import databaseService from './services/database.services'
import { config } from 'dotenv'
import usersRouter from './routes/users.routes'
import categoriesRouter from './routes/categories.routes'
import brandsRouter from './routes/brands.routes'
import productsRouter from './routes/products.routes'
import cartsRouter from './routes/carts.routes'
import { defaultErrorHandler } from '~/middlewares/error.middlewares'

config()

const app = express()
databaseService.connect()

// Parse cookies
app.use(cookieParser())

// CORS configuration - Allow frontend to connect
app.use(
  cors({
    origin: process.env.FRONTEND_URLS, // Frontend URL from env
    credentials: true, // Allow cookies/auth headers
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
  })
)

app.use(express.json())
app.use('/users', usersRouter)
app.use('/categories', categoriesRouter)
app.use('/brands', brandsRouter)
app.use('/products', productsRouter)
app.use('/cart', cartsRouter)

// Register central error handler so validation and other errors return JSON
app.use(defaultErrorHandler)

app.listen(process.env.PORT, () => {
  console.log(`App listening at http://localhost:${process.env.PORT}`)
})
