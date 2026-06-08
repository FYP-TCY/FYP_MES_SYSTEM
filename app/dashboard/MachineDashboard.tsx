'use client'

import { useState, useEffect, useRef } from 'react'
import { supabaseBrowser } from '@/lib/supabase-browser'

// ── Types ────────────────────────────────────────────────────
interface Order {
  id: number
  date_no: string
  item_group_1: string
  item_group_2: string
  item_group_3: string
  job_order_no: string
  so_number: string
  machine_code: string
  item_code: string
  item_name: string
  length_m: number | null
  total_pcs: number | null
  total_kg: number | null
  special_packing: string
  salesman_name: string
  sales_co_name: string
  status: string
  progress_status: string
  priority: string
  delivery_date: string
  customer_name: string
}

interface PlcReading {
  machine_code: string
  length_mm: number
  recorded_at: string
}

// ── Helper components ────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const s = (status ?? '').toLowerCase()
  const map: Record<string, string> = {
    'completed':   'bg-[#eaf3de] text-[#27500a]',
    'in progress': 'bg-[#e6f1fb] text-[#0c447c]',
    'pending':     'bg-[#faeeda] text-[#633806]',
    'queued':      'bg-[#f1efe8] text-[#444441]',
  }
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium ${map[s] ?? 'bg-[#f1efe8] text-[#444441]'}`}>
      {status || '—'}
    </span>
  )
}

function InfoRow({ label, value }: { label: string; value: string | number | null }) {
  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-gray-50 last:border-0">
      <span className="text-[11px] font-medium text-gray-400 uppercase tracking-wide w-36 flex-shrink-0 pt-0.5">{label}</span>
      <span className="text-sm text-gray-700 flex-1">{value ?? '—'}</span>
    </div>
  )
}

// ── Main component ───────────────────────────────────────────
export default function DashboardPage() {

  const [soInput, setSoInput]       = useState('')
  const [order, setOrder]           = useState<Order | null>(null)
  const [searching, setSearching]   = useState(false)
  const [notFound, setNotFound]     = useState(false)
  const [plcData, setPlcData]       = useState<PlcReading | null>(null)
  const [plcConnected, setPlcConnected] = useState(false)
  const [lastUpdate, setLastUpdate] = useState<string>('')
  const inputRef = useRef<HTMLInputElement>(null)

  // ── Auto-focus input on load ─────────────────────────────
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // ── Supabase Realtime: listen to plc_readings ────────────
  useEffect(() => {
    const machineCode = order?.machine_code

    const channel = supabaseBrowser
      .channel('plc-live')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'plc_readings',
          ...(machineCode ? { filter: `machine_code=eq.${machineCode}` } : {}),
        },
        (payload) => {
          const row = payload.new as PlcReading
          setPlcData(row)
          setPlcConnected(true)
          setLastUpdate(new Date().toLocaleTimeString('en-GB'))
        }
      )
      .subscribe()

    // Also do initial fetch
    async function fetchLatestPlc() {
      const query = supabaseBrowser
        .from('plc_readings')
        .select('*')
        .order('recorded_at', { ascending: false })
        .limit(1)

      if (machineCode) {
        query.eq('machine_code', machineCode)
      }

      const { data } = await query
      if (data && data.length > 0) {
        setPlcData(data[0])
        setPlcConnected(true)
        setLastUpdate(new Date().toLocaleTimeString('en-GB'))
      }
    }

    fetchLatestPlc()

    return () => {
      supabaseBrowser.removeChannel(channel)
    }
  }, [order?.machine_code])

  // ── SO Number lookup ─────────────────────────────────────
  async function handleScan(e: React.FormEvent) {
    e.preventDefault()
    const so = soInput.trim()
    if (!so) return

    setSearching(true)
    setNotFound(false)
    setOrder(null)

    const { data, error } = await supabaseBrowser
      .from('orders')
      .select('*')
      .eq('so_number', so)
      .limit(1)
      .single()

    setSearching(false)

    if (error || !data) {
      setNotFound(true)
      inputRef.current?.select()
      return
    }

    setOrder(data)
    setSoInput('')
  }

  function handleClear() {
    setOrder(null)
    setNotFound(false)
    setSoInput('')
    setTimeout(() => inputRef.current?.focus(), 50)
  }

  // ── PLC status indicator ─────────────────────────────────
  const plcMm = plcData?.length_mm ?? null

  // ── Render ───────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#f5f7fa] p-6">

      {/* Top bar */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-[#1a56db] flex items-center justify-center text-white text-sm font-medium">
            RT
          </div>
          <div>
            <p className="text-sm font-medium text-gray-800 leading-tight">Real-time Dashboard</p>
            <p className="text-xs text-gray-400 leading-tight">Scan QR to load order · Live PLC length</p>
          </div>
        </div>

        {/* PLC status pill */}
        <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border ${
          plcConnected
            ? 'bg-[#eaf3de] text-[#27500a] border-[#c0dd97]'
            : 'bg-[#f1efe8] text-[#5f5e5a] border-[#d3d1c7]'
        }`}>
          <span className={`w-1.5 h-1.5 rounded-full ${plcConnected ? 'bg-[#639922]' : 'bg-[#888780]'}`} />
          {plcConnected ? `PLC connected · ${lastUpdate}` : 'PLC not connected'}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        {/* ── Left: QR Scan + Order Info ─────────────────── */}
        <div className="flex flex-col gap-4">

          {/* Scan input card */}
          <div className="bg-white rounded-xl border border-gray-100 p-5">
            <p className="text-[10.5px] font-medium text-gray-400 uppercase tracking-widest mb-4">
              Scan QR Code
            </p>
            <form onSubmit={handleScan} className="flex gap-2">
              <div className="flex-1 flex items-center gap-2 h-10 border border-gray-200 rounded-lg px-3 bg-gray-50 focus-within:border-[#1a56db] focus-within:bg-white transition-colors">
                <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" className="text-gray-400 flex-shrink-0"><rect x="1" y="1" width="5" height="5" rx="0.5"/><rect x="8" y="1" width="5" height="5" rx="0.5"/><rect x="1" y="8" width="5" height="5" rx="0.5"/><rect x="9" y="9" width="1.5" height="1.5"/><rect x="11.5" y="9" width="1.5" height="1.5"/><rect x="9" y="11.5" width="1.5" height="1.5"/><rect x="11.5" y="11.5" width="1.5" height="1.5"/></svg>
                <input
                  ref={inputRef}
                  type="text"
                  value={soInput}
                  onChange={e => { setSoInput(e.target.value); setNotFound(false) }}
                  placeholder="SO Number will appear here after scan..."
                  className="flex-1 text-xs bg-transparent outline-none text-gray-700 placeholder-gray-300"
                />
              </div>
              <button
                type="submit"
                disabled={searching || !soInput.trim()}
                className="px-4 h-10 text-xs font-medium rounded-lg bg-[#1a56db] text-white hover:bg-[#1648c0] disabled:opacity-40 transition-colors"
              >
                {searching ? 'Searching...' : 'Load'}
              </button>
              {order && (
                <button
                  type="button"
                  onClick={handleClear}
                  className="px-3 h-10 text-xs rounded-lg border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 transition-colors"
                >
                  Clear
                </button>
              )}
            </form>

            {/* Not found message */}
            {notFound && (
              <div className="mt-3 flex items-center gap-2 p-3 bg-[#fcebeb] rounded-lg">
                <span className="text-[#791f1f] text-xs">⚠ SO Number not found in database. Check the QR code or wait for the next sync.</span>
              </div>
            )}

            {/* Instruction when no order loaded */}
            {!order && !notFound && (
              <p className="mt-3 text-xs text-gray-300 text-center">
                Point the wireless scanner at the Ecount QR code — it will auto-fill and load
              </p>
            )}
          </div>

          {/* Order info card */}
          {order && (
            <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100 bg-[#f8faff]">
                <div>
                  <p className="text-sm font-medium text-gray-800">{order.so_number}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{order.job_order_no}</p>
                </div>
                <StatusBadge status={order.status} />
              </div>

              <div className="px-5 py-1">
                <InfoRow label="Date No."       value={order.date_no} />
                <InfoRow label="Item Group I"   value={order.item_group_1} />
                <InfoRow label="Item Group II"  value={order.item_group_2} />
                <InfoRow label="Item Group III" value={order.item_group_3} />
                <InfoRow label="Item Code"      value={order.item_code} />
                <InfoRow label="Item Name"      value={order.item_name} />
                <InfoRow label="Machine"        value={order.machine_code} />
                <InfoRow label="Target Length"  value={order.length_m ? `${order.length_m} m` : null} />
                <InfoRow label="Total PCS"      value={order.total_pcs} />
                <InfoRow label="Total KG"       value={order.total_kg ? `${order.total_kg} kg` : null} />
                <InfoRow label="Special Packing" value={order.special_packing} />
                <InfoRow label="Salesman"       value={order.salesman_name} />
                <InfoRow label="Sales Co."      value={order.sales_co_name} />
                <InfoRow label="Delivery Date"  value={order.delivery_date} />
                <InfoRow label="Customer"       value={order.customer_name} />
              </div>
            </div>
          )}
        </div>

        {/* ── Right: Live PLC Length ─────────────────────── */}
        <div className="flex flex-col gap-4">

          {/* Big live length display */}
          <div className="bg-white rounded-xl border border-gray-100 p-6 flex flex-col items-center justify-center min-h-[240px]">
            <p className="text-[10.5px] font-medium text-gray-400 uppercase tracking-widest mb-6">
              Live Cutting Length
            </p>

            {plcConnected && plcMm !== null ? (
              <>
                <div className="flex items-end gap-3 mb-2">
                  <span className="text-[72px] font-semibold text-gray-800 leading-none tabular-nums">
                    {plcMm.toLocaleString()}
                  </span>
                  <span className="text-2xl text-gray-400 mb-3">mm</span>
                </div>
                <span className="text-lg text-gray-400 tabular-nums">
                  {(plcMm / 1000).toFixed(3)} m
                </span>

                {/* Progress vs target */}
                {order?.length_m && (
                  <div className="w-full mt-6">
                    <div className="flex justify-between text-xs text-gray-400 mb-1.5">
                      <span>Progress vs target</span>
                      <span>{Math.min(100, Math.round((plcMm / (order.length_m * 1000)) * 100))}%</span>
                    </div>
                    <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-[#1a56db] rounded-full transition-all duration-300"
                        style={{ width: `${Math.min(100, (plcMm / (order.length_m * 1000)) * 100)}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-[11px] text-gray-300 mt-1">
                      <span>0</span>
                      <span>Target: {(order.length_m * 1000).toLocaleString()} mm</span>
                    </div>
                  </div>
                )}

                <p className="text-[11px] text-gray-300 mt-4">
                  Last updated: {lastUpdate} · Machine: {plcData?.machine_code}
                </p>
              </>
            ) : (
              <div className="flex flex-col items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-gray-50 flex items-center justify-center">
                  <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-gray-300">
                    <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
                  </svg>
                </div>
                <p className="text-sm text-gray-300">Waiting for PLC data...</p>
                <p className="text-xs text-gray-200">Make sure the bridge script is running on the machine PC</p>
              </div>
            )}
          </div>

          {/* Machine info card */}
          {plcData && (
            <div className="bg-white rounded-xl border border-gray-100 p-5">
              <p className="text-[10.5px] font-medium text-gray-400 uppercase tracking-widest mb-3">
                Machine Status
              </p>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: 'Machine code', value: plcData.machine_code },
                  { label: 'Last reading', value: lastUpdate },
                  { label: 'Length (mm)',  value: plcMm?.toLocaleString() },
                  { label: 'Length (m)',   value: plcMm ? (plcMm / 1000).toFixed(3) : null },
                ].map(item => (
                  <div key={item.label} className="bg-gray-50 rounded-lg p-3">
                    <p className="text-[10.5px] text-gray-400 mb-1">{item.label}</p>
                    <p className="text-sm font-medium text-gray-700 tabular-nums">{item.value ?? '—'}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* How to use hint */}
          {!order && (
            <div className="bg-white rounded-xl border border-gray-100 p-5">
              <p className="text-[10.5px] font-medium text-gray-400 uppercase tracking-widest mb-3">
                How to use
              </p>
              <div className="flex flex-col gap-3">
                {[
                  { step: '1', text: 'Point wireless scanner at the Ecount QR code on the job order' },
                  { step: '2', text: 'Order details load automatically on the left panel' },
                  { step: '3', text: 'Live cutting length from PLC shows on the right in real-time' },
                  { step: '4', text: 'Progress bar shows how far along the target length you are' },
                ].map(item => (
                  <div key={item.step} className="flex items-start gap-3">
                    <span className="w-5 h-5 rounded-full bg-[#e6f1fb] text-[#0c447c] text-[11px] font-medium flex items-center justify-center flex-shrink-0 mt-0.5">
                      {item.step}
                    </span>
                    <p className="text-xs text-gray-500">{item.text}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
