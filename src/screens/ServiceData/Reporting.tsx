import { useState } from 'react'
import { FileDown, Loader2 } from 'lucide-react'
import { useSunday } from '../../context/SundayContext'
import { fetchReportData } from '../../lib/reportData'
import { generateReportHtml } from '../../lib/generateReportHtml'

interface ReportingProps { sundayId: string }

export function Reporting({ sundayId }: ReportingProps) {
  const { sundayDate } = useSunday()
  const [exporting, setExporting] = useState(false)

  const exportPdf = async () => {
    setExporting(true)
    try {
      const data = await fetchReportData(sundayId, sundayDate)
      const html = generateReportHtml(data)
      const win = window.open('', '_blank')
      if (!win) {
        alert('Pop-up was blocked. Please allow pop-ups for this site and try again.')
        return
      }
      win.document.write(html)
      win.document.close()
      win.focus()
      setTimeout(() => win.print(), 600)
    } catch (err) {
      console.error('PDF export failed', err)
      alert('Failed to generate report. Please try again.')
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="space-y-4 fade-in max-w-4xl">
      <div
        className="rounded-xl p-5 flex items-center justify-between gap-4"
        style={{ background: 'linear-gradient(135deg, #1e3a5f 0%, #1e40af 100%)' }}
      >
        <div>
          <p className="text-white font-bold text-sm">Export Service Report</p>
          <p className="text-blue-200 text-xs mt-1 leading-relaxed">
            Download a formatted report with attendance, runtimes, issues, checklist exceptions, and evaluation notes.
          </p>
        </div>
        <button
          onClick={exportPdf}
          disabled={exporting}
          className="flex items-center gap-2 bg-white text-blue-700 font-bold text-xs px-4 py-2.5 rounded-lg
            shadow-md hover:bg-blue-50 active:scale-95 transition-all disabled:opacity-60 flex-shrink-0 whitespace-nowrap"
        >
          {exporting
            ? <><Loader2 className="w-4 h-4 animate-spin" /> Generating...</>
            : <><FileDown className="w-4 h-4" /> Export PDF</>
          }
        </button>
      </div>
    </div>
  )
}
