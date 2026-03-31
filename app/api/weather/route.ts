import { NextResponse } from 'next/server';
import type { WeatherPayload } from '@/lib/types';

const LAT = 47.1684;
const LON = -88.4891;
const USER_AGENT = process.env.APP_USER_AGENT || 'cmx-flight-status-demo/0.1 (example@example.com)';

async function nwsFetch(url: string) {
  const response = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'application/geo+json, application/json',
    },
    next: { revalidate: 300 },
  });

  if (!response.ok) {
    throw new Error(`NWS request failed: ${response.status}`);
  }

  return response.json();
}

export async function GET() {
  try {
    const points = await nwsFetch(`https://api.weather.gov/points/${LAT},${LON}`);
    const forecastUrl = points.properties.forecast;
    const stationsUrl = points.properties.observationStations;

    const stations = await nwsFetch(stationsUrl);
    const stationUrl = stations.observationStations?.[0];
    const [forecast, latest] = await Promise.all([
      nwsFetch(forecastUrl),
      stationUrl ? nwsFetch(`${stationUrl}/observations/latest`) : Promise.resolve(null),
    ]);

    const currentProperties = latest?.properties;
    const payload: WeatherPayload = {
      location: 'Houghton, MI (CMX area)',
      updatedAt: new Date().toISOString(),
      current: {
        conditions: currentProperties?.textDescription ?? 'Unavailable',
        temperatureF:
          currentProperties?.temperature?.value != null
            ? Math.round((currentProperties.temperature.value * 9) / 5 + 32)
            : null,
        windMph:
          currentProperties?.windSpeed?.value != null
            ? Math.round(currentProperties.windSpeed.value * 0.621371)
            : null,
        windDirection: currentProperties?.windDirection?.value != null
          ? `${Math.round(currentProperties.windDirection.value)}°`
          : null,
      },
      forecast: (forecast.properties?.periods ?? []).slice(0, 4).map((period: any) => ({
        name: period.name,
        temperature: period.temperature,
        unit: period.temperatureUnit,
        shortForecast: period.shortForecast,
        windSpeed: period.windSpeed,
      })),
    };

    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Unable to load weather data right now.',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    );
  }
}
