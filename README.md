# CMX Airport Live Flight Status

A Next.js app for the SAT4520/5520 course project.

## What it includes
- 2 arrivals and 2 departures for CMX
- Date presets: today, yesterday, past two days, tomorrow, and custom date search
- Live Houghton weather using the National Weather Service API
- Airport webcam section
- Auto refresh
- Optional SAT5520-style baseline risk estimate

## Best hosting choice
Deploy on Vercel. It is the simplest option for a small Next.js app because it gives you free Hobby hosting, automatic CI/CD from GitHub, and server-side API routes so your flight API key stays private.

## Setup
1. Create a flight-data API account (the code is wired for Aviationstack first).
2. Copy `.env.example` to `.env.local`
3. Add your API key
4. Install and run:
   ```bash
   npm install
   npm run dev
   ```
5. Deploy to Vercel by importing the repo.

## Notes on flight APIs
The app is structured so you can swap providers if your plan limits historical or future schedule access. The current adapter is written for Aviationstack because it advertises historical, real-time, and future schedule coverage.

## Deploy
- Push to GitHub
- Import the repo into Vercel
- Add the same environment variables in Vercel Project Settings
- Deploy
