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
