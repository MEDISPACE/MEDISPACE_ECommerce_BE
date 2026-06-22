import { describe, it, expect } from 'vitest'
import { ALL_TYPES, TemplateError, renderNotificationTemplate } from '../helpers/db'

describe('notifications/unit/02.template-engine', () => {
  it('renders order confirmation with correct order details', () => {
    const rendered = renderNotificationTemplate('order', { orderNumber: 'ORD-001', total: '250.000đ' })
    expect(rendered.html).toContain('ORD-001')
    expect(rendered.html).toContain('250.000đ')
  })

  it('renders event reminder with correct event name and time', () => {
    const rendered = renderNotificationTemplate('reminder', { eventName: 'Tim mạch', startTime: '16:00' })
    expect(rendered.text).toContain('Tim mạch')
    expect(rendered.text).toContain('16:00')
  })

  it('renders with missing optional field using fallback', () => {
    const rendered = renderNotificationTemplate('shipping', {})
    expect(rendered.text).toContain('đang cập nhật')
  })

  it('renders with null required field by throwing TemplateError', () => {
    expect(() => renderNotificationTemplate('order', { orderNumber: null, total: '10đ' })).toThrow(TemplateError)
  })

  it('renders Vietnamese template correctly', () => {
    const rendered = renderNotificationTemplate('security', { message: 'Mật khẩu của bạn vừa được thay đổi.' })
    expect(rendered.html).toContain('Mật khẩu')
  })

  it('HTML email template renders without broken tags', () => {
    const rendered = renderNotificationTemplate('return', { requestNumber: 'RET-001', status: 'được chấp thuận' })
    expect(rendered.html).toMatch(/^<p>.*<\/p>$/)
  })

  it('plain text fallback is generated correctly', () => {
    const rendered = renderNotificationTemplate('payment', { orderNumber: 'ORD-001', paymentStatus: 'paid' })
    expect(rendered.text).not.toContain('<p>')
  })

  it('XSS attempt in dynamic field is sanitized before render', () => {
    const rendered = renderNotificationTemplate('community', { eventName: '<script>alert(1)</script>' })
    expect(rendered.html).toContain('&lt;script&gt;')
    expect(rendered.html).not.toContain('<script>')
  })

  it('long string in field is truncated correctly', () => {
    const rendered = renderNotificationTemplate('community', { eventName: 'A'.repeat(200) })
    expect(rendered.html.length).toBeLessThan(150)
    expect(rendered.html).toContain('…')
  })

  it('all template types render without error', () => {
    const base = {
      orderNumber: 'ORD-SNAPSHOT',
      total: '1đ',
      startTime: '09:00',
      eventName: 'Sự kiện mẫu',
      prescriptionNumber: 'RX-1',
      campaignName: 'Khuyến mãi',
      requestNumber: 'RET-1',
      message: 'Thông báo hệ thống'
    }
    const rendered = ALL_TYPES.map((type) => [type, renderNotificationTemplate(type, base).title])
    expect(rendered).toMatchInlineSnapshot(`
      [
        [
          "order",
          "Order confirmed",
        ],
        [
          "payment",
          "Payment update",
        ],
        [
          "shipping",
          "Shipping update",
        ],
        [
          "prescription",
          "Prescription update",
        ],
        [
          "promotion",
          "Promotion",
        ],
        [
          "reminder",
          "Event reminder",
        ],
        [
          "system",
          "System alert",
        ],
        [
          "review",
          "Review update",
        ],
        [
          "return",
          "Return update",
        ],
        [
          "security",
          "Security alert",
        ],
        [
          "community",
          "Community event",
        ],
      ]
    `)
  })
})
