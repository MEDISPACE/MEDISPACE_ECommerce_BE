# Patient History Enhancement APIs

## Overview

5 new API endpoints for managing patient medical information, notes, medications, and drug interaction checking.

## Base URL

```
/pharmacist
```

## Authentication

All endpoints require:

- `Authorization: Bearer <access_token>`
- User must have `pharmacist` role

---

## 1. Medical Information Management

### 1.1 Get Patient Medical Information

Get comprehensive medical information including allergies, chronic diseases, blood type.

**Endpoint:** `GET /patients/:customerId/medical-info`

**Request Example:**

```http
GET /pharmacist/patients/6752d14b8dcfa64e1e234567/medical-info
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Response Example:**

```json
{
  "message": "Get patient medical information successfully",
  "result": {
    "_id": "6752e89a1234567890abcdef",
    "customer_id": "6752d14b8dcfa64e1e234567",
    "blood_type": "A+",
    "allergies": ["Penicillin", "Aspirin"],
    "chronic_diseases": ["Hypertension", "Type 2 Diabetes"],
    "current_medications": [],
    "created_at": "2024-12-01T10:00:00.000Z",
    "updated_at": "2024-12-01T10:00:00.000Z"
  }
}
```

### 1.2 Update Patient Medical Information

Update blood type, allergies, or chronic diseases.

**Endpoint:** `PUT /patients/:customerId/medical-info`

**Request Example:**

```json
PUT /pharmacist/patients/6752d14b8dcfa64e1e234567/medical-info
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Content-Type: application/json

{
  "blood_type": "O+",
  "allergies": ["Penicillin", "Aspirin", "Peanuts"],
  "chronic_diseases": ["Hypertension", "Type 2 Diabetes", "Asthma"]
}
```

**Response Example:**

```json
{
  "message": "Update patient medical information successfully",
  "result": {
    "_id": "6752e89a1234567890abcdef",
    "customer_id": "6752d14b8dcfa64e1e234567",
    "blood_type": "O+",
    "allergies": ["Penicillin", "Aspirin", "Peanuts"],
    "chronic_diseases": ["Hypertension", "Type 2 Diabetes", "Asthma"],
    "updated_at": "2024-12-01T15:30:00.000Z"
  }
}
```

### 1.3 Add Single Allergy

Add one allergy to patient's record (prevents duplicates).

**Endpoint:** `POST /patients/:customerId/allergies`

**Request Example:**

```json
POST /pharmacist/patients/6752d14b8dcfa64e1e234567/allergies
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Content-Type: application/json

{
  "allergy": "Sulfa drugs"
}
```

**Response Example:**

```json
{
  "message": "Add allergy to patient successfully",
  "result": {
    "_id": "6752e89a1234567890abcdef",
    "customer_id": "6752d14b8dcfa64e1e234567",
    "allergies": ["Penicillin", "Aspirin", "Peanuts", "Sulfa drugs"],
    "updated_at": "2024-12-01T16:00:00.000Z"
  }
}
```

---

## 2. Patient Notes Management

### 2.1 Create Patient Note

Create a pharmacist note about a patient (consultation, verification, or general).

**Endpoint:** `POST /patients/:customerId/notes`

**Request Example:**

```json
POST /pharmacist/patients/6752d14b8dcfa64e1e234567/notes
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Content-Type: application/json

{
  "note_type": "prescription_verification",
  "content": "Patient requested substitution of branded drug with generic. Confirmed with doctor. Approved.",
  "related_prescription_id": "6752f123456789abcdef0001"
}
```

**Note Types:**

- `consultation` - Notes from patient consultation
- `prescription_verification` - Notes during prescription verification
- `general` - General observations

**Response Example:**

```json
{
  "message": "Create patient note successfully",
  "result": {
    "_id": "6752f999888777666555",
    "customer_id": "6752d14b8dcfa64e1e234567",
    "pharmacist_id": "6752a111222333444555",
    "note_type": "prescription_verification",
    "content": "Patient requested substitution of branded drug with generic. Confirmed with doctor. Approved.",
    "related_prescription_id": "6752f123456789abcdef0001",
    "created_at": "2024-12-01T14:00:00.000Z"
  }
}
```

### 2.2 Get All Patient Notes

Retrieve all notes for a patient (sorted newest first).

**Endpoint:** `GET /patients/:customerId/notes`

**Request Example:**

```http
GET /pharmacist/patients/6752d14b8dcfa64e1e234567/notes
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Response Example:**

```json
{
  "message": "Get patient notes successfully",
  "result": [
    {
      "_id": "6752f999888777666555",
      "customer_id": "6752d14b8dcfa64e1e234567",
      "pharmacist_id": "6752a111222333444555",
      "note_type": "prescription_verification",
      "content": "Patient requested substitution of branded drug with generic.",
      "created_at": "2024-12-01T14:00:00.000Z"
    },
    {
      "_id": "6752f888777666555444",
      "customer_id": "6752d14b8dcfa64e1e234567",
      "pharmacist_id": "6752a111222333444555",
      "note_type": "consultation",
      "content": "Patient complained of side effects. Recommended contacting doctor.",
      "created_at": "2024-11-30T10:00:00.000Z"
    }
  ]
}
```

---

## 3. Medication Tracking

### 3.1 Get Recent Medications

Get all medications from verified prescriptions within a time period.

**Endpoint:** `GET /patients/:customerId/medications`

**Query Parameters:**

- `days` (optional): Number of days to look back (default: 30)

**Request Example:**

```http
GET /pharmacist/patients/6752d14b8dcfa64e1e234567/medications?days=60
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Response Example:**

```json
{
  "message": "Get patient medications successfully",
  "result": [
    {
      "drug_name": "Amlodipine 5mg",
      "dosage": "5mg",
      "quantity": 30,
      "instructions": "Take 1 tablet daily in the morning",
      "prescribed_date": "2024-11-15T09:30:00.000Z",
      "prescription_id": "6752f123456789abcdef0001"
    },
    {
      "drug_name": "Metformin 500mg",
      "dosage": "500mg",
      "quantity": 60,
      "instructions": "Take 1 tablet twice daily with meals",
      "prescribed_date": "2024-11-15T09:30:00.000Z",
      "prescription_id": "6752f123456789abcdef0001"
    },
    {
      "drug_name": "Aspirin 100mg",
      "dosage": "100mg",
      "quantity": 30,
      "instructions": "Take 1 tablet daily after dinner",
      "prescribed_date": "2024-10-20T14:00:00.000Z",
      "prescription_id": "6752e000111222333444"
    }
  ]
}
```

---

## 4. Drug Interaction Checking

### 4.1 Check Drug Interactions

Check if a new drug has any interactions with patient's allergies or current medications.

**Endpoint:** `POST /patients/:customerId/check-interactions`

**Request Example:**

```json
POST /pharmacist/patients/6752d14b8dcfa64e1e234567/check-interactions
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Content-Type: application/json

{
  "drug_name": "Aspirin"
}
```

**Response Example (With Allergy Warning):**

```json
{
  "message": "Check drug interactions successfully",
  "result": {
    "has_interactions": true,
    "warnings": [
      {
        "type": "allergy",
        "severity": "high",
        "message": "Patient is allergic to Aspirin"
      }
    ],
    "current_medications": ["Amlodipine 5mg", "Metformin 500mg"],
    "recommendation": "DO NOT DISPENSE - Check with doctor"
  }
}
```

**Response Example (Safe to Dispense):**

```json
{
  "message": "Check drug interactions successfully",
  "result": {
    "has_interactions": false,
    "warnings": [],
    "current_medications": ["Amlodipine 5mg", "Metformin 500mg"],
    "recommendation": "Safe to dispense"
  }
}
```

---

## Use Case Examples

### Scenario 1: New Patient - Set Up Medical Profile

```bash
# Step 1: Get patient's current medical info (auto-creates if doesn't exist)
GET /pharmacist/patients/6752d14b8dcfa64e1e234567/medical-info

# Step 2: Update with patient's medical history
PUT /pharmacist/patients/6752d14b8dcfa64e1e234567/medical-info
{
  "blood_type": "B+",
  "allergies": ["Penicillin"],
  "chronic_diseases": ["Hypertension"]
}

# Step 3: Add consultation note
POST /pharmacist/patients/6752d14b8dcfa64e1e234567/notes
{
  "note_type": "consultation",
  "content": "Patient reported mild headaches. Recommended monitoring blood pressure."
}
```

### Scenario 2: Verify Prescription - Check Safety

```bash
# Step 1: Get patient's medical info
GET /pharmacist/patients/6752d14b8dcfa64e1e234567/medical-info

# Step 2: Check if new drug is safe
POST /pharmacist/patients/6752d14b8dcfa64e1e234567/check-interactions
{
  "drug_name": "Amoxicillin"
}
# Result: Warning - Patient allergic to Penicillin!

# Step 3: Add verification note
POST /pharmacist/patients/6752d14b8dcfa64e1e234567/notes
{
  "note_type": "prescription_verification",
  "content": "REJECTED: Patient allergic to Penicillin. Contacted doctor for alternative antibiotic.",
  "related_prescription_id": "6752f123456789abcdef0001"
}
```

### Scenario 3: Patient Follow-up

```bash
# Step 1: Get recent medications
GET /pharmacist/patients/6752d14b8dcfa64e1e234567/medications?days=90

# Step 2: Get all previous notes
GET /pharmacist/patients/6752d14b8dcfa64e1e234567/notes

# Step 3: Add new observation
POST /pharmacist/patients/6752d14b8dcfa64e1e234567/notes
{
  "note_type": "general",
  "content": "Patient reported improved blood pressure control. Current medications effective."
}
```

---

## Error Responses

### 404 - Patient Not Found

```json
{
  "message": "Patient not found"
}
```

### 401 - Unauthorized

```json
{
  "message": "Unauthorized access"
}
```

### 403 - Not Pharmacist

```json
{
  "message": "Access denied. Pharmacist role required."
}
```

---

## Database Collections

### `patientMedicalInfos`

Stores comprehensive medical information for each patient.

### `patientNotes`

Stores all pharmacist notes about patients with timestamps and references to prescriptions.

---

## Summary

**Total New Endpoints:** 7

- 3 Medical Info APIs
- 2 Patient Notes APIs
- 1 Medication Tracking API
- 1 Drug Interaction Checking API

**All endpoints:**

- ✅ Protected by authentication
- ✅ Require pharmacist role
- ✅ Zero TypeScript errors
- ✅ Follow existing project patterns
- ✅ Include proper error handling

**Progress Update:**

- Previous: 10/34 APIs (29%)
- **Current: 17/34 APIs (50%)**
- Remaining: 17 APIs
