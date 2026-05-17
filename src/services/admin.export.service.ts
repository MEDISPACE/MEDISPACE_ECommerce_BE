import ExcelJS from 'exceljs'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import path from 'path'
import fs from 'fs'

/**
 * Get time range label for file names and headers
 */
export const getTimeRangeLabel = (timeRange: string, startDate?: string, endDate?: string): string => {
  const labels: Record<string, string> = {
    week: 'Tuần_Này',
    month: 'Tháng_Này',
    quarter: 'Quý_Này',
    year: 'Năm_Nay'
  }
  if (timeRange === 'custom' && startDate && endDate) {
    return `${startDate}_${endDate}`
  }
  return labels[timeRange] || 'Tháng_Này'
}

export const getTimeRangeLabelVi = (timeRange: string, startDate?: string, endDate?: string): string => {
  const labels: Record<string, string> = {
    week: 'Tuần này',
    month: 'Tháng này',
    quarter: 'Quý này',
    year: 'Năm nay'
  }
  if (timeRange === 'custom' && startDate && endDate) {
    try {
      const start = new Date(startDate).toLocaleDateString('vi-VN')
      const end = new Date(endDate).toLocaleDateString('vi-VN')
      return `Từ ${start} đến ${end}`
    } catch {
      return `${startDate} - ${endDate}`
    }
  }
  return labels[timeRange] || 'Tháng này'
}

/**
 * Format currency for export
 */
const fmtCurrency = (value: number): string => {
  return new Intl.NumberFormat('vi-VN').format(Math.round(value)) + ' đ'
}

export class AdminExportService {
  /**
   * Export analytics data to Excel (.xlsx) Buffer
   */
  async exportToExcel(data: any, timeRange: string, startDate?: string, endDate?: string): Promise<Buffer> {
    const wb = new ExcelJS.Workbook()
    wb.creator = 'MEDISPACE'
    wb.created = new Date()

    const labelVi = getTimeRangeLabelVi(timeRange, startDate, endDate)
    const exportDateString = new Date().toLocaleDateString('vi-VN')

    // Helper to style header row
    const styleHeaderRow = (row: ExcelJS.Row, color: string = 'FF0066CC') => {
      row.font = { bold: true, color: { argb: 'FFFFFFFF' } }
      row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: color } }
      row.alignment = { vertical: 'middle', horizontal: 'center' }
      row.height = 25
    }

    // Helper to style title
    const styleTitle = (sheet: ExcelJS.Worksheet, title: string) => {
      sheet.mergeCells('A1:D1')
      const titleCell = sheet.getCell('A1')
      titleCell.value = title
      titleCell.font = { bold: true, size: 16, color: { argb: 'FF0066CC' } }
      titleCell.alignment = { vertical: 'middle', horizontal: 'left' }
      sheet.getRow(1).height = 30

      sheet.mergeCells('A2:D2')
      sheet.getCell('A2').value = `Kỳ báo cáo: ${labelVi}`
      sheet.getCell('A2').font = { italic: true, color: { argb: 'FF666666' } }

      sheet.mergeCells('A3:D3')
      sheet.getCell('A3').value = `Ngày xuất: ${exportDateString}`
      sheet.getCell('A3').font = { italic: true, color: { argb: 'FF666666' } }

      sheet.addRow([]) // row 4 empty
    }

    // Border helper
    const applyBorders = (sheet: ExcelJS.Worksheet, endRow: number, endCol: number) => {
      for (let i = 5; i <= endRow; i++) {
        for (let j = 1; j <= endCol; j++) {
          sheet.getCell(i, j).border = {
            top: { style: 'thin', color: { argb: 'FFDDDDDD' } },
            left: { style: 'thin', color: { argb: 'FFDDDDDD' } },
            bottom: { style: 'thin', color: { argb: 'FFDDDDDD' } },
            right: { style: 'thin', color: { argb: 'FFDDDDDD' } }
          }
        }
      }
    }

    // ========== Sheet 1: Tổng quan KPI ==========
    const wsKpi = wb.addWorksheet('Tổng quan')
    wsKpi.columns = [
      { key: 'metric', width: 30 },
      { key: 'value', width: 22 },
      { key: 'growth', width: 20 },
      { key: 'note', width: 35 }
    ]
    styleTitle(wsKpi, 'BÁO CÁO PHÂN TÍCH - MEDISPACE')

    const headerRow1 = wsKpi.addRow(['CHỈ SỐ', 'GIÁ TRỊ', 'TĂNG TRƯỞNG (%)', 'GHI CHÚ'])
    styleHeaderRow(headerRow1)

    wsKpi
      .addRow([
        'Tổng doanh thu',
        data.revenue?.total || 0,
        `${(data.revenue?.growth || 0).toFixed(1)}%`,
        'So với kỳ trước'
      ])
      .getCell(2).numFmt = '#,##0" đ"'
    wsKpi.addRow([
      'Tổng đơn hàng',
      data.orders?.total || 0,
      `${(data.orders?.growth || 0).toFixed(1)}%`,
      'So với kỳ trước'
    ])
    wsKpi.addRow([
      'Tổng người dùng',
      data.users?.total || 0,
      `${(data.users?.growth || 0).toFixed(1)}%`,
      'So với kỳ trước'
    ])
    wsKpi.addRow(['Tổng sản phẩm', data.products?.total || 0, `${(data.products?.growth || 0).toFixed(1)}%`, ''])

    wsKpi.addRow([])

    const headerRow2 = wsKpi.addRow(['CHỈ SỐ HIỆU SUẤT', 'GIÁ TRỊ', '', ''])
    styleHeaderRow(headerRow2, 'FF36B37E') // Green

    wsKpi.addRow(['Giá trị đơn trung bình', data.metrics?.avgOrderValue || 0, '', '']).getCell(2).numFmt = '#,##0" đ"'
    wsKpi.addRow([
      'Tỷ lệ chuyển đổi',
      `${(data.metrics?.conversionRate || 0).toFixed(1)}%`,
      '',
      'Unique ordering / total customers'
    ])
    wsKpi.addRow([
      'Tỷ lệ giữ chân KH',
      `${(data.metrics?.customerRetention || 0).toFixed(1)}%`,
      '',
      'Returning / ordering customers'
    ])

    applyBorders(wsKpi, 14, 4)

    // ========== Sheet 2: Doanh thu ==========
    const wsRevenue = wb.addWorksheet('Doanh thu')
    wsRevenue.columns = [
      { key: 'month', width: 25 },
      { key: 'revenue', width: 25 },
      { key: 'orders', width: 18 }
    ]
    styleTitle(wsRevenue, 'DOANH THU THEO THỜI GIAN')

    const revHeader = wsRevenue.addRow(['Tháng', 'Doanh thu (VND)', 'Số đơn'])
    styleHeaderRow(revHeader)

    let revRowIdx = 5
    ;(data.revenue?.monthlyTrends || []).forEach((item: any) => {
      const r = wsRevenue.addRow([item.month, item.revenue, item.orderCount || 0])
      r.getCell(2).numFmt = '#,##0" đ"'
      revRowIdx++
    })
    applyBorders(wsRevenue, revRowIdx, 3)

    // ========== Sheet 3: Đơn hàng ==========
    const sb = data.orders?.statusBreakdown || ({} as any)
    const wsOrders = wb.addWorksheet('Đơn hàng')
    wsOrders.columns = [
      { key: 'status', width: 25 },
      { key: 'count', width: 18 },
      { key: 'percent', width: 18 }
    ]
    styleTitle(wsOrders, 'PHÂN TÍCH ĐƠN HÀNG')

    const ordHeader = wsOrders.addRow(['Trạng thái', 'Số lượng', 'Tỷ lệ (%)'])
    styleHeaderRow(ordHeader, 'FFFF9F43') // Orange

    const getTotalPercent = (val: number) =>
      data.orders?.total ? ((val / data.orders.total) * 100).toFixed(1) + '%' : '0%'

    wsOrders.addRow(['Chờ xử lý', sb.pending || 0, getTotalPercent(sb.pending || 0)])
    wsOrders.addRow(['Đang xử lý', sb.processing || 0, getTotalPercent(sb.processing || 0)])
    wsOrders.addRow(['Đang giao', sb.shipped || 0, getTotalPercent(sb.shipped || 0)])
    wsOrders.addRow(['Hoàn thành', sb.delivered || 0, getTotalPercent(sb.delivered || 0)])
    wsOrders.addRow(['Đã hủy', sb.cancelled || 0, getTotalPercent(sb.cancelled || 0)])
    applyBorders(wsOrders, 10, 3)

    // ========== Sheet 4: Danh mục ==========
    const wsCat = wb.addWorksheet('Danh mục')
    wsCat.columns = [
      { key: 'cat', width: 35 },
      { key: 'revenue', width: 25 },
      { key: 'percent', width: 15 },
      { key: 'count', width: 15 }
    ]
    styleTitle(wsCat, 'DOANH SỐ THEO DANH MỤC')

    const catHeader = wsCat.addRow(['Danh mục', 'Doanh thu (VND)', 'Tỷ lệ (%)', 'Số SP'])
    styleHeaderRow(catHeader, 'FFA855F7') // Purple

    let catRowIdx = 5
    ;(data.products?.salesByCategory || []).forEach((cat: any) => {
      const r = wsCat.addRow([
        cat.categoryName || cat.category || 'Khác',
        cat.amount || cat.totalRevenue || 0,
        `${(cat.value || cat.percentage || 0).toFixed(1)}%`,
        cat.count || cat.productCount || 0
      ])
      r.getCell(2).numFmt = '#,##0" đ"'
      catRowIdx++
    })
    applyBorders(wsCat, catRowIdx, 4)

    // ========== Sheet 5: Top sản phẩm ==========
    const wsTop = wb.addWorksheet('Top sản phẩm')
    wsTop.columns = [
      { key: 'index', width: 10 },
      { key: 'name', width: 55 },
      { key: 'revenue', width: 25 },
      { key: 'sales', width: 15 },
      { key: 'cat', width: 30 }
    ]
    styleTitle(wsTop, 'SẢN PHẨM BÁN CHẠY')

    const topHeader = wsTop.addRow(['#', 'Tên sản phẩm', 'Doanh thu (VND)', 'Số đơn bán', 'Danh mục'])
    styleHeaderRow(topHeader, 'FF06B6D4') // Cyan

    let topRowIdx = 5
    ;(data.products?.topProducts || []).forEach((p: any, i: number) => {
      const r = wsTop.addRow([i + 1, p.name, p.revenue, p.sales, p.categoryName || ''])
      r.getCell(3).numFmt = '#,##0" đ"'
      topRowIdx++
    })
    applyBorders(wsTop, topRowIdx, 5)

    // ========== Sheet 6: Khách hàng ==========
    const wsCust = wb.addWorksheet('Khách hàng')
    wsCust.columns = [
      { key: 'metric', width: 30 },
      { key: 'val', width: 20 }
    ]
    styleTitle(wsCust, 'PHÂN TÍCH KHÁCH HÀNG')

    const custHeader = wsCust.addRow(['Chỉ số', 'Giá trị'])
    styleHeaderRow(custHeader)

    wsCust.addRow(['Tổng khách hàng', data.users?.customers || 0])
    wsCust.addRow(['Khách hàng mới', data.users?.newUsers || 0])
    wsCust.addRow(['Khách quay lại', data.users?.returningUsers || 0])
    wsCust.addRow(['Đã xác thực', data.users?.verified || 0])
    wsCust.addRow(['Dược sĩ', data.users?.pharmacists || 0])
    wsCust.addRow(['Admin', data.users?.admins || 0])
    applyBorders(wsCust, 11, 2)

    // Save to buffer
    const uint8Array = await wb.xlsx.writeBuffer()
    return Buffer.from(uint8Array)
  }

  /**
   * Export analytics data to PDF Buffer
   */
  async exportToPDF(data: any, timeRange: string, startDate?: string, endDate?: string): Promise<Buffer> {
    const doc = new jsPDF('p', 'mm', 'a4')
    const labelVi = getTimeRangeLabelVi(timeRange, startDate, endDate)
    const pageWidth = doc.internal.pageSize.getWidth()
    let y = 15

    // ========== Load Vietnamese-capable font ==========
    try {
      const fontPath = path.join(__dirname, '..', 'assets', 'fonts', 'Roboto-Regular.ttf')
      const fontBase64 = fs.readFileSync(fontPath).toString('base64')
      doc.addFileToVFS('Roboto-Regular.ttf', fontBase64)
      doc.addFont('Roboto-Regular.ttf', 'Roboto', 'normal')
      doc.setFont('Roboto')
    } catch (e) {
      console.warn('Không thể cài đặt font Roboto trên Server, sử dụng font mặc định:', e)
    }

    // Font style for autoTable
    const tableFont = doc.getFont()?.fontName === 'Roboto' ? 'Roboto' : undefined
    const autoTableStyles = tableFont ? { font: tableFont, fontStyle: 'normal' as const } : {}

    // ========== Header ==========
    doc.setFontSize(18)
    doc.setTextColor(0, 102, 204) // #0066CC
    doc.text('MEDISPACE - Báo cáo Phân tích', pageWidth / 2, y, { align: 'center' })
    y += 8

    doc.setFontSize(11)
    doc.setTextColor(100, 100, 100)
    doc.text(`Kỳ báo cáo: ${labelVi}`, pageWidth / 2, y, { align: 'center' })
    y += 5
    doc.text(`Ngày xuất: ${new Date().toLocaleDateString('vi-VN')}`, pageWidth / 2, y, { align: 'center' })
    y += 10

    // ========== KPI Summary ==========
    doc.setFontSize(13)
    doc.setTextColor(0, 102, 204)
    doc.text('1. Tổng quan KPI', 14, y)
    y += 3

    autoTable(doc, {
      startY: y,
      head: [['Chỉ số', 'Giá trị', 'Tăng trưởng']],
      body: [
        ['Doanh thu', fmtCurrency(data.revenue?.total || 0), `${(data.revenue?.growth || 0).toFixed(1)}%`],
        ['Đơn hàng', String(data.orders?.total || 0), `${(data.orders?.growth || 0).toFixed(1)}%`],
        ['Người dùng', String(data.users?.total || 0), `${(data.users?.growth || 0).toFixed(1)}%`],
        ['Sản phẩm', String(data.products?.total || 0), `${(data.products?.growth || 0).toFixed(1)}%`]
      ],
      theme: 'grid',
      headStyles: { fillColor: [0, 102, 204], textColor: 255, fontSize: 10, ...autoTableStyles },
      bodyStyles: { fontSize: 9, ...autoTableStyles },
      styles: { ...autoTableStyles },
      margin: { left: 14, right: 14 }
    })

    y = (doc as any).lastAutoTable.finalY + 8

    // ========== Key Metrics ==========
    doc.setFontSize(13)
    doc.setTextColor(0, 102, 204)
    doc.text('2. Chỉ số hiệu suất', 14, y)
    y += 3

    autoTable(doc, {
      startY: y,
      head: [['Chỉ số', 'Giá trị']],
      body: [
        ['Giá trị đơn trung bình', fmtCurrency(data.metrics?.avgOrderValue || 0)],
        ['Tỷ lệ chuyển đổi', `${(data.metrics?.conversionRate || 0).toFixed(1)}%`],
        ['Giữ chân khách hàng', `${(data.metrics?.customerRetention || 0).toFixed(1)}%`]
      ],
      theme: 'grid',
      headStyles: { fillColor: [54, 179, 126], textColor: 255, fontSize: 10, ...autoTableStyles },
      bodyStyles: { fontSize: 9, ...autoTableStyles },
      styles: { ...autoTableStyles },
      margin: { left: 14, right: 14 }
    })

    y = (doc as any).lastAutoTable.finalY + 8

    // ========== Order status ==========
    const sb = data.orders?.statusBreakdown || ({} as any)
    doc.setFontSize(13)
    doc.setTextColor(0, 102, 204)
    doc.text('3. Trạng thái đơn hàng', 14, y)
    y += 3

    autoTable(doc, {
      startY: y,
      head: [['Trạng thái', 'Số lượng']],
      body: [
        ['Chờ xử lý', String(sb.pending || 0)],
        ['Đang xử lý', String(sb.processing || 0)],
        ['Đang giao', String(sb.shipped || 0)],
        ['Hoàn thành', String(sb.delivered || 0)],
        ['Đã hủy', String(sb.cancelled || 0)]
      ],
      theme: 'grid',
      headStyles: { fillColor: [255, 159, 67], textColor: 255, fontSize: 10, ...autoTableStyles },
      bodyStyles: { fontSize: 9, ...autoTableStyles },
      styles: { ...autoTableStyles },
      margin: { left: 14, right: 14 }
    })

    y = (doc as any).lastAutoTable.finalY + 8

    // ========== Doanh số theo danh mục ==========
    if (data.products?.salesByCategory && data.products.salesByCategory.length > 0) {
      if (y > 220) {
        doc.addPage()
        y = 15
      }
      doc.setFontSize(13)
      doc.setTextColor(0, 102, 204)
      doc.text('4. Doanh số theo danh mục', 14, y)
      y += 3

      autoTable(doc, {
        startY: y,
        head: [['Danh mục', 'Doanh thu', 'Tỷ lệ']],
        body: (data.products.salesByCategory || []).map((cat: any) => [
          cat.categoryName || cat.category || 'Khác',
          fmtCurrency(cat.amount || cat.totalRevenue || 0),
          `${(cat.value || cat.percentage || 0).toFixed(1)}%`
        ]),
        theme: 'grid',
        headStyles: { fillColor: [168, 85, 247], textColor: 255, fontSize: 10, ...autoTableStyles },
        bodyStyles: { fontSize: 9, ...autoTableStyles },
        styles: { ...autoTableStyles },
        margin: { left: 14, right: 14 }
      })

      y = (doc as any).lastAutoTable.finalY + 8
    }

    // ========== Top sản phẩm ==========
    if (data.products?.topProducts && data.products.topProducts.length > 0) {
      if (y > 200) {
        doc.addPage()
        y = 15
      }
      doc.setFontSize(13)
      doc.setTextColor(0, 102, 204)
      doc.text('5. Sản phẩm bán chạy', 14, y)
      y += 3

      autoTable(doc, {
        startY: y,
        head: [['#', 'Tên sản phẩm', 'Doanh thu', 'Đơn bán']],
        body: (data.products.topProducts || []).map((p: any, i: number) => [
          String(i + 1),
          p.name.length > 40 ? p.name.substring(0, 40) + '...' : p.name,
          fmtCurrency(p.revenue),
          String(p.sales)
        ]),
        theme: 'grid',
        headStyles: { fillColor: [6, 182, 212], textColor: 255, fontSize: 10, ...autoTableStyles },
        bodyStyles: { fontSize: 8, ...autoTableStyles },
        styles: { ...autoTableStyles },
        columnStyles: { 1: { cellWidth: 70 } },
        margin: { left: 14, right: 14 }
      })
    }

    // ========== Footer ==========
    const pageCount = doc.getNumberOfPages()
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i)
      doc.setFontSize(8)
      doc.setTextColor(150, 150, 150)
      doc.text(
        `MEDISPACE Analytics Report - Trang ${i}/${pageCount}`,
        pageWidth / 2,
        doc.internal.pageSize.getHeight() - 8,
        { align: 'center' }
      )
    }

    // Return as Buffer
    const arrayBuffer = doc.output('arraybuffer')
    return Buffer.from(arrayBuffer)
  }
}

export const adminExportService = new AdminExportService()
