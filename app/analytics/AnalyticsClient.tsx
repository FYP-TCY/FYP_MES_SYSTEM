'use client'

import { useState, useEffect, useMemo } from 'react'
import { supabaseBrowser } from '@/lib/supabase-browser'

// ── Types ──────────────────────────────────────────────────────

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

// ── CSV Export ────────────────────────────────────────────────

function downloadCSV(rows: Record<string, unknown>[], filename: string) {
  if (!rows.length) return
  const headers = Object.keys(rows[0])
  const lines = [
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

// ── UI helpers ─────────────────────────────────────────────────

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

function StatCard({ label, value, sub, highlight }: { label: string; value: string | number; sub?: string; highlight?: 'green' | 'orange' | 'red' }) {
  const colorMap = {
    green:  'bg-[#eaf3de] text-[#27500a]',
    orange: 'bg-[#faeeda] text-[#633806]',
    red:    'bg-[#fce8e8] text-[#7c1a1a]',
  }
  return (
    <div className={`rounded-lg p-3.5 ${highlight ? colorMap[highlight] : 'bg-gray-50'}`}>
      <p className={`text-[10.5px] uppercase tracking-wide mb-1 ${highlight ? 'opacity-70' : 'text-gray-400'}`}>{label}</p>
      <p className={`text-lg font-semibold tabular-nums leading-tight ${highlight ? '' : 'text-gray-800'}`}>{value}</p>
      {sub && <p className={`text-[10.5px] mt-0.5 ${highlight ? 'opacity-60' : 'text-gray-400'}`}>{sub}</p>}
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────

export default function AnalyticsClient() {
  const [measurements, setMeasurements] = useState<MeasurementRecord[]>([])
  const [sessions,     setSessions]     = useState<JobSession[]>([])
  const [loading,      setLoading]      = useState(true)

  async function fetchAll() {
    setLoading(true)
    const [measRes, sessRes] = await Promise.all([
      supabaseBrowser
        .from('measurement_records')
        .select('*')
        .order('recorded_at', { ascending: false })
        .limit(500),
      supabaseBrowser
        .from('job_sessions')
        .select('*')
        .order('started_at', { ascending: false })
        .limit(30),
    ])
    if (measRes.data) setMeasurements(measRes.data as MeasurementRecord[])
    if (sessRes.data) setSessions(sessRes.data as JobSession[])
    setLoading(false)
  }

  useEffect(() => { fetchAll() }, [])

  // ── Per-session stats ──────────────────────────────────────
  const sessionStats = useMemo(() => {
    return sessions.map(session => {
      const records = measurements.filter(
        r => r.session_so === session.so_number && r.target_mm !== null
      )
      if (!records.length) {
        return { ...session, avgError: null, stdDev: null, minError: null, maxError: null, accuracy: null, count: 0 }
      }

      const errors   = records.map(r => Math.abs((r.corrected_mm ?? r.raw_mm) - r.target_mm!))
      const avg      = errors.reduce((s, e) => s + e, 0) / errors.length
      const variance = errors.reduce((s, e) => s + (e - avg) ** 2, 0) / errors.length
      const within2  = errors.filter(e => e <= 2).length / errors.length * 100

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

  // ── Orders available for the per-order breakdown picker ────
  const orderOptions = useMemo(() => {
    const seen = new Set<string>()
    const options: string[] = []
    for (const r of measurements) {
      if (r.session_so && !seen.has(r.session_so)) {
        seen.add(r.session_so)
        options.push(r.session_so)
      }
    }
    return options
  }, [measurements])

  const [selectedSo, setSelectedSo] = useState<string | null>(null)

  useEffect(() => {
    if (!selectedSo && orderOptions.length > 0) setSelectedSo(orderOptions[0])
  }, [orderOptions, selectedSo])

  // ── Per-piece breakdown for the selected order ──────────────
  const orderBreakdown = useMemo(() => {
    if (!selectedSo) return null
    const records = measurements
      .filter(r => r.session_so === selectedSo)
      .slice()
      .sort((a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime())

    const pieces = records.map((r, i) => {
      const corr  = r.corrected_mm ?? r.raw_mm
      const errMm = r.target_mm !== null ? corr - r.target_mm : null
      const absErr = errMm !== null ? Math.abs(errMm) : null
      return {
        index:    i + 1,
        corrected_mm: corr,
        target_mm:    r.target_mm,
        error_mm:     errMm,
        absError:     absErr,
        accurate:     absErr !== null && absErr <= 2,
        recorded_at:  r.recorded_at,
      }
    })

    const withTarget = pieces.filter(p => p.absError !== null)
    const accurateCount = withTarget.filter(p => p.accurate).length
    const outCount       = withTarget.length - accurateCount
    const maxAbsError    = withTarget.length ? Math.max(...withTarget.map(p => p.absError!)) : 1

    return {
      pieces,
      total:         withTarget.length,
      accurateCount,
      outCount,
      accuracyPct:   withTarget.length ? (accurateCount / withTarget.length) * 100 : null,
      maxAbsError:   maxAbsError || 1,
    }
  }, [measurements, selectedSo])

  // ── Overall summary ────────────────────────────────────────
  const overall = useMemo(() => {
    const withData = sessionStats.filter(s => s.avgError !== null)
    if (!withData.length) return null
    return {
      avgError:    withData.reduce((s, r) => s + r.avgError!, 0) / withData.length,
      avgAccuracy: withData.reduce((s, r) => s + r.accuracy!, 0) / withData.length,
      best:        withData.reduce((a, b) => a.avgError! < b.avgError! ? a : b),
      worst:       withData.reduce((a, b) => a.avgError! > b.avgError! ? a : b),
      sessions:    withData.length,
    }
  }, [sessionStats])

  // ── Export ─────────────────────────────────────────────────
  function exportSessions() {
    downloadCSV(
      sessionStats.map(s => ({
        so_number:     s.so_number,
        status:        s.status,
        completed_pcs: s.completed_pcs,
        started_at:    s.started_at,
        ended_at:      s.ended_at ?? '',
        avg_error_mm:  s.avgError?.toFixed(3) ?? '',
        std_dev_mm:    s.stdDev?.toFixed(3) ?? '',
        min_error_mm:  s.minError?.toFixed(3) ?? '',
        max_error_mm:  s.maxError?.toFixed(3) ?? '',
        accuracy_pct:  s.accuracy?.toFixed(1) ?? '',
        reading_count: s.count,
      })),
      `sessions_${new Date().toISOString().slice(0, 10)}.csv`
    )
  }

  function exportMeasurements() {
    downloadCSV(
      measurements.map(r => ({
        id:           r.id,
        machine_code: r.machine_code,
        session_so:   r.session_so ?? '',
        raw_mm:       r.raw_mm,
        corrected_mm: r.corrected_mm ?? '',
        target_mm:    r.target_mm ?? '',
        error_mm:     r.corrected_mm !== null && r.target_mm !== null
          ? (r.corrected_mm - r.target_mm).toFixed(3) : '',
        recorded_at:  r.recorded_at,
      })),
      `measurements_${new Date().toISOString().slice(0, 10)}.csv`
    )
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f5f7fa] flex items-center justify-center">
        <p className="text-sm text-gray-400">Loading analytics...</p>
      </div>
    )
  }

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
            <p className="text-xs text-gray-400 leading-tight">Measurement accuracy · comparison · export</p>
          </div>
        </div>
        <button
          onClick={fetchAll}
          className="px-3 py-1.5 text-xs font-medium rounded-md text-gray-500 bg-white border border-gray-200 hover:bg-gray-50 transition-colors"
        >
          Refresh
        </button>
      </div>

      {/* ── Overall summary ──────────────────────────────────── */}
      {overall ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard
            label="Overall Avg Error"
            value={`${overall.avgError.toFixed(2)} mm`}
            sub={`across ${overall.sessions} sessions`}
            highlight={overall.avgError <= 2 ? 'green' : overall.avgError <= 5 ? 'orange' : 'red'}
          />
          <StatCard
            label="Overall Accuracy"
            value={`${overall.avgAccuracy.toFixed(1)}%`}
            sub="within ±2 mm"
            highlight={overall.avgAccuracy >= 95 ? 'green' : overall.avgAccuracy >= 80 ? 'orange' : 'red'}
          />
          <StatCard
            label="Best Session"
            value={`${overall.best.avgError!.toFixed(2)} mm`}
            sub={overall.best.so_number}
            highlight="green"
          />
          <StatCard
            label="Worst Session"
            value={`${overall.worst.avgError!.toFixed(2)} mm`}
            sub={overall.worst.so_number}
            highlight={overall.worst.avgError! <= 5 ? 'orange' : 'red'}
          />
        </div>
      ) : (
        <div className="bg-[#faeeda] text-[#633806] rounded-lg px-4 py-3 text-xs">
          No measurement data yet. Start a job session to begin recording.
        </div>
      )}

      {/* ── Order Accuracy Breakdown ─────────────────────────── */}
      <Section
        title="Order Accuracy Breakdown"
        subtitle="Pick an order to see how many pieces were cut accurately vs out of target"
      >
        {orderOptions.length === 0 ? (
          <p className="text-xs text-gray-400">No records yet.</p>
        ) : (
          <div className="space-y-4">
            <select
              value={selectedSo ?? ''}
              onChange={e => setSelectedSo(e.target.value)}
              className="text-xs border border-gray-200 rounded-lg px-3 py-2 text-gray-700 bg-white focus:outline-none focus:border-[#1a56db]"
            >
              {orderOptions.map(so => (
                <option key={so} value={so}>{so}</option>
              ))}
            </select>

            {orderBreakdown && orderBreakdown.total > 0 ? (
              <>
                {/* Summary cards */}
                <div className="grid grid-cols-3 gap-3">
                  <StatCard label="Pieces measured" value={orderBreakdown.total} />
                  <StatCard
                    label="Accurate (±2mm)"
                    value={orderBreakdown.accurateCount}
                    sub={`${orderBreakdown.accuracyPct?.toFixed(1)}%`}
                    highlight="green"
                  />
                  <StatCard
                    label="Out of target"
                    value={orderBreakdown.outCount}
                    sub={orderBreakdown.outCount > 0 ? 'beyond ±2mm' : 'none'}
                    highlight={orderBreakdown.outCount > 0 ? 'red' : 'green'}
                  />
                </div>

                {/* Stacked proportion bar */}
                <div>
                  <div className="flex w-full h-3 rounded-full overflow-hidden bg-gray-100">
                    <div
                      className="bg-[#639922]"
                      style={{ width: `${(orderBreakdown.accurateCount / orderBreakdown.total) * 100}%` }}
                    />
                    <div
                      className="bg-[#d6453d]"
                      style={{ width: `${(orderBreakdown.outCount / orderBreakdown.total) * 100}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-[10.5px] text-gray-400 mt-1.5">
                    <span>● Accurate ({orderBreakdown.accurateCount})</span>
                    <span>● Out of target ({orderBreakdown.outCount})</span>
                  </div>
                </div>

                {/* Per-piece error bar chart */}
                <div>
                  <p className="text-[10.5px] font-medium text-gray-400 uppercase tracking-wide mb-2">
                    Per-piece error (mm) — in cutting order
                  </p>
                  <div className="flex items-end gap-[2px] h-28 overflow-x-auto pb-1">
                    {orderBreakdown.pieces.map(p => {
                      const heightPct = p.absError !== null
                        ? Math.max(4, (p.absError / orderBreakdown.maxAbsError) * 100)
                        : 4
                      const color = p.absError === null ? 'bg-gray-200'
                        : p.absError <= 2 ? 'bg-[#639922]'
                        : p.absError <= 5 ? 'bg-[#e0a527]'
                        : 'bg-[#d6453d]'
                      return (
                        <div
                          key={p.index}
                          title={`Piece #${p.index}: ${p.error_mm !== null ? (p.error_mm > 0 ? '+' : '') + p.error_mm.toFixed(1) + ' mm' : 'no target'}`}
                          className={`flex-shrink-0 w-2 rounded-sm ${color}`}
                          style={{ height: `${heightPct}%` }}
                        />
                      )
                    })}
                  </div>
                  <p className="text-[10px] text-gray-300 mt-1">Hover a bar to see the exact piece error</p>
                </div>
              </>
            ) : (
              <p className="text-xs text-gray-400">No target-comparable readings for this order yet.</p>
            )}
          </div>
        )}
      </Section>

      {/* ── Statistical Review ───────────────────────────────── */}
      <Section
        title="Statistical Review"
        subtitle="Per-session accuracy computed from all measurement records"
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
                  const accColor = s.accuracy === null ? 'text-gray-400'
                    : s.accuracy >= 95 ? 'text-green-600'
                    : s.accuracy >= 80 ? 'text-orange-500'
                    : 'text-red-500'
                  const avgColor = s.avgError === null ? 'text-gray-400'
                    : s.avgError <= 2 ? 'text-green-600'
                    : s.avgError <= 5 ? 'text-orange-500'
                    : 'text-red-500'
                  const statusMap: Record<string, string> = {
                    done:        'bg-[#eaf3de] text-[#27500a]',
                    in_progress: 'bg-[#e6f1fb] text-[#0c447c]',
                  }
                  return (
                    <tr key={s.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50 transition-colors">
                      <td className="py-2 pr-4 font-medium text-gray-700">{s.so_number}</td>
                      <td className="py-2 pr-4">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${statusMap[s.status] ?? 'bg-[#f1efe8] text-[#444441]'}`}>
                          {s.status}
                        </span>
                      </td>
                      <td className="py-2 pr-4 tabular-nums text-gray-600">{s.completed_pcs}</td>
                      <td className={`py-2 pr-4 tabular-nums font-semibold ${avgColor}`}>
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
      </Section>

      {/* ── Data Export ──────────────────────────────────────── */}
      <Section title="Data Export" subtitle="Download records as CSV for offline reporting">
        <div className="flex flex-wrap gap-3">
          {[
            {
              label:   'Export Job Sessions',
              sub:     `${sessionStats.length} sessions with accuracy stats`,
              onClick: exportSessions,
              count:   sessionStats.length,
            },
            {
              label:   'Export Measurement Records',
              sub:     `${measurements.length} raw + corrected readings`,
              onClick: exportMeasurements,
              count:   measurements.length,
            },
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
