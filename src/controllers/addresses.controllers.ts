import { Request, Response } from 'express'
import { ParamsDictionary } from 'express-serve-static-core'
import { TokenPayload } from '~/models/requests/User.request'
import { Address } from '~/models/requests/User.request'
import usersService from '~/services/users.services'
import { USERS_MESSAGES, ADDRESS_MESSAGES } from '~/constants/message'
import HTTP_STATUS from '~/constants/httpStatus'

export const getAddressesController = async (req: Request, res: Response) => {
  const { userId } = req.decoded_authorization as TokenPayload
  const user = await usersService.getMe(userId)

  return res.json({
    message: ADDRESS_MESSAGES.GET_ADDRESSES_SUCCESS,
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
      message: ADDRESS_MESSAGES.MISSING_REQUIRED_FIELDS
    })
  }

  const user = await usersService.getMe(userId)
  const addresses = user.addresses || []

  // Check limit (max 5 addresses)
  if (addresses.length >= 5) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      message: ADDRESS_MESSAGES.MAX_ADDRESSES_REACHED
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
    message: ADDRESS_MESSAGES.ADD_ADDRESS_SUCCESS,
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
      message: ADDRESS_MESSAGES.ADDRESS_NOT_FOUND
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
    message: ADDRESS_MESSAGES.UPDATE_ADDRESS_SUCCESS,
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
      message: ADDRESS_MESSAGES.ADDRESS_NOT_FOUND
    })
  }

  // Update user
  await usersService.updateMe(userId, { addresses: filteredAddresses })

  return res.json({
    message: ADDRESS_MESSAGES.DELETE_ADDRESS_SUCCESS
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
      message: ADDRESS_MESSAGES.ADDRESS_NOT_FOUND
    })
  }

  // Update user
  await usersService.updateMe(userId, { addresses: updatedAddresses })

  return res.json({
    message: ADDRESS_MESSAGES.SET_DEFAULT_ADDRESS_SUCCESS
  })
}
