import { Router } from 'express'
import { uploadImageController } from '~/controllers/medias.controllers'
// import { uploadVideoController } from '~/controllers/medias.controllers' // TODO: Uncomment khi cần
import { accessTokenValidator, verifiedUserValidator } from '~/middlewares/users.middlewares'
import { wrapRequestHandler } from '~/utils/handlers'

const mediasRouter = Router()

mediasRouter.post(
    '/upload-image',
    accessTokenValidator,
    verifiedUserValidator,
    wrapRequestHandler(uploadImageController)
)

// TODO: Uncomment khi cần upload video
// mediasRouter.post(
//     '/upload-video',
//     accessTokenValidator,
//     verifiedUserValidator,
//     wrapRequestHandler(uploadVideoController)
// )
export default mediasRouter
