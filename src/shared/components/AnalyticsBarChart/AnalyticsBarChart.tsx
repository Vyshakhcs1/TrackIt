import { BarChart } from 'react-native-gifted-charts';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';

export interface AnalyticsBar {
  label: string;
  value: number;
  displayValue: string;
  achieved: boolean;
  projected?: boolean;
}

interface AnalyticsBarChartProps {
  bars: AnalyticsBar[];
  accentColor: string;
  goalPosition: number;
  goalLabel: string;
  selectedIndex: number;
  onSelectBar: (index: number) => void;
}

export function AnalyticsBarChart({
  bars,
  accentColor,
  goalPosition,
  goalLabel,
  selectedIndex,
  onSelectBar,
}: AnalyticsBarChartProps) {
  const { width: screenWidth } = useWindowDimensions();
  const chartWidth = Math.max(272, screenWidth - 76);
  const barWidth = 14;
  const edgeSpacing = 7;
  const barSpacing =
    bars.length > 1
      ? Math.max(
          8,
          (chartWidth - edgeSpacing * 2 - barWidth * bars.length) /
            (bars.length - 1),
        )
      : 8;

  return (
    <View style={styles.container}>
      <BarChart
        data={bars.map((bar, index) => ({
          value: bar.value,
          label: bar.label,
          frontColor: bar.projected || !bar.achieved ? '#E2E8F0' : accentColor,
          barWidth,
          barBorderRadius: 9,
          barBorderWidth: index === selectedIndex ? 1.5 : bar.projected ? 1 : 0,
          barBorderColor: index === selectedIndex ? '#0F172A' : '#94A3B8',
          onPress: () => onSelectBar(index),
        }))}
        width={chartWidth}
        height={190}
        parentWidth={chartWidth}
        adjustToWidth
        maxValue={100}
        noOfSections={4}
        barWidth={barWidth}
        spacing={barSpacing}
        initialSpacing={edgeSpacing}
        endSpacing={edgeSpacing}
        roundedTop
        xAxisThickness={0}
        xAxisColor="transparent"
        xAxisLabelTexts={bars.map(bar => bar.label)}
        xAxisLabelsAtBottom
        xAxisLabelsHeight={24}
        xAxisLabelTextStyle={styles.xAxisLabel}
        yAxisThickness={0}
        yAxisLabelWidth={0}
        hideYAxisText
        hideRules
        rulesLength={chartWidth}
        showReferenceLine1
        referenceLine1Position={goalPosition}
        referenceLine1Config={{
          color: '#CBD5E1',
          thickness: 1,
          type: 'dashed',
          dashWidth: 4,
          dashGap: 4,
          zIndex: 20,
        }}
        backgroundColor="transparent"
        disableScroll
        isAnimated={false}
      />
      <Text
        pointerEvents="none"
        style={[
          styles.goalLabel,
          { top: Math.max(0, ((100 - goalPosition) / 100) * 140 - 2) },
        ]}
      >
        {goalLabel}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    width: '100%',
    height: 212,
    alignItems: 'center',
  },
  xAxisLabel: {
    color: '#94A3B8',
    fontFamily: 'Manrope',
    fontSize: 11,
    fontWeight: '700',
  },
  goalLabel: {
    position: 'absolute',
    right: 0,
    color: '#0F766E',
    fontFamily: 'Manrope',
    fontSize: 9,
    fontWeight: '700',
    paddingHorizontal: 6,
    paddingVertical: 3,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#99F6E4',
    borderRadius: 5,
    backgroundColor: '#F0FDFA',
    zIndex: 10,
    elevation: 3,
  },
});
