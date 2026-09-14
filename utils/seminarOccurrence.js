const IST_OFFSET_MS = 330 * 60 * 1000;

/**
 * Normalizes a schedule into day+time slots. `slots` is authoritative; when it's
 * empty we derive slots from the legacy daysOfWeek + single time, so seminars
 * saved before per-day times keep resolving exactly as they did.
 */
function getScheduleSlots(schedule) {
  const sch = schedule || {};
  const fallbackDuration = Number(sch.durationMinutes) || 60;

  if (Array.isArray(sch.slots) && sch.slots.length) {
    return sch.slots
      .filter((s) => s && Number.isInteger(s.dayOfWeek) && s.dayOfWeek >= 0 && s.dayOfWeek <= 6)
      .map((s) => ({
        dayOfWeek: s.dayOfWeek,
        time: String(s.time || '19:00').trim(),
        durationMinutes: Number(s.durationMinutes) || fallbackDuration,
      }));
  }

  const days = Array.isArray(sch.daysOfWeek) ? sch.daysOfWeek : [];
  return days
    .filter((d) => Number.isFinite(d) && d >= 0 && d <= 6)
    .map((d) => ({
      dayOfWeek: d,
      time: String(sch.time || '19:00').trim(),
      durationMinutes: fallbackDuration,
    }));
}

/**
 * Soonest occurrence across all slots, in UTC.
 *
 * An occurrence that has already STARTED but not yet ended stays current — it is
 * only rolled to next week once start + duration has passed. Without that, a
 * seminar vanished from the app the moment it began and `is_live` could never
 * be true.
 */
function buildNextOccurrenceUTC({ now, schedule }) {
  const slots = getScheduleSlots(schedule);
  if (!slots.length) return null;

  // "now" in IST components using fixed offset (India has no DST)
  const istNow = new Date(now.getTime() + IST_OFFSET_MS);
  const baseY = istNow.getUTCFullYear();
  const baseM = istNow.getUTCMonth();
  const baseD = istNow.getUTCDate();
  const todayDowIST = istNow.getUTCDay();
  const timeNowMinutes = istNow.getUTCHours() * 60 + istNow.getUTCMinutes();

  let best = null;

  for (const slot of slots) {
    const [hh, mm] = String(slot.time).split(':').map((x) => Number(x));
    const hour = Number.isFinite(hh) ? hh : 19;
    const minute = Number.isFinite(mm) ? mm : 0;
    const duration = Number(slot.durationMinutes) || 60;
    const targetMinutes = hour * 60 + minute;

    let diff = (slot.dayOfWeek - todayDowIST + 7) % 7;
    // Roll to next week only once this occurrence has actually finished
    if (diff === 0 && timeNowMinutes >= targetMinutes + duration) diff = 7;

    // Build the IST datetime as UTC fields (we shifted into IST context above),
    // then subtract the offset to get back to real UTC.
    const istTarget = new Date(Date.UTC(baseY, baseM, baseD + diff, hour, minute, 0, 0));
    const startUTC = new Date(istTarget.getTime() - IST_OFFSET_MS);
    const endUTC = new Date(startUTC.getTime() + duration * 60 * 1000);

    if (!best || startUTC < best.startUTC) {
      best = { startUTC, endUTC, durationMinutes: duration };
    }
  }

  return best;
}

module.exports = { getScheduleSlots, buildNextOccurrenceUTC, IST_OFFSET_MS };
