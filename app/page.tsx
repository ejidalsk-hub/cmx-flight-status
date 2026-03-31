'use client';

import { useEffect, useMemo, useState } from 'react';
import type { FlightsPayload, FlightRecord, WeatherPayload, WebcamPayload } from '@/lib/types';
import { formatLocalTime, shiftIsoDate, toIsoDate } from '@/lib/utils';

const todayIso = toIsoDate();

export default function Page() {
  const [date, setDate] = useState(todayIso);
  const [flights, setFlights] = useState<FlightsPayload | null>(null);
  const [weather, setWeather] = useState<WeatherPayload | null>(null);
  const [webcam, setWebcam] = useState<WebcamPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadAll(selectedDate: string) {
    setLoading(true);
    setError(null);

    try {
      const [flightsRes, weatherRes, webcamRes] = await Promise.all([
        fetch(`/api/flights?date=${selectedDate}`, { cache: 'no-store' }),
        fetch('/api/weather', { cache: 'no-store' }),
        fetch('/api/webcam', { cache: 'no-store' }),
      ]);

      if (!flightsRes.ok) throw new Error('Could not load flights.');
      if (!weatherRes.ok) throw new Error('Could not load weather.');
      if (!webcamRes.ok) throw new Error('Could not load webcam.');

      const [flightJson, weatherJson, webcamJson] = await Promise.all([
        flightsRes.json(),
        weatherRes.json(),
        webcamRes.json(),
      ]);

      setFlights(flightJson);
      setWeather(weatherJson);
      setWebcam(webcamJson);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll(date);
    const id = window.setInterval(() => loadAll(date), 60000);
    return () => window.clearInterval(id);
  }, [date]);

  const presets = useMemo(
    () => [
      { label: 'Today', value: todayIso },
      { label: 'Yesterday', value: shiftIsoDate(todayIso, -1) },
      { label: '2 Days Ago', value: shiftIsoDate(todayIso, -2) },
      { label: 'Tomorrow', value: shiftIsoDate(todayIso, 1) },
    ],
    [],
  );

  return (
    <main className="page-shell">
      <section className="hero">
        <div>
          <p className="eyebrow">SAT4520/5520 Project</p>
          <h1>CMX Airport Live Flight Status</h1>
          <p className="hero-copy">
            Live arrivals, departures, weather, and webcam coverage for Houghton County Memorial Airport.
          </p>
        </div>
        <div className="status-chip">Auto-refresh: 60s</div>
      </section>

      <section className="toolbar card">
        <div>
          <label htmlFor="date-picker">Flight date</label>
          <input id="date-picker" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="preset-wrap">
          {presets.map((preset) => (
            <button
              key={preset.label}
              className={preset.value === date ? 'preset active' : 'preset'}
              onClick={() => setDate(preset.value)}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </section>

      {error && <section className="card error-banner">{error}</section>}
      {loading && <section className="card">Loading live airport data…</section>}

      <section className="grid two-col">
        <Panel title="Arrivals" subtitle="Top 2 inbound flights for the selected date">
          {flights?.arrivals.map((flight) => <FlightCard key={flight.id} flight={flight} />)}
        </Panel>
        <Panel title="Departures" subtitle="Top 2 outbound flights for the selected date">
          {flights?.departures.map((flight) => <FlightCard key={flight.id} flight={flight} />)}
        </Panel>
      </section>

      {flights?.note && <section className="card note">{flights.note}</section>}

      <section className="grid two-col">
        <Panel title="Current Weather" subtitle={weather?.location ?? 'Houghton, MI'}>
          <div className="weather-now">
            <div>
              <span className="metric-label">Conditions</span>
              <strong>{weather?.current.conditions ?? '—'}</strong>
            </div>
            <div>
              <span className="metric-label">Temperature</span>
              <strong>{weather?.current.temperatureF != null ? `${weather.current.temperatureF} °F` : '—'}</strong>
            </div>
            <div>
              <span className="metric-label">Wind</span>
              <strong>
                {weather?.current.windMph != null
                  ? `${weather.current.windMph} mph ${weather.current.windDirection ?? ''}`
                  : '—'}
              </strong>
            </div>
          </div>
          <div className="forecast-list">
            {weather?.forecast.slice(0, 4).map((period) => (
              <div className="forecast-item" key={period.name}>
                <strong>{period.name}</strong>
                <span>{period.temperature}°{period.unit}</span>
                <span>{period.shortForecast}</span>
                <span>{period.windSpeed}</span>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title={webcam?.title ?? 'Airport Webcam'} subtitle={webcam?.sourceLabel ?? 'Live webcam feed'}>
          {webcam?.iframeUrl ? (
            <iframe
              src={webcam.iframeUrl}
              title="CMX webcam"
              className="webcam-frame"
              loading="lazy"
              referrerPolicy="no-referrer"
            />
          ) : (
            <p>Webcam unavailable right now.</p>
          )}
        </Panel>
      </section>

      <footer className="footer">
        <span>Selected date: {date}</span>
        <span>Flight source: {flights?.source ?? 'loading'}</span>
        <span>Last weather update: {weather?.updatedAt ? formatLocalTime(weather.updatedAt) : '—'}</span>
      </footer>
    </main>
  );
}

function Panel({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <section className="card panel">
      <div className="panel-header">
        <div>
          <h2>{title}</h2>
          <p>{subtitle}</p>
        </div>
      </div>
      <div className="panel-content">{children}</div>
    </section>
  );
}

function FlightCard({ flight }: { flight: FlightRecord }) {
  return (
    <article className="flight-card">
      <div className="flight-topline">
        <div>
          <h3>{flight.airline}</h3>
          <p>{flight.flightNumber}</p>
        </div>
        <span className="flight-status">{flight.status}</span>
      </div>
      <div className="flight-grid">
        <FlightField label={flight.kind === 'arrival' ? 'Origin' : 'Destination'} value={flight.city} />
        <FlightField label="Scheduled" value={formatLocalTime(flight.scheduledTime)} />
        <FlightField label="Actual" value={formatLocalTime(flight.actualTime)} />
        <FlightField label="Gate" value={flight.gate || '—'} />
        <FlightField label="Aircraft" value={flight.aircraft || '—'} />
      </div>
      {flight.risk && (
        <div className="risk-box">
          <strong>Risk estimate</strong>
          <span>Delay: {flight.risk.delay}%</span>
          <span>Cancellation: {flight.risk.cancellation}%</span>
          <p>{flight.risk.reason}</p>
        </div>
      )}
    </article>
  );
}

function FlightField({ label, value }: { label: string; value: string }) {
  return (
    <div className="field-block">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
