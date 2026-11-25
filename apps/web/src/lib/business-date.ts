export function businessDate(date: Date, timeZone: string) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(date);
}

export function addCalendarDays(date: string, days: number) {
  const day = new Date(`${date}T00:00:00.000Z`);
  day.setUTCDate(day.getUTCDate() + days);
  return day.toISOString().slice(0, 10);
}

export function businessMidnight(date: string, timeZone: string) {
  const midnight = new Date(`${date}T00:00:00.000Z`).getTime();
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  });
  let instant = midnight;
  for (let attempt = 0; attempt < 3; attempt++) {
    const fields = Object.fromEntries(formatter.formatToParts(instant).map(({ type, value }) => [type, value]));
    const shown = Date.UTC(+fields.year, +fields.month - 1, +fields.day, +fields.hour, +fields.minute, +fields.second);
    if (shown === midnight) break;
    instant += midnight - shown;
  }
  return new Date(instant).toISOString();
}
