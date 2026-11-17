// PDF de exportación, generado en el navegador a partir de la exportación JSON
// del backend (así los números son exactamente los mismos que en Excel/CSV).
import { exportApi, saveBlob, type ExportParams, type ExportSectionKey } from '@/lib/api'
import { BANK_NAMES, formatCurrency } from '@/lib/utils'

type Row = Record<string, unknown>

interface ExportJson {
  exported_at: string
  period: { kind: string; label: string; from: string | null; to: string | null }
  banks: Record<string, string> | 'all'
  data: Record<string, unknown>
}

const money = (v: unknown) => (typeof v === 'number' ? formatCurrency(v) : '')
const signed = (v: unknown) => (typeof v === 'number' ? (v > 0 ? '+' : '') + formatCurrency(v) : '')
const text = (v: unknown) => (v === null || v === undefined ? '' : String(v))
const pct = (v: unknown) => (typeof v === 'number' ? `${(v * 100).toFixed(1)} %` : '')

/** Columnas que caben en un A4 apaisado para cada sección. */
const LAYOUT: Record<string, { title: string; cols: [string, string, (v: unknown) => string][] }> = {
  monthly: {
    title: 'Resumen mensual',
    cols: [['label', 'Mes', text], ['income', 'Ingresos', money], ['expenses', 'Gastos', money],
      ['savings', 'Ahorro', signed], ['savings_rate', 'Tasa', pct], ['invested', 'Invertido', money],
      ['sold', 'Vendido', money], ['interest', 'Intereses', money], ['count', 'Movs.', text]],
  },
  banks: {
    title: 'Por banco',
    cols: [['bank', 'Banco', text], ['month', 'Mes', text], ['count', 'Movs.', text],
      ['inflow', 'Entradas', money], ['outflow', 'Salidas', money], ['net', 'Neto', signed],
      ['income', 'Ingresos', money], ['expenses', 'Gastos', money], ['invested', 'Invertido', money],
      ['first', 'Primero', text], ['last', 'Último', text]],
  },
  categories_by_month: {
    title: 'Por categoría',
    cols: [['month', 'Mes', text], ['kind', 'Tipo', text], ['category', 'Categoría', text],
      ['amount', 'Importe', money], ['count', 'Movs.', text]],
  },
  transactions: {
    title: 'Movimientos',
    cols: [['date', 'Fecha', text], ['name', 'Concepto', text], ['category', 'Categoría', text],
      ['bank', 'Banco', text], ['type', 'Tipo', text], ['amount', 'Importe', signed]],
  },
  portfolio: {
    title: 'Cartera',
    cols: [['name', 'Nombre', text], ['symbol', 'Símbolo / ISIN', text], ['bank', 'Banco', text],
      ['shares', 'Particip.', text], ['total_invested', 'Invertido', money],
      ['market_value', 'Valor', money], ['unrealized_pnl', 'Plusvalía', signed],
      ['unrealized_pnl_pct', '%', pct]],
  },
  budgets: {
    title: 'Presupuestos',
    cols: [['category', 'Categoría', text], ['amount', 'Importe', money], ['month', 'Mes', text],
      ['recurring', 'Recurrente', text]],
  },
  recurring: {
    title: 'Recurrentes',
    cols: [['name', 'Nombre', text], ['amount', 'Importe medio', money], ['period_days', 'Cada (días)', text],
      ['category', 'Categoría', text], ['next', 'Próximo', text], ['active', 'Activo', text]],
  },
  debts: {
    title: 'Deudas',
    cols: [['name', 'Nombre', text], ['direction', 'Dirección', text], ['total', 'Total', money],
      ['paid', 'Pagado', money], ['pending', 'Pendiente', money], ['due_date', 'Vence', text],
      ['settled', 'Saldada', text]],
  },
  goals: {
    title: 'Objetivos',
    cols: [['name', 'Nombre', text], ['type', 'Tipo', text], ['category', 'Categoría', text],
      ['target', 'Objetivo', money], ['current', 'Actual', money], ['deadline', 'Fecha límite', text],
      ['active', 'Activo', text]],
  },
  categories: {
    title: 'Categorías',
    cols: [['name', 'Nombre', text], ['type', 'Tipo', text], ['system', 'Del sistema', text]],
  },
  rules: {
    title: 'Reglas',
    cols: [['keyword', 'Palabra clave', text], ['field', 'Campo', text], ['category', 'Categoría', text],
      ['priority', 'Prioridad', text]],
  },
}

const ORDER: ExportSectionKey[] = [
  'monthly', 'banks', 'categories_by_month', 'transactions',
  'portfolio', 'budgets', 'recurring', 'debts', 'goals', 'categories', 'rules',
]

function slugName(json: string): string {
  return json.replace(/\.json$/i, '.pdf')
}

export async function downloadPdf(p: Omit<ExportParams, 'format'>): Promise<string> {
  // El JSON trae los movimientos ya separados si se pide; el PDF los pinta
  // como bloques con su propio encabezado.
  const { blob, filename } = await exportApi.fetch({ ...p, format: 'json' })
  const doc = JSON.parse(await blob.text()) as ExportJson

  const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ])
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const pageW = pdf.internal.pageSize.getWidth()

  pdf.setFontSize(16)
  pdf.text('FinanceMaster', 14, 16)
  pdf.setFontSize(11)
  pdf.text(doc.period.label, 14, 23)
  pdf.setFontSize(8)
  pdf.setTextColor(110)
  const banks = doc.banks === 'all' ? 'Todos los bancos' : Object.values(doc.banks).join(', ')
  pdf.text(`${banks} · Exportado el ${new Date(doc.exported_at).toLocaleString('es-ES')}`, 14, 28)
  pdf.setTextColor(0)

  let y = 34
  const block = (title: string, section: string, rows: Row[]) => {
    const layout = LAYOUT[section]
    if (!layout || rows.length === 0) return
    if (y > pdf.internal.pageSize.getHeight() - 30) { pdf.addPage(); y = 16 }
    pdf.setFontSize(11)
    pdf.text(title, 14, y)
    autoTable(pdf, {
      startY: y + 2,
      head: [layout.cols.map(c => c[1])],
      body: rows.map(r => layout.cols.map(([k, , fmt]) => fmt(r[k]))),
      styles: { fontSize: 7, cellPadding: 1.2 },
      headStyles: { fillColor: [40, 40, 60] },
      margin: { left: 14, right: 14 },
      tableWidth: pageW - 28,
      didParseCell: data => {
        // Las filas "Total" de Por banco en negrita
        if (section === 'banks' && data.section === 'body' && (rows[data.row.index]?.month === 'Total')) {
          data.cell.styles.fontStyle = 'bold'
        }
      },
    })
    y = ((pdf as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y) + 10
  }

  const monthLabel = (ym: string) => {
    const [yy, mm] = ym.split('-').map(Number)
    if (!yy || !mm) return ym
    const s = new Date(yy, mm - 1, 1).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })
    return s.charAt(0).toUpperCase() + s.slice(1)
  }

  for (const section of ORDER) {
    if (section === 'transactions') {
      const byBank = doc.data.transactions_by_bank as Record<string, Row[] | Record<string, Row[]>> | undefined
      const byMonth = doc.data.transactions_by_month as Record<string, Row[]> | undefined
      if (byBank) {
        for (const [bank, v] of Object.entries(byBank)) {
          const name = BANK_NAMES[bank] ?? bank
          if (Array.isArray(v)) block(`Movimientos · ${name}`, section, v)
          else for (const [ym, rows] of Object.entries(v)) block(`Movimientos · ${name} · ${monthLabel(ym)}`, section, rows)
        }
        continue
      }
      if (byMonth) {
        for (const [ym, rows] of Object.entries(byMonth)) block(`Movimientos · ${monthLabel(ym)}`, section, rows)
        continue
      }
    }
    const rows = doc.data[section]
    if (Array.isArray(rows)) block(LAYOUT[section]?.title ?? section, section, rows as Row[])
  }

  const total = pdf.getNumberOfPages()
  for (let i = 1; i <= total; i++) {
    pdf.setPage(i)
    pdf.setFontSize(7)
    pdf.setTextColor(140)
    pdf.text(`${i} / ${total}`, pageW - 14, pdf.internal.pageSize.getHeight() - 6, { align: 'right' })
  }

  const name = slugName(filename)
  saveBlob(pdf.output('blob'), name)
  return name
}
