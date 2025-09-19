import { toZonedTime, fromZonedTime } from 'date-fns-tz';

/**
 * Calculates night hours overlap between a work period and night shift window
 * in the specified timezone, handling DST and midnight crossing
 */
export function calcNightMinutesLocal(
  startUTC: Date,
  endUTC: Date,
  nightStart: string, // e.g. "22:00:00" or "21:30"
  nightEnd: string,   // e.g. "05:00:00" or "06:00"
  tz = 'Europe/Rome'
): number {
  if (!startUTC || !endUTC || endUTC <= startUTC) return 0;

  const hhmm = (t: string) => {
    const [h = '0', m = '0'] = t.split(':');
    return { h: Number(h), m: Number(m) };
  };

  const mkUtc = (dayLocal: Date, t: string) => {
    const { h, m } = hhmm(t);
    const local = new Date(dayLocal);
    local.setHours(h, m, 0, 0); // local time
    return fromZonedTime(local, tz);
  };

  let minutes = 0;
  let cursorUTC = startUTC;

  while (cursorUTC < endUTC) {
    const local = toZonedTime(cursorUTC, tz);
    const dayLocal = new Date(local); 
    dayLocal.setHours(0, 0, 0, 0);
    const nextDayLocal = new Date(dayLocal); 
    nextDayLocal.setDate(dayLocal.getDate() + 1);

    const sameDayWindow = (ns: string, ne: string) => {
      const aUTC = mkUtc(dayLocal, ns);
      const bUTC = mkUtc(dayLocal, ne);
      const a = aUTC > startUTC ? aUTC : startUTC;
      const b = bUTC < endUTC ? bUTC : endUTC;
      if (b > a) minutes += (b.getTime() - a.getTime()) / 60000;
    };

    const crossMidnightWindow = (ns: string, ne: string) => {
      // [ns, 24:00)
      const a1UTC = mkUtc(dayLocal, ns);
      const b1UTC = fromZonedTime(nextDayLocal, tz); // 24:00 local
      const a1 = a1UTC > startUTC ? a1UTC : startUTC;
      const b1 = b1UTC < endUTC ? b1UTC : endUTC;
      if (b1 > a1) minutes += (b1.getTime() - a1.getTime()) / 60000;

      // [00:00, ne] (always of current "dayLocal")
      const a2UTC = fromZonedTime(dayLocal, tz); // 00:00 local
      const b2UTC = mkUtc(dayLocal, ne);
      const a2 = a2UTC > startUTC ? a2UTC : startUTC;
      const b2 = b2UTC < endUTC ? b2UTC : endUTC;
      if (b2 > a2) minutes += (b2.getTime() - a2.getTime()) / 60000;
    };

    // Normalize HH:mm:ss -> HH:mm
    const ns = nightStart.slice(0, 5);
    const ne = nightEnd.slice(0, 5);

    if (ns <= ne) sameDayWindow(ns, ne);
    else crossMidnightWindow(ns, ne);

    // next local day
    cursorUTC = fromZonedTime(nextDayLocal, tz);
  }

  return minutes;
}