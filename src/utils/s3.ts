import { S3Client } from '@aws-sdk/client-s3'
import { config } from 'dotenv'

config()

// Khởi tạo S3 Client
const s3Client = new S3Client({
  region: process.env.AWS_REGION as string
})

export default s3Client
