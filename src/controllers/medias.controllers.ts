import { NextFunction, Request, Response } from 'express'
import { USERS_MESSAGES } from '~/constants/message'
import { mediasService } from '~/services/medias.services'

/**
 * Upload hình ảnh lên S3
 * POST /medias/upload-image
 */
export const uploadImageController = async (req: Request, res: Response, next: NextFunction) => {
  const url = await mediasService.uploadImage(req)
  return res.json({
    result: url,
    message: USERS_MESSAGES.UPLOAD_IMAGE_SUCCESS
  })
}

// TODO: Uncomment khi cần upload video
// /**
//  * Upload video lên S3
//  * POST /medias/upload-video
//  */
// export const uploadVideoController = async (req: Request, res: Response, next: NextFunction) => {
//     const url = await mediasService.uploadVideo(req)
//     return res.json({
//         url,
//         message: USERS_MESSAGES.UPLOAD_VIDEO_SUCCESS
//     })
// }
