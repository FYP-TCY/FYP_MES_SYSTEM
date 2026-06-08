'use client'
// Worker opens this page on phone after scanning QR code.
// QR code encodes: https://your-domain.com/scan?order=JO-001234
// This page reads the ?order= param, shows order details, and lets
// the worker confirm to start the machine session.

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'

type SessionState = 'idle' | 'loading' | 'confirm' | 'starting' | 'active' | 'error'

interface OrderPreview {
  job_order_no: string
  so_number: string
  item_name: string
  machine_code: string
  target_length: number | null
}

export default function ScanPage() {
  const params = useSearchParams()
  const jobOrderNo = params.get('order') ?? ''

  const [state, setState] = useState<SessionState>('idle')
  const [order, setOrder] = useState<OrderPreview | null>(null)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    if (!jobOrderNo) return
    setState('loading')

    // Preview order details before starting session
    fetch(`/api/orders/preview?job_order_no=${encodeURIComponent(jobOrderNo)}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) throw new Error(data.error)
        setOrder(data)
        setState('confirm')
      })
      .catch(e => {
        setErrorMsg(e.message)
        setState('error')
      })
  }, [jobOrderNo])

  async function startSession() {
    if (!order) return
    setState('starting')
    try {
      const res = await fetch('/api/session/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ job_order_no: order.job_order_no }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setSessionId(data.session.id)
      setState('active')
    } catch (e: unknown) {
      setErrorMsg(e instanceof Error ? e.message : 'Unknown error')
      setState('error')
    }
  }

  async function endSession() {
    if (!sessionId) return
    await fetch('/api/session/end', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId, status: 'completed' }),
    })
    setState('idle')
    setOrder(null)
    setSessionId(null)
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">

        {/* Header */}
        <div className="bg-[#1a56db] px-6 py-5">
          <p className="text-xs text-blue-200 font-medium uppercase tracking-widest mb-1">Cutting machine</p>
          <h1 className="text-white text-xl font-semibold">Job order scan</h1>
        </div>

        <div className="px-6 py-6">

          {/* No QR param */}
          {!jobOrderNo && (
            <div className="text-center py-8">
              <div className="text-4xl mb-3">📋</div>
              <p className="text-sm text-gray-500">Scan the QR code on your order paper to begin.</p>
            </div>
          )}

          {/* Loading */}
          {state === 'loading' && (
            <div className="text-center py-8">
              <div className="w-8 h-8 border-2 border-[#1a56db] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              <p className="text-sm text-gray-500">Loading order…</p>
            </div>
          )}

          {/* Error */}
          {state === 'error' && (
            <div className="text-center py-8">
              <div className="text-4xl mb-3">⚠️</div>
              <p className="text-sm text-red-500 font-medium">{errorMsg}</p>
              <p className="text-xs text-gray-400 mt-1">Scan the QR code again or contact office.</p>
            </div>
          )}

          {/* Confirm order */}
          {state === 'confirm' && order && (
            <div className="space-y-4">
              <div className="bg-gray-50 rounded-xl p-4 space-y-2.5">
                <Row label="Job order" value={order.job_order_no} mono />
                <Row label="SO number" value={order.so_number} mono />
                <Row label="Item" value={order.item_name} />
                <Row label="Machine" value={order.machine_code} mono />
                {order.target_length != null && (
                  <Row label="Target length" value={`${order.target_length} m`} />
                )}
              </div>
              <button
                onClick={startSession}
                className="w-full py-3.5 bg-[#1a56db] hover:bg-[#1648c0] active:bg-[#1340ad] text-white text-sm font-semibold rounded-xl transition-colors"
              >
                Start machine session
              </button>
            </div>
          )}

          {/* Starting spinner */}
          {state === 'starting' && (
            <div className="text-center py-8">
              <div className="w-8 h-8 border-2 border-[#1a56db] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              <p className="text-sm text-gray-500">Starting session…</p>
            </div>
          )}

          {/* Active session */}
          {state === 'active' && order && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="w-2.5 h-2.5 rounded-full bg-green-400 animate-pulse" />
                <span className="text-sm font-medium text-green-700">Session active</span>
              </div>
              <div className="bg-gray-50 rounded-xl p-4 space-y-2.5">
                <Row label="Job order" value={order.job_order_no} mono />
                <Row label="Machine" value={order.machine_code} mono />
                <p className="text-xs text-gray-400 pt-1">Dashboard is now showing this order in real time.</p>
              </div>
              <button
                onClick={endSession}
                className="w-full py-3.5 bg-white hover:bg-gray-50 border border-gray-200 text-gray-700 text-sm font-medium rounded-xl transition-colors"
              >
                End session manually
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-xs text-gray-400 flex-shrink-0 pt-0.5">{label}</span>
      <span className={`text-xs font-medium text-gray-700 text-right ${mono ? 'font-mono' : ''}`}>{value || '—'}</span>
    </div>
  )
}
