let arrivalsData: any[] = [];
let departuresData: any[] = [];
let arrivalsError: string | null = null;
let departuresError: string | null = null;

// ARRIVALS
try {
  const arrivalsRes = await fetch(arrivalsUrl);
  if (!arrivalsRes.ok) {
    arrivalsError = `Arrivals API error: ${arrivalsRes.status}`;
  } else {
    const json = await arrivalsRes.json();
    arrivalsData = json.data || [];
  }
} catch (err: any) {
  arrivalsError = err.message;
}

// DEPARTURES
try {
  const departuresRes = await fetch(departuresUrl);
  if (!departuresRes.ok) {
    departuresError = `Departures API error: ${departuresRes.status}`;
  } else {
    const json = await departuresRes.json();
    departuresData = json.data || [];
  }
} catch (err: any) {
  departuresError = err.message;
}

// If BOTH failed → fallback
if (arrivalsData.length === 0 && departuresData.length === 0) {
  return {
    ...getDemoFlights(date),
    source: 'demo fallback',
    note: 'Both arrivals and departures API calls failed. Showing fallback rows.',
    error: `Arrivals: ${arrivalsError} | Departures: ${departuresError}`,
  };
}
