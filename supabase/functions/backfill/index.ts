import 'jsr:@supabase/functions-js/edge-runtime.d.ts'

/**
 * Full Toast → Supabase backfill (Jan 2024 → today, all 4 locations).
 *
 * Each invocation processes one location × one calendar month, then
 * self-chains to the next chunk via EdgeRuntime.waitUntil + fetch.
 *
 * Invoke with no body to start from the beginning, or pass
 * { locationIndex, year, month } to resume from a specific point.
 */

const NEXT_API = 'https://ohio-liquor-crm-opal.vercel.app'
const LOCATIONS = ['Grandview', 'Gahanna', 'Westerville', 'PO BOX 21']

interface State {
  locationIndex: number
  year: number
  month: number  // 1–12
}

Deno.serve(async (req: Request) => {
  let state: State
  try {
    const body = await req.json()
    state = {
      locationIndex: body.locationIndex ?? 0,
      year: body.year ?? 2024,
      month: body.month ?? 1,
    }
  } catch {
    state = { locationIndex: 0, year: 2024, month: 1 }
  }

  if (state.locationIndex >= LOCATIONS.length) {
    console.log('[backfill] All locations complete.')
    return Response.json({ done: true, message: 'Full backfill complete' })
  }

  // Process this chunk in the background — returns response immediately
  EdgeRuntime.waitUntil(processAndChain(state))

  const location = LOCATIONS[state.locationIndex]
  const mm = String(state.month).padStart(2, '0')
  return Response.json({
    ok: true,
    started: `${location} ${state.year}-${mm}`,
    state,
  })
})

async function processAndChain(state: State): Promise<void> {
  const { locationIndex, year, month } = state
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

    try {
      const res = await fetch(syncUrl.toString(), {
        signal: AbortSignal.timeout(120_000),
      })
      const data = await res.json()
      const r = data.results ?? {}
      console.log(
        `[backfill] ${location} ${year}-${mm}: ` +
        `metrics=${r.metricsRows ?? 0} items=${r.itemSalesRows ?? 0} ` +
        `menu=${r.menuItems ?? 0} errors=${JSON.stringify(r.errors ?? [])}`
      )
    } catch (err) {
      console.error(`[backfill] ${location} ${year}-${mm} FAILED: ${err}`)
      // Continue chain even on error — log and move on
    }
  } else {
    console.log(`[backfill] Skipping ${location} ${year}-${mm} (future date)`)
  }

  const next = advance(state, today)
  if (!next) {
    console.log('[backfill] All locations complete.')
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

/**
 * Returns the next state after the given one, or null when all locations are done.
 * Advances month-by-month; when a location's months are exhausted (next start > today),
 * moves to the next location starting from Jan 2024.
 */
function advance(state: State, today: string): State | null {
  let { locationIndex, year, month } = state

  month++
  if (month > 12) {
    month = 1
    year++
  }

  const nextStart = `${year}-${String(month).padStart(2, '0')}-01`
  if (nextStart > today) {
    // This location is fully caught up — move to the next one
    locationIndex++
    year = 2024
    month = 1
  }

  return locationIndex >= LOCATIONS.length ? null : { locationIndex, year, month }
}
