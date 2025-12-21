import { handleUploadImage, handleUploadVideo, uploadFileToS3, deleteLocalFile } from '~/utils/file'
import { Request } from 'express'
import sharp from 'sharp'
import { S3_IMAGE_FOLDER, S3_VIDEO_FOLDER } from '~/constants/dir'
import fs from 'fs'
import path from 'path'
import { config } from 'dotenv'
import { MediaType } from '~/constants/enum'
import { Media } from '~/models/Orther'
config()

class MediasService {
    /**
     * Upload hình ảnh lên S3
     * - Nhận file từ client
     * - Xử lý với Sharp (convert sang JPEG, optimize)
     * - Upload lên S3
     * - Xóa file tạm
     */
    async uploadImage(req: Request) {

        const files = await handleUploadImage(req)

        const result: Media[] = await Promise.all(
            files.map(async (file) => {

                // Tạo file tạm để xử lý với Sharp
                const tempProcessedPath = `${file.filepath}-processed.jpeg`

                try {
                    // Xử lý ảnh với Sharp: convert sang JPEG và optimize
                    await sharp(file.filepath)
                        .jpeg({ quality: 80 }) // Compress với quality 80%
                        .toFile(tempProcessedPath)

                    // Upload file đã xử lý lên S3
                    const s3Url = await uploadFileToS3(
                        tempProcessedPath,
                        S3_IMAGE_FOLDER,
                        'image/jpeg'
                    )

                    // Xóa cả file gốc và file đã xử lý
                    deleteLocalFile(file.filepath)
                    deleteLocalFile(tempProcessedPath)

                    return {
                        url: s3Url,
                        type: MediaType.Image
                    }
                } catch (error) {
                    // Cleanup nếu có lỗi
                    deleteLocalFile(file.filepath)
                    deleteLocalFile(tempProcessedPath)
                    throw error
                }
            })
        )
        return result
    }

    // TODO: Uncomment khi cần upload video
    // /**
    //  * Upload video lên S3
    //  * - Nhận file từ client
    //  * - Upload trực tiếp lên S3 (không xử lý)
    //  * - Xóa file tạm
    //  */
    // async uploadVideo(req: Request) {
    //     const files = await handleUploadVideo(req)
    //     const result: Media[] = await Promise.all(
    //         files.map(async (file) => {
    //             try {
    //                 // Xác định MIME type dựa trên extension
    //                 const extension = path.extname(file.newFilename).toLowerCase()
    //                 const contentType = extension === '.mov' ? 'video/quicktime' : 'video/mp4'
    //                 
    //                 // Upload lên S3
    //                 const s3Url = await uploadFileToS3(
    //                     file.filepath,
    //                     S3_VIDEO_FOLDER,
    //                     contentType
    //                 )
    //                 
    //                 // Xóa file tạm
    //                 deleteLocalFile(file.filepath)
    //                 
    //                 return {
    //                     url: s3Url,
    //                     type: MediaType.Video
    //                 }
    //             } catch (error) {
    //                 // Cleanup nếu có lỗi
    //                 deleteLocalFile(file.filepath)
    //                 throw error
    //             }
    //         })
    //     )
    //     return result
    // }
}

export const mediasService = new MediasService()
