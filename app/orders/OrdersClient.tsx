'use client'

import { useState, useMemo } from 'react'
import { Order } from '@/types/order'

// ─── helpers ────────────────────────────────────────────────

function parseDate(raw: string): Date | null {
  if (!raw) return null
  const cleaned = raw.replace(/\s*-\d+\s*$/, '').trim()
  let d = new Date(cleaned)
  if (!isNaN(d.getTime())) return d
  const months: Record<string, number> = {
    jan:0, feb:1, mar:2, apr:3, may:4, jun:5,
    jul:6, aug:7, sep:8, oct:9, nov:10, dec:11
  }
  const match = cleaned.match(/^(\d{1,2})\/([A-Za-z]{3})\/(\d{4})$/)
  if (match) {
    const [, day, mon, year] = match
    const m = months[mon.toLowerCase()]
    if (m !== undefined) {
      d = new Date(Number(year), m, Number(day))
      return isNaN(d.getTime()) ? null : d
    }
  }
  return null
}

function toInputDate(d: Date): string {
  return d.toISOString().split('T')[0]
}

function Highlight({ text, keyword }: { text: string; keyword: string }) {
  if (!keyword.trim() || !text) return <>{text || '—'}</>
  const idx = text.toLowerCase().indexOf(keyword.toLowerCase())
  if (idx === -1) return <>{text}</>
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-yellow-100 text-yellow-900 rounded-[2px] px-px">{text.slice(idx, idx + keyword.length)}</mark>
      {text.slice(idx + keyword.length)}
    </>
  )
}

function StatusBadge({ status }: { status: string }) {
  const s = (status ?? '').toLowerCase()
  const map: Record<string, string> = {
    'completed':   'bg-[#eaf3de] text-[#27500a]',
    'in progress': 'bg-[#e6f1fb] text-[#0c447c]',
    'pending':     'bg-[#faeeda] text-[#633806]',
    'queued':      'bg-[#f1efe8] text-[#444441]',
    'urgent':      'bg-[#fcebeb] text-[#791f1f]',
  }
  const cls = map[s] ?? 'bg-[#f1efe8] text-[#444441]'
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10.5px] font-medium ${cls}`}>
      {status || '—'}
    </span>
  )
}

function PriorityDot({ priority }: { priority: string }) {
  const p = (priority ?? '').toLowerCase()
  const color = p === 'high' ? 'bg-[#e24b4a]' : p === 'medium' ? 'bg-[#ef9f27]' : p === 'low' ? 'bg-[#639922]' : 'bg-gray-300'
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-gray-600">
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${color}`} />
      {priority || '—'}
    </span>
  )
}

function ProgressBar({ value }: { value: string }) {
  const pct = Math.min(100, Math.max(0, parseInt(value) || 0))
  return (
    <div className="flex items-center gap-2">
      <div className="w-14 h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div className="h-full bg-[#1a56db] rounded-full" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[11px] text-gray-400 w-6">{pct}%</span>
    </div>
  )
}

// ─── sort icon ───────────────────────────────────────────────

type SortDir = 'asc' | 'desc'

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  return (
    <span className="inline-flex flex-col gap-[2px] ml-1.5 align-middle" style={{ width: 7 }}>
      <svg width="7" height="4" viewBox="0 0 7 4" fill="none">
        <path d="M3.5 0L7 4H0L3.5 0Z" fill={active && dir === 'asc' ? '#1a56db' : '#c0c0c0'} />
      </svg>
      <svg width="7" height="4" viewBox="0 0 7 4" fill="none">
        <path d="M3.5 4L0 0H7L3.5 4Z" fill={active && dir === 'desc' ? '#1a56db' : '#c0c0c0'} />
      </svg>
    </span>
  )
}

// ─── column definitions ──────────────────────────────────────

type ColKey = 'seq_no' | 'date_no' | 'job_order_no' | 'so_number' | 'machine_code' |
              'item_code' | 'item_name' | 'pcs' | 'total_kg' | 'status'

const COLUMNS: { key: ColKey; label: string; width: string }[] = [
  { key: 'seq_no',       label: 'Seq no.',   width: 'w-[90px]'  },
  { key: 'date_no',      label: 'Date no.',  width: 'w-[120px]' },
  { key: 'job_order_no', label: 'Job order', width: 'w-[110px]' },
  { key: 'so_number',    label: 'SO no.',    width: 'w-[100px]' },
  { key: 'machine_code', label: 'Machine',   width: 'w-[100px]' },
  { key: 'item_code',    label: 'Item code', width: 'w-[100px]' },
  { key: 'item_name',    label: 'Item name', width: 'w-[180px]' },
  { key: 'pcs',          label: 'PCS',       width: 'w-[70px]'  },
  { key: 'total_kg',     label: 'KG',        width: 'w-[70px]'  },
  { key: 'status',       label: 'Status',    width: 'w-[110px]' },
]

function compareValues(a: Order, b: Order, key: ColKey): number {
  const va = a[key]
  const vb = b[key]
  if (key === 'pcs' || key === 'total_kg') {
    return (Number(va) || 0) - (Number(vb) || 0)
  }
  if (key === 'date_no') {
    const da = parseDate(String(va ?? ''))
    const db = parseDate(String(vb ?? ''))
    if (da && db) return da.getTime() - db.getTime()
    if (da) return -1
    if (db) return 1
    return 0
  }
  return String(va ?? '').localeCompare(String(vb ?? ''))
}

// ─── main component ──────────────────────────────────────────

type DateMode = 'specific' | 'range'

export default function OrdersClient({ orders }: { orders: Order[] }) {

  const [keyword,   setKeyword]   = useState('')
  const [dateMode,  setDateMode]  = useState<DateMode>('range')
  const [dateFrom,  setDateFrom]  = useState('')
  const [dateTo,    setDateTo]    = useState('')
  const [dateExact, setDateExact] = useState('')

  const [appliedKeyword,   setAppliedKeyword]   = useState('')
  const [appliedDateMode,  setAppliedDateMode]  = useState<DateMode>('range')
  const [appliedDateFrom,  setAppliedDateFrom]  = useState('')
  const [appliedDateTo,    setAppliedDateTo]    = useState('')
  const [appliedDateExact, setAppliedDateExact] = useState('')

  const [sortKey, setSortKey] = useState<ColKey | null>(null)
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [currentPage, setCurrentPage] = useState(1)
  const PAGE_SIZE = 50

  const hasActiveFilters = appliedKeyword || appliedDateFrom || appliedDateTo || appliedDateExact

  function handleSort(key: ColKey) {
    setSortKey(prev => {
      if (prev === key) {
        setSortDir(d => d === 'asc' ? 'desc' : 'asc')
      } else {
        setSortDir('asc')
      }
      return key
    })
    setCurrentPage(1)
  }

  function handleSearch() {
    setCurrentPage(1)
    setAppliedKeyword(keyword)
    setAppliedDateMode(dateMode)
    setAppliedDateFrom(dateFrom)
    setAppliedDateTo(dateTo)
    setAppliedDateExact(dateExact)
  }

  function handleClear() {
    setCurrentPage(1)
    setKeyword(''); setDateFrom(''); setDateTo(''); setDateExact('')
    setAppliedKeyword(''); setAppliedDateFrom(''); setAppliedDateTo(''); setAppliedDateExact('')
  }

  // step 1: filter only
  const filtered = useMemo(() => {
    return orders.filter(o => {
      if (appliedKeyword.trim()) {
        const kw = appliedKeyword.toLowerCase()
        const haystack = [
          o.seq_no, o.date_no, o.job_order_no, o.so_number,
          o.machine_code, o.item_code, o.item_name,
          o.customer_name, o.salesman_name, o.status,
          o.progress_status, o.priority, o.delivery_area,
        ].join(' ').toLowerCase()
        if (!haystack.includes(kw)) return false
      }

      const rawDate = o.date_no

      if (appliedDateMode === 'specific' && appliedDateExact) {
        const d = parseDate(rawDate)
        const target = parseDate(appliedDateExact)
        if (!d || !target) return false
        if (toInputDate(d) !== toInputDate(target)) return false
      }

      if (appliedDateMode === 'range' && (appliedDateFrom || appliedDateTo)) {
        const d = parseDate(rawDate)
        if (!d) return false
        if (appliedDateFrom && d < new Date(appliedDateFrom)) return false
        if (appliedDateTo) {
          const end = new Date(appliedDateTo)
          end.setHours(23, 59, 59, 999)
          if (d > end) return false
        }
      }

      return true
    })
  }, [orders, appliedKeyword, appliedDateMode, appliedDateFrom, appliedDateTo, appliedDateExact])

  // step 2: sort only
  const sorted = useMemo(() => {
    if (!sortKey) return filtered
    return [...filtered].sort((a, b) => {
      const cmp = compareValues(a, b, sortKey)
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [filtered, sortKey, sortDir])

  // step 3: paginate
  const paginated = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE
    return sorted.slice(start, start + PAGE_SIZE)
  }, [sorted, currentPage])

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)

  const stats = {
    inprogress: filtered.filter(o => (o.status ?? '').toLowerCase() === 'in progress').length,
    completed:  filtered.filter(o => (o.status ?? '').toLowerCase() === 'completed').length,
    urgent:     filtered.filter(o => (o.priority ?? '').toLowerCase() === 'high').length,
  }

  const rangeStart = filtered.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1
  const rangeEnd   = Math.min(currentPage * PAGE_SIZE, filtered.length)

  return (
    <div className="min-h-screen bg-[#f5f7fa] p-6">

      {/* Top bar */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-[#1a56db] flex items-center justify-center text-white text-sm font-medium">
            OM
          </div>
          <div>
            <p className="text-sm font-medium text-gray-800 leading-tight">Order Management</p>
            <p className="text-xs text-gray-400 leading-tight">Production Dashboard</p>
          </div>
        </div>
        <button className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 transition-colors">
          ↓ Export
        </button>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        {[
          { label: 'Showing',     value: filtered.length,  sub: `of ${orders.length.toLocaleString()} orders`, accent: true },
          { label: 'In progress', value: stats.inprogress, sub: 'In results' },
          { label: 'Completed',   value: stats.completed,  sub: 'In results' },
          { label: 'Urgent',      value: stats.urgent,     sub: 'High priority' },
        ].map(s => (
          <div key={s.label} className={`bg-white rounded-xl border border-gray-100 px-4 py-4 ${s.accent ? 'border-t-2 border-t-[#1a56db]' : ''}`}>
            <p className="text-xs text-gray-400 mb-1.5">{s.label}</p>
            <p className="text-2xl font-semibold text-gray-800">{s.value.toLocaleString()}</p>
            <p className="text-xs text-gray-300 mt-1">{s.sub}</p>
          </div>
        ))}
      </div>

      {/* Search panel */}
      <div className="bg-white rounded-xl border border-gray-100 p-5 mb-4">
        <p className="text-[10.5px] font-medium text-gray-400 uppercase tracking-widest mb-4">Search &amp; Filter</p>

        <div className="flex flex-wrap gap-4 items-end">

          <div className="flex flex-col gap-1.5 flex-[2] min-w-[180px]">
            <label className="text-[11px] font-medium text-gray-500">Keyword</label>
            <div className="flex items-center gap-2 h-9 border border-gray-200 rounded-lg px-3 bg-gray-50 focus-within:border-[#1a56db] focus-within:bg-white transition-colors">
              <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" className="text-gray-400 flex-shrink-0"><circle cx="6" cy="6" r="4"/><path d="m11 11-2.5-2.5"/></svg>
              <input
                type="text"
                value={keyword}
                onChange={e => setKeyword(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSearch()}
                placeholder="Order no., item name, customer..."
                className="flex-1 text-xs bg-transparent outline-none text-gray-700 placeholder-gray-300"
              />
              {keyword && (
                <button onClick={() => setKeyword('')} className="text-gray-300 hover:text-gray-500 text-sm leading-none">×</button>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-1.5 min-w-[140px]">
            <label className="text-[11px] font-medium text-gray-500">Date mode</label>
            <div className="flex bg-gray-100 rounded-lg p-0.5 h-9">
              {(['specific', 'range'] as DateMode[]).map(m => (
                <button
                  key={m}
                  onClick={() => setDateMode(m)}
                  className={`flex-1 text-[11px] font-medium rounded-md px-2 transition-colors capitalize ${
                    dateMode === m ? 'bg-white text-[#1a56db] shadow-[0_0_0_0.5px_rgba(0,0,0,0.08)]' : 'text-gray-400 hover:text-gray-600'
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>

          {dateMode === 'specific' && (
            <div className="flex flex-col gap-1.5 min-w-[160px]">
              <label className="text-[11px] font-medium text-gray-500">Date no.</label>
              <input
                type="date"
                value={dateExact}
                onChange={e => setDateExact(e.target.value)}
                className="h-9 border border-gray-200 rounded-lg px-3 text-xs text-gray-700 bg-gray-50 focus:outline-none focus:border-[#1a56db] focus:bg-white transition-colors"
              />
            </div>
          )}

          {dateMode === 'range' && (
            <div className="flex flex-col gap-1.5 min-w-[260px]">
              <label className="text-[11px] font-medium text-gray-500">Date no. range</label>
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={dateFrom}
                  onChange={e => setDateFrom(e.target.value)}
                  className="flex-1 h-9 border border-gray-200 rounded-lg px-3 text-xs text-gray-700 bg-gray-50 focus:outline-none focus:border-[#1a56db] focus:bg-white transition-colors"
                />
                <span className="text-gray-300 text-xs flex-shrink-0">→</span>
                <input
                  type="date"
                  value={dateTo}
                  min={dateFrom}
                  onChange={e => setDateTo(e.target.value)}
                  className="flex-1 h-9 border border-gray-200 rounded-lg px-3 text-xs text-gray-700 bg-gray-50 focus:outline-none focus:border-[#1a56db] focus:bg-white transition-colors"
                />
              </div>
            </div>
          )}
        </div>

        <div className="flex gap-2 mt-4">
          <button
            onClick={handleSearch}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-lg bg-[#1a56db] text-white hover:bg-[#1648c0] transition-colors"
          >
            <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="5.5" cy="5.5" r="4"/><path d="m10 10-2-2"/></svg>
            Search
          </button>
          {(keyword || dateFrom || dateTo || dateExact) && (
            <button
              onClick={handleClear}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-lg border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 transition-colors"
            >
              × Clear all
            </button>
          )}
        </div>
      </div>

      {/* Active filter chips */}
      {hasActiveFilters && (
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <span className="text-[11px] text-gray-400">Active:</span>
          {appliedKeyword && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-[#e6f1fb] text-[#0c447c] rounded-full text-[11px] font-medium">
              🔍 "{appliedKeyword}"
              <button onClick={() => { setKeyword(''); setAppliedKeyword('') }} className="opacity-60 hover:opacity-100 leading-none">×</button>
            </span>
          )}
          {appliedDateMode === 'specific' && appliedDateExact && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-[#e6f1fb] text-[#0c447c] rounded-full text-[11px] font-medium">
              📅 Date no.: {appliedDateExact}
              <button onClick={() => { setDateExact(''); setAppliedDateExact('') }} className="opacity-60 hover:opacity-100 leading-none">×</button>
            </span>
          )}
          {appliedDateMode === 'range' && (appliedDateFrom || appliedDateTo) && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-[#e6f1fb] text-[#0c447c] rounded-full text-[11px] font-medium">
              📅 Date no.: {appliedDateFrom || '…'} → {appliedDateTo || '…'}
              <button onClick={() => { setDateFrom(''); setDateTo(''); setAppliedDateFrom(''); setAppliedDateTo('') }} className="opacity-60 hover:opacity-100 leading-none">×</button>
            </span>
          )}
          <button onClick={handleClear} className="text-[11px] text-gray-400 hover:text-gray-600 underline">Clear all</button>
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100">
          <p className="text-sm font-medium text-gray-700">
            {hasActiveFilters ? 'Search results' : 'Order list'}
          </p>
          <p className="text-xs text-gray-300">
            {hasActiveFilters
              ? `${filtered.length.toLocaleString()} of ${orders.length.toLocaleString()} orders`
              : `${orders.length.toLocaleString()} orders · auto-sync every 5 min`}
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs table-fixed">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                {COLUMNS.map(col => (
                  <th
                    key={col.key}
                    onClick={() => handleSort(col.key)}
                    className={`${col.width} px-4 py-2.5 text-left text-[10.5px] font-medium text-gray-400 uppercase tracking-wide whitespace-nowrap cursor-pointer select-none hover:text-gray-600 hover:bg-gray-100 transition-colors`}
                  >
                    <span className="inline-flex items-center">
                      {col.label}
                      <SortIcon active={sortKey === col.key} dir={sortKey === col.key ? sortDir : 'asc'} />
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paginated.map(o => (
                <tr key={o.id} className="border-b border-gray-50 hover:bg-blue-50/40 transition-colors">
                  <td className="px-4 py-3 font-mono text-gray-500 truncate"><Highlight text={o.seq_no} keyword={appliedKeyword} /></td>
                  <td className="px-4 py-3 text-gray-500 truncate"><Highlight text={o.date_no} keyword={appliedKeyword} /></td>
                  <td className="px-4 py-3 font-mono text-gray-600 truncate"><Highlight text={o.job_order_no} keyword={appliedKeyword} /></td>
                  <td className="px-4 py-3 font-mono text-gray-500 truncate"><Highlight text={o.so_number} keyword={appliedKeyword} /></td>
                  <td className="px-4 py-3 font-mono text-gray-600 truncate"><Highlight text={o.machine_code} keyword={appliedKeyword} /></td>
                  <td className="px-4 py-3 font-mono text-gray-500 truncate"><Highlight text={o.item_code} keyword={appliedKeyword} /></td>
                  <td className="px-4 py-3 text-gray-700 truncate"><Highlight text={o.item_name} keyword={appliedKeyword} /></td>
                  <td className="px-4 py-3 text-right text-gray-600 tabular-nums">{o.pcs ?? '—'}</td>
                  <td className="px-4 py-3 text-right text-gray-600 tabular-nums">{o.total_kg ?? '—'}</td>
                  <td className="px-4 py-3"><StatusBadge status={o.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>

          {filtered.length === 0 && (
            <div className="py-16 text-center">
              <p className="text-gray-300 text-sm">No orders match your search.</p>
              <button onClick={handleClear} className="mt-2 text-xs text-[#1a56db] hover:underline">Clear filters</button>
            </div>
          )}
        </div>

        {/* Footer — pagination */}
        <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between gap-4 flex-wrap">
          <p className="text-xs text-gray-300">
            {filtered.length === 0
              ? 'No orders'
              : `Showing ${rangeStart.toLocaleString()}–${rangeEnd.toLocaleString()} of ${filtered.length.toLocaleString()} orders`}
          </p>

          <div className="flex items-center gap-1">
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="w-7 h-7 flex items-center justify-center rounded-md text-xs text-gray-500 border border-gray-200 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >‹</button>

            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter(p => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1)
              .reduce<(number | '...')[]>((acc, p, i, arr) => {
                if (i > 0 && p - (arr[i - 1] as number) > 1) acc.push('...')
                acc.push(p)
                return acc
              }, [])
              .map((p, i) =>
                p === '...'
                  ? <span key={`ellipsis-${i}`} className="w-7 text-center text-xs text-gray-300">…</span>
                  : <button
                      key={p}
                      onClick={() => setCurrentPage(p as number)}
                      className={`w-7 h-7 flex items-center justify-center rounded-md text-xs transition-colors ${
                        currentPage === p
                          ? 'bg-[#1a56db] text-white'
                          : 'text-gray-500 border border-gray-200 hover:bg-gray-50'
                      }`}
                    >{p}</button>
              )}

            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="w-7 h-7 flex items-center justify-center rounded-md text-xs text-gray-500 border border-gray-200 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >›</button>
          </div>
        </div>
      </div>
    </div>
  )
}
