import {
  Activity,
  CheckCircle2,
  Droplets,
  Moon,
  RefreshCw,
  Scale,
  Watch,
} from 'lucide-react-native';
import {
  Pressable,
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppHeader } from '../../../../shared/components/AppHeader/AppHeader';
import { GoalProgressRings } from '../../../../shared/components/GoalProgressRings/GoalProgressRings';
import { HealthConnectBanner } from '../../../../shared/components/HealthConnectBanner/HealthConnectBanner';
import { SyncConflictBanner } from '../../../../shared/components/SyncConflictBanner/SyncConflictBanner';
import { TodayMetricCard } from '../../../../shared/components/TodayMetricCard/TodayMetricCard';
import { useTodayViewModel } from '../hooks/useTodayViewModel';

const colors = {
  background: '#F8F9FF',
  surface: '#FFFFFF',
  surfaceLow: '#EFF4FF',
  surfaceContainer: '#E5EEFF',
  surfaceHigh: '#DCE9FF',
  text: '#0B1C30',
  textMuted: '#45464D',
  primary: '#000000',
  green: '#006C4A',
  blue: '#188ACE',
  red: '#BA1A1A',
  tint: '#565E74',
};

const goalColors = {
  steps: colors.green,
  water: colors.blue,
  calories: colors.red,
  sleep: colors.tint,
};

function GoalLegendRow({
  color,
  label,
  value,
  goal,
}: {
  color: string;
  label: string;
  value: string;
  goal: string;
}) {
  return (
    <View style={styles.legendRow}>
      <View style={styles.legendLabel}>
        <View style={[styles.legendDot, { backgroundColor: color }]} />
        <Text style={styles.legendName}>{label}</Text>
      </View>
      <View style={styles.legendValueRow}>
        <Text style={styles.legendValue}>{value}</Text>
        <Text style={styles.legendGoal}>/ {goal}</Text>
      </View>
    </View>
  );
}

function ProgressBar({ value, color }: { value: number; color: string }) {
  return (
    <View style={styles.progressTrack}>
      <View
        style={[styles.progressValue, { width: `${value}%`, backgroundColor: color }]}
      />
    </View>
  );
}

export function TodayScreen() {
  const viewModel = useTodayViewModel();

  if (!viewModel.data) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <AppHeader headerSubtitle="Today" />
        <View style={styles.loadingContainer}>
          {viewModel.status === 'failed' ? (
            <Text style={styles.errorText}>{viewModel.error}</Text>
          ) : (
            <ActivityIndicator color={colors.green} />
          )}
        </View>
      </SafeAreaView>
    );
  }

  const { data } = viewModel;
  const { metrics } = data;

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <AppHeader headerSubtitle="Today" />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <HealthConnectBanner
          status={viewModel.healthConnectStatus}
          onConnect={viewModel.connectHealthConnect}
        />
        <SyncConflictBanner
          conflict={viewModel.syncConflict}
          remaining={viewModel.syncConflictCount}
          onResolve={viewModel.resolveSyncConflict}
        />
        <View style={styles.dateRow}>
          <Text style={styles.pageTitle}>Today</Text>
          <View style={styles.dateControls}>
            <View style={styles.datePill}>
              <View style={styles.dateDot} />
              <Text style={styles.dateText}>{viewModel.dateWithYear}</Text>
            </View>
          </View>
        </View>

        <View style={styles.dailyCard}>
          <View style={styles.sectionTitleRow}>
            <View>
              <Text style={styles.sectionEyebrow}>DAILY ENERGY &amp; HABITS</Text>
              <Text style={styles.sectionTitle}>Daily Balance</Text>
            </View>
            <View style={styles.metPill}>
              <Activity size={14} color={colors.green} fill={colors.green} />
              <Text style={styles.metText}>{viewModel.dailyProgress}% Met</Text>
            </View>
          </View>

          <View style={styles.balanceContent}>
            <GoalProgressRings
              progressValues={viewModel.ringProgress}
              completedGoals={viewModel.completedGoals}
              totalGoals={viewModel.totalGoals}
            />
            <View style={styles.legend}>
              {viewModel.goalRows.map(goal => (
                <GoalLegendRow
                  key={goal.metric}
                  color={goalColors[goal.metric]}
                  label={goal.label}
                  value={goal.value}
                  goal={goal.goal}
                />
              ))}
            </View>
          </View>
        </View>

        <View style={styles.quickActions}>
          <Text style={styles.sectionEyebrow}>DIRECT QUICK ACTIONS</Text>
          <View style={styles.quickActionRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: !viewModel.canAddWater }}
              disabled={!viewModel.canAddWater}
              onPress={viewModel.addWater}
              style={({ pressed }) => [
                styles.quickAction,
                !viewModel.canAddWater && styles.disabled,
                pressed && styles.pressed,
              ]}
            >
              <View style={styles.quickIconCircle}>
                <Droplets size={18} color={colors.blue} strokeWidth={2} />
              </View>
              <Text style={styles.quickActionTitle}>+{viewModel.waterIncrement}ml</Text>
              <Text style={styles.quickActionLabel}>WATER</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Sync now, force sync"
              accessibilityState={{ disabled: !viewModel.canSyncNow }}
              disabled={!viewModel.canSyncNow}
              onPress={viewModel.syncNow}
              style={({ pressed }) => [
                styles.quickAction,
                !viewModel.canSyncNow && styles.disabled,
                pressed && styles.pressed,
              ]}
            >
              <View style={styles.quickIconCircle}>
                <RefreshCw size={18} color={colors.green} strokeWidth={2} />
              </View>
              <Text style={styles.quickActionTitle}>
                {viewModel.pendingSyncCount > 0 ? 'Sync now' : 'Synced'}
              </Text>
              <Text style={styles.quickActionLabel}>
                {viewModel.isOnline ? 'SYNC STATUS' : 'OFFLINE'}
              </Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.metricGrid}>
          <TodayMetricCard
            icon={<Scale size={16} color={colors.text} strokeWidth={2} />}
            label="Body Mass"
            value={viewModel.weightValue}
            unit="kg"
          >
            <View style={styles.goalInset}>
              <View style={styles.goalInsetTop}>
                <Text style={styles.insetCaption}>{viewModel.weightGoalCaption}</Text>
                <Text style={styles.insetStrong}>{viewModel.weightDifferenceText}</Text>
              </View>
            </View>
          </TodayMetricCard>

          <TodayMetricCard
            icon={<Droplets size={16} color={colors.blue} strokeWidth={2} />}
            label="Hydration"
            value={viewModel.waterValueLiters}
            unit="L"
          >
            <View style={styles.goalInset}>
              <View style={styles.goalInsetTop}>
                <Text style={styles.insetCaption}>Goal {viewModel.waterGoalLiters} L</Text>
                <Text style={[styles.insetStrong, { color: colors.blue }]}>
                  {viewModel.waterPercent}%
                </Text>
              </View>
              <ProgressBar value={viewModel.waterPercent} color={colors.blue} />
            </View>
          </TodayMetricCard>

          <TodayMetricCard
            wide
            icon={<Moon size={16} color={colors.tint} strokeWidth={2} />}
            label="Rest & Sleep Score"
            value={String(viewModel.sleepScore)}
            unit="Score"
          >
            <View style={styles.sleepBar}>
              <View style={[styles.sleepSegment, styles.deepSleepSegment, { flex: metrics.sleep.stages.deepMinutes }]} />
              <View style={[styles.sleepSegment, styles.remSleepSegment, { flex: metrics.sleep.stages.remMinutes }]} />
              <View style={[styles.sleepSegment, styles.lightSleepSegment, { flex: metrics.sleep.stages.lightMinutes }]} />
              <View style={[styles.sleepSegment, styles.awakeSegment, { flex: metrics.sleep.stages.awakeMinutes }]} />
            </View>
            <View style={styles.sleepStats}>
              {viewModel.sleepStats.map(stat => (
                <View key={stat.label} style={styles.sleepStat}>
                  <Text style={styles.sleepStatLabel}>{stat.label}</Text>
                  <Text style={styles.sleepStatValue}>{stat.value}</Text>
                </View>
              ))}
            </View>
          </TodayMetricCard>

          <View style={styles.footerNote}>
            <Watch size={14} color={colors.green} />
            <Text style={styles.footerNoteText}>
              Viewing latest: Today, {viewModel.dateWithoutYear}
            </Text>
          </View>
        </View>
      </ScrollView>
      {viewModel.syncToastMessage ? (
        <View
          accessibilityLiveRegion="polite"
          pointerEvents="none"
          style={styles.syncToast}
        >
          <View style={styles.syncToastIcon}>
            <CheckCircle2 size={18} color="#FFFFFF" strokeWidth={2.4} />
          </View>
          <View style={styles.syncToastCopy}>
            <Text style={styles.syncToastTitle}>SYNC COMPLETE</Text>
            <Text numberOfLines={2} style={styles.syncToastMessage}>
              {viewModel.syncToastMessage}
            </Text>
          </View>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    gap: 14,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 24,
  },
  dateRow: {
    minHeight: 36,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  pageTitle: {
    color: colors.text,
    fontFamily: 'Manrope',
    fontSize: 20,
    fontWeight: '700',
    lineHeight: 28,
  },
  dateControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  dateArrow: {
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 15,
    backgroundColor: colors.surfaceContainer,
  },
  datePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: colors.surfaceContainer,
  },
  dateDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.green,
  },
  dateText: {
    color: colors.textMuted,
    fontFamily: 'Manrope',
    fontSize: 11,
    fontWeight: '500',
    lineHeight: 16,
  },
  dailyCard: {
    gap: 12,
    padding: 14,
    borderRadius: 12,
    backgroundColor: colors.surface,
    elevation: 2,
    shadowColor: colors.text,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 5,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  sectionEyebrow: {
    color: colors.textMuted,
    fontFamily: 'Manrope',
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 14,
    letterSpacing: 0.55,
  },
  sectionTitle: {
    marginTop: 1,
    color: colors.text,
    fontFamily: 'Manrope',
    fontSize: 20,
    fontWeight: '700',
    lineHeight: 27,
  },
  metPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 16,
    backgroundColor: 'rgba(130,245,193,0.3)',
  },
  metText: {
    color: colors.green,
    fontFamily: 'Manrope',
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 14,
    letterSpacing: 0.3,
  },
  balanceContent: {
    alignItems: 'center',
    gap: 12,
  },
  legend: {
    width: '100%',
    gap: 7,
  },
  legendRow: {
    minHeight: 36,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: colors.surfaceLow,
  },
  legendLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 1,
  },
  legendDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
  },
  legendName: {
    color: colors.text,
    fontFamily: 'Manrope',
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 16,
  },
  legendValueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
  },
  legendValue: {
    color: colors.text,
    fontFamily: 'SpaceGrotesk',
    fontSize: 16,
    fontWeight: '600',
    lineHeight: 20,
  },
  legendGoal: {
    color: colors.textMuted,
    fontFamily: 'Manrope',
    fontSize: 10,
    lineHeight: 14,
  },
  quickActions: {
    gap: 8,
  },
  quickActionRow: {
    flexDirection: 'row',
    gap: 8,
  },
  quickAction: {
    flex: 1,
    minHeight: 96,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: colors.surfaceContainer,
  },
  disabled: {
    opacity: 0.5,
  },
  pressed: {
    opacity: 0.82,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorText: {
    color: colors.red,
    fontFamily: 'Manrope',
    fontSize: 13,
  },
  syncToast: {
    position: 'absolute',
    right: 16,
    bottom: 16,
    left: 16,
    minHeight: 62,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: 14,
    backgroundColor: '#12382E',
    elevation: 8,
    shadowColor: '#0B1C30',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
  },
  syncToastIcon: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    backgroundColor: '#16845D',
  },
  syncToastCopy: {
    minWidth: 0,
    flex: 1,
    gap: 2,
  },
  syncToastTitle: {
    color: '#A7F3D0',
    fontFamily: 'Manrope',
    fontSize: 10,
    fontWeight: '800',
    lineHeight: 13,
  },
  syncToastMessage: {
    color: '#FFFFFF',
    fontFamily: 'Manrope',
    fontSize: 12,
    fontWeight: '500',
    lineHeight: 17,
  },
  quickIconCircle: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
    borderRadius: 16,
    backgroundColor: colors.surface,
    elevation: 1,
  },
  quickActionTitle: {
    color: colors.text,
    fontFamily: 'Manrope',
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
  },
  quickActionLabel: {
    marginTop: 1,
    color: colors.textMuted,
    fontFamily: 'Manrope',
    fontSize: 9,
    fontWeight: '700',
    lineHeight: 13,
    letterSpacing: 0.45,
  },
  metricGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  goalInset: {
    gap: 7,
    marginTop: 12,
    padding: 8,
    borderRadius: 8,
    backgroundColor: colors.surfaceLow,
  },
  goalInsetTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 3,
  },
  insetCaption: {
    color: colors.textMuted,
    fontFamily: 'Manrope',
    fontSize: 10,
    lineHeight: 14,
  },
  insetStrong: {
    color: colors.text,
    fontFamily: 'Manrope',
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 14,
  },
  progressTrack: {
    height: 6,
    overflow: 'hidden',
    borderRadius: 3,
    backgroundColor: colors.surfaceHigh,
  },
  progressValue: {
    height: '100%',
    borderRadius: 3,
  },
  sleepBar: {
    height: 8,
    flexDirection: 'row',
    gap: 3,
    overflow: 'hidden',
    marginTop: 14,
    borderRadius: 5,
    backgroundColor: colors.surfaceContainer,
  },
  sleepSegment: {
    height: '100%',
    borderRadius: 3,
  },
  deepSleepSegment: {
    flex: 24,
    backgroundColor: colors.tint,
  },
  remSleepSegment: {
    flex: 30,
    backgroundColor: colors.blue,
  },
  lightSleepSegment: {
    flex: 40,
    backgroundColor: '#D3E4FE',
  },
  awakeSegment: {
    flex: 6,
    backgroundColor: colors.red,
  },
  sleepStats: {
    flexDirection: 'row',
    gap: 7,
    marginTop: 10,
  },
  sleepStat: {
    flex: 1,
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 2,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: colors.surfaceLow,
  },
  sleepStatLabel: {
    color: colors.textMuted,
    fontFamily: 'Manrope',
    fontSize: 8,
    fontWeight: '700',
    lineHeight: 12,
    letterSpacing: 0.4,
  },
  sleepStatValue: {
    color: colors.text,
    fontFamily: 'Manrope',
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 16,
  },
  workoutCard: {
    width: '100%',
    gap: 10,
    padding: 14,
    borderRadius: 12,
    backgroundColor: colors.surface,
    elevation: 1,
    shadowColor: colors.text,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
  },
  workoutHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  workoutLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  workoutIcon: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: 'rgba(130,245,193,0.35)',
  },
  completedAt: {
    color: colors.textMuted,
    fontFamily: 'Manrope',
    fontSize: 10,
    lineHeight: 14,
    textAlign: 'right',
  },
  workoutTitleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
  },
  workoutCopy: {
    flex: 1,
    gap: 3,
  },
  workoutTitle: {
    color: colors.text,
    fontFamily: 'Manrope',
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 22,
  },
  workoutSubtitle: {
    color: colors.textMuted,
    fontFamily: 'Manrope',
    fontSize: 12,
    lineHeight: 17,
  },
  workoutDuration: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 3,
  },
  workoutMinutes: {
    color: colors.text,
    fontFamily: 'SpaceGrotesk',
    fontSize: 22,
    fontWeight: '600',
    lineHeight: 28,
  },
  workoutUnit: {
    color: colors.textMuted,
    fontFamily: 'Manrope',
    fontSize: 11,
    lineHeight: 15,
  },
  workoutStats: {
    minHeight: 38,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: colors.surfaceLow,
  },
  workoutStatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  workoutStat: {
    color: colors.text,
    fontFamily: 'Manrope',
    fontSize: 11,
    fontWeight: '600',
    lineHeight: 16,
  },
  statSeparator: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#C6C6CD',
  },
  footerNote: {
    minHeight: 30,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  footerNoteText: {
    color: colors.textMuted,
    fontFamily: 'Manrope',
    fontSize: 11,
    fontWeight: '500',
    lineHeight: 16,
  },
});