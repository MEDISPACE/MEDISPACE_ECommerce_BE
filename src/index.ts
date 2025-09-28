import express from 'express'
import cors from 'cors'
import databaseService from './services/database.services'
import { config } from 'dotenv'
import usersRouter from './routes/users.routes'
import { defaultErrorHandler } from '~/middlewares/error.middlewares'
config()

const app = express()
databaseService.connect()

// CORS configuration - Allow frontend to connect
app.use(
  cors({
    origin: ['http://localhost:3001', 'http://localhost:5173'], // Frontend URLs
    credentials: true, // Allow cookies/auth headers
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
  })
)

app.use(express.json())
app.use('/users', usersRouter)

// Register central error handler so validation and other errors return JSON
app.use(defaultErrorHandler)

app.listen(process.env.PORT, () => {
  console.log(`App listening at http://localhost:${process.env.PORT}`)
})
