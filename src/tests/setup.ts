/**
 * Global test setup — chạy trước tất cả test files
 * - Tắt console.log/warn/error không cần thiết trong tests
 * - Set env variables mặc định
 */

import { vi } from 'vitest'

// Set env vars cho test
process.env.TYPESENSE_HOST = 'localhost'
process.env.TYPESENSE_PORT = '7700'
process.env.TYPESENSE_API_KEY = 'test-key'

// Silence noisy console in tests (chỉ hiện error thật sự)
vi.spyOn(console, 'log').mockImplementation(() => {})
vi.spyOn(console, 'warn').mockImplementation(() => {})
vi.spyOn(console, 'error').mockImplementation(() => {})
