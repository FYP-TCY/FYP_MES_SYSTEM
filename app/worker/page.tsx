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
  progress_status: string
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

// ── helpers ──────────────────────────────────────────────────
function BigNumber({ value, unit, label }: { value: string | number; unit: string; label: string }) {
  return (
    <div className="flex flex-col items-center justify-center bg-white rounded-2xl border border-gray-100 p-6 flex-1">
      <p className="text-sm font-medium text-gray-400 uppercase tracking-widest mb-3">{label}</p>
      <div className="flex items-end gap-2">
        <span className="text-[80px] font-bold tabular-nums text-gray-900 leading-none">{value}</span>
        <span className="text-3xl text-gray-400 mb-3 font-medium">{unit}</span>
      </div>
    </div>
  )
}

// ── main ─────────────────────────────────────────────────────
export default function WorkerPage() {
  const [soInput, setSoInput]     = useState('')
  const [order, setOrder]         = useState<Order | null>(null)
  const [scanning, setScanning]   = useState(false)
  const [notFound, setNotFound]   = useState(false)
  const [plc, setPlc]             = useState<PlcReading | null>(null)
  const [isComplete, setIsComplete] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // auto-focus on load
  useEffect(() => { inputRef.current?.focus() }, [])

  // realtime PLC subscription
  useEffect(() => {
    const channel = supabaseBrowser
      .channel('worker-plc')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'plc_readings' },
        (payload) => {
          const row = payload.new as PlcReading
          setPlc(row)

          // check completion
          if (order?.length_m && row.length_mm > 0) {
            const targetMm = order.length_m * 1000
            if (row.current_pcs >= (order.total_pcs ?? 0) && (order.total_pcs ?? 0) > 0) {
              setIsComplete(true)
            }
          }
        }
      )
      .subscribe()

    // initial fetch
    supabaseBrowser
      .from('plc_readings')
      .select('*')
      .limit(1)
      .then(({ data }) => { if (data?.[0]) setPlc(data[0]) })

    return () => { supabaseBrowser.removeChannel(channel) }
  }, [order])

  // scan handler
  async function handleScan(e: React.FormEvent) {
    e.preventDefault()
    const so = soInput.trim()
    if (!so) return

    setScanning(true)
    setNotFound(false)
    setIsComplete(false)

    const { data, error } = await supabaseBrowser
      .from('orders')
      .select('*')
      .eq('so_number', so)
      .limit(1)
      .single()

    setScanning(false)

    if (error || !data) {
      setNotFound(true)
      setSoInput('')
      inputRef.current?.focus()
      return
    }

    setOrder(data)
    setSoInput('')

    // notify bridge: new session started
    await supabaseBrowser
      .from('plc_readings')
      .update({
        session_so: so,
        target_mm: data.length_m ? Math.round(data.length_m * 1000) : null,
      })
      .eq('machine_code', data.machine_code)
  }

  function handleReset() {
    setOrder(null)
    setIsComplete(false)
    setSoInput('')
    setTimeout(() => inputRef.current?.focus(), 50)
  }

  const mmValue     = plc?.length_mm ?? 0
  const pcsValue    = plc?.current_pcs ?? 0
  const targetMm    = order?.length_m ? order.length_m * 1000 : null
  const targetPcs   = order?.total_pcs ?? 0
  const pct         = targetMm ? Math.min(100, Math.round((mmValue / targetMm) * 100)) : 0

  // ── render ────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#f5f7fa] flex flex-col">

      {/* ── completion overlay ── */}
      {isComplete && (
        <div className="fixed inset-0 bg-[#eaf3de] flex flex-col items-center justify-center z-50 gap-6">
          <div className="text-[100px] leading-none">✅</div>
          <p className="text-4xl font-bold text-[#27500a]">Job Complete!</p>
          <p className="text-xl text-[#3b6d11]">{order?.so_number} · {pcsValue} pcs done</p>
          <button
            onClick={handleReset}
            className="mt-4 px-10 py-4 bg-[#27500a] text-white text-xl font-medium rounded-2xl"
          >
            Scan Next Order
          </button>
        </div>
      )}

      {/* ── top bar ── */}
      <div className="bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#1a56db] flex items-center justify-center text-white text-sm font-bold">
            W
          </div>
          <div>
            <p className="text-base font-semibold text-gray-800 leading-tight">Worker Terminal</p>
            <p className="text-xs text-gray-400">
              {plc ? `Machine: ${plc.machine_code}` : 'No PLC connected'}
            </p>
          </div>
        </div>

        {/* PLC dot */}
        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium ${
          plc ? 'bg-[#eaf3de] text-[#27500a]' : 'bg-[#f1efe8] text-[#5f5e5a]'
        }`}>
          <span className={`w-2 h-2 rounded-full ${plc ? 'bg-[#639922]' : 'bg-gray-400'}`} />
          {plc ? 'PLC Live' : 'PLC Offline'}
        </div>
      </div>

      <div className="flex-1 p-5 flex flex-col gap-4">

        {/* ── scan input ── */}
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
            {/* ── order banner ── */}
            <div className="bg-[#1a56db] rounded-2xl p-5 text-white">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm opacity-70 mb-1">Active Job Order</p>
                  <p className="text-2xl font-bold">{order.so_number}</p>
                  <p className="text-base opacity-80 mt-1">{order.job_order_no}</p>
                </div>
                <button
                  onClick={handleReset}
                  className="px-4 py-2 bg-white/20 rounded-xl text-sm font-medium"
                >
                  Change Order
                </button>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3">
                {[
                  { label: 'Item', value: order.item_name },
                  { label: 'Customer', value: order.customer_name },
                  { label: 'Target length', value: order.length_m ? `${order.length_m} m` : '—' },
                  { label: 'Total PCS', value: order.total_pcs ?? '—' },
                ].map(item => (
                  <div key={item.label} className="bg-white/10 rounded-xl p-3">
                    <p className="text-xs opacity-60 mb-0.5">{item.label}</p>
                    <p className="text-sm font-semibold truncate">{item.value}</p>
                  </div>
                ))}
              </div>

              {order.special_packing && (
                <div className="mt-3 bg-[#faeeda] text-[#633806] rounded-xl p-3 text-sm font-medium">
                  ⚠ Special packing: {order.special_packing}
                </div>
              )}
            </div>

            {/* ── big numbers ── */}
            <div className="flex gap-4">
              <BigNumber
                label="Current Length"
                value={(mmValue / 1000).toFixed(3)}
                unit="m"
              />
              <BigNumber
                label="Pieces Done"
                value={pcsValue}
                unit={`/ ${targetPcs}`}
              />
            </div>

            {/* ── progress bar ── */}
            {targetMm && (
              <div className="bg-white rounded-2xl border border-gray-100 p-5">
                <div className="flex justify-between text-sm text-gray-500 mb-2">
                  <span>Cut progress</span>
                  <span className="font-semibold text-gray-800">{pct}%</span>
                </div>
                <div className="w-full h-5 bg-gray-100 rounded-full overflow-hidden">
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
                  <span>Target: {order.length_m} m ({(targetMm).toLocaleString()} mm)</span>
                </div>
              </div>
            )}

            {/* ── mm display ── */}
            <div className="bg-white rounded-2xl border border-gray-100 p-5 text-center">
              <p className="text-sm text-gray-400 mb-1">Raw encoder reading</p>
              <p className="text-5xl font-bold tabular-nums text-gray-800">
                {mmValue.toLocaleString()} <span className="text-2xl text-gray-400 font-normal">mm</span>
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
