export enum TokenType {
  AccessToken,
  RefreshToken,
  ForgotPasswordToken,
  EmailVerifyToken
}

export enum MediaType {
  Image,
  Video
}

export enum UserRole {
  Customer,
  Pharmacist,
  Admin
}

export enum UserStatus {
  Unverified,
  Verified,
  Banned
}

export enum UserGender {
  Male,
  Female
}

export enum PrescriptionStatus {
  Pending = 'pending',
  Verified = 'verified',
  Rejected = 'rejected',
  Expired = 'expired'
}

export enum PaymentMethod {
  COD = 'cod',
  BankTransfer = 'bank_transfer',
  VNPay = 'vnpay',
  PayOS = 'payos'
}

export enum ShippingMethod {
  Standard = 'standard',
  Fast = 'fast',
  Express = 'express'
}

export enum ReviewStatus {
  Pending = 'pending',
  Approved = 'approved',
  Rejected = 'rejected'
}

// Order Status
export enum OrderStatus {
  Pending = 'pending',
  Confirmed = 'confirmed',
  Processing = 'processing',
  Shipped = 'shipped',
  Delivered = 'delivered',
  Cancelled = 'cancelled',
  Returned = 'returned'
}

// Re-export Return Request enums from schema for centralized access
export { ReturnReason, ReturnStatus, ReturnType, RefundMethod } from '~/models/schemas/ReturnRequest.schema'
