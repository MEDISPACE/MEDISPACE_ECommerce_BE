import { Request, Response } from 'express'
import { ParamsDictionary } from 'express-serve-static-core'
import { TokenPayload } from '~/models/requests/User.request'
import { Address } from '~/models/requests/User.request'
import usersService from '~/services/users.services'
import { USERS_MESSAGES } from '~/constants/message'
import HTTP_STATUS from '~/constants/httpStatus'

export const getAddressesController = async (req: Request, res: Response) => {
  const { userId } = req.decoded_authorization as TokenPayload
  const user = await usersService.getMe(userId)

  return res.json({
    message: USERS_MESSAGES.GET_ME_SUCCESS,
    addresses: user.addresses || []
  })
}

export const addAddressController = async (req: Request, res: Response) => {
  const { userId } = req.decoded_authorization as TokenPayload
  const addressData: Omit<Address, 'id'> = req.body

  // Validate required fields
  const { name, phone, province, district, ward, address, type } = addressData
  if (!name || !phone || !province || !district || !ward || !address || !type) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      message: 'Missing required fields'
    })
  }

  const user = await usersService.getMe(userId)
  const addresses = user.addresses || []

  // Check limit (max 5 addresses)
  if (addresses.length >= 5) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      message: 'Maximum 5 addresses allowed'
    })
  }

  // If this is default, unset other defaults
  let updatedAddresses = addresses
  if (addressData.isDefault) {
    updatedAddresses = addresses.map((addr) => ({ ...addr, isDefault: false }))
  }

  // Generate ID and add new address
  const newAddress: Address = {
    id: Date.now().toString(),
    ...addressData
  }

  updatedAddresses.push(newAddress)

  // Update user
  await usersService.updateMe(userId, { addresses: updatedAddresses })

  return res.status(HTTP_STATUS.CREATED).json({
    message: 'Address added successfully',
    address: newAddress
  })
}

export const updateAddressController = async (
  req: Request<ParamsDictionary, unknown, Partial<Address>>,
  res: Response
) => {
  const { userId } = req.decoded_authorization as TokenPayload
  const { addressId } = req.params
  const updateData = req.body

  const user = await usersService.getMe(userId)
  const addresses = user.addresses || []

  const addressIndex = addresses.findIndex((addr) => addr.id === addressId)
  if (addressIndex === -1) {
    return res.status(HTTP_STATUS.NOT_FOUND).json({
      message: 'Address not found'
    })
  }

  // If setting as default, unset other defaults
  let updatedAddresses = [...addresses]
  if (updateData.isDefault) {
    updatedAddresses = addresses.map((addr) => ({ ...addr, isDefault: false }))
  }

  // Update address
  updatedAddresses[addressIndex] = {
    ...updatedAddresses[addressIndex],
    ...updateData
  }

  // Update user
  await usersService.updateMe(userId, { addresses: updatedAddresses })

  return res.json({
    message: 'Address updated successfully',
    address: updatedAddresses[addressIndex]
  })
}

export const deleteAddressController = async (req: Request<ParamsDictionary>, res: Response) => {
  const { userId } = req.decoded_authorization as TokenPayload
  const { addressId } = req.params

  const user = await usersService.getMe(userId)
  const addresses = user.addresses || []

  const filteredAddresses = addresses.filter((addr) => addr.id !== addressId)

  if (filteredAddresses.length === addresses.length) {
    return res.status(HTTP_STATUS.NOT_FOUND).json({
      message: 'Address not found'
    })
  }

  // Update user
  await usersService.updateMe(userId, { addresses: filteredAddresses })

  return res.json({
    message: 'Address deleted successfully'
  })
}

export const setDefaultAddressController = async (req: Request<ParamsDictionary>, res: Response) => {
  const { userId } = req.decoded_authorization as TokenPayload
  const { addressId } = req.params

  const user = await usersService.getMe(userId)
  const addresses = user.addresses || []

  const updatedAddresses = addresses.map((addr) => ({
    ...addr,
    isDefault: addr.id === addressId
  }))

  const addressExists = updatedAddresses.some((addr) => addr.id === addressId && addr.isDefault)
  if (!addressExists) {
    return res.status(HTTP_STATUS.NOT_FOUND).json({
      message: 'Address not found'
    })
  }

  // Update user
  await usersService.updateMe(userId, { addresses: updatedAddresses })

  return res.json({
    message: 'Default address set successfully'
  })
}
