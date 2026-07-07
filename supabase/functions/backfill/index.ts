import 'jsr:@supabase/functions-js/edge-runtime.d.ts'

/**
 * Full Toast → Supabase backfill orchestrator — runs entirely on Supabase.
 *
 * Each invocation processes one location × one calendar month via a Vercel
 * API call (which holds the Toast credentials), then self-chains to the next
 * chunk via EdgeRuntime.waitUntil + fetch.
 *
 * Each chain stays on its assigned locationIndex and stops when months are
 * exhausted (or endYear/endMonth is reached). Trigger separate chains for
 * each location and non-contiguous date range.
 *
 * Invoke: { locationIndex, year, month, step?, endYear?, endMonth? }
 *   step: 'metrics' (default) | 'items' | 'all'
 *   endYear + endMonth: optional inclusive stop (omit → run through today)
 */

const NEXT_API = 'https://ohio-liquor-crm-opal.vercel.app'
const LOCATIONS = ['Grandview', 'Gahanna', 'Westerville', 'PO BOX 21']

interface State {
  locationIndex: number
  year: number
  month: number
  step: string
  endYear?: number  // inclusive stop; omit = run through today
  endMonth?: number
}

Deno.serve(async (req: Request) => {
  let state: State
  try {
    const body = await req.json()
    state = {
      locationIndex: body.locationIndex ?? 0,
      year: body.year ?? 2024,
      month: body.month ?? 1,
      step: body.step ?? 'metrics',
      endYear: body.endYear,
      endMonth: body.endMonth,
    }
  } catch {
    state = { locationIndex: 0, year: 2024, month: 1, step: 'metrics' }
  }

  if (state.locationIndex >= LOCATIONS.length) {
    console.log('[backfill] locationIndex out of range — done.')
    return Response.json({ done: true, message: 'locationIndex out of range' })
  }

  EdgeRuntime.waitUntil(processAndChain(state))

  const location = LOCATIONS[state.locationIndex]
  const mm = String(state.month).padStart(2, '0')
  return Response.json({
    ok: true,
    started: `${location} ${state.year}-${mm} (step=${state.step})`,
    state,
  })
})

async function processAndChain(state: State): Promise<void> {
  const { locationIndex, year, month, step = 'metrics' } = state
  const location = LOCATIONS[locationIndex]
  const today = new Date().toISOString().slice(0, 10)

  const mm = String(month).padStart(2, '0')
  const startDate = `${year}-${mm}-01`
  const lastDay = new Date(year, month, 0).getDate()
  const rawEnd = `${year}-${mm}-${String(lastDay).padStart(2, '0')}`
  const endDate = rawEnd > today ? today : rawEnd

  if (startDate <= today) {
    const syncUrl = new URL(`${NEXT_API}/api/toast-sync`)
    syncUrl.searchParams.set('mode', 'backfill')
    syncUrl.searchParams.set('location', location)
    syncUrl.searchParams.set('startDate', startDate)
    syncUrl.searchParams.set('endDate', endDate)
    if (step !== 'all') syncUrl.searchParams.set('step', step)

    try {
      // 270s — enough headroom for Toast 429 retries (20s+40s) inside Vercel's 300s budget
      const res = await fetch(syncUrl.toString(), {
        signal: AbortSignal.timeout(270_000),
      })
      const data = await res.json()
      const r = data.results ?? {}
      console.log(
        `[backfill] ${location} ${year}-${mm} (${step}): ` +
        `metrics=${r.metricsRows ?? 0} items=${r.itemSalesRows ?? 0} ` +
        `menu=${r.menuItems ?? 0} errors=${JSON.stringify(r.errors ?? [])}`
      )
    } catch (err) {
      console.error(`[backfill] ${location} ${year}-${mm} FAILED: ${err}`)
    }
  } else {
    console.log(`[backfill] Skipping ${location} ${year}-${mm} (future date)`)
  }

  // 5-minute pause before chaining — keeps Toast API call rate well below 429 threshold
  await new Promise(r => setTimeout(r, 300_000))

  const next = advance(state, today)
  if (!next) {
    console.log(`[backfill] Chain for ${location} complete (reached end).`)
    return
  }

  const selfUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/backfill`
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  try {
    const chainRes = await fetch(selfUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify(next),
    })
    const chainData = await chainRes.json()
    console.log(`[backfill] Chained → ${JSON.stringify(next)}: ${JSON.stringify(chainData)}`)
  } catch (err) {
    console.error(`[backfill] Chain failed for ${JSON.stringify(next)}: ${err}`)
  }
}

// Advances month within the same locationIndex; returns null when done.
function advance(state: State, today: string): State | null {
  let { locationIndex, year, month } = state
  const step = state.step ?? 'metrics'

  month++
  if (month > 12) { month = 1; year++ }

  // Respect optional end date (inclusive)
  if (state.endYear != null && state.endMonth != null) {
    if (year > state.endYear || (year === state.endYear && month > state.endMonth)) {
      return null
    }
  }

  const nextStart = `${year}-${String(month).padStart(2, '0')}-01`
  if (nextStart > today) return null

  return { locationIndex, year, month, step, endYear: state.endYear, endMonth: state.endMonth }
}
