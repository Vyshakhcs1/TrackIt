import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

interface TodayMetricCardProps {
  icon: ReactNode;
  label: string;
  value: string;
  unit?: string;
  children?: ReactNode;
  wide?: boolean;
}

export function TodayMetricCard({
  icon,
  label,
  value,
  unit,
  children,
  wide = false,
}: TodayMetricCardProps) {
  return (
    <View style={[styles.card, wide && styles.wide]}>
      <View style={styles.titleRow}>
        <View style={styles.iconContainer}>{icon}</View>
        <Text style={styles.label}>{label.toUpperCase()}</Text>
      </View>
      <View style={styles.valueRow}>
        <Text style={styles.value}>{value}</Text>
        {unit ? <Text style={styles.unit}>{unit}</Text> : null}
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    minWidth: 0,
    padding: 14,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    elevation: 1,
    shadowColor: '#0B1C30',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
  },
  wide: {
    width: '100%',
    flex: 0,
  },
  titleRow: {
    minHeight: 28,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  iconContainer: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: '#E5EEFF',
  },
  label: {
    flex: 1,
    color: '#45464D',
    fontFamily: 'Manrope',
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 14,
    letterSpacing: 0.6,
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
  },
  value: {
    color: '#0B1C30',
    fontFamily: 'SpaceGrotesk',
    fontSize: 22,
    fontWeight: '600',
    lineHeight: 28,
  },
  unit: {
    color: '#45464D',
    fontFamily: 'Manrope',
    fontSize: 12,
    lineHeight: 16,
  },
});