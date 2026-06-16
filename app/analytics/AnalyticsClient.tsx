'use client'

import { useState, useEffect, useMemo } from 'react'
import { supabaseBrowser } from '@/lib/supabase-browser'

// ── Types ──────────────────────────────────────────────────────

interface MLParams {
  machine_code: string
  slope: number
  intercept: number
  r_squared: number
  sample_count: number
  updated_at: string
}

interface CalibrationPoint {
  id: number
  machine_code: string
  raw_mm: number
  actual_mm: number
  recorded_at: string
}

interface MeasurementRecord {
  id: number
  machine_code: string
  session_so: string | null
  raw_mm: number
  corrected_mm: number | null
  target_mm: number | null
  recorded_at: string
}

interface JobSession {
  id: number
  so_number: string
  completed_pcs: number
  status: string
  started_at: string
  ended_at: string | null
}

// ── Linear Regression ──────────────────────────────────────────

function linearRegression(points: { x: number; y: number }[]) {
  const n = points.length
  if (n < 2) return { slope: 1, intercept: 0, r2: 0 }

  const sumX  = points.reduce((s, p) => s + p.x, 0)
  const sumY  = points.reduce((s, p) => s + p.y, 0)
  const sumXY = points.reduce((s, p) => s + p.x * p.y, 0)
  const sumXX = points.reduce((s, p) => s + p.x * p.x, 0)

  const denom = n * sumXX - sumX * sumX
  if (denom === 0) return { slope: 1, intercept: 0, r2: 0 }

  const slope     = (n * sumXY - sumX * sumY) / denom
  const intercept = (sumY - slope * sumX) / n

  const yMean = sumY / n
  const ssTot = points.reduce((s, p) => s + (p.y - yMean) ** 2, 0)
  const ssRes = points.reduce((s, p) => s + (p.y - (slope * p.x + intercept)) ** 2, 0)
  const r2    = ssTot === 0 ? 1 : 1 - ssRes / ssTot

  return { slope, intercept, r2 }
}

// ── CSV Export ────────────────────────────────────────────────

function downloadCSV(rows: Record<string, unknown>[], filename: string) {
  if (!rows.length) return
  const headers = Object.keys(rows[0])
  const lines   = [
    headers.join(','),
    ...rows.map(r =>
      headers.map(h => {
        const val = r[h] ?? ''
        return typeof val === 'string' && val.includes(',') ? `"${val}"` : String(val)
      }).join(',')
    ),
  ]
  const blob = new Blob([lines.join('\n')], { type: 'text/csv' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

// ── Section wrapper ───────────────────────────────────────────

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
      <div className="px-5 py-3.5 border-b border-gray-50">
        <p className="text-sm font-medium text-gray-800">{title}</p>
        {subtitle && <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>}
      </div>
      <div className="p-5">{children}</div>
    </div>
  )
}

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-gray-50 rounded-lg p-3.5">
      <p className="text-[10.5px] text-gray-400 uppercase tracking-wide mb-1">{label}</p>
      <p className="text-lg font-semibold text-gray-800 tabular-nums leading-tight">{value}</p>
      {sub && <p className="text-[10.5px] text-gray-400 mt-0.5">{sub}</p>}
    </div>
  )
}

function Badge({ label, color }: { label: string; color: 'green' | 'blue' | 'orange' | 'gray' }) {
  const map = {
    green:  'bg-[#eaf3de] text-[#27500a]',
    blue:   'bg-[#e6f1fb] text-[#0c447c]',
    orange: 'bg-[#faeeda] text-[#633806]',
    gray:   'bg-[#f1efe8] text-[#444441]',
  }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${map[color]}`}>
      {label}
    </span>
  )
}

// ── Main Component ────────────────────────────────────────────

export default function AnalyticsClient() {
  const [mlParams,    setMlParams]    = useState<MLParams | null>(null)
  const [calibPoints, setCalibPoints] = useState<CalibrationPoint[]>([])
  const [measurements, setMeasurements] = useState<MeasurementRecord[]>([])
  const [sessions,    setSessions]    = useState<JobSession[]>([])

  const [rawInput,     setRawInput]     = useState('')
  const [actualInput,  setActualInput]  = useState('')
  const [machineInput, setMachineInput] = useState('MC-01')

  const [loading,      setLoading]      = useState(true)
  const [trainLoading, setTrainLoading] = useState(false)
  const [addLoading,   setAddLoading]   = useState(false)
  const [msg,          setMsg]          = useState<{ text: string; ok: boolean } | null>(null)

  // ── Fetch all data ─────────────────────────────────────────
  async function fetchAll() {
    setLoading(true)
    const [mlRes, calibRes, measRes, sessRes] = await Promise.all([
      supabaseBrowser.from('ml_model_params').select('*').order('updated_at', { ascending: false }).limit(10),
      supabaseBrowser.from('calibration_data').select('*').order('recorded_at', { ascending: false }).limit(50),
      supabaseBrowser.from('measurement_records').select('*').order('recorded_at', { ascending: false }).limit(500),
      supabaseBrowser.from('job_sessions').select('*').order('started_at', { ascending: false }).limit(30),
    ])

    if (mlRes.data?.length)   setMlParams(mlRes.data[0] as MLParams)
    if (calibRes.data)        setCalibPoints(calibRes.data as CalibrationPoint[])
    if (measRes.data)         setMeasurements(measRes.data as MeasurementRecord[])
    if (sessRes.data)         setSessions(sessRes.data as JobSession[])
    setLoading(false)
  }

  useEffect(() => { fetchAll() }, [])

  // ── Add calibration point ──────────────────────────────────
  async function addCalibration() {
    const raw    = parseFloat(rawInput)
    const actual = parseFloat(actualInput)
    if (isNaN(raw) || isNaN(actual)) return flash('Enter valid numbers', false)

    setAddLoading(true)
    const { error } = await supabaseBrowser.from('calibration_data').insert({
      machine_code: machineInput,
      raw_mm:       raw,
      actual_mm:    actual,
    })
    setAddLoading(false)

    if (error) return flash(error.message, false)
    setRawInput('')
    setActualInput('')
    flash(`Calibration point added (${raw} → ${actual} mm)`, true)
    fetchAll()
  }

  // ── Train model ────────────────────────────────────────────
  async function trainModel() {
    const machinePoints = calibPoints.filter(p => p.machine_code === machineInput)
    if (machinePoints.length < 2) return flash('Need at least 2 calibration points to train', false)

    setTrainLoading(true)
    const points = machinePoints.map(p => ({ x: p.raw_mm, y: p.actual_mm }))
    const { slope, intercept, r2 } = linearRegression(points)

    const { error } = await supabaseBrowser.from('ml_model_params').upsert(
      {
        machine_code:  machineInput,
        slope,
        intercept,
        r_squared:     r2,
        sample_count:  points.length,
        updated_at:    new Date().toISOString(),
      },
      { onConflict: 'machine_code' }
    )
    setTrainLoading(false)

    if (error) return flash(error.message, false)
    flash(`Model trained: slope=${slope.toFixed(4)}, intercept=${intercept.toFixed(4)}, R²=${r2.toFixed(4)}`, true)
    fetchAll()
  }

  function flash(text: string, ok: boolean) {
    setMsg({ text, ok })
    setTimeout(() => setMsg(null), 4000)
  }

  // ── Session statistics (derived) ───────────────────────────
  const sessionStats = useMemo(() => {
    return sessions.map(session => {
      const records = measurements.filter(
        r => r.session_so === session.so_number && r.target_mm !== null && r.corrected_mm !== null
      )

      if (!records.length) {
        return { ...session, avgError: null, stdDev: null, minError: null, maxError: null, accuracy: null, count: 0 }
      }

      const errors  = records.map(r => Math.abs((r.corrected_mm ?? r.raw_mm) - r.target_mm!))
      const avg     = errors.reduce((s, e) => s + e, 0) / errors.length
      const variance= errors.reduce((s, e) => s + (e - avg) ** 2, 0) / errors.length
      const within2 = errors.filter(e => e <= 2).length / errors.length * 100

      return {
        ...session,
        avgError: avg,
        stdDev:   Math.sqrt(variance),
        minError: Math.min(...errors),
        maxError: Math.max(...errors),
        accuracy: within2,
        count:    records.length,
      }
    })
  }, [sessions, measurements])

  // ── Comparison rows (latest record per session) ────────────
  const comparisonRows = useMemo(() => {
    const grouped: Record<string, MeasurementRecord[]> = {}
    for (const r of measurements) {
      const key = r.session_so ?? 'no-session'
      if (!grouped[key]) grouped[key] = []
      grouped[key].push(r)
    }

    return Object.entries(grouped)
      .filter(([key]) => key !== 'no-session')
      .map(([so, records]) => {
        const latest = records[0]
        const target = latest.target_mm
        const corr   = latest.corrected_mm ?? latest.raw_mm
        const errMm  = target !== null ? corr - target : null
        const errPct = target !== null && target > 0 ? (errMm! / target) * 100 : null
        return {
          so_number:    so,
          machine_code: latest.machine_code,
          raw_mm:       latest.raw_mm,
          corrected_mm: corr,
          target_mm:    target,
          error_mm:     errMm,
          error_pct:    errPct,
          readings:     records.length,
          last_updated: latest.recorded_at,
        }
      })
  }, [measurements])

  // ── Export handlers ────────────────────────────────────────
  function exportSessions() {
    const rows = sessionStats.map(s => ({
      so_number:    s.so_number,
      status:       s.status,
      completed_pcs: s.completed_pcs,
      started_at:   s.started_at,
      ended_at:     s.ended_at ?? '',
      avg_error_mm: s.avgError?.toFixed(3) ?? '',
      std_dev_mm:   s.stdDev?.toFixed(3) ?? '',
      min_error_mm: s.minError?.toFixed(3) ?? '',
      max_error_mm: s.maxError?.toFixed(3) ?? '',
      accuracy_pct: s.accuracy?.toFixed(1) ?? '',
      reading_count: s.count,
    }))
    downloadCSV(rows, `sessions_${new Date().toISOString().slice(0, 10)}.csv`)
  }

  function exportMeasurements() {
    const rows = measurements.map(r => ({
      id:           r.id,
      machine_code: r.machine_code,
      session_so:   r.session_so ?? '',
      raw_mm:       r.raw_mm,
      corrected_mm: r.corrected_mm ?? '',
      target_mm:    r.target_mm ?? '',
      error_mm:     r.corrected_mm !== null && r.target_mm !== null
        ? (r.corrected_mm - r.target_mm).toFixed(3)
        : '',
      recorded_at:  r.recorded_at,
    }))
    downloadCSV(rows, `measurements_${new Date().toISOString().slice(0, 10)}.csv`)
  }

  function exportCalibration() {
    downloadCSV(
      calibPoints.map(p => ({ id: p.id, machine_code: p.machine_code, raw_mm: p.raw_mm, actual_mm: p.actual_mm, recorded_at: p.recorded_at })),
      `calibration_${new Date().toISOString().slice(0, 10)}.csv`
    )
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f5f7fa] flex items-center justify-center">
        <p className="text-sm text-gray-400">Loading analytics...</p>
      </div>
    )
  }

  const machineCalib = calibPoints.filter(p => p.machine_code === machineInput)

  return (
    <div className="min-h-screen bg-[#f5f7fa] p-6 space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-[#1a56db] flex items-center justify-center text-white text-sm font-medium">
            AN
          </div>
          <div>
            <p className="text-sm font-medium text-gray-800 leading-tight">Analytics</p>
            <p className="text-xs text-gray-400 leading-tight">ML correction · measurement comparison · statistics · export</p>
          </div>
        </div>
        <button
          onClick={fetchAll}
          className="px-3 py-1.5 text-xs font-medium rounded-md text-gray-500 bg-white border border-gray-200 hover:bg-gray-50 transition-colors"
        >
          Refresh
        </button>
      </div>

      {/* Flash message */}
      {msg && (
        <div className={`px-4 py-2.5 rounded-lg text-xs font-medium ${msg.ok ? 'bg-[#eaf3de] text-[#27500a]' : 'bg-[#fce8e8] text-[#7c1a1a]'}`}>
          {msg.text}
        </div>
      )}

      {/* ── 1. ML Model ──────────────────────────────────────── */}
      <Section title="ML Error Correction Model" subtitle="Linear regression to compensate measurement deviations">
        <div className="space-y-5">

          {/* Current model status */}
          {mlParams ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatCard label="Slope"        value={mlParams.slope.toFixed(5)}       sub="y = slope·x + intercept" />
              <StatCard label="Intercept"    value={mlParams.intercept.toFixed(3)}   sub="mm offset" />
              <StatCard label="R² Score"     value={mlParams.r_squared.toFixed(4)}   sub={mlParams.r_squared >= 0.99 ? '✓ Excellent' : mlParams.r_squared >= 0.95 ? '~ Good' : '✗ Retrain needed'} />
              <StatCard label="Trained on"   value={`${mlParams.sample_count} pts`}  sub={`Updated ${new Date(mlParams.updated_at).toLocaleDateString()}`} />
            </div>
          ) : (
            <div className="bg-[#faeeda] text-[#633806] rounded-lg px-4 py-3 text-xs">
              No model trained yet. Add calibration points below and click Train.
            </div>
          )}

          {/* Calibration input */}
          <div className="border-t border-gray-50 pt-5">
            <p className="text-xs font-medium text-gray-600 mb-3">Add Calibration Point</p>
            <div className="flex flex-wrap gap-2 items-end">
              <div>
                <p className="text-[10px] text-gray-400 mb-1">Machine</p>
                <input
                  value={machineInput}
                  onChange={e => setMachineInput(e.target.value)}
                  className="h-8 w-24 text-xs px-2 border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-[#1a56db]"
                />
              </div>
              <div>
                <p className="text-[10px] text-gray-400 mb-1">PLC Raw (mm)</p>
                <input
                  type="number"
                  value={rawInput}
                  onChange={e => setRawInput(e.target.value)}
                  placeholder="e.g. 3052"
                  className="h-8 w-28 text-xs px-2 border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-[#1a56db]"
                />
              </div>
              <div>
                <p className="text-[10px] text-gray-400 mb-1">Actual / Verified (mm)</p>
                <input
                  type="number"
                  value={actualInput}
                  onChange={e => setActualInput(e.target.value)}
                  placeholder="e.g. 3000"
                  className="h-8 w-28 text-xs px-2 border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-[#1a56db]"
                />
              </div>
              <button
                onClick={addCalibration}
                disabled={addLoading}
                className="h-8 px-3 text-xs font-medium bg-white border border-gray-200 rounded-md hover:bg-gray-50 disabled:opacity-50 transition-colors"
              >
                {addLoading ? 'Adding…' : 'Add Point'}
              </button>
              <button
                onClick={trainModel}
                disabled={trainLoading || machineCalib.length < 2}
                className="h-8 px-3 text-xs font-medium bg-[#1a56db] text-white rounded-md hover:bg-[#1648c0] disabled:opacity-50 transition-colors"
              >
                {trainLoading ? 'Training…' : `Train Model (${machineCalib.length} pts)`}
              </button>
            </div>
          </div>

          {/* Calibration history table */}
          {machineCalib.length > 0 && (
            <div className="border-t border-gray-50 pt-4">
              <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-2">Calibration history — {machineInput}</p>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-[10px] text-gray-400 uppercase tracking-wide border-b border-gray-50">
                      <th className="text-left py-1.5 pr-4 font-medium">Raw (mm)</th>
                      <th className="text-left py-1.5 pr-4 font-medium">Actual (mm)</th>
                      <th className="text-left py-1.5 pr-4 font-medium">Deviation (mm)</th>
                      <th className="text-left py-1.5 font-medium">Recorded</th>
                    </tr>
                  </thead>
                  <tbody>
                    {machineCalib.slice(0, 10).map(p => (
                      <tr key={p.id} className="border-b border-gray-50 last:border-0">
                        <td className="py-1.5 pr-4 tabular-nums text-gray-700">{p.raw_mm}</td>
                        <td className="py-1.5 pr-4 tabular-nums text-gray-700">{p.actual_mm}</td>
                        <td className={`py-1.5 pr-4 tabular-nums font-medium ${Math.abs(p.actual_mm - p.raw_mm) > 5 ? 'text-red-500' : 'text-green-600'}`}>
                          {(p.actual_mm - p.raw_mm).toFixed(1)}
                        </td>
                        <td className="py-1.5 text-gray-400">{new Date(p.recorded_at).toLocaleString('en-GB')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </Section>

      {/* ── 2. Measurement Comparison ─────────────────────────── */}
      <Section
        title="Measurement Comparison"
        subtitle="Raw PLC reading vs ML-corrected value vs target — per session"
      >
        {comparisonRows.length === 0 ? (
          <p className="text-xs text-gray-400">No measurement records yet. Start a job session to record data.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[10px] text-gray-400 uppercase tracking-wide border-b border-gray-100">
                  {['SO Number', 'Machine', 'Raw (mm)', 'Corrected (mm)', 'Target (mm)', 'Error (mm)', 'Error (%)', 'Readings', 'Last Updated'].map(h => (
                    <th key={h} className="text-left py-2 pr-4 font-medium whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {comparisonRows.map(row => {
                  const absErr = row.error_mm !== null ? Math.abs(row.error_mm) : null
                  const errColor = absErr === null ? '' : absErr <= 2 ? 'text-green-600' : absErr <= 5 ? 'text-orange-500' : 'text-red-500'
                  return (
                    <tr key={row.so_number} className="border-b border-gray-50 last:border-0 hover:bg-gray-50 transition-colors">
                      <td className="py-2 pr-4 font-medium text-gray-700">{row.so_number}</td>
                      <td className="py-2 pr-4 text-gray-500">{row.machine_code}</td>
                      <td className="py-2 pr-4 tabular-nums text-gray-600">{row.raw_mm.toLocaleString()}</td>
                      <td className="py-2 pr-4 tabular-nums font-medium text-[#1a56db]">{row.corrected_mm.toLocaleString()}</td>
                      <td className="py-2 pr-4 tabular-nums text-gray-600">{row.target_mm?.toLocaleString() ?? '—'}</td>
                      <td className={`py-2 pr-4 tabular-nums font-medium ${errColor}`}>
                        {row.error_mm !== null ? (row.error_mm > 0 ? '+' : '') + row.error_mm.toFixed(1) : '—'}
                      </td>
                      <td className={`py-2 pr-4 tabular-nums font-medium ${errColor}`}>
                        {row.error_pct !== null ? (row.error_pct > 0 ? '+' : '') + row.error_pct.toFixed(2) + '%' : '—'}
                      </td>
                      <td className="py-2 pr-4 tabular-nums text-gray-500">{row.readings}</td>
                      <td className="py-2 text-gray-400 whitespace-nowrap">
                        {new Date(row.last_updated).toLocaleString('en-GB')}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* ── 3. Statistical Review ────────────────────────────── */}
      <Section
        title="Statistical Review"
        subtitle="Per-session accuracy stats computed from measurement records"
      >
        {sessionStats.length === 0 ? (
          <p className="text-xs text-gray-400">No job sessions found.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[10px] text-gray-400 uppercase tracking-wide border-b border-gray-100">
                  {['SO Number', 'Status', 'PCS Done', 'Avg Error (mm)', 'Std Dev (mm)', 'Min Error', 'Max Error', 'Accuracy ±2mm', 'Readings', 'Duration'].map(h => (
                    <th key={h} className="text-left py-2 pr-4 font-medium whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sessionStats.map(s => {
                  const duration = s.ended_at
                    ? Math.round((new Date(s.ended_at).getTime() - new Date(s.started_at).getTime()) / 60000)
                    : null
                  const accColor = s.accuracy === null ? '' : s.accuracy >= 95 ? 'text-green-600' : s.accuracy >= 80 ? 'text-orange-500' : 'text-red-500'
                  const statusColor: 'green' | 'blue' | 'orange' | 'gray' =
                    s.status === 'done' ? 'green' : s.status === 'in_progress' ? 'blue' : 'gray'
                  return (
                    <tr key={s.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50 transition-colors">
                      <td className="py-2 pr-4 font-medium text-gray-700">{s.so_number}</td>
                      <td className="py-2 pr-4"><Badge label={s.status} color={statusColor} /></td>
                      <td className="py-2 pr-4 tabular-nums text-gray-600">{s.completed_pcs}</td>
                      <td className={`py-2 pr-4 tabular-nums font-medium ${s.avgError !== null && s.avgError <= 2 ? 'text-green-600' : 'text-orange-500'}`}>
                        {s.avgError?.toFixed(2) ?? '—'}
                      </td>
                      <td className="py-2 pr-4 tabular-nums text-gray-600">{s.stdDev?.toFixed(2) ?? '—'}</td>
                      <td className="py-2 pr-4 tabular-nums text-gray-600">{s.minError?.toFixed(2) ?? '—'}</td>
                      <td className="py-2 pr-4 tabular-nums text-gray-600">{s.maxError?.toFixed(2) ?? '—'}</td>
                      <td className={`py-2 pr-4 tabular-nums font-semibold ${accColor}`}>
                        {s.accuracy !== null ? s.accuracy.toFixed(1) + '%' : '—'}
                      </td>
                      <td className="py-2 pr-4 tabular-nums text-gray-500">{s.count || '—'}</td>
                      <td className="py-2 text-gray-400 whitespace-nowrap">
                        {duration !== null ? `${duration} min` : 'Active'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Summary stats */}
        {sessionStats.some(s => s.avgError !== null) && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5 pt-5 border-t border-gray-50">
            {(() => {
              const withData = sessionStats.filter(s => s.avgError !== null)
              const overallAvg = withData.reduce((s, r) => s + r.avgError!, 0) / withData.length
              const overallAcc = withData.reduce((s, r) => s + r.accuracy!, 0) / withData.length
              const best  = withData.reduce((a, b) => (a.avgError! < b.avgError! ? a : b))
              const worst = withData.reduce((a, b) => (a.avgError! > b.avgError! ? a : b))
              return (
                <>
                  <StatCard label="Overall Avg Error" value={`${overallAvg.toFixed(2)} mm`} sub={`across ${withData.length} sessions`} />
                  <StatCard label="Overall Accuracy"  value={`${overallAcc.toFixed(1)}%`}   sub="within ±2 mm" />
                  <StatCard label="Best Session"      value={`${best.avgError!.toFixed(2)} mm`} sub={best.so_number} />
                  <StatCard label="Worst Session"     value={`${worst.avgError!.toFixed(2)} mm`} sub={worst.so_number} />
                </>
              )
            })()}
          </div>
        )}
      </Section>

      {/* ── 4. Data Export ────────────────────────────────────── */}
      <Section title="Data Export" subtitle="Download records as CSV for offline reporting">
        <div className="flex flex-wrap gap-3">
          {[
            { label: 'Export Job Sessions',      sub: `${sessionStats.length} sessions with stats`,  onClick: exportSessions,     count: sessionStats.length },
            { label: 'Export Measurement Records', sub: `${measurements.length} raw + corrected readings`, onClick: exportMeasurements, count: measurements.length },
            { label: 'Export Calibration Data',  sub: `${calibPoints.length} calibration points`,   onClick: exportCalibration,  count: calibPoints.length },
          ].map(btn => (
            <button
              key={btn.label}
              onClick={btn.onClick}
              disabled={btn.count === 0}
              className="flex flex-col items-start gap-1 px-4 py-3 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-left"
            >
              <span className="text-xs font-medium text-gray-700">{btn.label}</span>
              <span className="text-[10px] text-gray-400">{btn.sub}</span>
              <span className="text-[10px] text-[#1a56db] font-medium mt-0.5">↓ Download CSV</span>
            </button>
          ))}
        </div>
      </Section>

    </div>
  )
}
