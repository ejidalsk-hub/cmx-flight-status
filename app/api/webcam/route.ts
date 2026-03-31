import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    title: 'CMX Airport Live Webcam',
    iframeUrl: 'https://g1.ipcamlive.com/player/player.php?alias=68e0608661d16&autoplay=1',
    sourceLabel: 'Houghton County Memorial Airport webcam',
    refreshedAt: new Date().toISOString(),
  });
}
