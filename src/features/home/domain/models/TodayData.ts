export type TodayGoalMetric = 'steps' | 'water' | 'calories' | 'sleep';

export interface TodayGoal {
  metric: TodayGoalMetric;
  value: number;
  goal: number;
  unit: string;
  goalMet: boolean;
}

export interface TodayData {
  date: string;
  dailyBalance: {
    goals: TodayGoal[];
  };
  metrics: {
    steps: {
      value: number;
      goal: number;
      unit: string;
      recordedAt: string;
    };
    water: {
      value: number;
      goal: number;
      unit: string;
      recordedAt: string;
    };
    weight: {
      value: number;
      unit: string;
      goal: number;
      recordedAt: string;
    };
    sleep: {
      durationMinutes: number;
      goalMinutes: number;
      score: number;
      stages: {
        deepMinutes: number;
        remMinutes: number;
        lightMinutes: number;
        awakeMinutes: number;
      };
      recordedAt: string;
    };
    calories: {
      value: number;
      goal: number;
      unit: string;
      recordedAt: string;
    };
  };
  quickActions: {
    waterIncrementMl: number;
    syncNowEnabled: boolean;
  };
}