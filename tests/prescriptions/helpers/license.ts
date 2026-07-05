import type { Collection, ObjectId } from 'mongodb'

export async function mockPharmacistStatus(users: Collection, pharmacistId: ObjectId, patch: { licenseNumber?: string; lisenseNumber?: string; isOnline?: boolean }) {
  await users.updateOne(
    { _id: pharmacistId },
    {
      $set: {
        ...(patch.licenseNumber !== undefined ? { lisenseNumber: patch.licenseNumber } : {}),
        ...(patch.lisenseNumber !== undefined ? { lisenseNumber: patch.lisenseNumber } : {}),
        ...(patch.isOnline !== undefined ? { isOnline: patch.isOnline } : {})
      }
    }
  )
}

export function hasUsableLicense(user: any) {
  return Boolean(user?.lisenseNumber || user?.licenseNumber) && user?.isOnline !== false
}
