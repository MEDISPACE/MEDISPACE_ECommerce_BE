import express from 'express'
import databaseService from './services/database.services'
import { config } from 'dotenv'
import usersRouter from './routes/users.routes'
import { defaultErrorHandler } from '~/middlewares/error.middlewares'
config()

const app = express()
databaseService.connect()

app.use(express.json())
app.use('/users', usersRouter)

// Register central error handler so validation and other errors return JSON
app.use(defaultErrorHandler)

app.listen(process.env.PORT, () => {
  console.log(`App listening at http://localhost:${process.env.PORT}`)
})
