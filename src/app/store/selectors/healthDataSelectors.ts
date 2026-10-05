import type { RootState } from '../appStore';
import type { WeightMeasurement } from '../../../features/metrics/domain/models/LogMetricData';

export function selectCurrentWeight(
  state: RootState,
): WeightMeasurement | null {
  const history = state.healthData.logMetric?.history ?? [];

  return history.reduce<WeightMeasurement | null>((latest, measurement) => {
    if (
      !latest ||
      Date.parse(measurement.measuredAt) > Date.parse(latest.measuredAt)
    ) {
      return measurement;
    }

    return latest;
  }, null);
}