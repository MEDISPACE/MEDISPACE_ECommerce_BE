import { Router } from 'express'
import {
  getAddressesController,
  addAddressController,
  updateAddressController,
  deleteAddressController,
  setDefaultAddressController
} from '~/controllers/addresses.controllers'
import { accessTokenValidator, verifiedUserValidator } from '~/middlewares/users.middlewares'
import { wrapRequestHandler } from '~/utils/handlers'

const addressesRouter = Router()

// Tất cả routes đều cần authentication
addressesRouter.use(accessTokenValidator, verifiedUserValidator)

/**
 * @swagger
 * /addresses:
 *   get:
 *     tags:
 *       - addresses
 *     summary: Get user's addresses
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Addresses retrieved successfully
 */
addressesRouter.get('/', wrapRequestHandler(getAddressesController))

/**
 * @swagger
 * /addresses:
 *   post:
 *     tags:
 *       - addresses
 *     summary: Add new address
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - phone
 *               - province
 *               - district
 *               - ward
 *               - address
 *               - type
 *             properties:
 *               name:
 *                 type: string
 *               phone:
 *                 type: string
 *               province:
 *                 type: string
 *               district:
 *                 type: string
 *               ward:
 *                 type: string
 *               address:
 *                 type: string
 *               type:
 *                 type: string
 *                 enum: [home, office, other]
 *               isDefault:
 *                 type: boolean
 *     responses:
 *       201:
 *         description: Address added successfully
 */
addressesRouter.post('/', wrapRequestHandler(addAddressController))

/**
 * @swagger
 * /addresses/{addressId}:
 *   put:
 *     tags:
 *       - addresses
 *     summary: Update address
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: addressId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               phone:
 *                 type: string
 *               province:
 *                 type: string
 *               district:
 *                 type: string
 *               ward:
 *                 type: string
 *               address:
 *                 type: string
 *               type:
 *                 type: string
 *                 enum: [home, office, other]
 *               isDefault:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Address updated successfully
 */
addressesRouter.put('/:addressId', wrapRequestHandler(updateAddressController))

/**
 * @swagger
 * /addresses/{addressId}:
 *   delete:
 *     tags:
 *       - addresses
 *     summary: Delete address
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: addressId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Address deleted successfully
 */
addressesRouter.delete('/:addressId', wrapRequestHandler(deleteAddressController))

/**
 * @swagger
 * /addresses/{addressId}/default:
 *   patch:
 *     tags:
 *       - addresses
 *     summary: Set address as default
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: addressId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Address set as default successfully
 */
addressesRouter.patch('/:addressId/default', wrapRequestHandler(setDefaultAddressController))

export default addressesRouter
