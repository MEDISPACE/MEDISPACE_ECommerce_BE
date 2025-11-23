# Pharmacist APIs - Frontend Integration Guide

## 🎯 Overview

Tổng hợp tất cả APIs cho Pharmacist Module đã hoàn thành, sẵn sàng để integrate vào Frontend.

**Base URL:** `http://localhost:3000/pharmacist`

**Authentication:** Tất cả endpoints đều cần:

- Header: `Authorization: Bearer <access_token>`
- Role: `pharmacist`

---

## 📋 API Summary by Module

### ✅ Module 1: Dashboard & Profile (5 APIs)

| Method | Endpoint                         | Purpose                              | Status   |
| ------ | -------------------------------- | ------------------------------------ | -------- |
| GET    | `/dashboard/stats`               | Dashboard statistics                 | ✅ Ready |
| GET    | `/dashboard/recent-activities`   | Recent prescriptions & orders        | ✅ Ready |
| GET    | `/patients/search?phone={phone}` | Search patient by phone              | ✅ Ready |
| GET    | `/patients/:customerId/history`  | Patient prescription & order history | ✅ Ready |
| GET    | `/profile`                       | Get pharmacist profile               | ✅ Ready |

### ✅ Module 2: Prescription Management (5 APIs)

| Method | Endpoint                    | Purpose                    | Status   |
| ------ | --------------------------- | -------------------------- | -------- |
| POST   | `/prescriptions`            | Upload prescription        | ✅ Ready |
| GET    | `/prescriptions`            | Get all prescriptions      | ✅ Ready |
| GET    | `/prescriptions/:id`        | Get prescription details   | ✅ Ready |
| GET    | `/prescriptions/pending`    | Get pending prescriptions  | ✅ Ready |
| PUT    | `/prescriptions/:id/verify` | Verify/reject prescription | ✅ Ready |

**Note:** Prescription APIs ở `/prescriptions` route, không phải `/pharmacist/prescriptions`

### ✅ Module 3: Patient Medical Info (3 APIs)

| Method | Endpoint                             | Purpose                  | Status   |
| ------ | ------------------------------------ | ------------------------ | -------- |
| GET    | `/patients/:customerId/medical-info` | Get patient medical info | ✅ Ready |
| PUT    | `/patients/:customerId/medical-info` | Update medical info      | ✅ Ready |
| POST   | `/patients/:customerId/allergies`    | Add allergy              | ✅ Ready |

### ✅ Module 4: Patient Notes (2 APIs)

| Method | Endpoint                      | Purpose               | Status   |
| ------ | ----------------------------- | --------------------- | -------- |
| POST   | `/patients/:customerId/notes` | Create patient note   | ✅ Ready |
| GET    | `/patients/:customerId/notes` | Get all patient notes | ✅ Ready |

### ✅ Module 5: Medication Tracking (2 APIs)

| Method | Endpoint                                    | Purpose                 | Status   |
| ------ | ------------------------------------------- | ----------------------- | -------- |
| GET    | `/patients/:customerId/medications?days=30` | Get recent medications  | ✅ Ready |
| POST   | `/patients/:customerId/check-interactions`  | Check drug interactions | ✅ Ready |

### ✅ Module 6: Order Management (4 APIs)

| Method | Endpoint                  | Purpose                  | Status   |
| ------ | ------------------------- | ------------------------ | -------- |
| GET    | `/orders`                 | List orders with filters | ✅ Ready |
| GET    | `/orders/:orderId`        | Get order details        | ✅ Ready |
| PATCH  | `/orders/:orderId/status` | Update order status      | ✅ Ready |
| GET    | `/orders/statistics`      | Get order statistics     | ✅ Ready |

### ✅ Module 7: Settings & Profile (4 APIs)

| Method | Endpoint         | Purpose                | Status   |
| ------ | ---------------- | ---------------------- | -------- |
| PATCH  | `/profile`       | Update profile info    | ✅ Ready |
| PATCH  | `/password`      | Change password        | ✅ Ready |
| GET    | `/stats/working` | Get working statistics | ✅ Ready |
| PATCH  | `/online-status` | Update online status   | ✅ Ready |

---

## 🔧 Frontend Service Layer Setup

### 1. Create API Client (`src/services/api/pharmacist.api.ts`)

```typescript
import axios from 'axios'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000'

// Axios instance với authentication
const pharmacistAPI = axios.create({
  baseURL: `${API_BASE_URL}/pharmacist`,
  headers: {
    'Content-Type': 'application/json'
  }
})

// Add auth token to all requests
pharmacistAPI.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Prescription API (different base URL)
const prescriptionAPI = axios.create({
  baseURL: `${API_BASE_URL}/prescriptions`,
  headers: {
    'Content-Type': 'application/json'
  }
})

prescriptionAPI.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

export { pharmacistAPI, prescriptionAPI }
```

---

## 📱 Frontend API Functions by Component

### Dashboard Component (`DashboardPage.tsx`)

```typescript
// src/services/pharmacist/dashboard.service.ts
import { pharmacistAPI } from '../api/pharmacist.api'

export const dashboardService = {
  // Get dashboard statistics
  getStats: async () => {
    const response = await pharmacistAPI.get('/dashboard/stats')
    return response.data.result
  },

  // Get recent activities
  getRecentActivities: async (limit = 5) => {
    const response = await pharmacistAPI.get('/dashboard/recent-activities', {
      params: { limit }
    })
    return response.data.result
  },

  // Search patient by phone
  searchPatient: async (phone: string) => {
    const response = await pharmacistAPI.get('/patients/search', {
      params: { phone }
    })
    return response.data.result
  },

  // Get patient history
  getPatientHistory: async (customerId: string) => {
    const response = await pharmacistAPI.get(`/patients/${customerId}/history`)
    return response.data.result
  }
}
```

**Usage Example:**

```typescript
// In DashboardPage.tsx
import { dashboardService } from '@/services/pharmacist/dashboard.service';

const DashboardPage = () => {
  const [stats, setStats] = useState(null);
  const [activities, setActivities] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [statsData, activitiesData] = await Promise.all([
          dashboardService.getStats(),
          dashboardService.getRecentActivities(10)
        ]);
        setStats(statsData);
        setActivities(activitiesData);
      } catch (error) {
        console.error('Failed to fetch dashboard data:', error);
      }
    };
    fetchData();
  }, []);

  return (
    <div>
      {/* Dashboard Stats Cards */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <h3>Pending Prescriptions</h3>
          <p>{stats?.pendingPrescriptions || 0}</p>
        </Card>
        <Card>
          <h3>Today's Orders</h3>
          <p>{stats?.ordersToday || 0}</p>
        </Card>
        {/* ... more cards */}
      </div>
    </div>
  );
};
```

---

### Prescription Management Component (`PrescriptionManagementPage.tsx`)

```typescript
// src/services/pharmacist/prescription.service.ts
import { prescriptionAPI } from '../api/pharmacist.api'

export const prescriptionService = {
  // Get all prescriptions
  getAll: async (params?: { page?: number; limit?: number; status?: string }) => {
    const response = await prescriptionAPI.get('/', { params })
    return response.data.result
  },

  // Get pending prescriptions
  getPending: async () => {
    const response = await prescriptionAPI.get('/pending')
    return response.data.result
  },

  // Get prescription by ID
  getById: async (id: string) => {
    const response = await prescriptionAPI.get(`/${id}`)
    return response.data.result
  },

  // Upload prescription
  upload: async (data: {
    customerId: string
    doctorName: string
    hospitalName?: string
    prescriptionDate: string
    images: string[]
    medications: Array<{
      productName: string
      dosage: string
      quantity: number
      instructions: string
    }>
  }) => {
    const response = await prescriptionAPI.post('/', data)
    return response.data.result
  },

  // Verify/reject prescription
  verify: async (
    id: string,
    data: {
      status: 'Verified' | 'Rejected'
      notes?: string
    }
  ) => {
    const response = await prescriptionAPI.put(`/${id}/verify`, data)
    return response.data.result
  }
}
```

**Usage Example:**

```typescript
// In PrescriptionManagementPage.tsx
import { prescriptionService } from '@/services/pharmacist/prescription.service';

const PrescriptionManagementPage = () => {
  const [prescriptions, setPrescriptions] = useState([]);
  const [selectedPrescription, setSelectedPrescription] = useState(null);

  // Load pending prescriptions
  useEffect(() => {
    const loadPrescriptions = async () => {
      const data = await prescriptionService.getPending();
      setPrescriptions(data);
    };
    loadPrescriptions();
  }, []);

  // Verify prescription
  const handleVerify = async (id: string) => {
    try {
      await prescriptionService.verify(id, {
        status: 'Verified',
        notes: 'Prescription verified successfully'
      });
      // Reload prescriptions
      const data = await prescriptionService.getPending();
      setPrescriptions(data);
    } catch (error) {
      console.error('Failed to verify prescription:', error);
    }
  };

  return (
    <div>
      {prescriptions.map(prescription => (
        <PrescriptionCard
          key={prescription._id}
          prescription={prescription}
          onVerify={handleVerify}
        />
      ))}
    </div>
  );
};
```

---

### Patient History Component (`PatientHistory.tsx`)

```typescript
// src/services/pharmacist/patient.service.ts
import { pharmacistAPI } from '../api/pharmacist.api'

export const patientService = {
  // Get medical info
  getMedicalInfo: async (customerId: string) => {
    const response = await pharmacistAPI.get(`/patients/${customerId}/medical-info`)
    return response.data.result
  },

  // Update medical info
  updateMedicalInfo: async (
    customerId: string,
    data: {
      blood_type?: string
      allergies?: string[]
      chronic_diseases?: string[]
    }
  ) => {
    const response = await pharmacistAPI.put(`/patients/${customerId}/medical-info`, data)
    return response.data.result
  },

  // Add allergy
  addAllergy: async (customerId: string, allergy: string) => {
    const response = await pharmacistAPI.post(`/patients/${customerId}/allergies`, { allergy })
    return response.data.result
  },

  // Get patient notes
  getNotes: async (customerId: string) => {
    const response = await pharmacistAPI.get(`/patients/${customerId}/notes`)
    return response.data.result
  },

  // Create patient note
  createNote: async (
    customerId: string,
    data: {
      note_type: 'consultation' | 'prescription_verification' | 'general'
      content: string
      related_prescription_id?: string
    }
  ) => {
    const response = await pharmacistAPI.post(`/patients/${customerId}/notes`, data)
    return response.data.result
  },

  // Get recent medications
  getMedications: async (customerId: string, days = 30) => {
    const response = await pharmacistAPI.get(`/patients/${customerId}/medications`, {
      params: { days }
    })
    return response.data.result
  },

  // Check drug interactions
  checkInteractions: async (customerId: string, drugName: string) => {
    const response = await pharmacistAPI.post(`/patients/${customerId}/check-interactions`, {
      drug_name: drugName
    })
    return response.data.result
  }
}
```

**Usage Example:**

```typescript
// In PatientHistory.tsx
import { patientService } from '@/services/pharmacist/patient.service';

const PatientHistory = ({ customerId }: { customerId: string }) => {
  const [medicalInfo, setMedicalInfo] = useState(null);
  const [medications, setMedications] = useState([]);
  const [notes, setNotes] = useState([]);

  useEffect(() => {
    const loadPatientData = async () => {
      const [medical, meds, patientNotes] = await Promise.all([
        patientService.getMedicalInfo(customerId),
        patientService.getMedications(customerId, 90),
        patientService.getNotes(customerId)
      ]);
      setMedicalInfo(medical);
      setMedications(meds);
      setNotes(patientNotes);
    };
    loadPatientData();
  }, [customerId]);

  // Check drug interaction before dispensing
  const checkDrug = async (drugName: string) => {
    const result = await patientService.checkInteractions(customerId, drugName);
    if (result.has_interactions) {
      alert(`Warning: ${result.warnings[0].message}`);
    } else {
      alert('Safe to dispense');
    }
  };

  return (
    <div>
      {/* Medical Info Section */}
      <Card>
        <h3>Medical Information</h3>
        <p>Blood Type: {medicalInfo?.blood_type || 'N/A'}</p>
        <p>Allergies: {medicalInfo?.allergies.join(', ')}</p>
        <p>Chronic Diseases: {medicalInfo?.chronic_diseases.join(', ')}</p>
      </Card>

      {/* Recent Medications */}
      <Card>
        <h3>Recent Medications</h3>
        {medications.map(med => (
          <div key={med.prescription_id}>
            <p>{med.drug_name} - {med.dosage}</p>
          </div>
        ))}
      </Card>

      {/* Notes */}
      <Card>
        <h3>Pharmacist Notes</h3>
        {notes.map(note => (
          <div key={note._id}>
            <p><strong>{note.note_type}:</strong> {note.content}</p>
          </div>
        ))}
      </Card>
    </div>
  );
};
```

---

### Order Management Component (`OrderManagement.tsx`)

```typescript
// src/services/pharmacist/order.service.ts
import { pharmacistAPI } from '../api/pharmacist.api'

export const orderService = {
  // Get orders with filters
  getOrders: async (params?: {
    page?: number
    limit?: number
    status?: string
    paymentStatus?: string
    search?: string
  }) => {
    const response = await pharmacistAPI.get('/orders', { params })
    return response.data.result
  },

  // Get order details
  getOrderDetails: async (orderId: string) => {
    const response = await pharmacistAPI.get(`/orders/${orderId}`)
    return response.data.result
  },

  // Update order status
  updateStatus: async (
    orderId: string,
    data: {
      status: string
      trackingNumber?: string
      notes?: string
    }
  ) => {
    const response = await pharmacistAPI.patch(`/orders/${orderId}/status`, data)
    return response.data.result
  },

  // Get order statistics
  getStatistics: async (dateRange?: { startDate: string; endDate: string }) => {
    const response = await pharmacistAPI.get('/orders/statistics', {
      params: dateRange
    })
    return response.data.result
  }
}
```

**Usage Example:**

```typescript
// In OrderManagement.tsx
import { orderService } from '@/services/pharmacist/order.service';

const OrderManagement = () => {
  const [orders, setOrders] = useState([]);
  const [pagination, setPagination] = useState(null);

  // Load orders with filters
  const loadOrders = async (page = 1, status = '') => {
    const data = await orderService.getOrders({
      page,
      limit: 20,
      status
    });
    setOrders(data.orders);
    setPagination(data.pagination);
  };

  // Confirm order
  const handleConfirm = async (orderId: string) => {
    await orderService.updateStatus(orderId, {
      status: 'confirmed',
      notes: 'Order verified and ready for processing'
    });
    loadOrders(); // Reload orders
  };

  // Ship order
  const handleShip = async (orderId: string, trackingNumber: string) => {
    await orderService.updateStatus(orderId, {
      status: 'shipped',
      trackingNumber,
      notes: 'Shipped via courier'
    });
    loadOrders();
  };

  return (
    <div>
      {/* Filter tabs */}
      <Tabs>
        <Tab onClick={() => loadOrders(1, 'pending')}>Pending</Tab>
        <Tab onClick={() => loadOrders(1, 'confirmed')}>Confirmed</Tab>
        <Tab onClick={() => loadOrders(1, 'shipped')}>Shipped</Tab>
      </Tabs>

      {/* Orders list */}
      {orders.map(order => (
        <OrderCard
          key={order._id}
          order={order}
          onConfirm={handleConfirm}
          onShip={handleShip}
        />
      ))}

      {/* Pagination */}
      <Pagination
        current={pagination?.page}
        total={pagination?.totalPages}
        onChange={(page) => loadOrders(page)}
      />
    </div>
  );
};
```

---

### Settings Component (`SettingsPage.tsx`)

```typescript
// src/services/pharmacist/settings.service.ts
import { pharmacistAPI } from '../api/pharmacist.api'

export const settingsService = {
  // Get profile
  getProfile: async () => {
    const response = await pharmacistAPI.get('/profile')
    return response.data.result
  },

  // Update profile
  updateProfile: async (data: {
    firstName?: string
    lastName?: string
    phoneNumber?: string
    dateOfBirth?: string
    gender?: number
    avatar?: string
    lisenseNumber?: string
  }) => {
    const response = await pharmacistAPI.patch('/profile', data)
    return response.data.result
  },

  // Update password
  updatePassword: async (oldPassword: string, newPassword: string) => {
    const response = await pharmacistAPI.patch('/password', {
      oldPassword,
      newPassword
    })
    return response.data.result
  },

  // Get working statistics
  getWorkingStats: async (dateRange?: { startDate: string; endDate: string }) => {
    const response = await pharmacistAPI.get('/stats/working', {
      params: dateRange
    })
    return response.data.result
  },

  // Update online status
  updateOnlineStatus: async (isOnline: boolean) => {
    const response = await pharmacistAPI.patch('/online-status', { isOnline })
    return response.data.result
  }
}
```

**Usage Example:**

```typescript
// In SettingsPage.tsx
import { settingsService } from '@/services/pharmacist/settings.service';

const SettingsPage = () => {
  const [profile, setProfile] = useState(null);
  const [stats, setStats] = useState(null);

  useEffect(() => {
    const loadData = async () => {
      const [profileData, statsData] = await Promise.all([
        settingsService.getProfile(),
        settingsService.getWorkingStats()
      ]);
      setProfile(profileData);
      setStats(statsData);
    };
    loadData();
  }, []);

  // Update profile
  const handleUpdateProfile = async (formData: any) => {
    await settingsService.updateProfile(formData);
    // Reload profile
    const updated = await settingsService.getProfile();
    setProfile(updated);
  };

  // Change password
  const handleChangePassword = async (oldPass: string, newPass: string) => {
    try {
      await settingsService.updatePassword(oldPass, newPass);
      alert('Password updated successfully');
    } catch (error) {
      alert('Failed to update password');
    }
  };

  // Toggle online status
  const handleToggleOnline = async () => {
    const newStatus = !profile.isOnline;
    await settingsService.updateOnlineStatus(newStatus);
    setProfile({ ...profile, isOnline: newStatus });
  };

  return (
    <div>
      {/* Profile Section */}
      <Card>
        <h3>Profile Information</h3>
        <Form onSubmit={handleUpdateProfile}>
          <Input name="firstName" defaultValue={profile?.firstName} />
          <Input name="lastName" defaultValue={profile?.lastName} />
          <Input name="phoneNumber" defaultValue={profile?.phoneNumber} />
          <Button type="submit">Update Profile</Button>
        </Form>
      </Card>

      {/* Password Section */}
      <Card>
        <h3>Change Password</h3>
        <Form onSubmit={handleChangePassword}>
          <Input type="password" name="oldPassword" placeholder="Old Password" />
          <Input type="password" name="newPassword" placeholder="New Password" />
          <Button type="submit">Change Password</Button>
        </Form>
      </Card>

      {/* Working Stats */}
      <Card>
        <h3>Working Statistics</h3>
        <p>Total Prescriptions Verified: {stats?.totalPrescriptionsVerified}</p>
      </Card>

      {/* Online Status */}
      <Card>
        <Switch
          checked={profile?.isOnline}
          onChange={handleToggleOnline}
        />
        <span>{profile?.isOnline ? 'Online' : 'Offline'}</span>
      </Card>
    </div>
  );
};
```

---

## 🚀 Quick Start Integration

### Step 1: Install Dependencies

```bash
npm install axios
```

### Step 2: Create Environment Variables

```env
# .env
VITE_API_BASE_URL=http://localhost:3000
```

### Step 3: Create API Structure

```
src/
├── services/
│   ├── api/
│   │   └── pharmacist.api.ts          # Axios instance
│   └── pharmacist/
│       ├── dashboard.service.ts       # Dashboard APIs
│       ├── prescription.service.ts    # Prescription APIs
│       ├── patient.service.ts         # Patient APIs
│       ├── order.service.ts           # Order APIs
│       └── settings.service.ts        # Settings APIs
```

### Step 4: Use in Components

```typescript
import { dashboardService } from '@/services/pharmacist/dashboard.service'
import { prescriptionService } from '@/services/pharmacist/prescription.service'
import { patientService } from '@/services/pharmacist/patient.service'
import { orderService } from '@/services/pharmacist/order.service'
import { settingsService } from '@/services/pharmacist/settings.service'
```

---

## 🔐 Authentication Flow

```typescript
// 1. Login and store token
const login = async (email: string, password: string) => {
  const response = await axios.post('http://localhost:3000/auth/login', {
    email,
    password
  })
  localStorage.setItem('access_token', response.data.result.access_token)
  localStorage.setItem('refresh_token', response.data.result.refresh_token)
}

// 2. Token is automatically added to all requests via interceptor

// 3. Logout
const logout = () => {
  localStorage.removeItem('access_token')
  localStorage.removeItem('refresh_token')
}
```

---

## 📊 Progress Summary

**Total Pharmacist APIs: 25/34 (74%)**

✅ **Completed Modules (25 APIs):**

- Dashboard & Profile: 5 APIs
- Prescription Management: 5 APIs
- Patient Medical Info: 3 APIs
- Patient Notes: 2 APIs
- Medication Tracking: 2 APIs
- Order Management: 4 APIs
- Settings & Profile: 4 APIs

❌ **Remaining Modules (9 APIs):**

- Reports: 2 APIs
- Drug Database: 4 APIs
- Chat/Consultation: 3 APIs

---

## 📚 Documentation Files

1. `PATIENT_HISTORY_ENHANCEMENT_API.md` - Medical info, notes, medications
2. `ORDER_MANAGEMENT_API.md` - Order processing and tracking
3. `SETTINGS_PROFILE_API.md` - Profile and settings management
4. `PRESCRIPTIONS_API.md` - Prescription upload and verification

---

## 🎯 Next Steps for Frontend

1. **Create API service layer** với các files trên
2. **Implement error handling** cho tất cả API calls
3. **Add loading states** khi fetch data
4. **Implement React Query/SWR** để cache và auto-refetch
5. **Add toast notifications** cho success/error messages
6. **Test all endpoints** với Postman trước khi integrate

---

## 💡 Tips for Integration

### Use React Query for Better DX

```typescript
import { useQuery, useMutation } from '@tanstack/react-query'

// In component
const { data, isLoading, error } = useQuery({
  queryKey: ['dashboard-stats'],
  queryFn: dashboardService.getStats
})

const verifyMutation = useMutation({
  mutationFn: (id: string) => prescriptionService.verify(id, { status: 'Verified' }),
  onSuccess: () => {
    queryClient.invalidateQueries(['prescriptions'])
  }
})
```

### Error Handling

```typescript
try {
  await prescriptionService.verify(id, data)
} catch (error) {
  if (axios.isAxiosError(error)) {
    console.error('API Error:', error.response?.data?.message)
  }
}
```

### TypeScript Types

```typescript
// Define response types
interface DashboardStats {
  pendingPrescriptions: number
  prescriptionsToday: { total: number; verified: number; rejected: number }
  ordersToday: number
  totalRevenue: number
}

interface Prescription {
  _id: string
  prescriptionNumber: string
  customerId: string
  doctorName: string
  status: 'Pending' | 'Verified' | 'Rejected'
  // ... more fields
}
```

---

**All APIs are ready for Frontend integration! 🚀**
