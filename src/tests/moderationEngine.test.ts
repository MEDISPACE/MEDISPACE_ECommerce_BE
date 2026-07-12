import { describe, expect, it } from 'vitest'
import { moderateTextRuleBased } from '~/utils/moderation/moderationEngine'

describe('moderateTextRuleBased', () => {
  it('detects risky dosage advice in rich text content', () => {
    const result = moderateTextRuleBased(
      '<p>Tôi&nbsp;nghĩ&nbsp;cứ&nbsp;uống&nbsp;gấp&nbsp;đôi&nbsp;liều&nbsp;thuốc&nbsp;huyết&nbsp;áp&nbsp;mỗi&nbsp;ngày&nbsp;là&nbsp;sẽ&nbsp;khỏi&nbsp;nhanh&nbsp;hơn.</p>'
    )

    expect(result).toMatchObject({
      categories: expect.arrayContaining(['medical_harm']),
      severity: 'high'
    })
  })

  it('detects direct email sharing as PII', () => {
    const result = moderateTextRuleBased('Ai tư vấn giúp tôi qua email nguyenvana@example.com nhé.')

    expect(result).toMatchObject({
      categories: expect.arrayContaining(['pii']),
      severity: 'high',
      confidence: 'high'
    })
  })

  it('auto-hides severe profanity and death wishes', () => {
    for (const content of ['đụ má', 'óc chó', 'mày đi chết con mẹ mày đi']) {
      const result = moderateTextRuleBased(content)

      expect(result).toMatchObject({
        categories: expect.arrayContaining(['toxic']),
        severity: 'high',
        confidence: 'high'
      })
    }
  })

})
