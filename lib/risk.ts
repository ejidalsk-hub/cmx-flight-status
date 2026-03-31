import trainedModel from '@/lib/trained-model.json';
import type { FlightRecord, WeatherPayload } from '@/lib/types';

type RiskResult = FlightRecord['risk'];

type FeatureName =
  | 'kind'
  | 'airline_family'
  | 'route'
  | 'season'
  | 'time_bucket'
  | 'wind_bucket'
  | 'weather_flag'
  | 'status_bucket';

type FeatureValues = Record<FeatureName, string>;

type BinaryModel = {
  priors: Record<'0' | '1', number>;
  likelihoods: Record<string, Record<'0' | '1', Record<string, number>>>;
};

type TrainedModelShape = {
  models: {
    delayed: BinaryModel;
    cancelled: BinaryModel;
  };
};

const model = trainedModel as unknown as TrainedModelShape;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function probabilityFromLogs(log0: number, log1: number) {
  const maxLog = Math.max(log0, log1);
  const p0 = Math.exp(log0 - maxLog);
  const p1 = Math.exp(log1 - maxLog);
  return p1 / (p0 + p1);
}

function percent(value: number) {
  return Math.round(clamp(value * 100, 1, 99));
}

function getMonth(flight: FlightRecord) {
  const raw = flight.scheduledTime || flight.actualTime;
  if (!raw) return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  return d.getUTCMonth() + 1;
}

function getHour(flight: FlightRecord) {
  const raw = flight.scheduledTime || flight.actualTime;
  if (!raw) return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  return d.getUTCHours();
}

function detectSeason(month: number | null): string {
  if (month === null) return 'shoulder';
  if ([11, 12, 1, 2, 3].includes(month)) return 'winter';
  if ([6, 7, 8].includes(month)) return 'summer';
  return 'shoulder';
}

function detectTimeBucket(hour: number | null): string {
  if (hour === null) return 'midday';
  if (hour <= 7) return 'early';
  if (hour <= 14) return 'midday';
  if (hour <= 19) return 'afternoon_evening';
  return 'night';
}

function detectAirlineFamily(flight: FlightRecord): string {
  const airline = flight.airline.toLowerCase();
  const number = flight.flightNumber.toLowerCase();

  const isUnitedFamily =
    airline.includes('united') ||
    airline.includes('skywest') ||
    airline.includes('united express') ||
    number.startsWith('ua') ||
    number.startsWith('oo');

  return isUnitedFamily ? 'united_family' : 'other';
}

function detectRoute(flight: FlightRecord): string {
  const city = flight.city.toLowerCase();

  if (
    city.includes('chicago') ||
    city.includes("o'hare") ||
    city.includes('ohare') ||
    city.includes('ord')
  ) {
    return flight.kind === 'arrival' ? 'ord_cmx' : 'cmx_ord';
  }

  return 'other';
}

function detectWindBucket(weather?: WeatherPayload): string {
  const wind = weather?.current.windMph ?? 0;
  if (wind >= 30) return 'high';
  if (wind >= 15) return 'moderate';
  return 'low';
}

function detectWeatherFlag(weather?: WeatherPayload): string {
  const current = weather?.current.conditions || '';
  const forecast = weather?.forecast?.map((p) => p.shortForecast).join(' ') || '';
  const combined = `${current} ${forecast}`.toLowerCase();

  if (
    combined.includes('snow') ||
    combined.includes('blizzard') ||
    combined.includes('flurries') ||
    combined.includes('wintry')
  ) {
    return 'snow';
  }

  if (
    combined.includes('freezing') ||
    combined.includes('ice') ||
    combined.includes('icy') ||
    combined.includes('sleet')
  ) {
    return 'freezing';
  }

  if (
    combined.includes('fog') ||
    combined.includes('mist') ||
    combined.includes('haze') ||
    combined.includes('blowing snow')
  ) {
    return 'low_visibility';
  }

  if (
    combined.includes('rain') ||
    combined.includes('showers') ||
    combined.includes('storm') ||
    combined.includes('thunder')
  ) {
    return 'rain';
  }

  return 'clear';
}

function detectStatusBucket(flight: FlightRecord): string {
  const status = flight.status.toLowerCase();

  if (status.includes('delayed')) return 'delayed';
  if (status.includes('active')) return 'active';
  if (status.includes('landed')) return 'landed';
  if (status.includes('scheduled')) return 'scheduled';

  return 'other';
}

function buildFeatureValues(flight: FlightRecord, weather?: WeatherPayload): FeatureValues {
  const month = getMonth(flight);
  const hour = getHour(flight);

  return {
    kind: flight.kind,
    airline_family: detectAirlineFamily(flight),
    route: detectRoute(flight),
    season: detectSeason(month),
    time_bucket: detectTimeBucket(hour),
    wind_bucket: detectWindBucket(weather),
    weather_flag: detectWeatherFlag(weather),
    status_bucket: detectStatusBucket(flight),
  };
}

function scoreModel(modelPart: BinaryModel, featureValues: FeatureValues) {
  let log0 = Math.log(modelPart.priors['0'] ?? 0.5);
  let log1 = Math.log(modelPart.priors['1'] ?? 0.5);

  const featureNames = Object.keys(featureValues) as FeatureName[];

  for (const feature of featureNames) {
    const value = featureValues[feature];
    const featureLikelihoods = modelPart.likelihoods[feature] ?? { '0': {}, '1': {} };

    const like0 = featureLikelihoods['0']?.[value] ?? 1e-6;
    const like1 = featureLikelihoods['1']?.[value] ?? 1e-6;

    log0 += Math.log(like0);
    log1 += Math.log(like1);
  }

  return probabilityFromLogs(log0, log1);
}

function buildReason(flight: FlightRecord, weather?: WeatherPayload) {
  const parts: string[] = [];

  const route = detectRoute(flight);
  const season = detectSeason(getMonth(flight));
  const wind = detectWindBucket(weather);
  const wx = detectWeatherFlag(weather);
  const status = detectStatusBucket(flight);

  if (route === 'cmx_ord' || route === 'ord_cmx') parts.push('CMX-ORD routing');
  if (season === 'winter') parts.push('winter operations');
  if (wind === 'moderate') parts.push('gusty winds');
  if (wind === 'high') parts.push('strong winds');
  if (wx === 'snow') parts.push('snow');
  if (wx === 'freezing') parts.push('freezing conditions');
  if (wx === 'low_visibility') parts.push('low visibility');
  if (wx === 'rain') parts.push('rain');
  if (status === 'delayed') parts.push('current delayed status');
  if (status === 'active') parts.push('active flight status');

  return parts.length ? parts.join(', ') : 'trained classifier baseline';
}

export function addBaselineRisk(
  flight: FlightRecord,
  weather?: WeatherPayload,
): FlightRecord {
  const featureValues = buildFeatureValues(flight, weather);

  let delayProb = scoreModel(model.models.delayed, featureValues);
  let cancelProb = scoreModel(model.models.cancelled, featureValues);

  const status = flight.status.toLowerCase();

  if (status.includes('delayed')) {
    delayProb = Math.min(0.95, delayProb + 0.2);
    cancelProb = Math.min(0.8, cancelProb + 0.05);
  }

  if (status.includes('landed')) {
    delayProb = Math.max(0.01, delayProb - 0.2);
    cancelProb = Math.max(0.01, cancelProb - 0.05);
  }

  if (status.includes('active')) {
    delayProb = Math.min(0.95, delayProb + 0.08);
  }

  const risk: RiskResult = {
    delay: percent(delayProb),
    cancellation: percent(Math.min(cancelProb, delayProb)),
    reason: buildReason(flight, weather),
  };

  return {
    ...flight,
    risk,
  };
}
