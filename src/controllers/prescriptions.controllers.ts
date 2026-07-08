import { Request, Response } from 'express'
import { ParamsDictionary } from 'express-serve-static-core'
import { ObjectId } from 'mongodb'
import axios from 'axios'
import FormData from 'form-data'
import { UserRole } from '~/constants/enum'
import { TokenPayload } from '~/models/requests/User.request'
import {
  UploadPrescriptionReqBody,
  VerifyPrescriptionReqBody,
  PrescriptionQuery
} from '~/models/requests/Prescription.request'
import { PRESCRIPTIONS_MESSAGES } from '~/constants/message'
import HTTP_STATUS from '~/constants/httpStatus'
import prescriptionsService from '~/services/prescriptions.services'
import databaseService from '~/services/database.services'

// Upload prescription - Customer
export const uploadPrescriptionController = async (
  req: Request<ParamsDictionary, unknown, UploadPrescriptionReqBody>,
  res: Response
) => {
  const { userId } = req.decoded_authorization as TokenPayload
  const result = await prescriptionsService.uploadPrescription(new ObjectId(userId), req.body)
  return res.status(HTTP_STATUS.CREATED).json({
    message: PRESCRIPTIONS_MESSAGES.UPLOAD_PRESCRIPTION_SUCCESS,
    result
  })
}

// Get user's prescriptions - Customer
export const getPrescriptionsController = async (
  req: Request<ParamsDictionary, unknown, unknown, PrescriptionQuery>,
  res: Response
) => {
  try {
    const { userId } = req.decoded_authorization as TokenPayload

    const result = await prescriptionsService.getPrescriptions({
      ...req.query,
      customerId: userId
    })

    return res.status(HTTP_STATUS.OK).json({
      message: PRESCRIPTIONS_MESSAGES.GET_PRESCRIPTIONS_SUCCESS,
      result
    })
  } catch (error) {
    throw error
  }
}

// Get prescription by ID - Customer (owner) or Pharmacist
export const getPrescriptionByIdController = async (req: Request<{ prescriptionId: string }>, res: Response) => {
  const { userId } = req.decoded_authorization as TokenPayload
  const result = await prescriptionsService.getPrescriptionById(req.params.prescriptionId)

  // Allow access if:
  // 1. User is the prescription owner (customer)
  // 2. User is a pharmacist (check via req.pharmacist set by authenticatePharmacist middleware)
  const isOwner = result.customerId.toString() === userId
  // If accessing as pharmacist, the pharmacist middleware would have set req.pharmacist
  // But since we don't require that middleware for this route, we check the user's role
  const pharmacist = req.pharmacist
  const isPharmacist = !!pharmacist

  if (!isOwner && !isPharmacist) {
    // If not owner, try to check if user is pharmacist by looking up in database
    const user = await databaseService.users.findOne({ _id: new ObjectId(userId) })
    const userIsPharmacist = user?.role === UserRole.Pharmacist

    if (!userIsPharmacist) {
      return res.status(HTTP_STATUS.FORBIDDEN).json({
        message: PRESCRIPTIONS_MESSAGES.ACCESS_DENIED
      })
    }

    if (!user?.lisenseNumber || user.isOnline === false) {
      return res.status(HTTP_STATUS.FORBIDDEN).json({
        message: PRESCRIPTIONS_MESSAGES.UNAUTHORIZED_TO_VERIFY
      })
    }
  }

  return res.status(HTTP_STATUS.OK).json({
    message: PRESCRIPTIONS_MESSAGES.GET_PRESCRIPTION_SUCCESS,
    result
  })
}

// Get pending prescriptions - Pharmacist
export const getPendingPrescriptionsController = async (
  req: Request<ParamsDictionary, unknown, unknown, PrescriptionQuery>,
  res: Response
) => {
  try {
    const result = await prescriptionsService.getPendingPrescriptions(req.query)
    return res.status(HTTP_STATUS.OK).json({
      message: PRESCRIPTIONS_MESSAGES.GET_PENDING_PRESCRIPTIONS_SUCCESS,
      result
    })
  } catch (error) {
    throw error
  }
}

// Verify prescription - Pharmacist
export const verifyPrescriptionController = async (
  req: Request<{ prescriptionId: string }, unknown, VerifyPrescriptionReqBody>,
  res: Response
) => {
  try {
    const pharmacist = req.pharmacist as { _id: ObjectId; firstName: string; lastName: string }
    const result = await prescriptionsService.verifyPrescription(req.params.prescriptionId, pharmacist._id, req.body)
    return res.status(HTTP_STATUS.OK).json({
      message: PRESCRIPTIONS_MESSAGES.VERIFY_PRESCRIPTION_SUCCESS,
      result
    })
  } catch (error) {
    throw error
  }
}

// Get prescription statistics - Pharmacist
export const getPrescriptionStatsController = async (req: Request, res: Response) => {
  try {
    const result = await prescriptionsService.getPrescriptionStats()

    return res.status(HTTP_STATUS.OK).json({
      message: PRESCRIPTIONS_MESSAGES.GET_PRESCRIPTION_STATS_SUCCESS,
      result
    })
  } catch (error) {
    throw error
  }
}

// ★ Scan prescription via OCR Service proxy
const OCR_SERVICE_URL = process.env.OCR_SERVICE_URL || 'http://localhost:8001'
const MAX_SCAN_IMAGE_BYTES = Number(process.env.PRESCRIPTION_SCAN_MAX_BYTES || 8 * 1024 * 1024)
const OCR_SCAN_TIMEOUT_MS = Number(process.env.PRESCRIPTION_OCR_SCAN_TIMEOUT_MS || 150000)
const OCR_SCAN_RETRIES = Number(process.env.PRESCRIPTION_OCR_SCAN_RETRIES || 6)
const MAX_SCAN_IMAGES = Number(process.env.PRESCRIPTION_SCAN_MAX_IMAGES || 5)
const ALLOWED_OCR_MODES = new Set(['traditional', 'vision', 'parallel', 'parallel_benchmark'])
const RETRYABLE_OCR_ERROR_CODES = new Set(['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'EAI_AGAIN', 'ECONNABORTED'])

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const resolveOcrMode = (mode?: string) => {
  const selectedMode = (mode || process.env.PRESCRIPTION_OCR_MODE || 'parallel').trim().toLowerCase()
  return ALLOWED_OCR_MODES.has(selectedMode) ? selectedMode : null
}

const isAllowedScanImageUrl = (imageUrl: string) => {
  try {
    const parsed = new URL(imageUrl)
    if (!['https:', 'http:'].includes(parsed.protocol)) return false

    const configuredHosts = (process.env.PRESCRIPTION_IMAGE_ALLOWED_HOSTS || '')
      .split(',')
      .map((host) => host.trim().toLowerCase())
      .filter(Boolean)

    const bucketName = process.env.AWS_S3_BUCKET_NAME || process.env.S3_BUCKET_NAME
    const region = process.env.AWS_REGION
    const s3Host = bucketName && region ? `${bucketName}.s3.${region}.amazonaws.com`.toLowerCase() : undefined
    const s3GlobalHost = bucketName ? `${bucketName}.s3.amazonaws.com`.toLowerCase() : undefined
    const regionalS3Host = region ? `s3.${region}.amazonaws.com`.toLowerCase() : undefined
    const allowedHosts = new Set([
      ...configuredHosts,
      ...(s3Host ? [s3Host] : []),
      ...(s3GlobalHost ? [s3GlobalHost] : []),
      ...(regionalS3Host ? [regionalS3Host] : []),
      's3.amazonaws.com'
    ])

    if (allowedHosts.size === 0 || !allowedHosts.has(parsed.hostname.toLowerCase())) {
      console.warn('[scanPrescription] Rejected imageUrl host:', parsed.hostname, 'allowed:', Array.from(allowedHosts))
      return false
    }

    if ([regionalS3Host, 's3.amazonaws.com'].includes(parsed.hostname.toLowerCase()) && bucketName) {
      return parsed.pathname.startsWith(`/${bucketName}/`)
    }

    return true
  } catch {
    return false
  }
}

const shouldRetryOcrRequest = (error: any) => {
  if (!axios.isAxiosError(error)) return false
  if (error.response) return false
  return RETRYABLE_OCR_ERROR_CODES.has(String(error.code || ''))
}

const postImageToOcrService = async (buffer: Buffer, contentType: string, ext: string, selectedMode: string) => {
  let lastError: any

  for (let attempt = 0; attempt <= OCR_SCAN_RETRIES; attempt += 1) {
    const formData = new FormData()
    formData.append('file', buffer, {
      filename: `prescription.${ext}`,
      contentType: contentType
    })
    formData.append('mode', selectedMode)

    try {
      return await axios.post(`${OCR_SERVICE_URL}/api/ocr/extract-prescription`, formData, {
        headers: formData.getHeaders(),
        timeout: OCR_SCAN_TIMEOUT_MS,
        maxContentLength: Infinity,
        maxBodyLength: Infinity
      })
    } catch (error: any) {
      lastError = error
      if (!shouldRetryOcrRequest(error) || attempt >= OCR_SCAN_RETRIES) break

      const delayMs = Math.min(1000 * 2 ** attempt, 5000)
      console.warn(
        `[scanPrescription] OCR service unavailable (${error.code || error.message}); retry ${attempt + 1}/${OCR_SCAN_RETRIES} in ${delayMs}ms`
      )
      await sleep(delayMs)
    }
  }

  throw lastError
}

const downloadScanImage = async (imageUrl: string) => {
  const imageResponse = await axios.get(imageUrl, {
    responseType: 'arraybuffer',
    timeout: 30000,
    maxContentLength: MAX_SCAN_IMAGE_BYTES,
    maxBodyLength: MAX_SCAN_IMAGE_BYTES
  })

  const headerContentType = imageResponse.headers['content-type']
  const contentType = (Array.isArray(headerContentType) ? headerContentType[0] : String(headerContentType || 'image/jpeg'))
    .split(';')[0]
    .trim()
    .toLowerCase()
  if (!contentType.startsWith('image/')) {
    throw new Error('imageUrl must point to an image resource')
  }

  const buffer = Buffer.from(imageResponse.data as ArrayBuffer)
  if (buffer.length > MAX_SCAN_IMAGE_BYTES) {
    throw new Error('Image is too large for prescription scanning')
  }

  const extMap: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp'
  }

  return {
    buffer,
    contentType,
    ext: extMap[contentType] || 'jpg'
  }
}

const scanSingleImage = async (imageUrl: string, selectedMode: string, pageIndex: number) => {
  const image = await downloadScanImage(imageUrl)
  const ocrResponse = await postImageToOcrService(image.buffer, image.contentType, image.ext, selectedMode)
  return {
    ...ocrResponse.data,
    pageIndex,
    imageUrl
  }
}

const getDefaultPriceVariant = (product: any) =>
  product?.priceVariants?.find((variant: any) => variant?.isDefault) || product?.priceVariants?.[0]

const normalizeMedicationTerm = (value?: string | null) =>
  String(value || '')
    .replace(/\d+(\.\d+)?\s*(mg|g|ml|mcg|iu|%)\b/gi, ' ')
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    .trim()

const cleanMedicationSearchTerm = (value?: string | null) =>
  String(value || '')
    .replace(/\d+(\.\d+)?\s*(mg|g|ml|mcg|iu|%)\b/gi, ' ')
    .replace(/\b(vien|viên|goi|gói|chai|ong|ống|lo|lọ|tuyp|tube|hop|hộp)\b/gi, ' ')
    .replace(/[()[\]{}]/g, ' ')
    .replace(/[,;|/]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

const escapeRegexTerm = (value?: string | null) => String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&').trim()

const uniqTerms = (terms: Array<string | null | undefined>) => {
  const seen = new Set<string>()
  const result: string[] = []
  for (const term of terms) {
    const cleaned = cleanMedicationSearchTerm(term)
    if (cleaned.length < 3) continue
    const key = cleaned.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    result.push(cleaned)
  }
  return result
}

const getParentheticalTerms = (value?: string | null) => {
  const matches = String(value || '').matchAll(/\(([^)]+)\)/g)
  return Array.from(matches).map((match) => match[1])
}

const getBrandTerm = (value?: string | null) => String(value || '').split('(')[0]

const getMedicationSearchTerms = (med: any, matchedProduct?: any) => {
  const matchedIngredient = matchedProduct?.details?.activeIngredients || matchedProduct?.activeIngredients
  const ingredientSource = matchedIngredient || med.activeIngredient
  const ingredientParts = String(ingredientSource || '')
    .split(/[,+/;|]/)
    .map((part) => part.trim())

  return uniqTerms([
    getBrandTerm(med.productName),
    med.productName,
    ...getParentheticalTerms(med.productName),
    ingredientSource,
    ...ingredientParts
  ])
}

const toMedicationProduct = (product: any, reason?: string) => {
  const defaultVariant = getDefaultPriceVariant(product)
  const images = Array.isArray(product?.images) ? product.images : []
  return {
    productId: product?._id?.toString?.() || String(product?._id || ''),
    name: product?.name || '',
    slug: product?.slug || '',
    image: product?.featuredImage || (images.length > 0 ? images[0] : null),
    price: defaultVariant?.salePrice ?? defaultVariant?.price ?? null,
    unit: defaultVariant?.unit,
    stockQuantity: product?.stockQuantity || 0,
    requiresPrescription: Boolean(product?.requiresPrescription),
    activeIngredients: product?.details?.activeIngredients || product?.activeIngredients || '',
    strength: product?.details?.strength || product?.strength || '',
    dosageForm: product?.details?.dosageForm || product?.dosageForm || '',
    reason
  }
}

const findProductsWithDetails = async (filter: Record<string, unknown>, limit: number) => {
  return databaseService.products
    .aggregate([
      {
        $lookup: {
          from: 'productDetails',
          localField: '_id',
          foreignField: 'productId',
          as: 'details'
        }
      },
      { $addFields: { details: { $arrayElemAt: ['$details', 0] } } },
      { $match: filter },
      { $sort: { stockQuantity: -1, rating: -1, reviewCount: -1 } },
      { $limit: limit }
    ])
    .toArray()
}

const findEquivalentProducts = async (med: any, matchedProduct?: any, limit = 4) => {
  const excludeIds = matchedProduct?._id ? [matchedProduct._id] : []
  const searchTerms = getMedicationSearchTerms(med, matchedProduct)
  const candidates: any[] = []
  const seen = new Set(excludeIds.map((id) => id.toString()))

  const pushUnique = (products: any[], reason: string) => {
    for (const product of products) {
      const id = product?._id?.toString?.()
      if (!id || seen.has(id)) continue
      seen.add(id)
      candidates.push({ product, reason })
      if (candidates.length >= limit) break
    }
  }

  for (const term of searchTerms) {
    if (candidates.length >= limit) break
    const safeTerm = escapeRegexTerm(term)
    if (safeTerm.length < 3) continue

    pushUnique(
      await findProductsWithDetails(
        {
          _id: { $nin: [...seen].filter(ObjectId.isValid).map((id) => new ObjectId(id)) },
          isActive: true,
          $or: [
            { 'details.activeIngredients': { $regex: safeTerm, $options: 'i' } },
            { activeIngredients: { $regex: safeTerm, $options: 'i' } },
            { name: { $regex: safeTerm, $options: 'i' } }
          ]
        },
        limit - candidates.length
      ),
      term.toLowerCase() === cleanMedicationSearchTerm(getBrandTerm(med.productName)).toLowerCase()
        ? 'Ten gan dung'
        : 'Cung hoat chat'
    )
  }

  if (candidates.length < limit && matchedProduct?.categoryId) {
    pushUnique(
      await findProductsWithDetails(
        {
          _id: { $nin: [...seen].filter(ObjectId.isValid).map((id) => new ObjectId(id)) },
          isActive: true,
          categoryId: matchedProduct.categoryId,
          requiresPrescription: matchedProduct.requiresPrescription
        },
        limit - candidates.length
      ),
      'Cung nhom san pham'
    )
  }

  const productNameTerm = normalizeMedicationTerm(med.productName)
  if (candidates.length < limit && productNameTerm.length >= 3) {
    pushUnique(
      await findProductsWithDetails(
        {
          _id: { $nin: [...seen].filter(ObjectId.isValid).map((id) => new ObjectId(id)) },
          isActive: true,
          name: { $regex: productNameTerm, $options: 'i' }
        },
        limit - candidates.length
      ),
      'Ten gan dung'
    )
  }

  return candidates.map(({ product, reason }) => toMedicationProduct(product, reason))
}

const findMatchedProduct = async (productName: string) => {
  const searchTerms = uniqTerms([getBrandTerm(productName), productName, ...getParentheticalTerms(productName)])
  for (const term of searchTerms) {
    const searchPattern = escapeRegexTerm(term)
    if (searchPattern.length < 2) continue
    const products = await findProductsWithDetails(
      {
        name: { $regex: new RegExp(searchPattern, 'i') },
        isActive: true
      },
      1
    )
    if (products[0]) return products[0]
  }
  return null
}

const firstNonEmpty = (values: unknown[]) => values.find((value) => value !== undefined && value !== null && value !== '')

const mergeOcrPages = (pages: any[]) => {
  if (pages.length === 1) return pages[0]

  const pageData = pages.map((page) => page?.data || {})
  const mergedData: Record<string, unknown> = {}
  for (const field of [
    'patientName',
    'patientAge',
    'patientGender',
    'phoneNumber',
    'doctorName',
    'hospitalName',
    'prescriptionDate',
    'diagnosis',
    'specialNotes'
  ]) {
    mergedData[field] = firstNonEmpty(pageData.map((data) => data?.[field])) ?? null
  }

  const seenMedications = new Set<string>()
  mergedData.medications = pageData.flatMap((data, pageIndex) => {
    const medications = Array.isArray(data?.medications) ? data.medications : []
    return medications
      .map((med: any) => ({
        ...med,
        sourcePage: pageIndex + 1,
        source: med.source || `page_${pageIndex + 1}`
      }))
      .filter((med: any) => {
        const key = [med.productName, med.quantity, med.unit, med.dosage]
          .map((value) => String(value || '').trim().toLowerCase())
          .join('|')
        if (!key.replace(/\|/g, '')) return false
        if (seenMedications.has(key)) return false
        seenMedications.add(key)
        return true
      })
  })

  const confidenceRank: Record<string, number> = { low: 0, medium: 1, high: 2 }
  const confidences = pageData.map((data) => String(data?.confidence || 'low').toLowerCase())
  const lowestConfidence = confidences.reduce((lowest, current) => {
    return (confidenceRank[current] ?? 0) < (confidenceRank[lowest] ?? 0) ? current : lowest
  }, 'high')

  mergedData.confidence = lowestConfidence
  mergedData._extraction_method = `multi_page_${pages.map((page) => page?.data?._extraction_method || page?.timing?.mode || 'ocr').join('+')}`

  return {
    success: pages.some((page) => page?.success),
    message: 'Prescription scanned successfully',
    rawText: pages
      .map((page, index) => `--- Page ${index + 1} ---\n${page?.rawText || ''}`.trim())
      .join('\n\n'),
    data: mergedData,
    quality: {
      score: Math.round(
        pages.reduce((sum, page) => sum + Number(page?.quality?.score || 0), 0) / Math.max(pages.length, 1)
      ),
      level: lowestConfidence,
      pages: pages.map((page, index) => ({
        page: index + 1,
        success: page?.success,
        quality: page?.quality,
        imageQuality: page?.imageQuality || page?.quality?.imageQuality
      }))
    },
    timing: {
      mode: pages[0]?.timing?.mode,
      pages: pages.map((page, index) => ({ page: index + 1, timing: page?.timing }))
    },
    pages
  }
}

export const scanPrescriptionController = async (req: Request, res: Response) => {
  try {
    const { imageUrl, imageUrls, mode } = req.body as { imageUrl?: string; imageUrls?: string[]; mode?: string }
    const scanImageUrls = (Array.isArray(imageUrls) && imageUrls.length > 0 ? imageUrls : imageUrl ? [imageUrl] : [])
      .filter((url): url is string => typeof url === 'string' && url.trim().length > 0)
      .map((url) => url.trim())

    if (scanImageUrls.length === 0) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        message: 'imageUrl or imageUrls is required'
      })
    }

    if (scanImageUrls.length > MAX_SCAN_IMAGES) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        message: `Too many prescription images. Maximum allowed is ${MAX_SCAN_IMAGES}`
      })
    }

    const selectedMode = resolveOcrMode(mode)
    if (!selectedMode) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        message: 'Unsupported OCR mode'
      })
    }

    for (const url of scanImageUrls) {
      if (!isAllowedScanImageUrl(url)) {
        let rejectedHost = 'unknown'
        try {
          rejectedHost = new URL(url).hostname
        } catch {
          // ignore invalid URL parsing here; the generic message below is enough
        }
        return res.status(HTTP_STATUS.BAD_REQUEST).json({
          message: 'imageUrl host is not allowed for prescription scanning',
          ...(process.env.NODE_ENV === 'development' ? { rejectedHost } : {})
        })
      }
    }

    const scannedPages = []
    for (let index = 0; index < scanImageUrls.length; index += 1) {
      scannedPages.push(await scanSingleImage(scanImageUrls[index], selectedMode, index + 1))
    }

    const ocrData = mergeOcrPages(scannedPages)

    // Map OCR medications to actual products in Database
    const medicationContainer = ocrData?.data && Array.isArray(ocrData.data.medications) ? ocrData.data : ocrData
    if (medicationContainer && Array.isArray(medicationContainer.medications)) {
      const enrichedMedications = await Promise.all(
        medicationContainer.medications.map(async (med: any) => {
          if (!med.productName) return med

          try {
            const shouldTrustDirectMatch = !med.needsReview && med.confidence !== 'low'
            const product = shouldTrustDirectMatch ? await findMatchedProduct(med.productName) : null
            const equivalentProducts = await findEquivalentProducts(med, product || undefined)

            if (product) {
              const mappedProduct = toMedicationProduct(product)
              return {
                ...med,
                productId: mappedProduct.productId,
                matchedName: mappedProduct.name,
                slug: mappedProduct.slug,
                image: mappedProduct.image,
                price: mappedProduct.price,
                unit: med.unit || mappedProduct.unit,
                stockQuantity: mappedProduct.stockQuantity,
                requiresPrescription: mappedProduct.requiresPrescription,
                activeIngredient: med.activeIngredient || mappedProduct.activeIngredients || null,
                equivalentProducts
              }
            }

            return {
              ...med,
              equivalentProducts
            }
          } catch (e) {
            console.error(`[OCR Map Product] Error mapping ${med.productName}:`, e)
          }
          return med
        })
      )
      medicationContainer.medications = enrichedMedications
    }

    return res.status(HTTP_STATUS.OK).json({
      message: 'Prescription scanned successfully',
      result: ocrData
    })
  } catch (error: any) {
    console.error('[scanPrescription] Error:', error?.message || error)

    if (shouldRetryOcrRequest(error)) {
      return res.status(503).json({
        message: 'OCR service is temporarily unavailable. Please retry in a few seconds.',
        detail: error?.code || error?.message || 'OCR service unavailable'
      })
    }

    // Forward OCR service errors
    if (error?.response?.data) {
      return res.status(error.response.status || HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
        message: 'OCR service error',
        detail: error.response.data
      })
    }

    if (['imageUrl must point to an image resource', 'Image is too large for prescription scanning'].includes(error?.message)) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        message: error.message
      })
    }

    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      message: 'Failed to scan prescription',
      detail: error?.message || 'Unknown error'
    })
  }
}
