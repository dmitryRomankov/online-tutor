import { localStartOptions } from './time';

describe('booking local time', () => {
  it('converts zones and rejects a nonexistent local time', () => {
    expect(localStartOptions('2026-11-27', '14:00', 'Europe/Warsaw')).toEqual([
      '2026-11-27T13:00:00.000Z',
    ]);
    expect(localStartOptions('2026-03-29', '02:30', 'Europe/Warsaw')).toEqual([]);
    expect(localStartOptions('2026-02-30', '14:00', 'Europe/Warsaw')).toEqual([]);
  });

  it('returns both occurrences of a repeated wall time', () => {
    expect(localStartOptions('2026-10-25', '02:30', 'Europe/Warsaw')).toEqual([
      '2026-10-25T00:30:00.000Z',
      '2026-10-25T01:30:00.000Z',
    ]);
    expect(localStartOptions('2026-04-05', '01:45', 'Australia/Lord_Howe')).toEqual([
      '2026-04-04T14:45:00.000Z',
      '2026-04-04T15:15:00.000Z',
    ]);
  });
});
