import fs from 'fs'
import formidable, { File } from 'formidable'
import { Request } from 'express'
import { USERS_MESSAGES } from '~/constants/message'
import { UPLOAD_IMAGE_TEMP_DIR, UPLOAD_VIDEO_TEMP_DIR, S3_BUCKET_NAME, S3_IMAGE_FOLDER, S3_VIDEO_FOLDER } from '~/constants/dir'
import { Upload } from '@aws-sdk/lib-storage'
import { PutObjectCommand } from '@aws-sdk/client-s3'
import s3Client from './s3'
import path from 'path'
import { v4 as uuidv4 } from 'uuid'

export const initFolder = () => {
    ;[UPLOAD_IMAGE_TEMP_DIR, UPLOAD_VIDEO_TEMP_DIR].forEach((dir) => {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true })
        }
    })
}
export const handleUploadImage = async (req: Request) => {
    const form = formidable({
        uploadDir: UPLOAD_IMAGE_TEMP_DIR,
        maxFiles: 4,
        keepExtensions: true,
        maxFileSize: 2 * 1024 * 1024, // 2MB
        maxTotalFileSize: 4 * 2 * 1024 * 1024, // 8MB
        filter: function (part: any) {
            const { name, mimetype } = part
            const valid = name === 'image' && Boolean(mimetype?.includes('image/'))
            if (!valid) {
                form.emit('error' as any, new Error(USERS_MESSAGES.FILE_IS_NOT_VALID) as any)
            }
            return valid
        }
    })
    return new Promise<File[]>((resolve, reject) => {
        form.parse(req, (err: any, fields: any, files: any) => {
            if (err) {
                return reject(err)
            }
            if (Boolean(files.image) === false) {
                return reject(new Error(USERS_MESSAGES.FILE_IS_EMPTY))
            }
            resolve(files.image as File[])
        })
    })
}
export const getNameFromFullName = (fullName: string) => {
    const parts = fullName.trim().split('.')
    const name = parts.slice(0, 1).join('.')
    return name
}
export const getExtensionFromFullName = (fullName: string) => {
    const parts = fullName.trim().split('.')
    return parts[parts.length - 1]
}

/**
 * Upload file lên S3
 * @param filePath - Đường dẫn file local
 * @param folder - Thư mục trên S3 (images hoặc videos)
 * @param contentType - MIME type của file
 * @returns S3 URL của file đã upload
 */
export const uploadFileToS3 = async (
    filePath: string,
    folder: string,
    contentType: string
): Promise<string> => {
    const fileStream = fs.createReadStream(filePath)
    const fileName = `${folder}/${uuidv4()}.${getExtensionFromFullName(filePath)}`

    const uploadParams = {
        Bucket: S3_BUCKET_NAME,
        Key: fileName,
        Body: fileStream,
        ContentType: contentType
    }

    try {
        const upload = new Upload({
            client: s3Client,
            params: uploadParams
        })

        await upload.done()

        // Trả về URL của file trên S3
        const s3Url = `https://${S3_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${fileName}`
        return s3Url
    } catch (error) {

        throw error
    }
}

/**
 * Xóa file local sau khi upload lên S3
 * @param filePath - Đường dẫn file cần xóa
 */
export const deleteLocalFile = (filePath: string) => {
    if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath)
    }
}
export const handleUploadVideo = async (req: Request) => {
    const form = formidable({
        uploadDir: UPLOAD_VIDEO_TEMP_DIR,
        maxFiles: 1,
        keepExtensions: false, // Đổi thành false để tự quản lý extension
        maxFileSize: 50 * 1024 * 1024, // 50MB
        filter: function (part: any) {
            const { name, mimetype } = part
            const valid = name === 'video' && Boolean(mimetype?.includes('mp4') || mimetype?.includes('quicktime'))
            if (!valid) {
                form.emit('error' as any, new Error(USERS_MESSAGES.FILE_IS_NOT_VALID) as any)
            }
            return valid
        }
    })
    return new Promise<File[]>((resolve, reject) => {
        form.parse(req, (err: any, fields: any, files: any) => {
            if (err) {
                reject(err)
            }
            if (Boolean(files.video) === false) {
                return reject(new Error(USERS_MESSAGES.FILE_IS_EMPTY))
            }
            const videos = files.video as File[]
            videos.forEach((video) => {
                const extension = getExtensionFromFullName(video.originalFilename as string)
                const newPath = video.filepath + '.' + extension
                fs.renameSync(video.filepath, newPath)
                video.filepath = newPath // Cập nhật filepath
                video.newFilename = video.newFilename + '.' + extension
            })
            resolve(files.video as File[])
        })
    })
}
