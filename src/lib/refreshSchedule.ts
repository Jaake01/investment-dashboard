// Shared by usePrices.ts and useFxRate.ts: both used to auto-refresh on a
// flat 30-minute interval all day (as long as the tab was open), every one
// of those checks burning Twelve Data credits regardless of whether anyone
// was actually watching prices move. Restricted to the hours actually worth
// watching — TW market hours plus the US evening session — and slowed to
// once an hour, since a snapshot every 30 minutes was never actually needed
// to notice a meaningful move.
//
// Ranges are [start, end) in minutes-since-midnight, local time (this is a
// personal single-timezone app, so "local" is just whatever the browser's
// clock says — no separate TZ handling). 21:00–01:00 wraps past midnight,
// so it's listed here as two adjacent ranges instead of one.
const ACTIVE_WINDOWS: Array<[number, number]> = [
  [9 * 60, 14 * 60], // 09:00–14:00
  [21 * 60, 24 * 60], // 21:00–24:00
  [0, 1 * 60], // 00:00–01:00
];

export function isWithinActiveRefreshWindow(date: Date): boolean {
  const minutes = date.getHours() * 60 + date.getMinutes();
  return ACTIVE_WINDOWS.some(([start, end]) => minutes >= start && minutes < end);
}

// How often the scheduler actually calls the refresh function while inside
// an active window. The tick interval below is much shorter than this —
// checking "are we due yet" is free, so it can poll often without touching
// the API; only crossing this threshold triggers a real refresh.
export const SCHEDULED_REFRESH_INTERVAL_MS = 60 * 60_000;

// How often to re-check whether a refresh is due. Short enough that a
// refresh fires promptly after a window opens (e.g. at 09:00) or after the
// hourly threshold passes, without itself costing anything.
export const SCHEDULE_CHECK_INTERVAL_MS = 60_000;
