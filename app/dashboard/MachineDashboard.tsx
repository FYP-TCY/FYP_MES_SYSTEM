'use client'

import { useState, useEffect, useRef } from 'react'
import { supabaseBrowser } from '@/lib/supabase-browser'

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
  corrected_length_mm: number | null
  current_pcs: number
  session_so: string | null
  target_mm: number | null
  recorded_at: string
}

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

export default function MachineDashboard() {
  const [order, setOrder]               = useState<Order | null>(null)
  const [plcData, setPlcData]           = useState<PlcReading | null>(null)
  const [plcConnected, setPlcConnected] = useState(false)
  const [lastUpdate, setLastUpdate]     = useState<string>('')
  const [lastSo, setLastSo]             = useState<string | null>(null)

  // ── load order by SO number ──────────────────────────────
  async function loadOrder(soNumber: string) {
    if (!soNumber || soNumber === lastSo) return
    setLastSo(soNumber)

    const { data, error } = await supabaseBrowser
      .from('orders')
      .select('*')
      .eq('so_number', soNumber)
      .limit(1)
      .single()

    if (!error && data) {
      setOrder(data)
      console.log('Order loaded:', soNumber)
    }
  }

  // ── initial fetch: get latest plc reading ────────────────
  useEffect(() => {
    async function fetchLatest() {
      const { data } = await supabaseBrowser
        .from('plc_readings')
        .select('*')
        .order('recorded_at', { ascending: false })
        .limit(1)

      if (data && data.length > 0) {
        const row = data[0] as PlcReading
        setPlcData(row)
        setPlcConnected(true)
        setLastUpdate(new Date().toLocaleTimeString('en-GB'))

        // Auto-load order if session_so exists
        if (row.session_so) {
          loadOrder(row.session_so)
        }
      }
    }

    fetchLatest()
  }, [])

  // ── realtime subscription ────────────────────────────────
  useEffect(() => {
    const channel = supabaseBrowser
      .channel('dashboard-plc')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'plc_readings',
        },
        (payload) => {
          const row = payload.new as PlcReading
          setPlcData(row)
          setPlcConnected(true)
          setLastUpdate(new Date().toLocaleTimeString('en-GB'))

          // If SO changed → auto load new order
          if (row.session_so && row.session_so !== lastSo) {
            loadOrder(row.session_so)
          }

          // If session cleared → clear order
          if (!row.session_so) {
            setOrder(null)
            setLastSo(null)
          }
        }
      )
      .subscribe()

    return () => { supabaseBrowser.removeChannel(channel) }
  }, [lastSo])

  const plcMm       = plcData?.length_mm ?? 0
  const plcCorrected = plcData?.corrected_length_mm ?? plcMm
  const plcPcs      = plcData?.current_pcs ?? 0
  const plcTarget   = plcData?.target_mm ?? null
  const errMm       = plcTarget !== null ? plcCorrected - plcTarget : null
  const errPct      = plcTarget !== null && plcTarget > 0 ? (errMm! / plcTarget) * 100 : null

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
            <p className="text-xs text-gray-400 leading-tight">
              {order ? `Active: ${order.so_number}` : 'Waiting for worker to scan QR...'}
            </p>
          </div>
        </div>

        {/* PLC status */}
        <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border ${
          plcConnected
            ? 'bg-[#eaf3de] text-[#27500a] border-[#c0dd97]'
            : 'bg-[#f1efe8] text-[#5f5e5a] border-[#d3d1c7]'
        }`}>
          <span className={`w-1.5 h-1.5 rounded-full ${plcConnected ? 'bg-[#639922] animate-pulse' : 'bg-[#888780]'}`} />
          {plcConnected ? `PLC live · ${lastUpdate}` : 'PLC not connected'}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        {/* ── Left: Order info ────────────────────────────── */}
        <div className="flex flex-col gap-4">
          {order ? (
            <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100 bg-[#f8faff]">
                <div>
                  <p className="text-sm font-medium text-gray-800">{order.so_number}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{order.job_order_no}</p>
                </div>
                <StatusBadge status={order.status} />
              </div>
              <div className="px-5 py-1">
                <InfoRow label="Date No."        value={order.date_no} />
                <InfoRow label="Item Group I"    value={order.item_group_1} />
                <InfoRow label="Item Group II"   value={order.item_group_2} />
                <InfoRow label="Item Group III"  value={order.item_group_3} />
                <InfoRow label="Item Code"       value={order.item_code} />
                <InfoRow label="Item Name"       value={order.item_name} />
                <InfoRow label="Machine"         value={order.machine_code} />
                <InfoRow label="Target Length"   value={order.length_m ? `${order.length_m} m` : null} />
                <InfoRow label="Total PCS"       value={order.total_pcs} />
                <InfoRow label="Total KG"        value={order.total_kg ? `${order.total_kg} kg` : null} />
                <InfoRow label="Special Packing" value={order.special_packing} />
                <InfoRow label="Salesman"        value={order.salesman_name} />
                <InfoRow label="Sales Co."       value={order.sales_co_name} />
                <InfoRow label="Delivery Date"   value={order.delivery_date} />
                <InfoRow label="Customer"        value={order.customer_name} />
              </div>
            </div>
          ) : (
            // No order loaded yet
            <div className="bg-white rounded-xl border border-gray-100 p-10 flex flex-col items-center justify-center gap-3 text-center">
              <div className="w-14 h-14 rounded-full bg-gray-50 flex items-center justify-center text-2xl">
                📋
              </div>
              <p className="text-sm font-medium text-gray-500">No active job order</p>
              <p className="text-xs text-gray-300">
                Waiting for worker to scan QR code on the machine terminal
              </p>
            </div>
          )}
        </div>

        {/* ── Right: Live PLC ─────────────────────────────── */}
        <div className="flex flex-col gap-4">

          {/* Big length display */}
          <div className="bg-white rounded-xl border border-gray-100 p-6 flex flex-col items-center justify-center min-h-[220px]">
            <p className="text-[10.5px] font-medium text-gray-400 uppercase tracking-widest mb-5">
              Live Cutting Length
            </p>

            {plcConnected ? (
              <>
                <div className="flex items-end gap-3 mb-2">
                  <span className="text-[72px] font-semibold text-gray-800 leading-none tabular-nums">
                    {plcMm.toLocaleString()}
                  </span>
                  <span className="text-2xl text-gray-400 mb-3">mm</span>
                </div>
                <span className="text-lg text-gray-400 tabular-nums mb-4">
                  {(plcMm / 1000).toFixed(3)} m
                </span>

                {/* Progress bar */}
                {order?.length_m && (
                  <div className="w-full mt-2">
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
                  Last updated: {lastUpdate} · {plcData?.machine_code}
                </p>
              </>
            ) : (
              <div className="flex flex-col items-center gap-3">
                <p className="text-sm text-gray-300">Waiting for PLC data...</p>
                <p className="text-xs text-gray-200">Make sure bridge script is running</p>
              </div>
            )}
          </div>

          {/* PCS counter */}
          {plcConnected && (
            <div className="bg-white rounded-xl border border-gray-100 p-5">
              <p className="text-[10.5px] font-medium text-gray-400 uppercase tracking-widest mb-3">
                Pieces Counter
              </p>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: 'Pieces done',  value: plcPcs.toString() },
                  { label: 'Target PCS',   value: order?.total_pcs?.toString() ?? '—' },
                  { label: 'Length (mm)',  value: plcMm.toLocaleString() },
                  { label: 'Length (m)',   value: (plcMm / 1000).toFixed(3) },
                ].map(item => (
                  <div key={item.label} className="bg-gray-50 rounded-lg p-3">
                    <p className="text-[10.5px] text-gray-400 mb-1">{item.label}</p>
                    <p className="text-sm font-medium text-gray-700 tabular-nums">{item.value}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Measurement comparison panel */}
          {plcConnected && (
            <div className="bg-white rounded-xl border border-gray-100 p-5">
              <p className="text-[10.5px] font-medium text-gray-400 uppercase tracking-widest mb-3">
                Measurement Comparison
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-[10.5px] text-gray-400 mb-1">Raw PLC (mm)</p>
                  <p className="text-sm font-medium text-gray-700 tabular-nums">{plcMm.toLocaleString()}</p>
                </div>
                <div className="bg-[#e6f1fb] rounded-lg p-3">
                  <p className="text-[10.5px] text-[#0c447c] mb-1">Corrected (mm)</p>
                  <p className="text-sm font-semibold text-[#0c447c] tabular-nums">{plcCorrected.toLocaleString()}</p>
                </div>
                <div className={`rounded-lg p-3 ${errMm === null ? 'bg-gray-50' : Math.abs(errMm) <= 2 ? 'bg-[#eaf3de]' : Math.abs(errMm) <= 5 ? 'bg-[#faeeda]' : 'bg-[#fce8e8]'}`}>
                  <p className={`text-[10.5px] mb-1 ${errMm === null ? 'text-gray-400' : Math.abs(errMm) <= 2 ? 'text-[#27500a]' : Math.abs(errMm) <= 5 ? 'text-[#633806]' : 'text-[#7c1a1a]'}`}>
                    Error (mm)
                  </p>
                  <p className={`text-sm font-semibold tabular-nums ${errMm === null ? 'text-gray-700' : Math.abs(errMm) <= 2 ? 'text-[#27500a]' : Math.abs(errMm) <= 5 ? 'text-[#633806]' : 'text-[#7c1a1a]'}`}>
                    {errMm !== null ? (errMm > 0 ? '+' : '') + errMm.toFixed(1) : '—'}
                  </p>
                </div>
                <div className={`rounded-lg p-3 ${errPct === null ? 'bg-gray-50' : Math.abs(errPct) <= 0.5 ? 'bg-[#eaf3de]' : Math.abs(errPct) <= 1 ? 'bg-[#faeeda]' : 'bg-[#fce8e8]'}`}>
                  <p className={`text-[10.5px] mb-1 ${errPct === null ? 'text-gray-400' : Math.abs(errPct) <= 0.5 ? 'text-[#27500a]' : Math.abs(errPct) <= 1 ? 'text-[#633806]' : 'text-[#7c1a1a]'}`}>
                    Error (%)
                  </p>
                  <p className={`text-sm font-semibold tabular-nums ${errPct === null ? 'text-gray-700' : Math.abs(errPct) <= 0.5 ? 'text-[#27500a]' : Math.abs(errPct) <= 1 ? 'text-[#633806]' : 'text-[#7c1a1a]'}`}>
                    {errPct !== null ? (errPct > 0 ? '+' : '') + errPct.toFixed(2) + '%' : '—'}
                  </p>
                </div>
              </div>
              {plcTarget !== null && (
                <p className="text-[10px] text-gray-300 mt-2.5">Target: {plcTarget.toLocaleString()} mm</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}