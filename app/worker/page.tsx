'use client'

import { useState, useEffect, useRef } from 'react'
import { supabaseBrowser } from '@/lib/supabase-browser'

interface Order {
  id: number
  so_number: string
  job_order_no: string
  item_code: string
  item_name: string
  length_m: number | null
  total_pcs: number | null
  total_kg: number | null
  machine_code: string
  customer_name: string
  delivery_date: string
  special_packing: string
  status: string
}

interface PlcReading {
  machine_code: string
  length_mm: number
  current_pcs: number
  session_so: string | null
  target_mm: number | null
  recorded_at: string
}

interface JobSession {
  id: number
  so_number: string
  completed_pcs: number
  status: string
  target_pcs: number | null
}

export default function WorkerPage() {
  const [soInput, setSoInput]       = useState('')
  const [order, setOrder]           = useState<Order | null>(null)
  const [scanning, setScanning]     = useState(false)
  const [notFound, setNotFound]     = useState(false)
  const [plc, setPlc]               = useState<PlcReading | null>(null)
  const [isComplete, setIsComplete] = useState(false)
  const [sessionId, setSessionId]   = useState<number | null>(null)
  const [resumedPcs, setResumedPcs] = useState(0)
  const [showEndConfirm, setShowEndConfirm] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  // ── Realtime PLC subscription ───────────────────────────
  useEffect(() => {
    const channel = supabaseBrowser
      .channel('worker-plc-v2')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'plc_readings' },
        (payload) => {
          const row = payload.new as PlcReading
          setPlc(row)

          // Check completion
          if (order?.total_pcs && row.current_pcs >= order.total_pcs) {
            setIsComplete(true)
          }
        }
      )
      .subscribe()

    // Initial fetch
    supabaseBrowser
      .from('plc_readings')
      .select('*')
      .order('recorded_at', { ascending: false })
      .limit(1)
      .then(({ data }) => { if (data?.[0]) setPlc(data[0]) })

    return () => { supabaseBrowser.removeChannel(channel) }
  }, [order])

  // ── Scan handler ────────────────────────────────────────
  async function handleScan(e: React.FormEvent) {
    e.preventDefault()
    const so = soInput.trim()
    if (!so) return

    setScanning(true)
    setNotFound(false)

    // 1. Fetch order
    const { data: orderData, error } = await supabaseBrowser
      .from('orders')
      .select('*')
      .eq('so_number', so)
      .limit(1)
      .single()

    if (error || !orderData) {
      setScanning(false)
      setNotFound(true)
      setSoInput('')
      inputRef.current?.focus()
      return
    }

    // 2. Check for existing in_progress session
    const { data: existingSession } = await supabaseBrowser
      .from('job_sessions')
      .select('*')
      .eq('so_number', so)
      .eq('status', 'in_progress')
      .order('started_at', { ascending: false })
      .limit(1)
      .single()

    let sessId: number
    let startPcs = 0

    if (existingSession) {
      // Resume existing session
      sessId    = existingSession.id
      startPcs  = existingSession.completed_pcs
      setResumedPcs(startPcs)
      console.log(`Resuming session ${sessId}, pcs: ${startPcs}`)
    } else {
      // Create new session
      const { data: newSession } = await supabaseBrowser
        .from('job_sessions')
        .insert({
          so_number:    so,
          job_order_no: orderData.job_order_no,
          machine_code: orderData.machine_code,
          target_pcs:   orderData.total_pcs,
          target_mm:    orderData.length_m ? Math.round(orderData.length_m * 1000) : null,
          completed_pcs: 0,
          status:       'in_progress',
        })
        .select()
        .single()

      sessId   = newSession?.id
      startPcs = 0
      setResumedPcs(0)
    }

    setSessionId(sessId)
    setOrder(orderData)
    setSoInput('')
    setScanning(false)

    // 3. Notify bridge: new session
    await supabaseBrowser
      .from('plc_readings')
      .update({
        session_so: so,
        target_mm:  orderData.length_m ? Math.round(orderData.length_m * 1000) : null,
        current_pcs: startPcs,
      })
      .eq('machine_code', orderData.machine_code)
  }

  // ── End job ─────────────────────────────────────────────
  async function handleEndJob() {
    if (!sessionId || !order) return

    const finalPcs  = plc?.current_pcs ?? 0
    const targetPcs = order.total_pcs ?? 0
    const jobStatus = finalPcs >= targetPcs && targetPcs > 0 ? 'done' : 'pending'

    // Save to job_sessions
    await supabaseBrowser
      .from('job_sessions')
      .update({
        completed_pcs: finalPcs,
        status:        jobStatus,
        ended_at:      new Date().toISOString(),
      })
      .eq('id', sessionId)

    // Clear session in plc_readings
    await supabaseBrowser
      .from('plc_readings')
      .update({
        session_so:  null,
        target_mm:   null,
        current_pcs: 0,
      })
      .eq('machine_code', order.machine_code)

    // Reset local state
    setOrder(null)
    setSessionId(null)
    setIsComplete(false)
    setShowEndConfirm(false)
    setResumedPcs(0)
    setSoInput('')
    setTimeout(() => inputRef.current?.focus(), 50)
  }

  const mmValue   = plc?.length_mm ?? 0
  const pcsValue  = plc?.current_pcs ?? 0
  const targetPcs = order?.total_pcs ?? 0
  const targetMm  = order?.length_m ? order.length_m * 1000 : null
  const pct       = targetMm ? Math.min(100, Math.round((mmValue / targetMm) * 100)) : 0

  return (
    <div className="min-h-screen bg-[#f5f7fa] flex flex-col">

      {/* ── Completion overlay ── */}
      {isComplete && (
        <div className="fixed inset-0 bg-[#eaf3de] flex flex-col items-center justify-center z-50 gap-6 p-6">
          <div className="text-[80px] leading-none">✅</div>
          <p className="text-4xl font-bold text-[#27500a] text-center">Job Complete!</p>
          <p className="text-xl text-[#3b6d11] text-center">{order?.so_number} · {pcsValue} / {targetPcs} pcs</p>
          <button
            onClick={() => setShowEndConfirm(true)}
            className="mt-2 px-10 py-4 bg-[#27500a] text-white text-xl font-semibold rounded-2xl"
          >
            End Job & Save
          </button>
        </div>
      )}

      {/* ── End job confirm modal ── */}
      {showEndConfirm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-6">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm">
            <p className="text-lg font-bold text-gray-800 mb-2">End this job?</p>
            <p className="text-sm text-gray-500 mb-1">SO: <span className="font-medium">{order?.so_number}</span></p>
            <p className="text-sm text-gray-500 mb-4">
              Pieces completed: <span className="font-medium">{pcsValue} / {targetPcs}</span>
              {' · '}
              <span className={pcsValue >= targetPcs ? 'text-[#27500a] font-medium' : 'text-[#633806] font-medium'}>
                {pcsValue >= targetPcs && targetPcs > 0 ? 'Will mark as DONE' : 'Will mark as PENDING'}
              </span>
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowEndConfirm(false)}
                className="flex-1 py-3 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleEndJob}
                className="flex-1 py-3 rounded-xl bg-[#1a56db] text-white text-sm font-semibold"
              >
                Confirm End
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Top bar ── */}
      <div className="bg-white border-b border-gray-100 px-5 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#1a56db] flex items-center justify-center text-white font-bold">
            W
          </div>
          <div>
            <p className="text-base font-semibold text-gray-800 leading-tight">Worker Terminal</p>
            <p className="text-xs text-gray-400">
              {plc ? `Machine: ${plc.machine_code}` : 'No PLC connected'}
            </p>
          </div>
        </div>
        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium ${
          plc ? 'bg-[#eaf3de] text-[#27500a]' : 'bg-[#f1efe8] text-[#5f5e5a]'
        }`}>
          <span className={`w-2 h-2 rounded-full ${plc ? 'bg-[#639922] animate-pulse' : 'bg-gray-400'}`} />
          {plc ? 'PLC Live' : 'PLC Offline'}
        </div>
      </div>

      <div className="flex-1 p-5 flex flex-col gap-4">

        {/* ── Scan input (no active order) ── */}
        {!order ? (
          <div className="bg-white rounded-2xl border border-gray-100 p-8 flex flex-col items-center gap-6">
            <div className="text-center">
              <p className="text-2xl font-bold text-gray-800 mb-2">Scan Job Order QR</p>
              <p className="text-base text-gray-400">Point the scanner at the Ecount QR code</p>
            </div>
            <form onSubmit={handleScan} className="w-full max-w-md flex flex-col gap-3">
              <input
                ref={inputRef}
                type="text"
                value={soInput}
                onChange={e => { setSoInput(e.target.value); setNotFound(false) }}
                placeholder="SO Number..."
                className="w-full h-16 text-xl border-2 border-gray-200 rounded-xl px-5 focus:outline-none focus:border-[#1a56db] text-center tracking-widest"
              />
              {notFound && (
                <div className="bg-[#fcebeb] text-[#791f1f] text-sm text-center p-3 rounded-xl">
                  SO Number not found. Check the QR code.
                </div>
              )}
              <button
                type="submit"
                disabled={scanning || !soInput.trim()}
                className="h-14 text-lg font-semibold rounded-xl bg-[#1a56db] text-white disabled:opacity-40"
              >
                {scanning ? 'Loading...' : 'Start Job'}
              </button>
            </form>
          </div>
        ) : (
          <>
            {/* ── Order banner ── */}
            <div className="bg-[#1a56db] rounded-2xl p-5 text-white">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <p className="text-xs opacity-60 mb-0.5">Active Job</p>
                  <p className="text-2xl font-bold">{order.so_number}</p>
                  <p className="text-sm opacity-70 mt-0.5">{order.job_order_no}</p>
                </div>
                <button
                  onClick={() => setShowEndConfirm(true)}
                  className="px-4 py-2 bg-white/20 rounded-xl text-sm font-semibold border border-white/30"
                >
                  End Job
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: 'Item',          value: order.item_name },
                  { label: 'Customer',      value: order.customer_name },
                  { label: 'Target length', value: order.length_m ? `${order.length_m} m` : '—' },
                  { label: 'Target PCS',    value: order.total_pcs ?? '—' },
                ].map(item => (
                  <div key={item.label} className="bg-white/10 rounded-xl p-3">
                    <p className="text-xs opacity-60 mb-0.5">{item.label}</p>
                    <p className="text-sm font-semibold truncate">{item.value}</p>
                  </div>
                ))}
              </div>

              {resumedPcs > 0 && (
                <div className="mt-3 bg-white/20 rounded-xl p-3 text-sm">
                  ↩ Resumed — previously completed {resumedPcs} pcs
                </div>
              )}

              {order.special_packing && (
                <div className="mt-2 bg-[#faeeda] text-[#633806] rounded-xl p-3 text-sm font-medium">
                  ⚠ Special packing: {order.special_packing}
                </div>
              )}
            </div>

            {/* ── Big numbers ── */}
            <div className="flex gap-3">
              <div className="flex-1 bg-white rounded-2xl border border-gray-100 p-5 flex flex-col items-center">
                <p className="text-xs font-medium text-gray-400 uppercase tracking-widest mb-2">Length</p>
                <div className="flex items-end gap-1">
                  <span className="text-[64px] font-bold tabular-nums text-gray-900 leading-none">
                    {(mmValue / 1000).toFixed(3)}
                  </span>
                  <span className="text-2xl text-gray-400 mb-2">m</span>
                </div>
                <span className="text-sm text-gray-400 tabular-nums">{mmValue.toLocaleString()} mm</span>
              </div>

              <div className="flex-1 bg-white rounded-2xl border border-gray-100 p-5 flex flex-col items-center">
                <p className="text-xs font-medium text-gray-400 uppercase tracking-widest mb-2">Pieces</p>
                <div className="flex items-end gap-1">
                  <span className="text-[64px] font-bold tabular-nums text-gray-900 leading-none">
                    {pcsValue}
                  </span>
                  <span className="text-2xl text-gray-400 mb-2">/ {targetPcs}</span>
                </div>
                <span className="text-sm text-gray-400">pcs completed</span>
              </div>
            </div>

            {/* ── Progress bar ── */}
            {targetMm && (
              <div className="bg-white rounded-2xl border border-gray-100 p-5">
                <div className="flex justify-between text-sm text-gray-500 mb-2">
                  <span>Cut progress</span>
                  <span className="font-semibold text-gray-800">{pct}%</span>
                </div>
                <div className="w-full h-4 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-300"
                    style={{
                      width: `${pct}%`,
                      background: pct >= 100 ? '#639922' : '#1a56db'
                    }}
                  />
                </div>
                <div className="flex justify-between text-xs text-gray-400 mt-1.5">
                  <span>0</span>
                  <span>Target: {order.length_m} m</span>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}