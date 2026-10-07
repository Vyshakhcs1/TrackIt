import { localDateKey } from './dateKeys';
import type { DeviceDailyValue } from './healthConnectTypes';

export interface SleepSessionInput {
  startTime: string;
  endTime: string;
  stages?: { startTime: string; endTime: string; stage: number }[];
}

type Interval = [number, number];

// Health Connect SleepStageType values.
const AWAKE = 1;
const SLEEPING = 2;
const LIGHT = 4;
const DEEP = 5;
const REM = 6;

function unionMinutes(intervals: Interval[]): number {
  const sorted = [...intervals].sort((left, right) => left[0] - right[0]);
  let total = 0;
  let currentStart = 0;
  let currentEnd = 0;
  for (const [start, end] of sorted) {
    if (end <= start) {
      continue;
    }
    if (currentEnd === 0 || start > currentEnd) {
      total += currentEnd - currentStart;
      currentStart = start;
      currentEnd = end;
    } else if (end > currentEnd) {
      currentEnd = end;
    }
  }
  total += currentEnd - currentStart;
  return Math.round(total / 60000);
}

interface DayBuckets {
  asleep: Interval[];
  deep: Interval[];
  rem: Interval[];
  light: Interval[];
  awake: Interval[];
}

// Each session belongs to the local date it ended on; overlapping sources are merged.
export function summarizeSleepByWakeDate(
  sessions: SleepSessionInput[],
): DeviceDailyValue[] {
  const days = new Map<string, DayBuckets>();

  for (const session of sessions) {
    const date = localDateKey(session.endTime);
    const buckets = days.get(date) ?? { asleep: [], deep: [], rem: [], light: [], awake: [] };
    days.set(date, buckets);

    if (!session.stages?.length) {
      buckets.asleep.push([Date.parse(session.startTime), Date.parse(session.endTime)]);
      continue;
    }

    for (const stage of session.stages) {
      const interval: Interval = [Date.parse(stage.startTime), Date.parse(stage.endTime)];
      switch (stage.stage) {
        case DEEP:
          buckets.deep.push(interval);
          buckets.asleep.push(interval);
          break;
        case REM:
          buckets.rem.push(interval);
          buckets.asleep.push(interval);
          break;
        case LIGHT:
        case SLEEPING:
          buckets.light.push(interval);
          buckets.asleep.push(interval);
          break;
        case AWAKE:
          buckets.awake.push(interval);
          break;
      }
    }
  }

  return [...days.entries()]
    .map(([date, buckets]) => ({
      date,
      value: unionMinutes(buckets.asleep),
      deepMinutes: unionMinutes(buckets.deep),
      remMinutes: unionMinutes(buckets.rem),
      lightMinutes: unionMinutes(buckets.light),
      awakeMinutes: unionMinutes(buckets.awake),
    }))
    .filter(day => day.value > 0)
    .sort((left, right) => left.date.localeCompare(right.date));
}
