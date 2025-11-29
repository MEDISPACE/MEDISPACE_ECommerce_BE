# Settings & Profile APIs for Pharmacist

## Overview

4 API endpoints for pharmacists to manage their profile, change password, view working statistics, and update online status.

## Base URL

```
/pharmacist
```

## Authentication

All endpoints require:

- `Authorization: Bearer <access_token>`
- User must have `pharmacist` role

---

## 1. Update Pharmacist Profile

### Endpoint

`PATCH /pharmacist/profile`

### Description

Update pharmacist's personal information including name, phone, license number, and avatar.

### Request Body

| Field         | Type   | Required | Description                           |
| ------------- | ------ | -------- | ------------------------------------- |
| firstName     | string | No       | First name                            |
| lastName      | string | No       | Last name                             |
| phoneNumber   | string | No       | Phone number                          |
| dateOfBirth   | string | No       | Date of birth (ISO 8601 format)       |
| gender        | number | No       | Gender (1: Male, 2: Female, 3: Other) |
| avatar        | string | No       | Avatar URL                            |
| lisenseNumber | string | No       | Pharmacy license number               |

### Request Example

```json
PATCH /pharmacist/profile
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Content-Type: application/json

{
  "firstName": "Nguyen",
  "lastName": "Van Duoc Si",
  "phoneNumber": "0901234567",
  "dateOfBirth": "1990-05-15",
  "gender": 1,
  "avatar": "https://example.com/avatars/pharmacist.jpg",
  "lisenseNumber": "DS-123456"
}
```

### Response Example

```json
{
  "message": "Update pharmacist profile successfully",
  "result": {
    "_id": "6752a111222333444555",
    "email": "pharmacist@medispace.com",
    "firstName": "Nguyen",
    "lastName": "Van Duoc Si",
    "phoneNumber": "0901234567",
    "dateOfBirth": "1990-05-15T00:00:00.000Z",
    "gender": 1,
    "avatar": "https://example.com/avatars/pharmacist.jpg",
    "lisenseNumber": "DS-123456",
    "role": "pharmacist",
    "status": "active",
    "createdAt": "2024-10-01T08:00:00.000Z",
    "updatedAt": "2024-12-01T15:30:00.000Z"
  }
}
```

---

## 2. Update Password

### Endpoint

`PATCH /pharmacist/password`

### Description

Change pharmacist's password. Requires old password for verification.

### Request Body

| Field       | Type   | Required | Description                     |
| ----------- | ------ | -------- | ------------------------------- |
| oldPassword | string | Yes      | Current password                |
| newPassword | string | Yes      | New password (min 8 characters) |

### Request Example

```json
PATCH /pharmacist/password
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Content-Type: application/json

{
  "oldPassword": "OldPassword123!",
  "newPassword": "NewPassword456!"
}
```

### Response Example

```json
{
  "message": "Update password successfully",
  "result": {
    "message": "Password updated successfully"
  }
}
```

### Security Notes

- Old password must match current password
- New password should be at least 8 characters
- Password is hashed before storage
- After password change, user should re-login

---

## 3. Get Working Statistics

### Endpoint

`GET /pharmacist/stats/working`

### Description

Get statistics about pharmacist's work performance including prescriptions verified and status breakdown.

### Query Parameters

| Parameter | Type   | Required | Description                  |
| --------- | ------ | -------- | ---------------------------- |
| startDate | string | No       | Start date (ISO 8601 format) |
| endDate   | string | No       | End date (ISO 8601 format)   |

### Request Example (All Time)

```http
GET /pharmacist/stats/working
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### Request Example (Date Range)

```http
GET /pharmacist/stats/working?startDate=2024-11-01&endDate=2024-11-30
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### Response Example

```json
{
  "message": "Get working statistics successfully",
  "result": {
    "totalPrescriptionsVerified": 127,
    "prescriptionsByStatus": [
      {
        "_id": "Verified",
        "count": 98
      },
      {
        "_id": "Rejected",
        "count": 29
      }
    ],
    "dateRange": {
      "startDate": "2024-11-01T00:00:00.000Z",
      "endDate": "2024-11-30T23:59:59.999Z"
    }
  }
}
```

### Response Fields

- `totalPrescriptionsVerified`: Total number of prescriptions verified by this pharmacist
- `prescriptionsByStatus`: Breakdown by status (Verified, Rejected)
- `dateRange`: The date range used for statistics (null if all-time)

---

## 4. Update Online Status

### Endpoint

`PATCH /pharmacist/online-status`

### Description

Update pharmacist's online/offline status. Used for availability indication in chat/consultation features.

### Request Body

| Field    | Type    | Required | Description                                    |
| -------- | ------- | -------- | ---------------------------------------------- |
| isOnline | boolean | Yes      | Online status (true = online, false = offline) |

### Request Example (Go Online)

```json
PATCH /pharmacist/online-status
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Content-Type: application/json

{
  "isOnline": true
}
```

### Request Example (Go Offline)

```json
PATCH /pharmacist/online-status
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Content-Type: application/json

{
  "isOnline": false
}
```

### Response Example

```json
{
  "message": "Update online status successfully",
  "result": {
    "_id": "6752a111222333444555",
    "isOnline": true,
    "updatedAt": "2024-12-01T16:45:00.000Z"
  }
}
```

### Use Cases

- **Start Shift**: Set `isOnline: true` when pharmacist starts working
- **End Shift**: Set `isOnline: false` when ending work
- **Break Time**: Set to `false` during breaks
- **Chat Availability**: Shows customers which pharmacists are available for consultation

---

## Complete Workflow Examples

### Scenario 1: Setup New Pharmacist Profile

```bash
# Step 1: Get current profile
GET /pharmacist/profile

# Step 2: Update profile information
PATCH /pharmacist/profile
{
  "firstName": "Tran",
  "lastName": "Thi Mai",
  "phoneNumber": "0907654321",
  "dateOfBirth": "1992-08-20",
  "gender": 2,
  "lisenseNumber": "DS-789012"
}

# Step 3: Set online status
PATCH /pharmacist/online-status
{
  "isOnline": true
}
```

### Scenario 2: Change Password

```bash
# Update password for security
PATCH /pharmacist/password
{
  "oldPassword": "CurrentPass123!",
  "newPassword": "NewSecurePass456!"
}

# User will need to re-login after this
```

### Scenario 3: View Performance

```bash
# Get this month's statistics
GET /pharmacist/stats/working?startDate=2024-12-01&endDate=2024-12-31

# Get today's statistics
GET /pharmacist/stats/working?startDate=2024-12-01&endDate=2024-12-01

# Get all-time statistics
GET /pharmacist/stats/working
```

### Scenario 4: Daily Routine

```bash
# Morning: Clock in and go online
PATCH /pharmacist/online-status
{
  "isOnline": true
}

# Lunch break: Go offline
PATCH /pharmacist/online-status
{
  "isOnline": false
}

# After lunch: Go back online
PATCH /pharmacist/online-status
{
  "isOnline": true
}

# Evening: Clock out
PATCH /pharmacist/online-status
{
  "isOnline": false
}
```

---

## Profile Fields Reference

### Basic Information

| Field       | Type   | Description    | Example      |
| ----------- | ------ | -------------- | ------------ |
| firstName   | string | First name     | "Nguyen"     |
| lastName    | string | Last name      | "Van A"      |
| phoneNumber | string | Phone number   | "0901234567" |
| dateOfBirth | Date   | Date of birth  | "1990-05-15" |
| gender      | number | Gender (1/2/3) | 1 (Male)     |

### Professional Information

| Field         | Type    | Description      | Example     |
| ------------- | ------- | ---------------- | ----------- |
| lisenseNumber | string  | Pharmacy license | "DS-123456" |
| isOnline      | boolean | Online status    | true/false  |

### System Fields (Read-Only)

| Field     | Type     | Description                                 |
| --------- | -------- | ------------------------------------------- |
| \_id      | ObjectId | Unique identifier                           |
| email     | string   | Email address (cannot be changed)           |
| role      | string   | User role (always "pharmacist")             |
| status    | string   | Account status ("active", "inactive", etc.) |
| createdAt | Date     | Account creation date                       |
| updatedAt | Date     | Last update timestamp                       |

---

## Gender Values

| Value | Description |
| ----- | ----------- |
| 1     | Male        |
| 2     | Female      |
| 3     | Other       |

---

## Error Responses

### 404 - Pharmacist Not Found

```json
{
  "message": "Pharmacist not found"
}
```

### 401 - Unauthorized

```json
{
  "message": "Unauthorized access"
}
```

### 400 - Invalid Password

```json
{
  "message": "Old password is incorrect"
}
```

### 400 - Weak Password

```json
{
  "message": "New password must be at least 8 characters"
}
```

---

## Security Considerations

### Password Management

- Passwords are hashed using bcrypt
- Old password verification required before change
- Minimum password length: 8 characters
- Recommended: Include uppercase, lowercase, numbers, special characters

### Profile Updates

- Only authenticated pharmacist can update their own profile
- Email cannot be changed via this endpoint (contact admin)
- License number should be validated against official records

### Online Status

- Automatically set to `false` after 30 minutes of inactivity (future feature)
- Can be manually controlled by pharmacist
- Visible to customers for chat availability

---

## Integration Points

### Dashboard

- Display pharmacist's name, avatar, and license number
- Show working statistics summary
- Display online/offline badge

### Chat System

- Filter available pharmacists by `isOnline: true`
- Show pharmacist profile to customers
- Update status automatically on chat session start/end

### Performance Reports

- Use working statistics for performance reviews
- Track prescription verification accuracy
- Monitor daily/monthly workload

---

## Summary

**Total Endpoints:** 4

- ✅ PATCH `/profile` - Update profile information
- ✅ PATCH `/password` - Change password
- ✅ GET `/stats/working` - Get working statistics
- ✅ PATCH `/online-status` - Update online status

**All endpoints:**

- ✅ Protected by authentication
- ✅ Require pharmacist role
- ✅ Zero TypeScript errors
- ✅ Full profile management
- ✅ Secure password handling
- ✅ Performance tracking

**Progress Update:**

- Previous: 21/34 APIs (62%)
- **Current: 25/34 APIs (74%)**
- Remaining: 9 APIs

**Next Modules:**

1. Reports (2 APIs) - Export performance reports
2. Drug Database (4 APIs) - Search and view drug information
3. Chat/Consultation (3 APIs) - Remaining chat endpoints
