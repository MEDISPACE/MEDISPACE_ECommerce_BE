import express from 'express'
import databaseService from './services/database.services'
import { config } from 'dotenv'
import usersRouter from './routes/users.routes'
import categoriesRouter from './routes/categories.routes'
import brandsRouter from './routes/brands.routes'
import productsRouter from './routes/products.routes'
import { defaultErrorHandler } from '~/middlewares/error.middlewares'
import cors from 'cors'
config()

const app = express()
databaseService.connect()
app.use(
  cors({
    origin: 'http://localhost:3000',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    credentials: true
  })
)
app.use(express.json())
app.use('/users', usersRouter)
app.use('/categories', categoriesRouter)
app.use('/brands', brandsRouter)
app.use('/products', productsRouter)
app.use('/brands', brandsRouter)

// Register central error handler so validation and other errors return JSON
app.use(defaultErrorHandler)

app.listen(process.env.PORT, () => {
  console.log(`App listening at http://localhost:${process.env.PORT}`)
})
