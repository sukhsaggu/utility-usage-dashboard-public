import { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  Legend,
  ComposedChart,
  Area,
} from 'recharts'
import parseGasXml, { parseElectricityXml, detectUtilityType } from './parseGasXml.js'
import { fetchRuntimeEnv } from './runtimeEnv.js'
import RuntimeEnvBadge from './RuntimeEnvBadge.jsx'

const STORAGE_KEY_GAS = 'utility-dashboard-gas'
const STORAGE_KEY_ELEC = 'utility-dashboard-elec'

const API_BASE = (typeof import.meta !== 'undefined' && import.meta.env?.BASE_URL) || '/gas-dashboard/'

function serializeBills(bills) {
  return bills.map((b) => ({ ...b, date: b.date.getTime() }))
}

function deserializeBills(bills) {
  if (!bills?.length) return []
  return bills.map((b) => ({ ...b, date: new Date(b.date) }))
}

/** Merge multiple sources into one list; same period (label) keeps first occurrence (no overwrite). */
function mergeAndDedupe(sources) {
  const byLabel = new Map()
  for (const { bills } of sources) {
    for (const bill of bills) {
      if (!byLabel.has(bill.label)) byLabel.set(bill.label, bill)
    }
  }
  return [...byLabel.values()].sort((a, b) => a.date - b.date)
}

function loadFromStorage(key) {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return []
    const data = JSON.parse(raw)
    const sources = Array.isArray(data?.sources) ? data.sources : []
    return sources.map((s) => ({ name: s.name || 'Unknown', bills: deserializeBills(s.bills) })).filter((s) => s.bills.length)
  } catch {
    return []
  }
}

function saveToStorage(key, sources) {
  try {
    const data = { sources: sources.map((s) => ({ name: s.name, bills: serializeBills(s.bills) })), updatedAt: new Date().toISOString() }
    localStorage.setItem(key, JSON.stringify(data))
  } catch (e) {
    console.warn('Failed to save to localStorage', e)
  }
}

function sourcesToPayload(gasSources, elecSources) {
  return {
    gas: { sources: gasSources.map((s) => ({ name: s.name, bills: serializeBills(s.bills) })) },
    electricity: { sources: elecSources.map((s) => ({ name: s.name, bills: serializeBills(s.bills) })) },
  }
}

async function fetchDashboardData() {
  try {
    const res = await fetch(`${API_BASE.replace(/\/$/, '')}/api/dashboard-data`, { credentials: 'include' })
    if (!res.ok) return null
    const data = await res.json()
    const gas = Array.isArray(data?.gas?.sources) ? data.gas.sources : []
    const elec = Array.isArray(data?.electricity?.sources) ? data.electricity.sources : []
    return {
      gas: gas.map((s) => ({ name: s.name || 'Unknown', bills: deserializeBills(s.bills) })).filter((s) => s.bills.length),
      electricity: elec.map((s) => ({ name: s.name || 'Unknown', bills: deserializeBills(s.bills) })).filter((s) => s.bills.length),
    }
  } catch {
    return null
  }
}

async function saveDashboardDataToServer(gasSources, elecSources) {
  try {
    await fetch(`${API_BASE.replace(/\/$/, '')}/api/dashboard-data`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(sourcesToPayload(gasSources, elecSources)),
    })
  } catch {
    // ignore
  }
}

const C = {
  elec: '#2563eb',
  elecLight: '#93c5fd',
  gas: '#ea580c',
  gasLight: '#fdba74',
  border: '#f0f0f0',
  muted: '#9ca3af',
  text: '#111827',
  sub: '#6b7280',
  bg: '#fafaf9',
  card: '#fff',
}

const CT = ({ active, payload, label, suffix }) => {
  if (!active || !payload?.length) return null
  return (
    <div
      style={{
        background: C.card,
        border: `1px solid ${C.border}`,
        borderRadius: 8,
        padding: '8px 12px',
        fontSize: 13,
        boxShadow: '0 2px 8px rgba(0,0,0,0.07)',
      }}
    >
      <div style={{ fontWeight: 600, color: C.text, marginBottom: 2 }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color || C.gas }}>
          {typeof p.value === 'number' ? p.value.toFixed(2) : p.value} {suffix}
        </div>
      ))}
    </div>
  )
}

const StatCard = ({ label, value, sub, accent }) => (
  <div
    style={{
      background: C.card,
      borderRadius: 12,
      padding: '18px 20px',
      border: `1px solid ${C.border}`,
      boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
      borderTop: `3px solid ${accent || C.elec}`,
    }}
  >
    <div style={{ fontSize: 11, color: C.muted, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
      {label}
    </div>
    <div style={{ fontSize: 22, fontWeight: 800, color: C.text, margin: '4px 0 2px', fontFamily: 'monospace' }}>
      {value}
    </div>
    {sub && <div style={{ fontSize: 12, color: C.sub }}>{sub}</div>}
  </div>
)

const SH = ({ title, sub }) => (
  <div style={{ marginBottom: 14 }}>
    <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: C.text }}>{title}</h3>
    {sub && <p style={{ margin: '2px 0 0', fontSize: 12, color: C.sub }}>{sub}</p>}
  </div>
)

const Card = ({ children, style }) => (
  <div
    style={{
      background: C.card,
      borderRadius: 16,
      border: `1px solid ${C.border}`,
      padding: 24,
      boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
      ...style,
    }}
  >
    {children}
  </div>
)

const DropZone = ({ label, icon, onFile, loaded, accent }) => {
  const [drag, setDrag] = useState(false)
  const handle = (f) => {
    if (!f) return
    const r = new FileReader()
    r.onload = (e) => onFile(e.target.result, f.name)
    r.readAsText(f)
  }
  return (
    <label
      onDragOver={(e) => {
        e.preventDefault()
        setDrag(true)
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDrag(false)
        handle(e.dataTransfer.files[0])
      }}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        border: `2px dashed ${drag ? accent : loaded ? accent : '#d1d5db'}`,
        borderRadius: 14,
        padding: '32px 24px',
        cursor: 'pointer',
        background: drag ? accent + '10' : loaded ? accent + '08' : '#fff',
        transition: 'all 0.2s',
        gap: 10,
        flex: 1,
        minWidth: 220,
      }}
    >
      <div style={{ fontSize: 36 }}>{loaded ? '✅' : icon}</div>
      <div style={{ fontWeight: 700, color: loaded ? accent : C.text, fontSize: 15, textAlign: 'center' }}>
        {label}
      </div>
      <div style={{ fontSize: 12, color: C.muted }}>
        {loaded ? 'Loaded — click to replace' : 'Drop XML here or click to browse'}
      </div>
      <input
        type="file"
        accept=".xml,application/xml,text/xml"
        style={{ display: 'none' }}
        onChange={(e) => handle(e.target.files[0])}
      />
    </label>
  )
}

const GAS_CHARGE_KEYS = [
  'Gas Supply Charge',
  'Gas Delivery Variable Charge',
  'Gas Federal Carbon Charge',
  'Customer charge',
  'HST ($)',
]
const GAS_CHARGE_COLORS = [C.gas, '#f97316', '#fb923c', '#fdba74', '#fed7aa']

const ELEC_CHARGE_COLORS = [C.elec, '#3b82f6', '#60a5fa', '#93c5fd', '#bfdbfe', '#dbeafe']

const UtilityTab = ({ bills, unit, unitLabel, accent, accentLight, chargeKeys, chargeColors, tableConsumptionHeader }) => {
  const totalUsage = bills.reduce((s, b) => s + b.m3, 0)
  const totalBill = bills.reduce((s, b) => s + b.bill, 0)
  const peak = bills.reduce((a, b) => (b.m3 > a.m3 ? b : a), bills[0])
  const avgUsage = totalUsage / bills.length
  const costData = bills.map((b) => ({
    label: b.label,
    ...Object.fromEntries(chargeKeys.map((k) => [k, b.charges[k] || 0])),
  }))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 14 }}>
        <StatCard accent={accent} label="Total Consumption" value={`${totalUsage.toFixed(0)} ${unitLabel}`} sub={`${bills.length} periods`} />
        <StatCard accent={accent} label="Total Spend" value={`$${totalBill.toFixed(2)}`} sub="CAD incl. HST" />
        <StatCard accent={accent} label="Period Avg" value={`${avgUsage.toFixed(0)} ${unitLabel}`} sub="per billing period" />
        <StatCard accent={accent} label="Peak Period" value={`${peak.m3.toFixed(0)} ${unitLabel}`} sub={peak.label} />
      </div>
      <Card>
        <SH title="Monthly Consumption" sub={`${unitLabel} per billing period`} />
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={bills} barCategoryGap="28%">
            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: C.muted }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: C.muted }} axisLine={false} tickLine={false} width={36} />
            <Tooltip content={<CT suffix={unitLabel} />} />
            <Bar dataKey="m3" radius={[5, 5, 0, 0]}>
              {bills.map((b, i) => (
                <Cell
                  key={i}
                  fill={b.m3 > avgUsage * 1.3 ? accent : b.m3 > avgUsage * 0.7 ? accentLight : accent + '99'}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </Card>
      <Card>
        <SH title="Monthly Bill" sub="Total charges per period (CAD)" />
        <ResponsiveContainer width="100%" height={200}>
          <ComposedChart data={bills}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: C.muted }} axisLine={false} tickLine={false} />
            <YAxis
              tick={{ fontSize: 11, fill: C.muted }}
              axisLine={false}
              tickLine={false}
              width={44}
              tickFormatter={(v) => `$${v}`}
            />
            <Tooltip formatter={(v) => [`$${v.toFixed(2)}`, 'Bill']} />
            <Area type="monotone" dataKey="bill" fill={accent + '20'} stroke={accent} strokeWidth={2.5} dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </Card>
      <Card>
        <SH title="Bill Breakdown by Charge Type" sub="CAD stacked by component" />
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={costData} barCategoryGap="25%">
            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: C.muted }} axisLine={false} tickLine={false} />
            <YAxis
              tick={{ fontSize: 11, fill: C.muted }}
              axisLine={false}
              tickLine={false}
              width={44}
              tickFormatter={(v) => `$${v}`}
            />
            <Tooltip formatter={(v, n) => [`$${parseFloat(v).toFixed(2)}`, n]} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            {chargeKeys.map((k, i) => (
              <Bar
                key={k}
                dataKey={k}
                stackId="a"
                fill={chargeColors[i % chargeColors.length]}
                radius={i === chargeKeys.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </Card>
      <Card>
        <SH title="Billing History" />
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>
                {['Period', 'Days', tableConsumptionHeader, ...chargeKeys, 'Total'].map((h) => (
                  <th
                    key={h}
                    style={{
                      textAlign: 'left',
                      padding: '6px 10px',
                      color: C.muted,
                      fontWeight: 600,
                      fontSize: 11,
                      borderBottom: `1px solid ${C.border}`,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {bills.map((b, i) => (
                <tr key={i} style={{ background: i % 2 === 0 ? '#fafaf9' : C.card }}>
                  <td style={{ padding: '7px 10px', fontWeight: 600 }}>{b.label}</td>
                  <td style={{ padding: '7px 10px', color: C.sub }}>{b.days}</td>
                  <td style={{ padding: '7px 10px', fontFamily: 'monospace', color: accent, fontWeight: 700 }}>
                    {b.m3.toFixed(1)}
                  </td>
                  {chargeKeys.map((k) => (
                    <td key={k} style={{ padding: '7px 10px', fontFamily: 'monospace', color: C.sub }}>
                      ${(b.charges[k] || 0).toFixed(2)}
                    </td>
                  ))}
                  <td style={{ padding: '7px 10px', fontFamily: 'monospace', fontWeight: 700 }}>
                    ${b.bill.toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}

const GasTab = (props) => (
  <UtilityTab
    {...props}
    unit="m3"
    unitLabel="m³"
    accent={C.gas}
    accentLight="#f97316"
    chargeKeys={GAS_CHARGE_KEYS}
    chargeColors={GAS_CHARGE_COLORS}
    tableConsumptionHeader="m³"
  />
)

const ElectricityTab = ({ bills }) => {
  const chargeKeys = [...new Set(bills.flatMap((b) => Object.keys(b.charges)))].filter(Boolean).sort()
  const chargeColors = ELEC_CHARGE_COLORS
  return (
    <UtilityTab
      bills={bills}
      unit="kwh"
      unitLabel="kWh"
      accent={C.elec}
      accentLight="#3b82f6"
      chargeKeys={chargeKeys.length ? chargeKeys : ['Charges']}
      chargeColors={chargeColors}
      tableConsumptionHeader="kWh"
    />
  )
}

const OverviewTab = ({ gas, electricity }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 14 }}>
      {gas && gas.length > 0 && (
        <>
          <StatCard
            accent={C.gas}
            label="Total Gas"
            value={`${gas.reduce((s, b) => s + b.m3, 0).toFixed(0)} m³`}
            sub={`${gas.length} bills`}
          />
          <StatCard
            accent={C.gas}
            label="Total Gas Spend"
            value={`$${gas.reduce((s, b) => s + b.bill, 0).toFixed(2)}`}
            sub="CAD incl. HST"
          />
        </>
      )}
      {electricity && electricity.length > 0 && (
        <>
          <StatCard
            accent={C.elec}
            label="Total Electricity"
            value={`${electricity.reduce((s, b) => s + b.m3, 0).toFixed(0)} kWh`}
            sub={`${electricity.length} bills`}
          />
          <StatCard
            accent={C.elec}
            label="Total Electricity Spend"
            value={`$${electricity.reduce((s, b) => s + b.bill, 0).toFixed(2)}`}
            sub="CAD incl. HST"
          />
        </>
      )}
    </div>
    {gas && gas.length > 0 && (
      <Card>
        <SH title="Gas Bill Trend" sub="Monthly Enbridge bill (CAD)" />
        <ResponsiveContainer width="100%" height={160}>
          <ComposedChart data={gas}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: C.muted }} axisLine={false} tickLine={false} />
            <YAxis
              tick={{ fontSize: 11, fill: C.muted }}
              axisLine={false}
              tickLine={false}
              width={44}
              tickFormatter={(v) => `$${v}`}
            />
            <Tooltip formatter={(v) => [`$${parseFloat(v).toFixed(2)}`, 'Bill']} />
            <Area
              type="monotone"
              dataKey="bill"
              fill={C.gas + '15'}
              stroke={C.gas}
              strokeWidth={2}
              dot={{ r: 3, fill: C.gas }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </Card>
    )}
    {electricity && electricity.length > 0 && (
      <Card>
        <SH title="Electricity Bill Trend" sub="Monthly electricity bill (CAD)" />
        <ResponsiveContainer width="100%" height={160}>
          <ComposedChart data={electricity}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: C.muted }} axisLine={false} tickLine={false} />
            <YAxis
              tick={{ fontSize: 11, fill: C.muted }}
              axisLine={false}
              tickLine={false}
              width={44}
              tickFormatter={(v) => `$${v}`}
            />
            <Tooltip formatter={(v) => [`$${parseFloat(v).toFixed(2)}`, 'Bill']} />
            <Area
              type="monotone"
              dataKey="bill"
              fill={C.elec + '15'}
              stroke={C.elec}
              strokeWidth={2}
              dot={{ r: 3, fill: C.elec }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </Card>
    )}
  </div>
)

export default function App({ onLogout }) {
  const [gasSources, setGasSources] = useState(() => loadFromStorage(STORAGE_KEY_GAS))
  const [elecSources, setElecSources] = useState(() => loadFromStorage(STORAGE_KEY_ELEC))
  const [tab, setTab] = useState('overview')
  const [err, setErr] = useState('')
  const [uploadMsg, setUploadMsg] = useState('')
  const [deployInfo, setDeployInfo] = useState(null)
  const serverSyncDone = useRef(false)

  const gasBills = useMemo(() => mergeAndDedupe(gasSources), [gasSources])
  const elecBills = useMemo(() => mergeAndDedupe(elecSources), [elecSources])

  useEffect(() => {
    let cancelled = false
    fetchRuntimeEnv(API_BASE).then((info) => {
      if (!cancelled && info) setDeployInfo(info)
    })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    let cancelled = false
    fetchDashboardData().then((data) => {
      if (cancelled) return
      if (data && (data.gas.length || data.electricity.length)) {
        setGasSources(data.gas)
        setElecSources(data.electricity)
      }
      serverSyncDone.current = true // allow POST sync from now on
    })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (gasSources.length) saveToStorage(STORAGE_KEY_GAS, gasSources)
    else try { localStorage.removeItem(STORAGE_KEY_GAS) } catch {}
  }, [gasSources])

  useEffect(() => {
    if (elecSources.length) saveToStorage(STORAGE_KEY_ELEC, elecSources)
    else try { localStorage.removeItem(STORAGE_KEY_ELEC) } catch {}
  }, [elecSources])

  useEffect(() => {
    if (!serverSyncDone.current) return
    saveDashboardDataToServer(gasSources, elecSources)
  }, [gasSources, elecSources])

  const handleGas = useCallback((text, name) => {
    try {
      const detected = detectUtilityType(text)
      if (detected === 'electricity') {
        setErr('This file looks like electricity data. Please use the Electricity drop zone.')
        return
      }
      const newBills = parseGasXml(text)
      if (!newBills.length) throw new Error('No billing summaries found.')
      const existingLabels = new Set(mergeAndDedupe(gasSources).map((b) => b.label))
      const added = newBills.filter((b) => !existingLabels.has(b.label)).length
      const skipped = newBills.length - added
      setGasSources((prev) => [...prev, { name, bills: newBills }])
      setErr('')
      setUploadMsg(added ? `Gas: added ${added} period(s) from ${name}${skipped ? ` (${skipped} duplicate(s) kept existing)` : ''}` : `Gas: all ${newBills.length} period(s) from ${name} were duplicates; kept existing data`)
      setTimeout(() => setUploadMsg(''), 4000)
    } catch (e) {
      setErr('Gas: ' + e.message)
    }
  }, [gasSources])

  const handleElec = useCallback((text, name) => {
    try {
      const detected = detectUtilityType(text)
      if (detected === 'gas') {
        setErr('This file looks like gas data. Please use the Gas drop zone.')
        return
      }
      const newBills = parseElectricityXml(text)
      if (!newBills.length) throw new Error('No UsageSummary or IntervalBlock data found.')
      const existingLabels = new Set(mergeAndDedupe(elecSources).map((b) => b.label))
      const added = newBills.filter((b) => !existingLabels.has(b.label)).length
      const skipped = newBills.length - added
      setElecSources((prev) => [...prev, { name, bills: newBills }])
      setErr('')
      setUploadMsg(added ? `Electricity: added ${added} period(s) from ${name}${skipped ? ` (${skipped} duplicate(s) kept existing)` : ''}` : `Electricity: all ${newBills.length} period(s) from ${name} were duplicates; kept existing data`)
      setTimeout(() => setUploadMsg(''), 4000)
    } catch (e) {
      setErr('Electricity: ' + e.message)
    }
  }, [elecSources])

  const clearGas = useCallback(() => {
    setGasSources([])
    try {
      localStorage.removeItem(STORAGE_KEY_GAS)
    } catch {}
  }, [])

  const clearElec = useCallback(() => {
    setElecSources([])
    try {
      localStorage.removeItem(STORAGE_KEY_ELEC)
    } catch {}
  }, [])

  const exportData = useCallback(() => {
    const payload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      gas: { sources: gasSources.map((s) => ({ name: s.name, bills: serializeBills(s.bills) })) },
      electricity: { sources: elecSources.map((s) => ({ name: s.name, bills: serializeBills(s.bills) })) },
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `utility-dashboard-data-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(a.href)
    setUploadMsg('Data exported. Use Import in another browser to restore.')
    setTimeout(() => setUploadMsg(''), 4000)
  }, [gasSources, elecSources])

  const importData = useCallback((file) => {
    if (!file) return
    const r = new FileReader()
    r.onload = () => {
      try {
        const data = JSON.parse(r.result)
        if (!data || typeof data !== 'object') throw new Error('Invalid file')
        const gas = Array.isArray(data.gas?.sources) ? data.gas.sources : []
        const elec = Array.isArray(data.electricity?.sources) ? data.electricity.sources : []
        if (gas.length) {
          const restored = gas.map((s) => ({ name: s.name || 'Imported', bills: deserializeBills(s.bills) })).filter((s) => s.bills.length)
          setGasSources((prev) => [...prev, ...restored])
        }
        if (elec.length) {
          const restored = elec.map((s) => ({ name: s.name || 'Imported', bills: deserializeBills(s.bills) })).filter((s) => s.bills.length)
          setElecSources((prev) => [...prev, ...restored])
        }
        setErr('')
        setUploadMsg(gas.length || elec.length ? `Imported ${gas.length} gas file(s), ${elec.length} electricity file(s). Duplicate periods were kept from existing data.` : 'No data found in file.')
        setTimeout(() => setUploadMsg(''), 5000)
      } catch (e) {
        setErr('Import failed: ' + (e.message || 'invalid file'))
      }
    }
    r.readAsText(file)
  }, [])

  const hasGas = gasBills.length > 0
  const hasElec = elecBills.length > 0
  const hasData = hasGas || hasElec
  const gasNames = gasSources.map((s) => s.name).join(', ')
  const elecNames = elecSources.map((s) => s.name).join(', ')
  const TABS = [
    { id: 'overview', label: 'Overview' },
    { id: 'gas', label: '🔥 Gas', show: hasGas },
    { id: 'electricity', label: '⚡ Electricity', show: hasElec },
  ].filter((t) => t.show !== false)

  return (
    <div style={{ minHeight: '100vh', background: C.bg, fontFamily: 'system-ui, sans-serif', color: C.text }}>
      <div
        style={{
          background: C.card,
          borderBottom: `1px solid ${C.border}`,
          padding: '14px 28px',
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          flexWrap: 'wrap',
        }}
      >
        <div
          style={{
            width: 38,
            height: 38,
            borderRadius: 10,
            background: 'linear-gradient(135deg, #2563eb, #ea580c)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 18,
          }}
        >
          🏠
        </div>
        <div style={{ flex: '1 1 200px', minWidth: 0 }}>
          <div style={{ fontWeight: 800, fontSize: 17 }}>Home Utility Dashboard (JSX)</div>
          <div style={{ fontSize: 11, color: C.muted }}>
            {[gasNames && 'Gas: ' + gasNames, elecNames && 'Electricity: ' + elecNames].filter(Boolean).join(' · ') || 'Upload gas or electricity XML · Data is saved on the server and shared across all browsers'}
          </div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <RuntimeEnvBadge env={deployInfo?.environment} version={deployInfo?.version} />
          {typeof onLogout === 'function' ? (
            <button
              type="button"
              onClick={onLogout}
              style={{
                fontSize: 11,
                fontWeight: 600,
                padding: '5px 10px',
                borderRadius: 6,
                border: '1px solid #d1d5db',
                background: '#fff',
                color: '#4b5563',
                cursor: 'pointer',
              }}
            >
              Log out
            </button>
          ) : null}
        </div>
      </div>

      <div style={{ maxWidth: 1080, margin: '0 auto', padding: '28px 20px' }}>
        <div style={{ display: 'flex', gap: 14, marginBottom: 28, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <DropZone
            label="Gas Energy Usage XML (Enbridge)"
            icon="🔥"
            onFile={handleGas}
            loaded={hasGas}
            accent={C.gas}
          />
          <DropZone
            label="Electricity Usage XML (Green Button)"
            icon="⚡"
            onFile={handleElec}
            loaded={hasElec}
            accent={C.elec}
          />
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {hasData && (
            <button type="button" onClick={exportData} style={{ fontSize: 12, padding: '8px 12px', borderRadius: 8, border: '1px solid #16a34a', background: '#fff', color: '#16a34a', cursor: 'pointer', fontWeight: 600 }}>
              Export data
            </button>
          )}
          <label style={{ fontSize: 12, padding: '8px 12px', borderRadius: 8, border: '1px solid #2563eb', background: '#fff', color: '#2563eb', cursor: 'pointer', fontWeight: 600 }}>
            Import data
            <input type="file" accept=".json,application/json" style={{ display: 'none' }} onChange={(e) => { importData(e.target.files?.[0]); e.target.value = '' }} />
          </label>
          {hasGas && (
            <button type="button" onClick={clearGas} style={{ fontSize: 12, padding: '8px 12px', borderRadius: 8, border: `1px solid ${C.gas}`, background: '#fff', color: C.gas, cursor: 'pointer', fontWeight: 600 }}>
              Clear gas
            </button>
          )}
          {hasElec && (
            <button type="button" onClick={clearElec} style={{ fontSize: 12, padding: '8px 12px', borderRadius: 8, border: `1px solid ${C.elec}`, background: '#fff', color: C.elec, cursor: 'pointer', fontWeight: 600 }}>
              Clear electricity
            </button>
          )}
        </div>
        </div>

        {uploadMsg && (
          <div style={{ background: '#ecfdf5', border: '1px solid #86efac', color: '#166534', borderRadius: 10, padding: '10px 16px', fontSize: 13, marginBottom: 20 }}>
            ✓ {uploadMsg}
          </div>
        )}

        {err && (
          <div
            style={{
              background: '#fef2f2',
              border: '1px solid #fca5a5',
              color: '#991b1b',
              borderRadius: 10,
              padding: '10px 16px',
              fontSize: 13,
              marginBottom: 20,
            }}
          >
            ⚠️ {err}
          </div>
        )}

        {!hasData && (
          <div style={{ textAlign: 'center', padding: '60px 20px' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>📊</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: C.sub, marginBottom: 8 }}>
              Upload gas or electricity XML to get started
            </div>
            <div style={{ fontSize: 13, color: C.muted }}>
              Gas: Enbridge EGD_Gas_EnergyUsage_*.xml · Electricity: Green Button usage XML (same ESPI format)
            </div>
          </div>
        )}

        {hasData && (
          <>
            <div
              style={{
                display: 'flex',
                gap: 4,
                marginBottom: 24,
                background: '#f3f4f6',
                padding: 4,
                borderRadius: 12,
                width: 'fit-content',
              }}
            >
              {TABS.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  style={{
                    padding: '8px 20px',
                    borderRadius: 9,
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: 13,
                    fontWeight: 600,
                    fontFamily: 'inherit',
                    background: tab === t.id ? C.card : 'transparent',
                    color: tab === t.id ? C.text : C.muted,
                    boxShadow: tab === t.id ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
                    transition: 'all 0.15s',
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>
            {tab === 'overview' && <OverviewTab gas={gasBills} electricity={elecBills} />}
            {tab === 'gas' && gasBills.length > 0 && <GasTab bills={gasBills} />}
            {tab === 'electricity' && elecBills.length > 0 && <ElectricityTab bills={elecBills} />}
          </>
        )}
      </div>
    </div>
  )
}
