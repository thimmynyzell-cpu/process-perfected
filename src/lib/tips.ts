// Occasional editor tips: shown at most once per page load and then only
// after a pause, so they help without nagging. Stored per browser.
const KEY = "checklista.optionTip";
const PAUSE_MS = 3 * 24 * 60 * 60 * 1000;
export const TIP_COUNT = 1;

type TipState = { lastShown: number; next: number; off: boolean };

let shownThisLoad = false;

function read(): TipState {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? "null");
    if (s && typeof s.lastShown === "number") return { next: 0, off: false, ...s };
  } catch {
    // storage unavailable or corrupt; treat as never shown
  }
  return { lastShown: 0, next: 0, off: false };
}

function write(s: TipState) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // storage unavailable; the tip may show again next visit
  }
}

/** Returns the index of the tip to show now, or null. Marks it as shown. */
export function takeTip(now = Date.now()): number | null {
  if (shownThisLoad) return null;
  const s = read();
  if (s.off || (s.lastShown > 0 && now - s.lastShown < PAUSE_MS)) return null;
  shownThisLoad = true;
  write({ ...s, lastShown: now, next: (s.next + 1) % TIP_COUNT });
  return s.next % TIP_COUNT;
}

/** Stops tips for good in this browser. */
export function turnOffTips() {
  write({ ...read(), off: true });
}

/** Test helper. */
export function resetTipsForTest() {
  shownThisLoad = false;
}
