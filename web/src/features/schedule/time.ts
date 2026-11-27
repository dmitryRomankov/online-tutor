export function viewerZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}

export function localStartOptions(date: string, time: string, timeZone: string): string[] {
  const wallTime = `${date}T${time}`;
  const nominal = Date.parse(`${wallTime}:00Z`);
  if (!Number.isFinite(nominal) || new Date(nominal).toISOString().slice(0, 16) !== wallTime)
    return [];

  const formatter = new Intl.DateTimeFormat('sv-SE', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  const local = (instant: number) => formatter.format(instant).replace(' ', 'T');

  // Sample both sides of a clock change, then accept only exact wall-clock matches.
  const day = 86_400_000;
  const candidates = [nominal - day, nominal, nominal + day].map((sample) => {
    const offset = Date.parse(`${local(sample)}:00Z`) - sample;
    return nominal - offset;
  });

  return [...new Set(candidates)]
    .filter((candidate) => local(candidate) === wallTime)
    .sort((a, b) => a - b)
    .map((candidate) => new Date(candidate).toISOString());
}

export function bookingTime(start: string, durationMinutes: number, timeZone: string) {
  const first = new Date(start);
  const last = new Date(first.getTime() + durationMinutes * 60_000);
  const format = new Intl.DateTimeFormat(undefined, {
    timeZone,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

  return format.formatRange(first, last);
}
