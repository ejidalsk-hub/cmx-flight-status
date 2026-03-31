import trainedModel from './trained-model.json';
import type { FlightRecord, WeatherPayload } from './types';

type TargetName = 'delayed' | 'cancelled';
type FeatureName =
  | 'kind'
  | 'airline_family'
  | 'route'
  | 'month_bucket'
  | 'hour_bucket'
  | 'wind_bucket'
  | 'precip_flag'
  | 'freezing_flag'
  | 'fog_flag'
  | 'status_bucket';

type ModelJson = typeof trainedModel;

function clampPercent(value: number) {
  return Math.max(1, Math.min(99, Math.round(value)));
}

function probabilityFromLogs(log0: number, log1: number) {
  const maxLog = Math.max(log0, log1);
  const p0 = Math.exp(log0 - maxLog);
  const p1 = Math.exp(log1 - maxLog);
  return p1 / (p0 + p1);
}

function safeDate(raw?: string | null) {
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

function getMonthBucket(flight: FlightRecord) {
  const d = safeDate(flight.scheduledTime || flight.actualTime);
  const month = d ? d.getUTCMonth() + 1 : null;
  if (month == null) return 'shoulder';
  if ([11, 12, 1, 2, 3].includes(month)) return 'winter';
  if ([4, 5, 10].includes(month)) return 'shoulder';
  return 'summer';
}

function getHourBucket(flight: FlightRecord) {
  const d = safeDate(flight.scheduledTime || flight.actualTime);
  const hour = d ? d.getUTCHours() : null;
  if (hour == null) return 'midday';
  if (hour <= 7) return 'early';
  if (hour >= 20) return 'late';
  return 'midday';
}

function getWindBucket(weather?: WeatherPayload) {
  const wind = weather?.current.windMph ?? 0;
  if (wind >= 35) return 'extreme';
  if (wind >= 25) return 'high';
  if (wind >= 15) return 'moderate';
  return 'low';
}

function getConditionText(weather?: WeatherPayload) {
  const now = weather?.current.conditions ?? '';
  const forecast = weather?.forecast?.map((p) => p.shortForecast).join(' ') ?? '';
  return `${now} ${forecast}`.toLowerCase();
}

function hasAny(text: string, words: string[]) {
  return words.some((word) => text.includes(word));
}

function buildFeatures(flight: FlightRecord, weather?: WeatherPayload): Record<FeatureName, string> {
  const conditions = getConditionText(weather);
  const airlineLower = flight.airline.toLowerCase();
  const numberLower = flight.flightNumber.toLowerCase();
  const cityLower = flight.city.toLowerCase();
  const statusLower = flight.status.toLowerCase();

  const airlineFamily =
    airlineLower.includes('united') ||
    airlineLower.includes('skywest') ||
    airlineLower.includes('united express') ||
    numberLower.startsWith('ua') ||
    numberLower.startsWith('oo')
      ? 'united_family'
      : 'other';

  const route = cityLower.includes('chicago') || cityLower.includes("o'hare") || cityLower.includes('ohare') || cityLower.includes('ord')
    ? flight.kind === 'arrival'
      ? 'ord_cmx'
      : 'cmx_ord'
    : 'other';

  const statusBucket = statusLower.includes('delay')
    ? 'delayed'
    : statusLower.includes('active')
      ? 'active'
      : statusLower.includes('landed')
        ? 'landed'
        : 'scheduled';

  return {
    kind: flight.kind,
    airline_family: airlineFamily,
    route,
    month_bucket: getMonthBucket(flight),
    hour_bucket: getHourBucket(flight),
    wind_bucket: getWindBucket(weather),
    precip_flag: hasAny(conditions, ['snow', 'rain', 'showers', 'storm', 'thunder']) ? '1' : '0',
    freezing_flag: hasAny(conditions, ['freezing', 'ice', 'sleet', 'icy']) ? '1' : '0',
    fog_flag: hasAny(conditions, ['fog', 'mist', 'haze', 'blowing snow']) ? '1' : '0',
    status_bucket: statusBucket,
  };
}

function classify(target: TargetName, featureValues: Record<FeatureName, string>) {
  const model = (trainedModel as ModelJson).models[target];

  let log0 = Math.log(model.priors['0']);
  let log1 = Math.log(model.priors['1']);

  for (const feature of Object.keys(featureValues) as FeatureName[]) {
    const value = featureValues[feature];
    const like0 = model.likelihoods[feature]['0'][value] ?? 1e-6;
    const like1 = model.likelihoods[feature]['1'][value] ?? 1e-6;
    log0 += Math.log(like0);
    log1 += Math.log(like1);
  }

  return probabilityFromLogs(log0, log1);
}

function buildReason(features: Record<FeatureName, string>) {
  const reasons: string[] = [];

  if (features.month_bucket === 'winter') reasons.push('winter-season pattern');
  if (features.wind_bucket === 'moderate') reasons.push('elevated winds');
  if (features.wind_bucket === 'high' || features.wind_bucket === 'extreme') reasons.push('strong winds');
  if (features.precip_flag === '1') reasons.push('precipitation signal');
  if (features.freezing_flag === '1') reasons.push('freezing conditions');
  if (features.fog_flag === '1') reasons.push('reduced visibility');
  if (features.route === 'ord_cmx' || features.route === 'cmx_ord') reasons.push('CMX-ORD route sensitivity');
  if (features.status_bucket === 'delayed') reasons.push('current delayed status');
  if (features.status_bucket === 'active') reasons.push('active aircraft rotation');
  if (features.hour_bucket === 'early') reasons.push('early-day schedule');
  if (features.hour_bucket === 'late') reasons.push('late-day schedule');

  return reasons.length ? reasons.join(', ') : 'historical baseline pattern';
}

export function addBaselineRisk(flight: FlightRecord, weather?: WeatherPayload): FlightRecord {
  const features = buildFeatures(flight, weather);
  const delayProbability = classify('delayed', features);
  const cancellationProbability = classify('cancelled', features);

  return {
    ...flight,
    risk: {
      delay: clampPercent(delayProbability * 100),
      cancellation: clampPercent(cancellationProbability * 100),
      reason: buildReason(features),
    },
  };
}
