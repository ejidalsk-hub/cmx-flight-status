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
    id: item.flight?.iata || item.flight_date + Math.random().toString(36).slice(2, 8),
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

async function fetchAviationstack(date: string): Promise<FlightsPayload> {
  if (!API_KEY) return getDemoFlights(date);

  // Historical + real-time flights endpoint for the selected date.
  // Depending on your plan, you may want to swap tomorrow searches to a future-schedules endpoint.
  const url = new URL('https://api.aviationstack.com/v1/flights');
  url.searchParams.set('access_key', API_KEY);
  url.searchParams.set('flight_date', date);
  url.searchParams.set('arr_iata', AIRPORT_IATA);
  url.searchParams.set('limit', '10');

  const arrResponse = await fetch(url.toString(), { next: { revalidate: 60 } });
  if (!arrResponse.ok) {
    throw new Error(`Flight API failed for arrivals: ${arrResponse.status}`);
  }

  const depUrl = new URL('https://api.aviationstack.com/v1/flights');
  depUrl.searchParams.set('access_key', API_KEY);
  depUrl.searchParams.set('flight_date', date);
  depUrl.searchParams.set('dep_iata', AIRPORT_IATA);
  depUrl.searchParams.set('limit', '10');

  const depResponse = await fetch(depUrl.toString(), { next: { revalidate: 60 } });
  if (!depResponse.ok) {
    throw new Error(`Flight API failed for departures: ${depResponse.status}`);
  }

  const arrivalsJson = await arrResponse.json();
  const departuresJson = await depResponse.json();

  const payload: FlightsPayload = {
    date,
    source: 'aviationstack',
    arrivals: (arrivalsJson.data ?? []).map((item: any) => normalizeFlight(item, 'arrival')).slice(0, 2),
    departures: (departuresJson.data ?? []).map((item: any) => normalizeFlight(item, 'departure')).slice(0, 2),
  };

  if (!payload.arrivals.length && !payload.departures.length) {
    return { ...getDemoFlights(date), source: 'demo fallback', note: 'No live flights returned for that date/provider plan.' };
  }

  if (payload.arrivals.length < 2 || payload.departures.length < 2) {
    const demo = getDemoFlights(date);
    payload.arrivals = [...payload.arrivals, ...demo.arrivals].slice(0, 2);
    payload.departures = [...payload.departures, ...demo.departures].slice(0, 2);
    payload.note = 'Live data was supplemented with demo rows because fewer than 2 arrivals/departures were returned.';
  }

  return payload;
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
