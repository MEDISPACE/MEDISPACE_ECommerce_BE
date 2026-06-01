import { NextFunction, Request, Response } from 'express'
import { ObjectId } from 'mongodb'
import { TokenPayload } from '~/models/requests/User.request'
import communityService from '~/services/community.services'

export const listAdminRoomsController = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { visibility, status, diseaseKey } = req.query as { visibility?: any; status?: any; diseaseKey?: any }
    const rooms = await communityService.listAdminRooms({
      visibility: visibility === 'public' || visibility === 'private' ? visibility : undefined,
      status: status === 'active' || status === 'archived' ? status : undefined,
      diseaseKey: typeof diseaseKey === 'string' ? diseaseKey : undefined
    })
    return res.status(200).json({ message: 'OK', data: rooms })
  } catch (error) {
    next(error)
  }
}

export const createAdminRoomController = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userId } = req.decoded_authorization as TokenPayload
    const { name, slug, visibility, diseaseKey } = req.body
    const room = await communityService.createRoom({
      name,
      slug,
      visibility,
      diseaseKey,
      createdBy: new ObjectId(userId)
    })
    return res.status(201).json({ message: 'Tạo phòng thành công', data: room })
  } catch (error) {
    next(error)
  }
}

export const updateAdminRoomController = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const room = await communityService.updateRoom(new ObjectId(req.params.roomId), req.body)
    return res.status(200).json({ message: 'Cập nhật phòng thành công', data: room })
  } catch (error) {
    next(error)
  }
}

export const archiveRoomController = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const room = await communityService.setRoomStatus(new ObjectId(req.params.roomId), 'archived')
    return res.status(200).json({ message: 'Đã lưu trữ phòng', data: room })
  } catch (error) {
    next(error)
  }
}

export const unarchiveRoomController = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const room = await communityService.setRoomStatus(new ObjectId(req.params.roomId), 'active')
    return res.status(200).json({ message: 'Đã mở lại phòng', data: room })
  } catch (error) {
    next(error)
  }
}

export const listRoomMembersController = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = Number((req.query as any).page || 1)
    const limit = Number((req.query as any).limit || 20)
    const status = (req.query as any).status
    const result = await communityService.listMembers(new ObjectId(req.params.roomId), {
      page,
      limit,
      status: ['pending', 'invited', 'active', 'left', 'banned'].includes(status) ? status : undefined
    })
    return res.status(200).json({ message: 'OK', data: result })
  } catch (error) {
    next(error)
  }
}

export const updateRoomMemberController = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const member = await communityService.updateMember(new ObjectId(req.params.roomId), new ObjectId(req.params.userId), {
      status: req.body.status,
      role: req.body.role,
      mutedUntil: req.body.mutedUntil
    })
    return res.status(200).json({ message: 'Cập nhật thành viên thành công', data: member })
  } catch (error) {
    next(error)
  }
}

export const inviteRoomMemberController = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await communityService.inviteMember(new ObjectId(req.params.roomId), {
      userId: req.body.userId ? new ObjectId(req.body.userId) : undefined,
      email: req.body.email
    })
    return res.status(201).json({ message: 'Đã mời thành viên', data: result })
  } catch (error) {
    next(error)
  }
}
