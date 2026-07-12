export type ModerationCategory =
  | 'pii'
  | 'spam'
  | 'toxic'
  | 'medical_harm'
  | 'unsafe_advice'
  | 'self_harm'
  | 'harassment'
  | 'other'
  | 'user_report'
export type ModerationSeverity = 'low' | 'medium' | 'high' | 'critical'

export interface ModerationResult {
  categories: ModerationCategory[]
  severity: ModerationSeverity
  confidence: 'low' | 'medium' | 'high'
  reasons: string[]
}

const URL_REGEX = /(https?:\/\/\S+|www\.[^\s]+|\b[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z]{2,})(?:\/[^\s]*)?)/gi
const EMAIL_REGEX = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi

// VN phone numbers (very rough): 0xxxxxxxxx or +84xxxxxxxxx
const PHONE_REGEX = /\b(\+84|0)(\d{9})\b/g

function countMatches(text: string, regex: RegExp): number {
  const m = text.match(regex)
  return m ? m.length : 0
}

function decodeHtmlEntities(text: string): string {
  const namedEntities: Record<string, string> = {
    nbsp: ' ',
    amp: '&',
    lt: '<',
    gt: '>',
    quot: '"',
    apos: "'"
  }

  return text.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, entity) => {
    const key = String(entity).toLowerCase()
    if (key.startsWith('#x')) {
      const codePoint = Number.parseInt(key.slice(2), 16)
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match
    }
    if (key.startsWith('#')) {
      const codePoint = Number.parseInt(key.slice(1), 10)
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match
    }
    return namedEntities[key] ?? match
  })
}

function normalize(text: string): string {
  return decodeHtmlEntities(text || '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/p>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .trim()
}

export function moderateTextRuleBased(rawText: string): ModerationResult {
  const text = normalize(rawText)
  const reasons: string[] = []
  const categories: Set<ModerationCategory> = new Set()

  if (!text) {
    return { categories: [], severity: 'low', confidence: 'high', reasons: [] }
  }

  // PII
  if (countMatches(text, PHONE_REGEX) > 0) {
    categories.add('pii')
    reasons.push('Phát hiện số điện thoại trong nội dung.')
  }
  if (countMatches(text, EMAIL_REGEX) > 0) {
    categories.add('pii')
    reasons.push('Phát hiện email trong nội dung.')
  }

  // Spam heuristics
  const urlCount = countMatches(text, URL_REGEX)
  if (urlCount >= 2) {
    categories.add('spam')
    reasons.push('Có nhiều liên kết trong một tin nhắn.')
  }
  if (text.length > 600 && urlCount >= 1) {
    categories.add('spam')
    reasons.push('Tin nhắn dài bất thường kèm liên kết.')
  }

  // Toxic (minimal keyword list; expand later)
  const severeToxicKeywords = ['đụ má', 'đụ mẹ', 'địt mẹ', 'đcm', 'dkm', 'óc chó', 'súc vật', 'con chó']
  const severeToxicPatterns = [/mày.*(đi chết|chết đi|chết mẹ|con mẹ mày)/, /(đi chết|chết mẹ mày|con mẹ mày)/]
  const toxicKeywords = ['đồ ngu', 'ngu quá', 'não để đâu', 'cút', 'đ*', 'dm', 'dmm', 'clm']
  const hasSevereToxic = severeToxicKeywords.some((k) => text.includes(k)) || severeToxicPatterns.some((pattern) => pattern.test(text))
  if (hasSevereToxic || toxicKeywords.some((k) => text.includes(k))) {
    categories.add('toxic')
    reasons.push('Ngôn từ có dấu hiệu xúc phạm/quấy rối.')
  }

  // Medical harm (heuristics)
  const harmSignals = ['tự ý', 'tăng liều', 'gấp đôi', 'không cần bác sĩ', 'bỏ thuốc', 'ngưng thuốc', 'uống liều']
  const dosageSignals = ['viên', 'ống', 'ml', 'mg', 'g', 'lần/ngày', 'lần một ngày', 'mỗi ngày']
  const hasNumber = /\b\d{1,3}\b/.test(text)
  const harm = harmSignals.some((s) => text.includes(s))
  const dosage = dosageSignals.some((s) => text.includes(s))
  if (harm && (hasNumber || dosage)) {
    categories.add('medical_harm')
    reasons.push('Có dấu hiệu hướng dẫn dùng thuốc/liều lượng có thể gây nguy hiểm.')
  }

  // Severity mapping (per your choice: auto hide for HIGH)
  let severity: ModerationSeverity = 'low'
  let confidence: 'low' | 'medium' | 'high' = 'high'

  if (categories.has('medical_harm') || categories.has('unsafe_advice')) {
    severity = 'high'
    confidence = 'medium'
  }
  if (categories.has('pii')) {
    severity = 'high'
    confidence = 'high'
  }
  if (categories.has('spam') && severity === 'low') {
    severity = 'medium'
    confidence = 'medium'
  }
  if (categories.has('toxic') && hasSevereToxic) {
    severity = 'high'
    confidence = 'high'
  } else if (categories.has('toxic') && severity === 'low') {
    severity = 'medium'
    confidence = 'medium'
  }

  return {
    categories: Array.from(categories),
    severity,
    confidence,
    reasons
  }
}
