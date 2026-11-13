#!/usr/bin/env node
// Builds the card show pages: /shows/ (states with counts), /shows/<state>/ (that state's
// upcoming shows by month) and /shows/<state>/<show>/ (one show: all its upcoming dates), then
// refreshes their entries in sitemap.xml. Node built-ins only. Runs daily from
// .github/workflows/shows.yml.
//
// A show is one name (tidied) in one city and state. Its page's folder name is made once, from
// name and city, and then read back from the page itself (data-show-key) on every later run, so
// URLs never move. A show with no upcoming dates keeps its page (no dead links, Pages can't
// redirect): the dates give way to one line and a link to its state.
//
// Reads with the public anon key only, through the app database's read-only function
// site_upcoming_shows() (approved shows that are not over yet, public columns only).
// Env: SUPABASE_URL, SUPABASE_ANON_KEY.
//
// A page whose shows didn't change is left exactly as it was (its Updated date too), so a day
// with no changes commits nothing. A read that looks wrong (fewer than --min shows) stops
// before anything is written.
//
// Flags:
//   --data <file>          rows as JSON (array or {shows}) instead of the network
//   --today YYYY-MM-DD     the date to build for (default: today in Hawaii, the last US zone)
//   --root <dir>           site folder (default: this repo)
//   --thumbs               make missing flyer thumbnails (needs ImageMagick or macOS sips)
//   --flyer-prefix <url>   flyer URLs must start with this (default: the project's show-flyers bucket)
//   --min <n>              fewest shows a good read can have (default 100)
//   --report <file>        write the data report as JSON
//   --allow-drop           build even if far fewer shows have dates than last run

import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync, rmSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';

const SITE = 'https://gettracka.com';
const STORE = (ct) => `https://apps.apple.com/app/apple-store/id6778956833?pt=129011221&ct=${ct}&mt=8`;
const CSS_V = 3;
const JS_V = 2;
const THUMB_W = 216; // 72 css px at 3x

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : null;
};
const has = (name) => args.includes(`--${name}`);

const ROOT = resolve(flag('root') || join(dirname(fileURLToPath(import.meta.url)), '..'));
const TODAY =
  flag('today') ||
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Pacific/Honolulu', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const MIN_SHOWS = Number(flag('min') || 100);
const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const FLYER_PREFIX = flag('flyer-prefix') || (SUPABASE_URL ? `${SUPABASE_URL}/storage/v1/object/public/show-flyers/` : null);

const STATES = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado', CT: 'Connecticut',
  DE: 'Delaware', DC: 'Washington DC', FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois',
  IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland',
  MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri', MT: 'Montana',
  NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York',
  NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania',
  RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah',
  VT: 'Vermont', VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming',
};

const NEIGHBORS = {
  AL: 'FL GA MS TN', AK: 'WA', AZ: 'CA CO NM NV UT', AR: 'LA MO MS OK TN TX', CA: 'AZ NV OR', CO: 'AZ KS NE NM OK UT WY',
  CT: 'MA NY RI', DE: 'MD NJ PA', DC: 'MD VA', FL: 'AL GA', GA: 'AL FL NC SC TN', HI: 'CA', ID: 'MT NV OR UT WA WY',
  IL: 'IN IA KY MO WI', IN: 'IL KY MI OH', IA: 'IL MN MO NE SD WI', KS: 'CO MO NE OK', KY: 'IL IN MO OH TN VA WV',
  LA: 'AR MS TX', ME: 'NH', MD: 'DC DE PA VA WV', MA: 'CT NH NY RI VT', MI: 'IN OH WI', MN: 'IA ND SD WI',
  MS: 'AL AR LA TN', MO: 'AR IL IA KS KY NE OK TN', MT: 'ID ND SD WY', NE: 'CO IA KS MO SD WY', NV: 'AZ CA ID OR UT',
  NH: 'MA ME VT', NJ: 'DE NY PA', NM: 'AZ CO OK TX UT', NY: 'CT MA NJ PA VT', NC: 'GA SC TN VA', ND: 'MN MT SD',
  OH: 'IN KY MI PA WV', OK: 'AR CO KS MO NM TX', OR: 'CA ID NV WA', PA: 'DE MD NJ NY OH WV', RI: 'CT MA',
  SC: 'GA NC', SD: 'IA MN MT ND NE WY', TN: 'AL AR GA KY MO MS NC VA', TX: 'AR LA NM OK', UT: 'AZ CO ID NM NV WY',
  VT: 'MA NH NY', VA: 'DC KY MD NC TN WV', WA: 'ID OR', WV: 'KY MD OH PA VA', WI: 'IA IL MI MN', WY: 'CO ID MT NE SD UT',
};

// Each state's main time zone. Split states take the other zone where the show's pin says so.
const TZ = {
  AL: 'America/Chicago', AK: 'America/Anchorage', AZ: 'America/Phoenix', AR: 'America/Chicago', CA: 'America/Los_Angeles',
  CO: 'America/Denver', CT: 'America/New_York', DE: 'America/New_York', DC: 'America/New_York', FL: 'America/New_York',
  GA: 'America/New_York', HI: 'Pacific/Honolulu', ID: 'America/Boise', IL: 'America/Chicago', IN: 'America/Indiana/Indianapolis',
  IA: 'America/Chicago', KS: 'America/Chicago', KY: 'America/New_York', LA: 'America/Chicago', ME: 'America/New_York',
  MD: 'America/New_York', MA: 'America/New_York', MI: 'America/Detroit', MN: 'America/Chicago', MS: 'America/Chicago',
  MO: 'America/Chicago', MT: 'America/Denver', NE: 'America/Chicago', NV: 'America/Los_Angeles', NH: 'America/New_York',
  NJ: 'America/New_York', NM: 'America/Denver', NY: 'America/New_York', NC: 'America/New_York', ND: 'America/Chicago',
  OH: 'America/New_York', OK: 'America/Chicago', OR: 'America/Los_Angeles', PA: 'America/New_York', RI: 'America/New_York',
  SC: 'America/New_York', SD: 'America/Chicago', TN: 'America/Chicago', TX: 'America/Chicago', UT: 'America/Denver',
  VT: 'America/New_York', VA: 'America/New_York', WA: 'America/Los_Angeles', WV: 'America/New_York', WI: 'America/Chicago',
  WY: 'America/Denver',
};

function timeZone(s) {
  const lat = s.latitude;
  const lon = s.longitude;
  if (typeof lat === 'number' && typeof lon === 'number') {
    switch (s.state) {
      case 'TX': if (lon < -104.9) return 'America/Denver'; break;
      case 'FL': if (lon < -85.0 && lat > 29.6) return 'America/Chicago'; break;
      case 'TN': if (lon > -84.9 || (lon > -85.5 && lat < 35.3)) return 'America/New_York'; break;
      case 'KY': if (lon < -86.0) return 'America/Chicago'; break;
      case 'IN': if (lon < -86.9 && (lat > 41.0 || lat < 38.4)) return 'America/Chicago'; break;
      case 'MI': if (lon < -87.5 && lat > 45.5) return 'America/Chicago'; break;
      case 'ID': if (lat > 45.9) return 'America/Los_Angeles'; break;
      case 'ND': if (lon < -101.5 && lat < 47.5) return 'America/Denver'; break;
      case 'SD': if (lon < -100.5) return 'America/Denver'; break;
      case 'NE': if (lon < -101.4) return 'America/Denver'; break;
      case 'KS': if (lon < -101.5) return 'America/Denver'; break;
    }
  }
  return TZ[s.state];
}

// "+HH:MM" for a wall clock time in a zone, DST included.
function offsetFor(tz, iso, hhmm) {
  const [y, m, d] = iso.split('-').map(Number);
  const [h, mi] = hhmm.split(':').map(Number);
  const wall = Date.UTC(y, m - 1, d, h, mi);
  const offsetAt = (t) => {
    const name = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'longOffset' })
      .formatToParts(new Date(t))
      .find((p) => p.type === 'timeZoneName').value; // "GMT-07:00" or "GMT"
    const mm = /GMT([+-])(\d{2}):(\d{2})/.exec(name);
    return mm ? (mm[1] === '-' ? -1 : 1) * (Number(mm[2]) * 60 + Number(mm[3])) : 0;
  };
  let off = offsetAt(wall);
  off = offsetAt(wall - off * 60000);
  const sign = off < 0 ? '-' : '+';
  const a = Math.abs(off);
  return `${sign}${String(Math.floor(a / 60)).padStart(2, '0')}:${String(a % 60).padStart(2, '0')}`;
}

// ---------- text ----------

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const unesc = (s) => String(s).replace(/&quot;/g, '"').replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&amp;/g, '&');

// Shortens at a word break, with an ellipsis.
function cut(text, n) {
  if (text.length <= n) return text;
  const at = text.lastIndexOf(' ', n - 1);
  return `${text.slice(0, at > n / 2 ? at : n - 1).replace(/[\s,;:·-]+$/, '')}…`;
}

const slugify = (s) =>
  String(s)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['’`]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const KEEP_CAPS = new Set(
  'TCG TCGS PSA BGS CGC VFW USA NYC DFW OKC MTG LLC II III IV NJ NY PA VA NC SC TX CA FL MD DE CT RI NH VT WA AZ NV UT CO KY TN GA AL MS LA IL WI MI OH IA MO KS NE SD ND WV AR ID MT WY AK MA'.split(' '),
);
const SMALL = new Set('a an and at by for from in of on or the to with'.split(' '));

// Names arrive as typed. All capitals reads as shouting in a list, so it gets title case;
// emoji go; long dashes become plain ones; anything else stays as written.
function tidyName(raw) {
  const name = String(raw)
    .replace(/\p{Extended_Pictographic}|[️‍]/gu, '')
    .replace(/\s*[—–]\s*/g, ' - ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!/[\p{L}\p{N}]/u.test(name)) return 'Card show';
  if (/\p{Ll}/u.test(name) || !/\p{Lu}/u.test(name)) return name;
  return name
    .split(' ')
    .map((word, i) =>
      word
        .split(/([-/+])/)
        .map((part) => {
          const bare = part.replace(/[^A-Z0-9]/g, '');
          if (KEEP_CAPS.has(bare) || /\d/.test(part)) return part;
          const low = part.toLowerCase();
          if (i > 0 && SMALL.has(low)) return low;
          return low.replace(/\p{L}/u, (c) => c.toUpperCase());
        })
        .join(''),
    )
    .join(' ');
}

const andList = (xs) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);

// ---------- dates: plain strings, so no time zone can move a day ----------

const ymd = (iso) => iso.split('-').map(Number);
const utc = (iso) => {
  const [y, m, d] = ymd(iso);
  return new Date(Date.UTC(y, m - 1, d));
};
const addDays = (iso, n) => new Date(utc(iso).getTime() + n * 864e5).toISOString().slice(0, 10);
const fmt = (iso, opts) => new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', ...opts }).format(utc(iso));
const monthLong = (iso) => fmt(iso, { month: 'long' });
const monthShort = (iso) => fmt(iso, { month: 'short' });
const dayNum = (iso) => ymd(iso)[2];
const yearNum = (iso) => ymd(iso)[0];
const weekdayShort = (iso) => fmt(iso, { weekday: 'short' });
const weekdayLong = (iso) => fmt(iso, { weekday: 'long' });
const longDate = (iso) => `${monthShort(iso)} ${dayNum(iso)}, ${yearNum(iso)}`;

// "Sat, Nov 14", "Nov 13 to 15", "Nov 29 to Dec 1"
function whenText(a, b) {
  if (a === b) return `${weekdayShort(a)}, ${monthShort(a)} ${dayNum(a)}`;
  if (a.slice(0, 7) === b.slice(0, 7)) return `${monthShort(a)} ${dayNum(a)} to ${dayNum(b)}`;
  return `${monthShort(a)} ${dayNum(a)} to ${monthShort(b)} ${dayNum(b)}`;
}

// "Sat, Nov 14, 2026", "Nov 13 to 15, 2026"
const whenLong = (a, b) => `${whenText(a, b)}, ${yearNum(b)}`;

// "Nov 2026", "Nov–Dec 2026", "Dec 2026–Jan 2027"
function monthRange(a, b) {
  if (a.slice(0, 7) === b.slice(0, 7)) return `${monthShort(a)} ${yearNum(a)}`;
  if (yearNum(a) === yearNum(b)) return `${monthShort(a)}–${monthShort(b)} ${yearNum(a)}`;
  return `${monthShort(a)} ${yearNum(a)}–${monthShort(b)} ${yearNum(b)}`;
}

function clock(t) {
  const m = /^(\d{1,2}):(\d{2})/.exec(t || '');
  if (!m || Number(m[1]) > 23) return null;
  const h = Number(m[1]);
  const suffix = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m[2] === '00' ? `${h12} ${suffix}` : `${h12}:${m[2]} ${suffix}`;
}

// A one-day show that "ends" at or before it starts runs past midnight, or was typed wrong.
const endsBeforeStart = (s) =>
  s.start_date === s.end_date && clock(s.start_time) && clock(s.end_time) && s.end_time.slice(0, 5) <= s.start_time.slice(0, 5);

function hours(s) {
  const a = clock(s.start_time);
  if (!a) return null;
  const b = clock(s.end_time);
  if (!b || endsBeforeStart(s)) return a;
  return `${a} to ${b}`;
}

// ---------- places ----------

const STREET_WORD = /\b(st|street|rd|road|ave|avenue|blvd|boulevard|hwy|highway|dr|drive|ln|lane|way|pkwy|parkway|ct|court|pl|place|cir|circle|pike|turnpike)\.?$/i;

// "12 Main St, Fairfax, VA 22030", "12 Main St, Fairfax, Virginia" or "12 Main St".
function parseAddress(raw, city, state) {
  if (!raw || !raw.trim()) return null;
  let s = raw.trim().replace(/[,\s]+(USA|US|United States)$/i, '');
  let zip = null;
  const z = /[,\s]+(\d{5})(?:-\d{4})?$/.exec(s);
  if (z) {
    zip = z[1];
    s = s.slice(0, z.index);
  }
  const st = new RegExp(`[,\\s]+(${state}|${STATES[state]})$`, 'i').exec(s);
  let sawState = false;
  if (st) {
    sawState = true;
    s = s.slice(0, st.index);
  }
  const pieces = s.split(',').map((p) => p.trim()).filter(Boolean);
  let locality = city;
  const cityAt = pieces.findIndex((p, i) => i > 0 && p.toLowerCase() === city.toLowerCase());
  if (cityAt > 0) {
    locality = pieces[cityAt];
    pieces.length = cityAt;
  } else if (pieces.length >= 2 && sawState) {
    locality = pieces.pop();
  } else if (pieces.length === 1 && sawState && pieces[0].toLowerCase().endsWith(` ${city.toLowerCase()}`)) {
    pieces[0] = pieces[0].slice(0, -(city.length + 1)).trim();
  }
  const name = pieces.length >= 2 && !STREET_WORD.test(pieces[0]) && STREET_WORD.test(pieces[1]) ? pieces.shift() : null;
  const street = pieces.join(', ');
  return street ? { street, locality, zip, name } : null;
}

// Some venues hold a whole address: "40 Oakwood Drive, Glastonbury CT 06033" has no name in it.
function tidyVenue(raw, state) {
  const venue = (raw || '').replace(/\s+/g, ' ').trim();
  if (!venue) return { name: null, address: null };
  if (/^\d+\s/.test(venue) && /\b[A-Z]{2}\s+\d{5}(-\d{4})?$/.test(venue)) return { name: null, address: venue };
  const endsInState = new RegExp(`,\\s*(${state}|${STATES[state]})(\\s+\\d{5})?(,\\s*(USA|US|United States))?$`, 'i');
  if (!endsInState.test(venue) && !/,[^,]*\b\d{5}(-\d{4})?$/.test(venue)) return { name: venue, address: null };
  const comma = venue.indexOf(',');
  const rest = venue.slice(comma + 1).trim();
  return { name: venue.slice(0, comma).trim(), address: rest.includes(',') ? rest : null };
}

function directions(s) {
  const dest =
    typeof s.latitude === 'number' && typeof s.longitude === 'number'
      ? `${s.latitude.toFixed(6)},${s.longitude.toFixed(6)}`
      : [s.venue, s.place?.street, s.city, s.state].filter(Boolean).join(', ');
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(dest)}`;
}

// ---------- reading ----------

async function readLive() {
  const key = process.env.SUPABASE_ANON_KEY;
  if (!SUPABASE_URL || !key) throw new Error('SUPABASE_URL and SUPABASE_ANON_KEY must be set');
  const rows = [];
  for (let offset = 0; ; offset += 1000) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/site_upcoming_shows?limit=1000&offset=${offset}`, {
      headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: 'application/json' },
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`site_upcoming_shows: HTTP ${res.status} ${text.slice(0, 300)}`);
    const page = JSON.parse(text);
    if (!Array.isArray(page)) throw new Error('site_upcoming_shows did not return a list');
    rows.push(...page);
    if (page.length < 1000) return rows;
  }
}

function readFixture(file) {
  const j = JSON.parse(readFileSync(file, 'utf8'));
  return Array.isArray(j) ? j : j.shows;
}

// ---------- the model ----------

const report = { today: TODAY, read: 0, used: 0, dropped: [], duplicates: [], nearDuplicates: [], notes: [] };

function buildModel(rows) {
  report.read = rows.length;
  const horizon = addDays(TODAY, 400);
  const seen = new Map();
  const shows = [];
  for (const r of [...rows].sort((a, b) => String(a.id).localeCompare(String(b.id)))) {
    const why =
      !r.id ? 'no id'
      : !STATES[r.state] ? `state "${r.state}" is not a US state`
      : !r.name || !String(r.name).trim() ? 'no name'
      : !r.city || !String(r.city).trim() ? 'no city'
      : !/^\d{4}-\d{2}-\d{2}$/.test(r.start_date || '') || !/^\d{4}-\d{2}-\d{2}$/.test(r.end_date || '') ? 'bad dates'
      : r.end_date < r.start_date ? 'ends before it starts'
      : r.end_date < TODAY ? 'over'
      : r.start_date > horizon ? 'more than 400 days out'
      : null;
    if (why) {
      if (why !== 'over') report.dropped.push({ id: r.id, name: r.name, state: r.state, start_date: r.start_date, why });
      continue;
    }
    const city = String(r.city).replace(/\s+/g, ' ').trim();
    const title = tidyName(r.name);
    const key = `${r.state}|${r.start_date}|${city.toLowerCase()}|${slugify(title)}`;
    if (seen.has(key)) {
      report.duplicates.push({ kept: seen.get(key).id, dropped: r.id, name: title, city, state: r.state, start_date: r.start_date });
      continue;
    }
    const v = tidyVenue(r.venue_name, r.state);
    const place = parseAddress(r.address || v.address, city, r.state);
    let flyer = null;
    if (r.flyer_url) {
      if (FLYER_PREFIX && String(r.flyer_url).startsWith(FLYER_PREFIX)) flyer = r.flyer_url;
      else report.notes.push(`flyer not on our storage, left off: ${r.id}`);
    }
    const s = {
      ...r,
      city,
      title,
      venue: v.name || place?.name || null,
      place,
      flyer,
      lat: typeof r.latitude === 'number' ? r.latitude : null,
      stateName: STATES[r.state],
      stateSlug: slugify(STATES[r.state]),
      anchor: `s-${String(r.id).replace(/-/g, '').slice(0, 8)}`,
    };
    seen.set(key, s);
    shows.push(s);
  }
  shows.sort(
    (a, b) =>
      a.start_date.localeCompare(b.start_date) ||
      (a.start_time || '99').localeCompare(b.start_time || '99') ||
      a.title.localeCompare(b.title) ||
      String(a.id).localeCompare(String(b.id)),
  );

  // Same state, day and city under another name: often two sessions of one show. Kept, flagged.
  const byDay = new Map();
  for (const s of shows) {
    const k = `${s.state}|${s.start_date}|${s.city.toLowerCase()}`;
    if (!byDay.has(k)) byDay.set(k, []);
    byDay.get(k).push(s);
  }
  for (const [k, list] of byDay) if (list.length > 1) report.nearDuplicates.push({ key: k, names: list.map((s) => s.title) });

  const states = new Map();
  for (const s of shows) {
    if (!states.has(s.state)) states.set(s.state, { code: s.state, name: s.stateName, slug: s.stateSlug, shows: [] });
    states.get(s.state).shows.push(s);
  }
  report.used = shows.length;
  report.states = Object.fromEntries([...states.values()].map((st) => [st.code, st.shows.length]));
  report.noFlyer = shows.filter((s) => !s.flyer).length;
  report.noVenue = shows.filter((s) => !s.venue && !s.place).length;
  report.noPin = shows.filter((s) => s.lat === null).length;
  return { shows, states };
}

// ---------- one page per show ----------

// Many organizers put the date in the name ("G&S TCG Show November 14th", "Peoria Card Expo 1/2",
// "Elite TCG Card Show - January 3rd, 2027 - Wilmington", "NOVA TCG Exchange Card Show #12"). A show's page is about all its dates,
// so its name (and so its URL and identity) leaves dates and years out. State pages keep the name
// as typed, since there it sits beside that one date.
const MON = '(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
const WDAY = '(?:(?:mon|tues|wednes|thurs|fri|satur|sun)day,?\\s+)?';
const DAY = '(?:0?[1-9]|[12]\\d|3[01])(?:st|nd|rd|th)?(?!\\d)';
const NUMDATE = '(?:0?[1-9]|1[0-2])\\/(?:0?[1-9]|[12]\\d|3[01])(?:\\/(?:20)?\\d\\d)?(?!\\d)';
const DATEJOIN = '\\s*(?:-|–|&|and|to|,|\\/)\\s*';
const DATED = [
  new RegExp(`\\b${WDAY}${MON}\\.?\\s*${DAY}(?:${DATEJOIN}(?:${MON}\\.?\\s*)?${DAY})*(?:,?\\s*202\\d\\b)?`, 'gi'),
  new RegExp(`\\b${WDAY}${NUMDATE}(?:${DATEJOIN}${NUMDATE})*`, 'gi'),
  new RegExp(`\\b${MON}\\.?\\s*202\\d\\b`, 'gi'),
  /\b202[4-9]\b/g,
  new RegExp(`\\b${DAY}\\s+${MON}\\b\\.?`, 'gi'), // "16 November"
  // A month on its own ("November Great River Card Shows", "Novembers BK TCG Show", "... NJ Dec"):
  // a monthly show names its month. Full names, plus short forms that aren't everyday words.
  /\b(?:january|february|march|april|may|june|july|august|september|october|november|december)(?:'?s)?\b/gi,
  /\b(?:jan|feb|apr|jun|jul|aug|sept?|oct|nov|dec)\b\.?/gi,
  /\s*#\s*\d+\b/g, // "#11", the edition number: same show, next date
  // An edition number standing before punctuation or the end: "RVA Expo 7 (Regional)", "Show 16! - November",
  // "West Valley TCG Expo 8", and a short year: "Nutmeg Card Show '26: Oakville".
  /\s\d{1,3}(?=\s*(?:[!:(\-–|┃]|$))/g,
  /\s'\d\d\b/g,
  /\b(?:vol\.?|volume|episode)\s*\d+\b/gi,
];
const SEP = '[-–|┃│:@,]';

function undated(title) {
  let t = title;
  for (const re of DATED) t = t.replace(re, ' ');
  if (t === title) return title;
  t = t
    .replace(/[(\[]\s*[,.\s]*\s*[)\]]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(new RegExp(`(${SEP})\\s*,`, 'g'), '$1')
    .replace(/\s+([,.)!])/g, '$1')
    .replace(/\s([-–|┃│])(?:\s*[-–|┃│])+\s/g, ' $1 ')
    .replace(/\s[-–|┃│]\s+(?=[@:]\s)/g, ' ')
    .replace(new RegExp(`\\s*${SEP}+\\s*([!.]*)$`), '$1')
    .replace(new RegExp(`^[\\s.)]*${SEP}+\\s*`), '')
    .replace(/([!?.])\1+$/, '$1')
    .trim();
  return /\p{L}{2}/u.test(t) && t.length >= 4 ? t : title;
}

// Name without dates, and without its own city ("Elite TCG Card Show - King of Prussia" in King of
// Prussia is "Elite TCG Card Show" there), plus city and state.
function showKey(state, city, title) {
  const c = slugify(city);
  const name = slugify(undated(title)) || 'card-show';
  const bare = c ? `-${name}-`.replace(`-${c}-`, '-').replace(/^-+|-+$/g, '') : name;
  return `${state}|${c}|${bare || name}`;
}

// "dulles-card-show-chantilly": the name (at most 48 characters, cut at a word), then the city
// unless the name already says it. No dates or ids, so it never needs to change.
function baseSlug(title, city) {
  let name = slugify(title) || 'card-show';
  if (name.length > 48) name = name.slice(0, 49).replace(/-[^-]*$/, '') || name.slice(0, 48);
  const c = slugify(city);
  return c && !`-${name}-`.includes(`-${c}-`) ? `${name}-${c}` : name;
}

// Show pages from earlier runs: shows/<state>/<folder>/index.html carrying data-show-key.
// Every other folder there is left alone, and its name is never handed to a show.
function readShowPages() {
  const pages = new Map();
  const taken = new Set();
  const stateOf = Object.fromEntries(Object.entries(STATES).map(([code, n]) => [slugify(n), code]));
  for (const st of readdirSync(join(ROOT, 'shows'), { withFileTypes: true })) {
    if (!st.isDirectory() || !stateOf[st.name]) continue;
    const dirs = readdirSync(join(ROOT, 'shows', st.name), { withFileTypes: true }).filter((d) => d.isDirectory());
    for (const d of dirs.sort((a, b) => a.name.localeCompare(b.name))) {
      taken.add(`${st.name}/${d.name}`);
      const file = join(ROOT, 'shows', st.name, d.name, 'index.html');
      if (!existsSync(file)) continue;
      const html = readFileSync(file, 'utf8');
      const attr = (n) => {
        const m = new RegExp(`\\sdata-show-${n}="([^"]*)"`).exec(html);
        return m ? unesc(m[1]) : null;
      };
      const key = attr('key');
      if (!key || pages.has(key) || !key.startsWith(`${stateOf[st.name]}|`)) continue;
      pages.set(key, { key, past: html.includes('class="sh-none"'), slug: d.name, stateSlug: st.name, state: stateOf[st.name], stateName: STATES[stateOf[st.name]], title: attr('name'), city: attr('city') });
    }
  }
  return { pages, taken };
}

// Groups the upcoming shows by name, city and state, and gives each group its folder: the one
// its page already has, or a new one. New names are handed out in key order, so two shows that
// slug the same get -2, -3 the same way every time, and an older page is never the one renamed.
function showGroups(model, old) {
  const groups = new Map();
  for (const s of model.shows) {
    const key = showKey(s.state, s.city, s.title);
    if (!groups.has(key)) groups.set(key, { key, state: s.state, stateName: s.stateName, stateSlug: s.stateSlug, city: s.city, title: undated(s.title), dates: [] });
    groups.get(key).dates.push(s);
  }
  const taken = new Set(old.taken);
  const fresh = [];
  for (const g of groups.values()) {
    const had = old.pages.get(g.key);
    if (had) g.slug = had.slug;
    else fresh.push(g);
  }
  report.showSlugCollisions = [];
  for (const g of fresh.sort((a, b) => a.key.localeCompare(b.key))) {
    const base = baseSlug(g.title, g.city);
    let slug = base;
    for (let i = 2; taken.has(`${g.stateSlug}/${slug}`); i++) slug = `${base}-${i}`;
    if (slug !== base) report.showSlugCollisions.push({ key: g.key, slug: `/shows/${g.stateSlug}/${slug}/` });
    taken.add(`${g.stateSlug}/${slug}`);
    g.slug = slug;
  }
  for (const g of groups.values()) {
    g.path = `/shows/${g.stateSlug}/${g.slug}/`;
    for (const s of g.dates) s.showPath = g.path;
  }
  return groups;
}

// ---------- flyer thumbnails ----------

const IMG_DIR = join(ROOT, 'shows', 'img');
const thumbName = (url) => `${createHash('sha1').update(url).digest('hex').slice(0, 16)}.jpg`;

function imageTool() {
  for (const t of ['magick', 'convert', 'sips']) {
    try {
      execFileSync('/bin/sh', ['-c', `command -v ${t}`], { stdio: 'pipe' });
      return t;
    } catch {}
  }
  return null;
}

async function makeThumbs(shows) {
  mkdirSync(IMG_DIR, { recursive: true });
  const tool = has('thumbs') ? imageTool() : null;
  if (has('thumbs') && !tool) report.notes.push('no image tool (ImageMagick or sips): thumbnails not made');
  const todo = [...new Set(shows.filter((s) => s.flyer).map((s) => s.flyer))].filter((u) => !existsSync(join(IMG_DIR, thumbName(u))));
  let made = 0;
  let failed = 0;
  if (tool) {
    const work = async (url) => {
      const out = join(IMG_DIR, thumbName(url));
      const tmp = join(tmpdir(), `flyer-${process.pid}-${thumbName(url)}`);
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        writeFileSync(tmp, Buffer.from(await res.arrayBuffer()));
        if (tool === 'sips') {
          execFileSync('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '72', '--resampleWidth', String(THUMB_W), tmp, '--out', out], { stdio: 'pipe' });
        } else {
          const argv = [tmp, '-auto-orient', '-resize', `${THUMB_W}x`, '-strip', '-quality', '72', '-interlace', 'JPEG', out];
          execFileSync(tool, argv, { stdio: 'pipe' });
        }
        if (!existsSync(out) || statSync(out).size < 500) throw new Error('empty thumbnail');
        made++;
      } catch (e) {
        failed++;
        rmSync(out, { force: true });
        report.notes.push(`thumbnail failed (${e.message}): ${url}`);
      } finally {
        rmSync(tmp, { force: true });
      }
    };
    const queue = [...todo];
    await Promise.all(Array.from({ length: 6 }, async () => { while (queue.length) await work(queue.shift()); }));
  }
  report.thumbs = { made, failed, missing: todo.length - made };
  // A thumbnail no show uses any more goes.
  const keep = new Set(shows.filter((s) => s.flyer).map((s) => thumbName(s.flyer)));
  for (const f of readdirSync(IMG_DIR)) if (f.endsWith('.jpg') && !keep.has(f)) rmSync(join(IMG_DIR, f));
  for (const s of shows) {
    if (!s.flyer) continue;
    const f = thumbName(s.flyer);
    s.thumb = existsSync(join(IMG_DIR, f)) ? `/shows/img/${f}` : s.flyer;
  }
}

// ---------- structured data ----------

function eventLd(s, pageUrl) {
  const tz = timeZone(s);
  const start = clock(s.start_time) ? `${s.start_date}T${s.start_time.slice(0, 5)}:00${offsetFor(tz, s.start_date, s.start_time)}` : s.start_date;
  const end =
    clock(s.end_time) && !endsBeforeStart(s)
      ? `${s.end_date}T${s.end_time.slice(0, 5)}:00${offsetFor(tz, s.end_date, s.end_time)}`
      : s.end_date;
  const address = { '@type': 'PostalAddress', addressLocality: s.place?.locality || s.city, addressRegion: s.state, addressCountry: 'US' };
  if (s.place?.street) address.streetAddress = s.place.street;
  if (s.place?.zip) address.postalCode = s.place.zip;
  const location = { '@type': 'Place', name: s.venue || `${s.city}, ${s.state}`, address };
  if (s.lat !== null) location.geo = { '@type': 'GeoCoordinates', latitude: s.latitude, longitude: s.longitude };
  const ev = {
    '@type': 'Event',
    name: s.title,
    startDate: start,
    endDate: end,
    eventStatus: 'https://schema.org/EventScheduled',
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    location,
    description: `Pokémon and trading card show in ${s.city}, ${s.state}.`,
    url: `${pageUrl}#${s.anchor}`,
  };
  if (s.flyer) ev.image = [s.flyer];
  if (Number.isInteger(s.admission_cents)) {
    ev.offers = {
      '@type': 'Offer',
      price: (s.admission_cents / 100).toFixed(2),
      priceCurrency: 'USD',
      availability: 'https://schema.org/InStock',
      url: `${pageUrl}#${s.anchor}`,
    };
  }
  return ev;
}

// Google's required Event fields, checked on every build so a bad row can't ship broken markup.
function checkEvent(ev) {
  const iso = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2})?$/;
  const bad = [];
  if (!ev.name) bad.push('name');
  if (!iso.test(ev.startDate)) bad.push('startDate');
  if (ev.endDate && !iso.test(ev.endDate)) bad.push('endDate');
  if (ev.endDate && ev.endDate.slice(0, 10) < ev.startDate.slice(0, 10)) bad.push('endDate before startDate');
  if (!ev.location?.name || !ev.location?.address?.addressLocality || !ev.location?.address?.addressRegion) bad.push('location');
  if (bad.length) throw new Error(`Event "${ev.name}" is missing or has bad: ${bad.join(', ')}`);
}

// ---------- pages ----------

function versions() {
  const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
  const v = (file, dflt) => (new RegExp(`/${file.replace('.', '\\.')}\\?v=(\\d+)`).exec(html) || [])[1] || dflt;
  return { css: v('site.css', '44'), track: v('track.js', '5'), escape: v('escape.js', '11'), android: v('android.js', '5') };
}

const SYMBOLS = `<svg width="0" height="0" style="position:absolute" aria-hidden="true">
  <symbol id="i-left" viewBox="0 0 24 24"><path d="M14.5 6 8.5 12l6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></symbol>
  <symbol id="i-go" viewBox="0 0 24 24"><path d="M12 21s-6.5-6.1-6.5-11.2a6.5 6.5 0 0 1 13 0C18.5 14.9 12 21 12 21z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><circle cx="12" cy="9.8" r="2.3" fill="currentColor"/></symbol>
  <symbol id="i-apple" viewBox="0 0 24 24"><path fill="currentColor" d="M16.37 12.64c-.02-2.1 1.72-3.11 1.8-3.16-.98-1.43-2.5-1.63-3.04-1.65-1.3-.13-2.53.76-3.19.76-.66 0-1.67-.74-2.75-.72-1.41.02-2.72.82-3.44 2.09-1.47 2.55-.38 6.32 1.05 8.39.7 1.01 1.53 2.15 2.62 2.11 1.05-.04 1.45-.68 2.72-.68s1.63.68 2.74.66c1.13-.02 1.85-1.03 2.54-2.05.8-1.17 1.13-2.3 1.15-2.36-.03-.01-2.2-.85-2.2-3.39zM14.28 6.46c.58-.7.97-1.68.86-2.66-.83.03-1.85.56-2.45 1.26-.54.62-1.01 1.62-.88 2.57.93.07 1.88-.47 2.47-1.17z"/></symbol>
</svg>`;

function shell({ path, title, description, ct, state, count, ld, body, noindex, v, show }) {
  const url = SITE + path;
  const json = ld ? JSON.stringify({ '@context': 'https://schema.org', '@graph': ld }).replace(/</g, '\\u003c') : null;
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<script src="/track.js?v=${v.track}"></script>
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
${noindex ? '<meta name="robots" content="noindex, follow">\n' : ''}<meta name="theme-color" content="#2a8576">
<meta name="color-scheme" content="light">
<meta name="apple-itunes-app" content="app-id=6778956833, affiliate-data=pt=129011221&amp;ct=shows-banner">
<link rel="canonical" href="${esc(url)}">
<link rel="icon" type="image/svg+xml" href="/favicon.svg?v=6">
<link rel="icon" type="image/png" href="/favicon.png?v=6">
<link rel="apple-touch-icon" href="/apple-touch-icon.png?v=6">
<meta property="og:title" content="${esc(title.replace(/ \| Tracka$/, ''))}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(url)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Tracka">
<meta property="og:image" content="${SITE}/og.jpg?v=10">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<link rel="preload" as="font" type="font/woff2" crossorigin href="/fonts/plus-jakarta-sans-latin.woff2">
<link rel="preload" as="font" type="font/woff2" crossorigin href="/fonts/instrument-serif-italic-latin.woff2">
<link rel="stylesheet" href="/site.css?v=${v.css}">
<link rel="stylesheet" href="/shows/shows.css?v=${CSS_V}">
${json ? `<script type="application/ld+json">${json}</script>\n` : ''}</head>
<body class="sh-page" data-shows-state="${esc(state)}" data-shows-count="${count}"${
  show ? ` data-show-key="${esc(show.key)}" data-show-name="${esc(show.title)}" data-show-city="${esc(show.city)}"` : ''
}>
${SYMBOLS}
<a class="skip" href="#main">Skip to content</a>
<header class="nav solid">
  <div class="wrap nav-in">
    <a class="brand" href="/" aria-label="Tracka home" translate="no"><img src="/art/v2/icon.png?v=3" width="30" height="30" alt="">Tracka</a>
    <a class="pill pill-sm nav-cta" style="margin-left:auto" href="${esc(STORE(ct))}">Get the app</a>
  </div>
</header>
<main id="main" class="sh${show ? ' sh-one' : ''}">
  <div class="wrap">
${body}
  </div>
</main>
<footer class="foot">
  <div class="wrap foot-mini">
    <p>© ${yearNum(TODAY)} Tracka</p>
    <nav aria-label="Footer"><a href="/">Home</a><a href="/shows/">Card shows</a><a href="/privacy">Privacy</a><a href="/terms">Terms</a><a href="mailto:support@gettracka.com">Contact</a></nav>
    <p class="sh-disc">Not affiliated with or endorsed by The Pokémon Company or any game publisher.</p>
  </div>
</footer>
<script src="/shows/shows.js?v=${JS_V}" defer></script>
<script src="/escape.js?v=${v.escape}" defer></script>
<script src="/android.js?v=${v.android}" defer></script>
</body>
</html>
`;
}

function cta(ct) {
  return `    <aside class="sh-cta">
      <img src="/art/v2/icon.png?v=3" width="40" height="40" alt="">
      <p>Get the full details in the Tracka app</p>
      <a class="sh-get" href="${esc(STORE(ct))}">Get the app</a>
    </aside>`;
}

function showItem(s) {
  const where = [s.venue || s.place?.street, s.city].filter(Boolean).join(' · ');
  const time = hours(s);
  const art = s.flyer
    ? `<a class="sh-flyer" href="${esc(s.flyer)}" target="_blank" rel="noopener"><img src="${esc(s.thumb || s.flyer)}" alt="Flyer for ${esc(s.title)}" width="72" height="96" loading="lazy" decoding="async"></a>`
    : `<div class="sh-flyer sh-tile" aria-hidden="true"><span>${monthShort(s.start_date)}</span><b>${dayNum(s.start_date)}</b></div>`;
  return `        <li class="sh-show" id="${s.anchor}">
          ${art}
          <div class="sh-body">
            <p class="sh-when"><time datetime="${s.start_date}">${esc(whenText(s.start_date, s.end_date))}</time>${time ? ` · ${esc(time)}` : ''}</p>
            <h3>${s.showPath ? `<a href="${esc(s.showPath)}">${esc(s.title)}</a>` : esc(s.title)}</h3>
            ${where ? `<p class="sh-where">${esc(where)}</p>` : ''}
          </div>
          <a class="sh-go" href="${esc(directions(s))}" target="_blank" rel="noopener" aria-label="Directions to ${esc(s.title)}"><svg aria-hidden="true"><use href="#i-go"/></svg>Directions</a>
        </li>`;
}

function updatedLine(iso) {
  return `<p class="sh-upd">Updated <time datetime="${iso}" data-updated>${longDate(iso)}</time></p>`;
}

function statePage(st, model, updated, v) {
  const path = `/shows/${st.slug}/`;
  const url = SITE + path;
  const ct = `shows-${st.slug}`.slice(0, 40);
  const list = st.shows;
  const n = list.length;

  const cityCount = new Map();
  for (const s of list) cityCount.set(s.city, (cityCount.get(s.city) || 0) + 1);
  const cities = [...cityCount.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map((c) => c[0]);
  const top = cities.slice(0, 3);
  const cityText = cities.length > 3 ? `${top.join(', ')} and more` : andList(top);

  const soon = list.filter((s) => s.start_date <= addDays(TODAY, 62));
  const range = monthRange(list[0].start_date, (soon.length ? soon : list.slice(0, 1)).at(-1).start_date);
  const title = `Pokémon Card Shows in ${st.name} · ${range} | Tracka`;
  const description = `${n} upcoming Pokémon card ${n === 1 ? 'show' : 'shows'} in ${st.name}: dates, venues and flyers for ${cityText}. Updated daily.`;

  const months = new Map();
  for (const s of list) {
    const k = s.start_date.slice(0, 7);
    if (!months.has(k)) months.set(k, []);
    months.get(k).push(s);
  }
  const blocks = [...months.entries()].map(
    ([k, g]) => `    <section class="sh-month" aria-labelledby="m-${k}">
      <h2 id="m-${k}">${monthLong(g[0].start_date)} <span>${yearNum(g[0].start_date)}</span></h2>
      <ul class="sh-list">
${g.map(showItem).join('\n')}
      </ul>
    </section>`,
  );

  const near = (NEIGHBORS[st.code] || '')
    .split(' ')
    .map((c) => model.states.get(c))
    .filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name));
  const nearHtml = near.length
    ? `    <nav class="sh-near" aria-label="Nearby states">
      <h2>Nearby</h2>
      <ul>${near.map((o) => `<li><a href="/shows/${o.slug}/">${esc(o.name)}<span>${o.shows.length}</span></a></li>`).join('')}</ul>
    </nav>`
    : '';

  const body = `    <a class="back" href="/shows/"><svg aria-hidden="true"><use href="#i-left"/></svg>All states</a>
    <h1>Pokémon card shows in <span class="it">${esc(st.name)}</span></h1>
    <p class="sh-sub">${n} upcoming ${n === 1 ? 'show' : 'shows'} in ${esc(cityText)}.</p>
    ${updatedLine(updated)}
${cta(ct)}
${blocks.join('\n')}
${nearHtml}`;

  const events = list.map((s) => eventLd(s, s.showPath ? SITE + s.showPath : url));
  events.forEach(checkEvent);
  const ld = [
    {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Tracka', item: `${SITE}/` },
        { '@type': 'ListItem', position: 2, name: 'Card shows', item: `${SITE}/shows/` },
        { '@type': 'ListItem', position: 3, name: st.name, item: url },
      ],
    },
    ...events,
  ];
  return shell({ path, title, description, ct, state: st.slug, count: n, ld, body, v });
}

function hubPage(model, updated, v) {
  const states = [...model.states.values()].sort((a, b) => a.name.localeCompare(b.name));
  const n = model.shows.length;
  const title = 'Pokémon Card Shows Near You, by State | Tracka';
  const description = `${n} upcoming Pokémon card shows in ${states.length} states, with dates, venues and flyers. Updated daily.`;
  const body = `    <h1>Pokémon card shows <span class="it">near you</span></h1>
    <p class="sh-sub">${n} upcoming in ${states.length} states.</p>
    ${updatedLine(updated)}
${cta('shows-hub')}
    <ul class="sh-states">
${states.map((st) => `      <li><a href="/shows/${st.slug}/"><b>${esc(st.name)}</b><span>${st.shows.length} ${st.shows.length === 1 ? 'show' : 'shows'}</span></a></li>`).join('\n')}
    </ul>`;
  const ld = [
    {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Tracka', item: `${SITE}/` },
        { '@type': 'ListItem', position: 2, name: 'Card shows', item: `${SITE}/shows/` },
      ],
    },
  ];
  return shell({ path: '/shows/', title, description, ct: 'shows-hub', state: 'hub', count: n, ld, body, v });
}

// One show's page, title and description. Long names are cut so the title stays near 60
// characters with the place and the next date still in it.
function showTitle(g, next) {
  const loc = `${g.city}, ${g.state}`;
  const showy = /\b(show|shows|expo|con|convention|fest|festival)\b/i.test(g.title);
  const where = showy ? loc : `${loc} card show`;
  const date = next ? `${monthShort(next)} ${dayNum(next)}` : null;
  const tail = [where, date].filter(Boolean).join(' · ');
  // The name matters most, then the place, then the date. Asides ("(Bob Duncan Center)",
  // "- Winter Edition") go before any of those do.
  const short = g.title.replace(/\s*\([^)]*\)/g, '').split(/\s+(?:[-–|┃│@/]|featuring|presented by)\s+|:\s+/i)[0].trim();
  const names = short.length >= 8 && short !== g.title ? [g.title, short] : [g.title];
  const dated = (n, w) => [n, w, date].filter(Boolean).join(' · ');
  const tries = [`${g.title} · ${tail} | Tracka`, ...names.flatMap((n) => [dated(n, where), dated(n, loc), `${n} · ${where}`])];
  const fit = tries.find((t) => t.length <= 64);
  return fit || `${cut(names.at(-1), Math.max(28, 64 - where.length - 3))} · ${where}`;
}

function showDescription(g) {
  const first = g.dates[0];
  const at = first.venue ? ` at ${first.venue}` : '';
  const head = `${g.title}: Pokémon and trading card show in ${g.city}, ${g.state}`;
  if (g.dates.length === 1) {
    const time = hours(first);
    return cut(`${head}, ${whenLong(first.start_date, first.end_date)}${time ? `, ${time}` : ''}${at}.`, 155);
  }
  const days = g.dates.slice(0, 4).map((s) => `${monthShort(s.start_date)} ${dayNum(s.start_date)}`);
  const more = g.dates.length > 4 ? ' and more' : '';
  return cut(`${head}${at}. Upcoming dates: ${more ? days.join(', ') + more : andList(days)}.`, 155);
}

function addressLines(s) {
  const lines = [];
  if (s.place?.street) lines.push(s.place.street);
  if (s.place) lines.push(`${s.place.locality || s.city}, ${s.state}${s.place.zip ? ` ${s.place.zip}` : ''}`);
  return lines;
}

function showPage(g, updated, v) {
  const url = SITE + g.path;
  const ct = `show-${g.stateSlug}`.slice(0, 40);
  const first = g.dates[0];

  // Dates that share a place sit together under it; usually that is all of them.
  const stops = new Map();
  for (const s of g.dates) {
    const k = `${s.venue || ''}|${s.place?.street || ''}|${s.lat ?? ''}`;
    if (!stops.has(k)) stops.set(k, []);
    stops.get(k).push(s);
  }
  const stopHtml = [...stops.values()].map((list) => {
    const s = list[0];
    const lines = addressLines(s);
    const addr = s.venue || lines.length
      ? `\n          <p class="sh-addr">${[s.venue ? `<b>${esc(s.venue)}</b>` : null, ...lines.map(esc)].filter(Boolean).join('<br>')}</p>`
      : '';
    return `        <div class="sh-stop">
          <ul class="sh-dates${list.length > 3 ? ' sh-dates-many' : ''}">
${list
  .map((d) => {
    const time = hours(d);
    return `            <li id="${d.anchor}"><time datetime="${d.start_date}">${esc(whenLong(d.start_date, d.end_date))}</time>${time ? ` <span>${esc(time)}</span>` : ''}</li>`;
  })
  .join('\n')}
          </ul>${addr}
          <a class="sh-go" href="${esc(directions(s))}" target="_blank" rel="noopener" aria-label="Directions to ${esc(s.venue || g.title)}"><svg aria-hidden="true"><use href="#i-go"/></svg>Directions</a>
        </div>`;
  });
  const art = first.flyer
    ? `\n      <a class="sh-flyer" href="${esc(first.flyer)}" target="_blank" rel="noopener"><img src="${esc(first.thumb || first.flyer)}" alt="Flyer for ${esc(g.title)}" width="120" height="160" decoding="async"></a>`
    : '';

  const body = `    <a class="back" href="/shows/${g.stateSlug}/"><svg aria-hidden="true"><use href="#i-left"/></svg>${esc(g.stateName)}</a>
    <h1>${esc(g.title).replace(/ ([-–|]) /g, '&nbsp;$1 ')}</h1>
    <p class="sh-sub">${esc(g.city)}, ${esc(g.stateName)}</p>
    ${updatedLine(updated)}
${cta(ct)}
    <section class="sh-detail${first.flyer ? '' : ' sh-noflyer'}" aria-label="Dates and place">${art}
      <div class="sh-stops">
${stopHtml.join('\n')}
      </div>
    </section>
    <p class="sh-more"><a href="/shows/${g.stateSlug}/">More card shows in ${esc(g.stateName)}</a></p>`;

  const events = g.dates.map((s) => eventLd(s, url));
  events.forEach(checkEvent);
  const ld = [breadcrumbs(g, url), ...events];
  return shell({ path: g.path, title: showTitle(g, first.start_date), description: showDescription(g), ct, state: g.stateSlug, count: g.dates.length, ld, body, v, show: g });
}

function breadcrumbs(g, url) {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Tracka', item: `${SITE}/` },
      { '@type': 'ListItem', position: 2, name: 'Card shows', item: `${SITE}/shows/` },
      { '@type': 'ListItem', position: 3, name: g.stateName, item: `${SITE}/shows/${g.stateSlug}/` },
      { '@type': 'ListItem', position: 4, name: g.title, item: url },
    ],
  };
}

// A show whose dates are all past keeps its page (no dead links) but leaves the index and the sitemap: name, city,
// one line, and the way to its state's shows. Built only from what the old page carries.
function pastShowPage(p, updated, v) {
  const path = `/shows/${p.stateSlug}/${p.slug}/`;
  const g = { ...p, path };
  const body = `    <a class="back" href="/shows/${p.stateSlug}/"><svg aria-hidden="true"><use href="#i-left"/></svg>${esc(p.stateName)}</a>
    <h1>${esc(p.title).replace(/ ([-–|]) /g, '&nbsp;$1 ')}</h1>
    <p class="sh-sub">${esc(p.city)}, ${esc(p.stateName)}</p>
    ${updatedLine(updated)}
${cta(`show-${p.stateSlug}`.slice(0, 40))}
    <p class="sh-none">No upcoming dates. <a href="/shows/${p.stateSlug}/">Card shows in ${esc(p.stateName)}</a></p>`;
  return shell({
    path,
    title: showTitle(g, null),
    description: cut(`${p.title} in ${p.city}, ${p.state} has no upcoming dates listed. See other Pokémon card shows in ${p.stateName}.`, 155),
    ct: `show-${p.stateSlug}`.slice(0, 40),
    state: p.stateSlug,
    count: 0,
    ld: [breadcrumbs(g, SITE + path)],
    body,
    noindex: true,
    v,
    show: p,
  });
}

// A state that had a page and now has no shows keeps a small page, kept out of search, so
// links to it still land somewhere useful.
function emptyPage(slug, name, updated, v) {
  const body = `    <a class="back" href="/shows/"><svg aria-hidden="true"><use href="#i-left"/></svg>All states</a>
    <h1>Pokémon card shows in <span class="it">${esc(name)}</span></h1>
    <p class="sh-sub">No upcoming shows listed right now.</p>
    ${updatedLine(updated)}
${cta(`shows-${slug}`.slice(0, 40))}`;
  return shell({
    path: `/shows/${slug}/`,
    title: `Pokémon Card Shows in ${name} | Tracka`,
    description: `Upcoming Pokémon card shows in ${name}.`,
    ct: `shows-${slug}`.slice(0, 40),
    state: slug,
    count: 0,
    body,
    noindex: true,
    v,
  });
}

// Writes a page only when something besides its Updated date changed. Returns its date.
function writePage(rel, render) {
  const file = join(ROOT, rel, 'index.html');
  const fresh = render(TODAY);
  if (existsSync(file)) {
    const old = readFileSync(file, 'utf8');
    const was = /datetime="(\d{4}-\d{2}-\d{2})" data-updated/.exec(old)?.[1];
    if (was && render(was) === old) return { updated: was, changed: false };
  }
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, fresh);
  return { updated: TODAY, changed: true };
}

function writeSitemap(entries) {
  const file = join(ROOT, 'sitemap.xml');
  const old = readFileSync(file, 'utf8');
  const keep = (old.match(/<url>[\s\S]*?<\/url>/g) || []).filter((u) => !/<loc>https:\/\/gettracka\.com\/shows\//.test(u));
  const add = entries.map(
    (e) => `<url>
    <loc>${SITE}${e.path}</loc>
    <lastmod>${e.updated}</lastmod>
    <priority>${e.priority}</priority>
  </url>`,
  );
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${[...keep, ...add].map((u) => `  ${u}`).join('\n')}
</urlset>
`;
  if (xml !== old) writeFileSync(file, xml);
}

// ---------- run ----------

async function main() {
  const rows = flag('data') ? readFixture(flag('data')) : await readLive();
  const model = buildModel(rows);
  if (model.shows.length < MIN_SHOWS) {
    throw new Error(`only ${model.shows.length} upcoming shows read (expected at least ${MIN_SHOWS}); nothing written`);
  }
  const old = readShowPages();
  const groups = showGroups(model, old);
  // A partial read that still clears --min would turn every missing show into a no-dates page for a
  // day. Stop if far fewer shows have dates than the pages that had dates last run.
  const hadDates = [...old.pages.values()].filter((p) => !p.past).length;
  if (!has('allow-drop') && hadDates >= 50 && groups.size < hadDates * 0.6) {
    throw new Error(`only ${groups.size} shows with dates, last run had ${hadDates}; nothing written (--allow-drop to override)`);
  }
  await makeThumbs(model.shows);
  const v = versions();

  const entries = [];
  const changed = [];
  const hub = writePage('shows', (d) => hubPage(model, d, v));
  entries.push({ path: '/shows/', updated: hub.updated, priority: '0.8' });
  if (hub.changed) changed.push('/shows/');

  const live = new Set();
  for (const st of [...model.states.values()].sort((a, b) => a.name.localeCompare(b.name))) {
    live.add(st.slug);
    const r = writePage(join('shows', st.slug), (d) => statePage(st, model, d, v));
    entries.push({ path: `/shows/${st.slug}/`, updated: r.updated, priority: '0.7' });
    if (r.changed) changed.push(`/shows/${st.slug}/`);
  }

  // One page per show, then the pages of shows that have no dates left.
  let showPages = 0;
  let pastPages = 0;
  for (const g of [...groups.values()].sort((a, b) => a.path.localeCompare(b.path))) {
    const r = writePage(g.path.slice(1, -1), (d) => showPage(g, d, v));
    entries.push({ path: g.path, updated: r.updated, priority: '0.6' });
    if (r.changed) changed.push(g.path);
    showPages++;
  }
  for (const p of [...old.pages.values()].sort((a, b) => `${a.stateSlug}/${a.slug}`.localeCompare(`${b.stateSlug}/${b.slug}`))) {
    if (groups.has(p.key)) continue;
    const path = `/shows/${p.stateSlug}/${p.slug}/`;
    const r = writePage(path.slice(1, -1), (d) => pastShowPage(p, d, v));
    if (r.changed) changed.push(`${path} (no dates)`);
    pastPages++;
  }

  // Folders from earlier runs whose state has nothing now.
  const names = Object.fromEntries(Object.values(STATES).map((n) => [slugify(n), n]));
  for (const d of readdirSync(join(ROOT, 'shows'), { withFileTypes: true })) {
    if (!d.isDirectory() || live.has(d.name) || !names[d.name]) continue;
    const r = writePage(join('shows', d.name), (u) => emptyPage(d.name, names[d.name], u, v));
    if (r.changed) changed.push(`/shows/${d.name}/ (no shows)`);
  }

  writeSitemap(entries);

  report.pages = entries.length;
  report.showPages = showPages;
  report.pastShowPages = pastPages;
  report.changed = changed;
  if (flag('report')) writeFileSync(flag('report'), JSON.stringify(report, null, 2));
  console.log(
    `${model.shows.length} upcoming shows in ${model.states.size} states (read ${report.read}). ` +
      `${entries.length} pages (${showPages} show pages, ${pastPages} with no dates, ${report.showSlugCollisions.length} slug collisions), ${changed.length} changed. Dropped ${report.dropped.length}, duplicates ${report.duplicates.length}, ` +
      `same-day same-city pairs ${report.nearDuplicates.length}. No flyer ${report.noFlyer}, no venue or address ${report.noVenue}, no pin ${report.noPin}. ` +
      `Thumbnails made ${report.thumbs.made}, failed ${report.thumbs.failed}.`,
  );
  for (const n of report.notes.slice(0, 20)) console.log(`note: ${n}`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
