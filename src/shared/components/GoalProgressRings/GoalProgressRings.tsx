import { PieChart } from 'react-native-gifted-charts';
import { StyleSheet, Text, View } from 'react-native';

const chartSize = 204;
const ringRadii = [82, 68, 54, 40];
const ringColors = ['#006C4A', '#188ACE', '#BA1A1A', '#565E74'];

interface GoalProgressRingsProps {
  progressValues: number[];
  completedGoals: number;
  totalGoals: number;
}

export function GoalProgressRings({
  progressValues,
  completedGoals,
  totalGoals,
}: GoalProgressRingsProps) {
  const ringData = ringRadii.map((radius, index) => ({
    radius,
    progress: progressValues[index] ?? 0,
    color: ringColors[index],
  }));

  return (
    <View style={styles.container}>
      {ringData.map(ring => {
        const diameter = ring.radius * 2;
        return (
          <View
            key={ring.radius}
            pointerEvents="none"
            style={[
              styles.ring,
              {
                width: diameter,
                height: diameter,
                left: (chartSize - diameter) / 2,
                top: (chartSize - diameter) / 2,
              },
            ]}
          >
            <PieChart
              data={[
                { value: ring.progress, color: ring.color },
                { value: 100 - ring.progress, color: '#E5EEFF' },
              ]}
              donut
              radius={ring.radius}
              innerRadius={ring.radius - 8}
              initialAngle={-90}
              strokeWidth={0}
              paddingHorizontal={0}
              paddingVertical={0}
              backgroundColor="transparent"
              showText={false}
            />
          </View>
        );
      })}
      <View style={styles.center}>
        <Text style={styles.goalCount}>{`${completedGoals}/${totalGoals}`}</Text>
        <Text style={styles.goalLabel}>GOALS</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: chartSize,
    height: chartSize,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  center: {
    width: 56,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 28,
    backgroundColor: '#FFFFFF',
    elevation: 2,
    shadowColor: '#0B1C30',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
  },
  goalCount: {
    color: '#0B1C30',
    fontFamily: 'SpaceGrotesk',
    fontSize: 22,
    fontWeight: '700',
    lineHeight: 26,
  },
  goalLabel: {
    marginTop: 0,
    color: '#0B1C30',
    fontFamily: 'Manrope',
    fontSize: 9,
    fontWeight: '700',
    lineHeight: 12,
    letterSpacing: 0.4,
  },
});