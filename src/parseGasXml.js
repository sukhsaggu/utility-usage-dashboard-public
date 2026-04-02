/**
 * Parse Green Button (ESPI) usage XML — gas or electricity.
 * Same structure for both: UsageSummary with billingPeriod, billToDate,
 * costAdditionalDetailLastPeriod, and "Usage (unadjusted)" for consumption (m³ or kWh).
 */
const ESPI_NS = 'http://naesb.org/espi'

function getFirst(el, tag) {
  const list = el.getElementsByTagNameNS(ESPI_NS, tag)
  return list.length ? list[0].textContent?.trim() : null
}

/**
 * Detect utility type from XML so we can reject wrong file in wrong drop zone.
 * Returns 'gas' | 'electricity' | null (null = unknown / could be either).
 */
export function detectUtilityType(xmlString) {
  const doc = new DOMParser().parseFromString(xmlString, 'application/xml')
  const entries = doc.getElementsByTagName('entry')

  let hasCommodity7 = false
  let hasCommodity1 = false
  let hasGasNote = false
  let hasElecNote = false
  let hasEnbridgeLink = false

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]
    const content = entry.getElementsByTagName('content')[0]
    if (!content) continue

    const commodityEls = content.getElementsByTagNameNS(ESPI_NS, 'commodity')
    for (let c = 0; c < commodityEls.length; c++) {
      const v = commodityEls[c].textContent?.trim()
      if (v === '7') hasCommodity7 = true
      if (v === '1') hasCommodity1 = true
    }

    const notes = content.getElementsByTagNameNS(ESPI_NS, 'note')
    for (let n = 0; n < notes.length; n++) {
      const text = (notes[n].textContent || '').trim()
      if (/Gas\s+(Supply|Delivery|Federal|Transportation|Cost|Service|Charges)/i.test(text) || /Enbridge/i.test(text)) hasGasNote = true
      if (/TOU\s+(On|Off|Mid)\s*Peak/i.test(text) || /Ontario Electricity Rebate/i.test(text) || /Delivery charge/i.test(text)) hasElecNote = true
    }

    const links = entry.getElementsByTagName('link')
    for (let L = 0; L < links.length; L++) {
      const href = (links[L].getAttribute('href') || '').toLowerCase()
      if (href.includes('enbridgegas') || href.includes('enbridge')) hasEnbridgeLink = true
    }
  }

  if (hasCommodity7 || hasGasNote || hasEnbridgeLink) return 'gas'
  if (hasCommodity1 || hasElecNote) return 'electricity'
  return null
}

function parseGasXml(xmlString) {
  const doc = new DOMParser().parseFromString(xmlString, 'application/xml')
  const bills = []
  const entries = doc.getElementsByTagName('entry')

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]
    const content = entry.getElementsByTagName('content')[0]
    if (!content) continue

    const usList = content.getElementsByTagNameNS(ESPI_NS, 'UsageSummary')
    if (!usList.length) continue

    const us = usList[0]
    const bp = us.getElementsByTagNameNS(ESPI_NS, 'billingPeriod')[0]
    const bpStart = bp ? parseInt(getFirst(bp, 'start') || '0', 10) : 0
    const bpDur = bp ? parseInt(getFirst(bp, 'duration') || '0', 10) : 0
    if (!bpStart) continue

    const billRaw = getFirst(us, 'billToDate') || getFirst(us, 'billLastPeriod') || '0'
    const bill = parseInt(billRaw, 10) / 1000

    let m3 = 0
    const consumEls = us.getElementsByTagNameNS(ESPI_NS, 'currentBillingPeriodOverAllConsumption')
    if (consumEls.length) {
      const val = consumEls[0].getElementsByTagNameNS(ESPI_NS, 'value')[0]?.textContent
      if (val) m3 = parseInt(val, 10) / 1000
    }
    if (m3 === 0) {
      const details = us.getElementsByTagNameNS(ESPI_NS, 'costAdditionalDetailLastPeriod')
      for (let d = 0; d < details.length; d++) {
        const note = getFirst(details[d], 'note')
        if (note === 'Usage (unadjusted)') {
          const meas = details[d].getElementsByTagNameNS(ESPI_NS, 'measurement')[0]
          if (meas) {
            const valEl = meas.getElementsByTagNameNS(ESPI_NS, 'value')[0]
            const multEl = meas.getElementsByTagNameNS(ESPI_NS, 'powerOfTenMultiplier')[0]
            if (valEl?.textContent) {
              const v = parseInt(valEl.textContent, 10)
              const mult = multEl?.textContent ? parseInt(multEl.textContent, 10) : -3
              m3 = v * Math.pow(10, mult)
              break
            }
          }
        }
      }
    }

    const charges = {}
    const costDetails = us.getElementsByTagNameNS(ESPI_NS, 'costAdditionalDetailLastPeriod')
    for (let c = 0; c < costDetails.length; c++) {
      const note = getFirst(costDetails[c], 'note')
      const amountEl = costDetails[c].getElementsByTagNameNS(ESPI_NS, 'amount')[0]
      if (note && amountEl?.textContent) {
        charges[note] = parseInt(amountEl.textContent, 10) / 1000
      }
    }

    const date = new Date(bpStart * 1000)
    const label = date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
    const days = Math.round(bpDur / 86400)
    bills.push({ date, label, m3, bill, charges, days })
  }

  bills.sort((a, b) => a.date - b.date)
  const seen = new Map()
  bills.forEach((b) => seen.set(b.label, b))
  return [...seen.values()].sort((a, b) => a.date - b.date)
}

/**
 * Parse electricity XML that only has IntervalBlock/IntervalReading (no UsageSummary).
 * Returns same bill shape: { date, label, m3 (kWh), bill: 0, charges: {}, days } aggregated by month.
 */
function parseElectricityIntervalXml(xmlString) {
  const doc = new DOMParser().parseFromString(xmlString, 'application/xml')
  const readings = []
  const entries = doc.getElementsByTagName('entry')

  for (let i = 0; i < entries.length; i++) {
    const content = entries[i].getElementsByTagName('content')[0]
    if (!content) continue

    const blockList = content.getElementsByTagNameNS(ESPI_NS, 'IntervalBlock')
    if (!blockList.length) continue

    const block = blockList[0]
    const intervalEl = block.getElementsByTagNameNS(ESPI_NS, 'interval')[0]
    const durationEl = intervalEl?.getElementsByTagNameNS(ESPI_NS, 'duration')[0]
    const startEl = intervalEl?.getElementsByTagNameNS(ESPI_NS, 'start')[0]
    const duration = durationEl?.textContent ? parseInt(durationEl.textContent, 10) : 0
    const blockStart = startEl?.textContent ? parseInt(startEl.textContent, 10) : 0

    const intervalReadings = block.getElementsByTagNameNS(ESPI_NS, 'IntervalReading')
    for (let r = 0; r < intervalReadings.length; r++) {
      const ir = intervalReadings[r]
      const tp = ir.getElementsByTagNameNS(ESPI_NS, 'timePeriod')[0]
      const startTs = tp ? parseInt(getFirst(tp, 'start') || '0', 10) : blockStart
      const valEl = ir.getElementsByTagNameNS(ESPI_NS, 'value')[0]
      const rawVal = valEl?.textContent ? parseInt(valEl.textContent, 10) : 0
      const valueKwh = rawVal / 1000
      if (startTs) readings.push({ start_ts: startTs, value_kwh: valueKwh })
    }
  }

  if (!readings.length) return []

  const byMonth = new Map()
  for (const r of readings) {
    const d = new Date(r.start_ts * 1000)
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
    if (!byMonth.has(key)) byMonth.set(key, { total: 0, start: r.start_ts })
    byMonth.get(key).total += r.value_kwh
  }

  const bills = []
  for (const [key, data] of byMonth.entries()) {
    const [y, m] = key.split('-').map(Number)
    const date = new Date(Date.UTC(y, m - 1, 1))
    const daysInMonth = new Date(y, m, 0).getDate()
    const label = date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
    bills.push({
      date,
      label,
      m3: Math.round(data.total * 10) / 10,
      bill: 0,
      charges: {},
      days: daysInMonth,
    })
  }
  return bills.sort((a, b) => a.date - b.date)
}

/**
 * Parse electricity XML: tries UsageSummary first (billing data), then IntervalBlock (interval data).
 */
export function parseElectricityXml(xmlString) {
  const fromSummary = parseGasXml(xmlString)
  if (fromSummary.length > 0) return fromSummary
  return parseElectricityIntervalXml(xmlString)
}

export default parseGasXml
