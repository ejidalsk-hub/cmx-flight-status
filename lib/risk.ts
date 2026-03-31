import { clamp } from './utils';
import type { FlightRecord, WeatherPayload } from './types';

export function addBaselineRisk(flight: FlightRecord, weather?: WeatherPayload): FlightRecord {
  const status = flight.status.toLowerCase();
  const wind = weather?.current.windMph ?? 0;
  const temp = weather?.current.temperatureF ?? 32;
  const conditions = weather?.current.conditions?.toLowerCase() ?? '';

  let delay = 12;
  let cancellation = 4;
  const reasons: string[] = [];

  if (status.includes('delay')) {
    delay += 35;
    cancellation += 10;
    reasons.push('current status already shows delay');
  }

  if (wind >= 20) {
    delay += 18;
    cancellation += 8;
    reasons.push('strong winds at CMX');
  }

  if (temp <= 20) {
    delay += 8;
    cancellation += 6;
    reasons.push('cold weather conditions');
  }

  if (conditions.includes('snow') || conditions.includes('ice')) {
    delay += 22;
    cancellation += 15;
    reasons.push('wintry weather in the area');
  }

  if (!reasons.length) reasons.push('baseline operational uncertainty');

  return {
    ...flight,
    risk: {
      delay: clamp(Math.round(delay)),
      cancellation: clamp(Math.round(cancellation)),
      reason: reasons.join(', '),
    },
  };
}
