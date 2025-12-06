import path from 'path'

// Local directories (for temporary storage)
export const UPLOAD_IMAGE_TEMP_DIR = path.resolve('uploads/images-temp')
export const UPLOAD_VIDEO_TEMP_DIR = path.resolve('uploads/videos-temp')

// Legacy local directories (không còn sử dụng khi dùng S3)
export const UPLOAD_IMAGE_DIR = path.resolve('uploads/images')
export const UPLOAD_VIDEO_DIR = path.resolve('uploads/videos')

// AWS S3 Configuration
export const S3_BUCKET_NAME = process.env.AWS_S3_BUCKET_NAME as string

// S3 Folders
export const S3_IMAGE_FOLDER = 'images'
export const S3_VIDEO_FOLDER = 'videos'
