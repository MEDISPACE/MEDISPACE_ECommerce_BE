import { NextFunction, Request, Response } from 'express'
import HTTP_STATUS from '~/constants/httpStatus'
import { ErrorWithStatus } from '~/models/Error'
import databaseService from '~/services/database.services'
import { UserRole } from '~/constants/enum'
import { TokenPayload } from '~/models/requests/User.request'
import { ObjectId } from 'mongodb'
import User from '~/models/schemas/User.schema'

// Extend Request interface để thêm pharmacist property
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      pharmacist?: User
    }
  }
}

/**
 * Middleware xác thực người dùng là Pharmacist
 * Kiểm tra role và trạng thái user
 */
export const authenticatePharmacist = (req: Request, res: Response, next: NextFunction) => {
  const { role } = req.decoded_authorization as TokenPayload

  // Debug log
  // console.log('🔍 authenticatePharmacist - role from token:', role)
  // console.log('🔍 UserRole.Pharmacist:', UserRole.Pharmacist)
  // console.log('🔍 Comparison:', role === UserRole.Pharmacist)

  // Kiểm tra role có phải Pharmacist không
  if (role !== UserRole.Pharmacist) {
    // console.log('❌ Access denied - role mismatch')
    return next(
      new ErrorWithStatus({
        message: 'Chỉ dược sĩ mới có quyền truy cập chức năng này',
        status: HTTP_STATUS.FORBIDDEN
      })
    )
  }

  // console.log('✅ Pharmacist authenticated successfully')
  next()
}

/**
 * Middleware kiểm tra giấy phép hành nghề của Pharmacist
 * Kiểm tra lisenseNumber và trạng thái online
 */
export const checkLicense = async (req: Request, res: Response, next: NextFunction) => {
  const { userId } = req.decoded_authorization as TokenPayload

  try {
    // Lấy thông tin pharmacist từ database
    const pharmacist = await databaseService.users.findOne({
      _id: new ObjectId(userId),
      role: UserRole.Pharmacist
    })

    // Kiểm tra pharmacist có tồn tại không
    if (!pharmacist) {
      return next(
        new ErrorWithStatus({
          message: 'Không tìm thấy thông tin dược sĩ',
          status: HTTP_STATUS.NOT_FOUND
        })
      )
    }

    // Kiểm tra giấy phép hành nghề
    if (!pharmacist.lisenseNumber) {
      return next(
        new ErrorWithStatus({
          message: 'Dược sĩ chưa có giấy phép hành nghề',
          status: HTTP_STATUS.FORBIDDEN
        })
      )
    }

    // Kiểm tra trạng thái online (có thể pharmacist cần online để tư vấn)
    if (pharmacist.isOnline === false) {
      return next(
        new ErrorWithStatus({
          message: 'Dược sĩ hiện không online',
          status: HTTP_STATUS.FORBIDDEN
        })
      )
    }

    // Lưu thông tin pharmacist vào request để controller sử dụng
    req.pharmacist = pharmacist

    next()
  } catch (error) {
    console.error('Error checking pharmacist license:', error)
    return next(
      new ErrorWithStatus({
        message: 'Lỗi khi kiểm tra giấy phép dược sĩ',
        status: HTTP_STATUS.INTERNAL_SERVER_ERROR
      })
    )
  }
}
