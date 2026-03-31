import type { FlightsPayload } from './types';

export function getDemoFlights(date: string): FlightsPayload {
  return {
    date,
    source: 'demo fallback',
    note: 'Showing demo data until a flight API key is added.',
    arrivals: [
      {
        id: 'arr-1',
        kind: 'arrival',
        airline: 'United Express',
        flightNumber: 'UA 3612',
        city: 'Chicago (ORD)',
        scheduledTime: `${date}T10:20:00-04:00`,
        actualTime: `${date}T10:24:00-04:00`,
        status: 'Landed',
        gate: '—',
        aircraft: 'CRJ-200',
      },
      {
        id: 'arr-2',
        kind: 'arrival',
        airline: 'United Express',
        flightNumber: 'UA 4291',
        city: 'Chicago (ORD)',
        scheduledTime: `${date}T18:55:00-04:00`,
        actualTime: null,
        status: 'Scheduled',
        gate: '—',
        aircraft: 'ERJ-145',
      },
    ],
    departures: [
      {
        id: 'dep-1',
        kind: 'departure',
        airline: 'United Express',
        flightNumber: 'UA 3440',
        city: 'Chicago (ORD)',
        scheduledTime: `${date}T06:15:00-04:00`,
        actualTime: `${date}T06:27:00-04:00`,
        status: 'Departed',
        gate: '—',
        aircraft: 'CRJ-200',
      },
      {
        id: 'dep-2',
        kind: 'departure',
        airline: 'United Express',
        flightNumber: 'UA 4725',
        city: 'Chicago (ORD)',
        scheduledTime: `${date}T14:35:00-04:00`,
        actualTime: null,
        status: 'Scheduled',
        gate: '—',
        aircraft: 'ERJ-145',
      },
    ],
  };
}
