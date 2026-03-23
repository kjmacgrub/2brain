const ICAL_URLS = [
  'https://p39-caldav.icloud.com/published/2/OTE4MDI4ODg5MTgwMjg4OOCp0P2o51yKGRORXO0xc4HyjC3W4P9EV3FXSHNqIKWQBV_YFH16bccEUEs0TnhTnfqO1_fYkPCNWuSCSgqaOJc',
  'https://p39-caldav.icloud.com/published/2/OTE4MDI4ODg5MTgwMjg4OOCp0P2o51yKGRORXO0xc4EE1NvuaNNxXLZ6yNRNsAUckvSs04SHBDah1_5nyRvqbpVWPrAc8Wn25RWZ-jq-zHI',
];

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET',
  'Access-Control-Allow-Headers': 'apikey, Authorization',
};

interface CalEvent {
  date: string;     // YYYY-MM-DD start
  endDate: string;  // YYYY-MM-DD end (exclusive for all-day per RFC 5545)
  title: string;
  allDay: boolean;
  startTime?: string; // HH:MM
  endTime?: string;
}

interface RawEvent {
  uid: string;
  summary: string;
  dtstart: string;       // raw iCal value
  dtend?: string;
  rrule?: string;
  exdates: string[];     // raw iCal values
  recurrenceId?: string; // raw iCal value — marks this as an override
  allDay: boolean;
  startDate: string;     // YYYY-MM-DD
  startTime?: string;    // HH:MM
  endDate: string;
  endTime?: string;
}

function parseDateVal(val: string): { date: string; time?: string; allDay: boolean; raw: string } {
  const raw = val.replace(/Z$/, '');
  const dateOnly = /^(\d{4})(\d{2})(\d{2})$/.exec(raw);
  if (dateOnly) {
    return { date: `${dateOnly[1]}-${dateOnly[2]}-${dateOnly[3]}`, allDay: true, raw };
  }
  const dateTime = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})/.exec(raw);
  if (dateTime) {
    return {
      date: `${dateTime[1]}-${dateTime[2]}-${dateTime[3]}`,
      time: `${dateTime[4]}:${dateTime[5]}`,
      allDay: false,
      raw,
    };
  }
  return { date: val, allDay: true, raw };
}

function toDateKey(raw: string): string {
  // Convert raw iCal date value to YYYY-MM-DD for comparison
  return parseDateVal(raw).date;
}

function parseRrule(rrule: string): { freq: string; interval: number; until?: string; count?: number } {
  const parts: Record<string, string> = {};
  for (const p of rrule.split(';')) {
    const [k, v] = p.split('=');
    parts[k] = v;
  }
  return {
    freq: parts['FREQ'] || 'DAILY',
    interval: parseInt(parts['INTERVAL'] || '1', 10),
    until: parts['UNTIL'],
    count: parts['COUNT'] ? parseInt(parts['COUNT'], 10) : undefined,
  };
}

function expandRecurrence(ev: RawEvent, windowStart: Date, windowEnd: Date): CalEvent[] {
  if (!ev.rrule) return [];

  const rule = parseRrule(ev.rrule);
  const results: CalEvent[] = [];
  const exdateSet = new Set(ev.exdates.map(toDateKey));

  // Duration in days between start and end
  const s0 = new Date(ev.startDate + 'T12:00:00');
  const e0 = new Date(ev.endDate + 'T12:00:00');
  const durationDays = Math.round((e0.getTime() - s0.getTime()) / 86400000);

  let until: Date | null = null;
  if (rule.until) {
    const u = parseDateVal(rule.until);
    until = new Date(u.date + 'T23:59:59');
  }

  const maxOccurrences = rule.count || 520; // ~10 years of weekly
  const cursor = new Date(s0);
  let count = 0;

  while (count < maxOccurrences) {
    if (until && cursor > until) break;
    if (cursor > windowEnd) break;

    const curDate = cursor.toISOString().substring(0, 10);

    if (cursor >= windowStart && !exdateSet.has(curDate)) {
      const endD = new Date(cursor);
      endD.setDate(endD.getDate() + durationDays);
      results.push({
        date: curDate,
        endDate: endD.toISOString().substring(0, 10),
        title: ev.summary,
        allDay: ev.allDay,
        startTime: ev.startTime,
        endTime: ev.endTime,
      });
    }

    count++;

    // Advance cursor
    switch (rule.freq) {
      case 'DAILY':
        cursor.setDate(cursor.getDate() + rule.interval);
        break;
      case 'WEEKLY':
        cursor.setDate(cursor.getDate() + 7 * rule.interval);
        break;
      case 'MONTHLY':
        cursor.setMonth(cursor.getMonth() + rule.interval);
        break;
      case 'YEARLY':
        cursor.setFullYear(cursor.getFullYear() + rule.interval);
        break;
      default:
        cursor.setDate(cursor.getDate() + rule.interval);
    }
  }

  return results;
}

function parseIcal(text: string): CalEvent[] {
  const blocks = text.split('BEGIN:VEVENT');
  const rawEvents: RawEvent[] = [];

  // First pass: parse all VEVENTs
  for (let i = 1; i < blocks.length; i++) {
    // Stop at END:VEVENT to avoid leaking VTIMEZONE properties into events
    const veventBody = blocks[i].split('END:VEVENT')[0];
    const unfolded = veventBody.replace(/\r?\n[ \t]/g, '');
    const props: Record<string, string> = {};
    const exdates: string[] = [];

    for (const line of unfolded.split(/\r?\n/)) {
      const m = line.match(/^([A-Z-]+)(?:;[^:]+)?:(.*)$/);
      if (m) {
        if (m[1] === 'EXDATE') {
          // Can have multiple EXDATE lines, each with comma-separated values
          exdates.push(...m[2].trim().split(','));
        } else {
          props[m[1]] = m[2].trim();
        }
      }
    }

    if (!props['DTSTART'] || !props['SUMMARY']) continue;

    const start = parseDateVal(props['DTSTART']);
    const end = props['DTEND'] ? parseDateVal(props['DTEND']) : start;

    rawEvents.push({
      uid: props['UID'] || '',
      summary: props['SUMMARY']
        .replace(/\\,/g, ',')
        .replace(/\\n/g, ' ')
        .replace(/\\/g, ''),
      dtstart: props['DTSTART'],
      dtend: props['DTEND'],
      rrule: props['RRULE'],
      exdates,
      recurrenceId: props['RECURRENCE-ID'],
      allDay: start.allDay,
      startDate: start.date,
      startTime: start.time,
      endDate: end.date,
      endTime: end.time,
    });
  }

  // Separate base events from overrides
  const baseEvents = rawEvents.filter(e => !e.recurrenceId);
  const overrides = rawEvents.filter(e => !!e.recurrenceId);

  // Build override map: uid -> { overriddenDate -> override event }
  const overrideMap = new Map<string, Map<string, RawEvent>>();
  for (const ov of overrides) {
    if (!overrideMap.has(ov.uid)) overrideMap.set(ov.uid, new Map());
    const origDate = toDateKey(ov.recurrenceId!);
    overrideMap.get(ov.uid)!.set(origDate, ov);
  }

  // Expansion window: 6 months back to 1 year forward
  const now = new Date();
  const windowStart = new Date(now);
  windowStart.setMonth(windowStart.getMonth() - 6);
  const windowEnd = new Date(now);
  windowEnd.setFullYear(windowEnd.getFullYear() + 1);

  const results: CalEvent[] = [];

  for (const ev of baseEvents) {
    if (ev.rrule) {
      // Expand recurrence
      const occurrences = expandRecurrence(ev, windowStart, windowEnd);
      const uidOverrides = overrideMap.get(ev.uid);

      for (const occ of occurrences) {
        if (uidOverrides?.has(occ.date)) {
          // This occurrence was moved — replace with override
          const ov = uidOverrides.get(occ.date)!;
          results.push({
            date: ov.startDate,
            endDate: ov.endDate,
            title: ov.summary,
            allDay: ov.allDay,
            startTime: ov.startTime,
            endTime: ov.endTime,
          });
        } else {
          results.push(occ);
        }
      }
    } else {
      // Single event, no recurrence
      results.push({
        date: ev.startDate,
        endDate: ev.endDate,
        title: ev.summary,
        allDay: ev.allDay,
        startTime: ev.startTime,
        endTime: ev.endTime,
      });
    }
  }

  return results;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS });
  }

  try {
    const month = new URL(req.url).searchParams.get('month'); // YYYY-MM, optional

    const texts = await Promise.all(ICAL_URLS.map(async url => {
      try {
        const res = await fetch(`${url}?_=${Date.now()}`, { cache: 'no-store' });
        return res.ok ? await res.text() : '';
      } catch { return ''; }
    }));

    let events = texts.flatMap(parseIcal);

    if (month) {
      const monthStart = month + '-01';
      const monthEnd   = month + '-31';
      events = events.filter(e => e.date <= monthEnd && (e.endDate || e.date) >= monthStart);
    }

    return new Response(JSON.stringify({ events }), {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...CORS },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...CORS },
    });
  }
});
