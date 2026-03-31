import { NextRequest, NextResponse } from 'next/server';
import { addBaselineRisk } from '@/lib/risk';
import { getDemoFlights } from '@/lib/demo-data';
import type { FlightRecord, FlightsPayload, WeatherPayload } from '@/lib/types';
import { toIsoDate } from '@/lib/utils';

const AIRPORT_IATA = 'CMX';
const PROVIDER = process.env.FLIGHT_PROVIDER || 'aviationstack';
const API_KEY = process.env.AVIATIONSTACK_API_KEY;
const ENABLE_RISK = String(process.env.ENABLE_RISK_MODEL).toLowerCase() === 'true';

function normalizeFlight(item: any, kind: 'arrival' | 'departure'): FlightRecord {
  const endpoint = kind === 'arrival' ? item.arrival : item.departure;
  const city = kind === 'arrival' ? item.departure?.airport : item.arrival?.airport;

  return {
    id:
      item.flight?.iata ||
      `${item.flight_date ?? 'live'}-${kind}-${Math.random().toString(36).slice(2, 8)}`,
    kind,
    airline: item.airline?.name || 'Unknown airline',
    flightNumber: item.flight?.iata || item.flight?.number || 'Unknown flight',
    city: city || 'Unknown city',
    scheduledTime: endpoint?.scheduled || null,
    actualTime: endpoint?.actual || endpoint?.estimated || null,
    status: item.flight_status || endpoint?.status || 'Unknown',
    gate: endpoint?.gate || null,
    aircraft: item.aircraft?.registration || item.aircraft?.icao24 || null,
  };
}

function isLikelyCmxFlight(item: any, kind: 'arrival' | 'departure') {
  const arrIata = String(item.arrival?.iata || '').toUpperCase();
  const depIata = String(item.departure?.iata || '').toUpperCase();
  const airline = String(item.airline?.name || '').toLowerCase();
  const flightIata = String(item.flight?.iata || '').toUpperCase();
  const flightStatus = String(item.flight_status || '').toLowerCase();

  const touchesCmx =
    (kind === 'arrival' && arrIata === 'CMX') ||
    (kind === 'departure' && depIata === 'CMX');

  const touchesOrd = arrIata === 'ORD' || depIata === 'ORD';

  const likelyUnited =
    airline.includes('united') ||
    airline.includes('skywest') ||
    airline.includes('united express') ||
    flightIata.startsWith('UA') ||
    flightIata.startsWith('OO');

  const notCargoOrRandom =
    !airline.includes('fedex') &&
    !airline.includes('ameriflight') &&
    !airline.includes('vista') &&
    !airline.includes('uganda');

  return touchesCmx && touchesOrd && likelyUnited && notCargoOrRandom && flightStatus !== 'cancelled';
}

function filterCmxFlights(items: any[], kind: 'arrival' | 'departure') {
  return items.filter((item) => isLikelyCmxFlight(item, kind));
}

async function loadWeather(): Promise<WeatherPayload | undefined> {
  try {
    const base = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000';
    const response = await fetch(`${base}/api/weather`, { cache: 'no-store' });
    if (!response.ok) return undefined;
    return response.json();
  } catch {
    return undefined;
  }
}

function buildAviationstackUrl(kind: 'arrival' | 'departure', date: string) {
  const today = toIsoDate();
  const url = new URL('https://api.aviationstack.com/v1/flights');

  url.searchParams.set('access_key', API_KEY || '');
  url.searchParams.set(kind === 'arrival' ? 'arr_iata' : 'dep_iata', AIRPORT_IATA);
  url.searchParams.set('limit', '25');

  // Free tier supports real-time today better than historical/date-based queries.
  if (date !== today) {
    url.searchParams.set('flight_date', date);
  }

  return url;
}

async function fetchAviationstackList(kind: 'arrival' | 'departure', date: string) {
  const response = await fetch(buildAviationstackUrl(kind, date).toString(), {
    next: { revalidate: 60 },
  });

  const json = await response.json();

  if (!response.ok) {
    throw new Error(`Flight API failed for ${kind}s: ${response.status}`);
  }

  if (json?.error) {
    const message = json.error.message || `Flight API returned an error for ${kind}s.`;
    const code = json.error.code ? ` (${json.error.code})` : '';
    throw new Error(`${message}${code}`);
  }

  return (json?.data ?? []) as any[];
}

async function fetchAviationstack(date: string): Promise<FlightsPayload> {
  if (!API_KEY) return getDemoFlights(date);

  const today = toIsoDate();
  const isToday = date === today;

  try {
    const [arrivalsData, departuresData] = await Promise.all([
      fetchAviationstackList('arrival', date),
      fetchAviationstackList('departure', date),
    ]);

    const filteredArrivals = filterCmxFlights(arrivalsData, 'arrival');
    const filteredDepartures = filterCmxFlights(departuresData, 'departure');

    const payload: FlightsPayload = {
      date,
      source: 'aviationstack',
      arrivals: filteredArrivals.map((item: any) => normalizeFlight(item, 'arrival')).slice(0, 2),
      departures: filteredDepartures.map((item: any) => normalizeFlight(item, 'departure')).slice(0, 2),
    };

    if (!payload.arrivals.length && !payload.departures.length) {
      const note = isToday
        ? 'No valid live CMX flights were returned by the provider right now. Showing fallback rows instead.'
        : 'This free provider plan does not reliably support date-based CMX flight lookups. Showing fallback rows instead.';
      return { ...getDemoFlights(date), source: 'demo fallback', note };
    }

    if (payload.arrivals.length < 2 || payload.departures.length < 2) {
      const demo = getDemoFlights(date);
      payload.arrivals = [...payload.arrivals, ...demo.arrivals].slice(0, 2);
      payload.departures = [...payload.departures, ...demo.departures].slice(0, 2);
      payload.note = isToday
        ? 'Only flights matching likely CMX-ORD United/SkyWest service were kept. Fallback rows were added because fewer than 2 valid live flights were returned.'
        : 'Date-based lookup returned limited data on the free plan, so fallback rows were added.';
    }

    return payload;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';

    return {
      ...getDemoFlights(date),
      source: 'demo fallback',
      note: isToday
        ? 'Live flight API failed for today. Showing fallback rows instead.'
        : 'The selected date requires a paid historical/schedule API feature or your own saved snapshots. Showing fallback rows instead.',
      error: message,
    };
  }
}

export async function GET(request: NextRequest) {
  const date = toIsoDate(request.nextUrl.searchParams.get('date') || undefined);

  try {
    let payload = PROVIDER === 'aviationstack' ? await fetchAviationstack(date) : getDemoFlights(date);

    if (ENABLE_RISK) {
      const weather = await loadWeather();
      payload = {
        ...payload,
        arrivals: payload.arrivals.map((flight) => addBaselineRisk(flight, weather)),
        departures: payload.departures.map((flight) => addBaselineRisk(flight, weather)),
      };
    }

    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json(
      {
        ...getDemoFlights(date),
        note: 'Live flight API failed. Showing demo fallback instead.',
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 200 },
    );
  }
}
