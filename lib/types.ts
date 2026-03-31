export type FlightRecord = {
  id: string;
  kind: 'arrival' | 'departure';
  airline: string;
  flightNumber: string;
  city: string;
  scheduledTime: string | null;
  actualTime: string | null;
  status: string;
  gate?: string | null;
  aircraft?: string | null;
  risk?: {
    delay: number;
    cancellation: number;
    reason: string;
  };
};

export type WeatherPayload = {
  location: string;
  updatedAt: string;
  current: {
    conditions: string;
    temperatureF: number | null;
    windMph: number | null;
    windDirection: string | null;
  };
  forecast: Array<{
    name: string;
    temperature: number;
    unit: string;
    shortForecast: string;
    windSpeed: string;
  }>;
};

export type FlightsPayload = {
  date: string;
  source: string;
  arrivals: FlightRecord[];
  departures: FlightRecord[];
  note?: string;
};

export type WebcamPayload = {
  title: string;
  iframeUrl: string;
  sourceLabel: string;
  refreshedAt: string;
};
