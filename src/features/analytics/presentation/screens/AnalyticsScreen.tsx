import { useState } from 'react';
import type { ReactNode } from 'react';
import {
  Activity,
  Award,
  Clock3,
  Droplets,
  Flame,
  Flag,
  Footprints,
  HeartPulse,
  History,
  Moon,
  Route,
  Scale,
  Star,
  TrendingDown,
  TrendingUp,
  Trophy,
  Verified,
} from 'lucide-react-native';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppHeader } from '../../../../shared/components/AppHeader/AppHeader';
import { AnalyticsBarChart } from '../../../../shared/components/AnalyticsBarChart/AnalyticsBarChart';
import { useAnalyticsViewModel } from '../hooks/useAnalyticsViewModel';

type MetricKey = 'steps' | 'water' | 'weight' | 'sleep' | 'calories';
type Timeframe = '7d' | '30d' | '3m';

interface MetricAppearance {
  accent: string;
  accentDark: string;
  icon: ReactNode;
}

const timeframes: { key: Timeframe; label: string }[] = [
  { key: '7d', label: '7 Days' },
  { key: '30d', label: '30 Days' },
  { key: '3m', label: '3 Months' },
];

const summaryIcons: Record<MetricKey, ReactNode[]> = {
  steps: [<Activity size={18} />, <Verified size={18} />, <Trophy size={18} />, <Route size={18} />],
  water: [<Droplets size={18} />, <Verified size={18} />, <Star size={18} />, <Droplets size={18} />],
  weight: [<Scale size={18} />, <Flag size={18} />, <History size={18} />, <TrendingDown size={18} />],
  sleep: [<Clock3 size={18} />, <Star size={18} />, <Moon size={18} />, <HeartPulse size={18} />],
  calories: [<Flame size={18} />, <Verified size={18} />, <Award size={18} />, <Activity size={18} />],
};

const metricAppearance: Record<MetricKey, MetricAppearance> = {
  steps: {
    accent: '#14B8A6',
    accentDark: '#0F766E',
    icon: <Footprints size={20} color="#5EEAD4" strokeWidth={2} />,
  },
  water: {
    accent: '#0EA5E9',
    accentDark: '#0369A1',
    icon: <Droplets size={20} color="#0EA5E9" strokeWidth={2} />,
  },
  weight: {
    accent: '#10B981',
    accentDark: '#047857',
    icon: <Scale size={20} color="#059669" strokeWidth={2} />,
  },
  sleep: {
    accent: '#9333EA',
    accentDark: '#7E22CE',
    icon: <Moon size={20} color="#9333EA" strokeWidth={2} />,
  },
  calories: {
    accent: '#F97316',
    accentDark: '#C2410C',
    icon: <Flame size={20} color="#F97316" strokeWidth={2} />,
  },
};

export function AnalyticsScreen() {
  const [selectedMetric, setSelectedMetric] = useState<MetricKey>();
  const [selectedTimeframe, setSelectedTimeframe] = useState<Timeframe>();
  const [selectedBarIndex, setSelectedBarIndex] = useState<number>();
  const viewModel = useAnalyticsViewModel(
    metricAppearance,
    selectedMetric,
    selectedTimeframe,
    selectedBarIndex,
  );

  if (!viewModel.metric) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <AppHeader headerSubtitle="Analytics" />
        <View style={styles.loadingState}>
          {viewModel.status === 'failed' ? (
            <Text style={styles.loadingError}>{viewModel.error}</Text>
          ) : (
            <ActivityIndicator color="#0F766E" />
          )}
        </View>
      </SafeAreaView>
    );
  }

  const metric = viewModel.metric;
  const metricKey = viewModel.selectedMetric;
  const rangeKey = viewModel.selectedRange;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <AppHeader headerSubtitle="Analytics" />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.timeframeControl}>
          {timeframes.map(timeframe => {
            const active = rangeKey === timeframe.key;
            return (
              <Pressable
                key={timeframe.key}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                onPress={() => {
                  setSelectedTimeframe(timeframe.key);
                  setSelectedBarIndex(undefined);
                }}
                style={[styles.timeframeTab, active && styles.timeframeTabActive]}
              >
                <Text style={[styles.timeframeText, active && styles.timeframeTextActive]}>
                  {timeframe.label.toUpperCase()}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <ScrollView
          horizontal
          style={styles.metricScroller}
          contentContainerStyle={styles.metricChipRow}
          showsHorizontalScrollIndicator={false}
        >
          {viewModel.availableMetrics.map(key => {
            const active = metricKey === key;
            return (
              <Pressable
                key={key}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                onPress={() => {
                  setSelectedMetric(key);
                  setSelectedBarIndex(undefined);
                }}
                style={[
                  styles.metricChip,
                  active ? styles.metricChipActive : styles.metricChipInactive,
                ]}
              >
                <View style={styles.metricChipIcon}>{metricAppearance[key].icon}</View>
                <View style={styles.metricChipCopy}>
                  <Text
                    numberOfLines={1}
                    style={[styles.metricChipTitle, active && styles.metricChipTitleActive]}
                  >
                    {viewModel.metricLabels[key]}
                  </Text>
                  <Text
                    numberOfLines={1}
                    style={[styles.metricChipValue, active && styles.metricChipValueActive]}
                  >
                    {viewModel.chipValues[key]}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </ScrollView>

        <View style={styles.heroCard}>
          <View style={styles.heroTop}>
            <View style={styles.heroMetric}>
              <View style={[styles.metricDot, { backgroundColor: metric.accent }]} />
              <Text style={styles.heroCategory}>{metric.category.toUpperCase()}</Text>
              <View style={styles.heroValueRow}>
                <Text adjustsFontSizeToFit numberOfLines={1} style={styles.heroValue}>
                  {metric.value}
                </Text>
                <Text style={[styles.heroUnit, { color: metric.accentDark }]}>{metric.unit}</Text>
              </View>
              <View style={styles.deltaRow}>
                <TrendingUp size={14} color="#059669" strokeWidth={2.2} />
                <Text style={styles.deltaText}>{metric.delta}</Text>
              </View>
            </View>
            <View style={styles.rangeSummary}>
              <Text style={styles.rangeEyebrow}>
                {rangeKey === '7d'
                  ? '7-DAY RANGE'
                  : rangeKey === '30d'
                    ? '30-DAY RANGE'
                    : '3-MONTH RANGE'}
              </Text>
              <Text style={styles.rangeText}>{viewModel.selectedBucketLabel}</Text>
            </View>
          </View>

          <AnalyticsBarChart
            bars={metric.bars}
            accentColor={metric.accent}
            goalPosition={metric.goalPosition}
            goalLabel={metric.goal}
            selectedIndex={viewModel.selectedBarIndex}
            onSelectBar={setSelectedBarIndex}
          />

          <View style={styles.chartLegend}>
            <View style={styles.legendGroup}>
              <View style={styles.legendItem}>
                <View style={[styles.legendSwatch, { backgroundColor: metric.accent }]} />
                <Text style={styles.legendText}>Goal Achieved</Text>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.legendSwatch, styles.standardSwatch]} />
                <Text style={styles.legendText}>Goal Not Achieved</Text>
              </View>
            </View>
            <Pressable
              accessibilityRole="button"
              onPress={() => setSelectedBarIndex(undefined)}
              style={styles.todayReset}
            >
              <Text style={[styles.todayResetText, { color: metric.accentDark }]}>LATESTa</Text>
              <Activity size={13} color={metric.accentDark} />
            </Pressable>
          </View>
        </View>

        <View style={styles.summaryGrid}>
          {metric.stats.map((stat, index) => (
            <View key={stat.label} style={styles.summaryCard}>
              <View style={styles.summaryHeading}>
                <Text style={styles.summaryLabel}>{stat.label}</Text>
                <View>{summaryIcons[metricKey][index]}</View>
              </View>
              <View style={styles.summaryValueRow}>
                <Text adjustsFontSizeToFit numberOfLines={1} style={styles.summaryValue}>
                  {stat.value}
                </Text>
                {stat.badge ? (
                  <View style={[styles.summaryBadge, { backgroundColor: `${metric.accent}16` }]}>
                    <Text style={[styles.summaryBadgeText, { color: metric.accentDark }]}>
                      {stat.badge}
                    </Text>
                  </View>
                ) : null}
              </View>
              <View style={styles.summarySubRow}>
                <Text style={styles.summarySub}>{stat.sub}</Text>
              </View>
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FF',
  },
  loadingState: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingError: { color: '#BA1A1A', fontFamily: 'Manrope', fontSize: 13 },
  scroll: { flex: 1 },
  content: {
    gap: 14,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 28,
  },
  timeframeControl: {
    height: 38,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    padding: 4,
    borderRadius: 12,
    backgroundColor: 'rgba(226,232,240,0.75)',
  },
  timeframeTab: {
    flex: 1,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 9,
  },
  timeframeTabActive: {
    backgroundColor: '#FFFFFF',
    elevation: 2,
  },
  timeframeText: {
    color: '#475569',
    fontFamily: 'Manrope',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.45,
  },
  timeframeTextActive: {
    color: '#0F172A',
    fontWeight: '700',
  },
  metricScroller: {
    marginHorizontal: -16,
    flexGrow: 0,
  },
  metricChipRow: {
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 3,
  },
  metricChip: {
    minWidth: 112,
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingHorizontal: 11,
    paddingVertical: 8,
    borderWidth: 1,
    borderRadius: 12,
  },
  metricChipActive: {
    backgroundColor: '#0F172A',
    borderColor: '#0F172A',
    elevation: 3,
  },
  metricChipInactive: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E2E8F0',
    elevation: 1,
  },
  metricChipIcon: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  metricChipCopy: {
    minWidth: 0,
    flex: 1,
  },
  metricChipTitle: {
    color: '#0F172A',
    fontFamily: 'Manrope',
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 16,
  },
  metricChipTitleActive: {
    color: '#FFFFFF',
  },
  metricChipValue: {
    marginTop: 1,
    color: '#64748B',
    fontFamily: 'SpaceGrotesk',
    fontSize: 10,
    lineHeight: 13,
  },
  metricChipValueActive: {
    color: '#E2E8F0',
  },
  heroCard: {
    gap: 12,
    overflow: 'hidden',
    padding: 18,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    elevation: 2,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
  },
  heroTop: {
    minHeight: 106,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
  },
  heroMetric: {
    flex: 1,
    minWidth: 0,
  },
  metricDot: {
    width: 10,
    height: 10,
    marginBottom: 5,
    borderWidth: 3,
    borderColor: '#CCFBF1',
    borderRadius: 5,
  },
  heroCategory: {
    color: '#64748B',
    fontFamily: 'Manrope',
    fontSize: 9,
    fontWeight: '700',
    lineHeight: 13,
    letterSpacing: 0.5,
  },
  heroValueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
    marginTop: 3,
  },
  heroValue: {
    flexShrink: 1,
    color: '#0F172A',
    fontFamily: 'SpaceGrotesk',
    fontSize: 32,
    fontWeight: '700',
    lineHeight: 40,
  },
  heroUnit: {
    flexShrink: 0,
    fontFamily: 'Manrope',
    fontSize: 12,
    fontWeight: '600',
  },
  deltaRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 4,
    marginTop: 2,
    paddingRight: 5,
  },
  deltaText: {
    flex: 1,
    color: '#059669',
    fontFamily: 'Manrope',
    fontSize: 10,
    fontWeight: '600',
    lineHeight: 14,
  },
  rangeSummary: {
    width: 116,
    minHeight: 62,
    justifyContent: 'center',
    paddingHorizontal: 9,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    backgroundColor: '#F8FAFC',
  },
  rangeEyebrow: {
    color: '#94A3B8',
    fontFamily: 'Manrope',
    fontSize: 8,
    fontWeight: '700',
    lineHeight: 11,
    letterSpacing: 0.45,
    textAlign: 'right',
  },
  rangeText: {
    marginTop: 3,
    color: '#0F172A',
    fontFamily: 'Manrope',
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 15,
    textAlign: 'right',
  },
  chartLegend: {
    minHeight: 32,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E2E8F0',
  },
  legendGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  legendSwatch: {
    width: 9,
    height: 9,
    borderRadius: 5,
  },
  standardSwatch: {
    backgroundColor: '#E2E8F0',
  },
  legendText: {
    color: '#475569',
    fontFamily: 'Manrope',
    fontSize: 9,
    fontWeight: '500',
  },
  todayReset: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingVertical: 4,
  },
  todayResetText: {
    fontFamily: 'Manrope',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  summaryCard: {
    width: '48%',
    minHeight: 112,
    justifyContent: 'space-between',
    padding: 13,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    elevation: 1,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
  },
  summaryHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 4 },
  summaryLabel: { flex: 1, color: '#64748B', fontFamily: 'Manrope', fontSize: 9, fontWeight: '700', lineHeight: 13, letterSpacing: 0.35 },
  summaryValueRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 },
  summaryValue: { flexShrink: 1, color: '#0F172A', fontFamily: 'SpaceGrotesk', fontSize: 21, fontWeight: '700', lineHeight: 27 },
  summaryBadge: { paddingHorizontal: 5, paddingVertical: 2, borderRadius: 5 },
  summaryBadgeText: { fontFamily: 'Manrope', fontSize: 9, fontWeight: '700' },
  summarySubRow: { minHeight: 16, flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 2 },
  summarySub: { flexShrink: 1, color: '#64748B', fontFamily: 'Manrope', fontSize: 9, lineHeight: 13 },
  positiveSub: { color: '#059669', fontWeight: '600' },
});