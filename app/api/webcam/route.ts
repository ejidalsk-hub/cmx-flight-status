import { NextResponse } from 'next/server';
import type { WebcamPayload } from '@/lib/types';

export async function GET() {
  const payload: WebcamPayload = {
    title: 'CMX Airport Webcam',
    iframeUrl: 'https://weathercams.faa.gov/map/-88.48889%2C46.84854%2C9/airport/CMX/details/rco',
    sourceLabel: 'FAA WeatherCams',
    refreshedAt: new Date().toISOString(),
  };

  return NextResponse.json(payload);
}
