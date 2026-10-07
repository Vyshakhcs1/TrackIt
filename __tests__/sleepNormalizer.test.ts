import { summarizeSleepByWakeDate } from '../src/shared/health/sleepNormalizer';

const at = (day: number, hour: number, minute = 0) =>
  new Date(2026, 9, day, hour, minute).toISOString();

describe('summarizeSleepByWakeDate', () => {
  it('assigns a night to the day it ended and splits stages', () => {
    const [night] = summarizeSleepByWakeDate([
      {
        startTime: at(6, 23),
        endTime: at(7, 7),
        stages: [
          { startTime: at(6, 23), endTime: at(7, 1), stage: 4 },
          { startTime: at(7, 1), endTime: at(7, 3), stage: 5 },
          { startTime: at(7, 3), endTime: at(7, 3, 30), stage: 1 },
          { startTime: at(7, 3, 30), endTime: at(7, 5), stage: 6 },
          { startTime: at(7, 5), endTime: at(7, 7), stage: 4 },
        ],
      },
    ]);

    expect(night.date).toBe('2026-10-07');
    expect(night.value).toBe(450);
    expect(night.deepMinutes).toBe(120);
    expect(night.remMinutes).toBe(90);
    expect(night.lightMinutes).toBe(240);
    expect(night.awakeMinutes).toBe(30);
  });

  it('does not double count the same night reported by two sources', () => {
    const session = { startTime: at(6, 23), endTime: at(7, 7) };
    const [night] = summarizeSleepByWakeDate([session, { ...session }]);

    expect(night.value).toBe(480);
  });

  it('uses the whole session when a source reports no stages', () => {
    const [night] = summarizeSleepByWakeDate([{ startTime: at(7, 0), endTime: at(7, 6) }]);

    expect(night.value).toBe(360);
    expect(night.deepMinutes).toBe(0);
  });
});
