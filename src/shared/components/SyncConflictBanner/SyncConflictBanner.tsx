import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { ConflictChoice, SyncConflictItem } from '../../data/syncContract';

interface SyncConflictBannerProps {
  conflict: SyncConflictItem | null;
  remaining: number;
  onResolve: (recordId: string, choice: ConflictChoice) => void;
}

function describeLocal(conflict: SyncConflictItem): string {
  if (conflict.localOperation === 'delete') {
    return 'deleted';
  }
  return formatValue(conflict.kind, conflict.local.value);
}

function describeServer(conflict: SyncConflictItem): string {
  return conflict.server.deleted ? 'deleted' : formatValue(conflict.kind, conflict.server.value);
}

function formatValue(kind: SyncConflictItem['kind'], value: number | null): string {
  if (value === null) {
    return '-';
  }
  return kind === 'weight' ? `${value.toFixed(1)} kg` : `${Math.round(value)} ml`;
}

export function SyncConflictBanner({ conflict, remaining, onResolve }: SyncConflictBannerProps) {
  if (!conflict) {
    return null;
  }

  const subject = conflict.kind === 'weight'
    ? `Weight entry for ${conflict.date}`
    : `Water total for ${conflict.date}`;

  return (
    <View style={styles.banner} accessibilityRole="alert">
      <Text style={styles.title}>
        {subject} changed on another device{remaining > 1 ? ` (${remaining} to review)` : ''}
      </Text>
      <Text style={styles.detail}>
        Yours: {describeLocal(conflict)}  |  Server: {describeServer(conflict)}
      </Text>
      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          onPress={() => onResolve(conflict.recordId, 'mine')}
          style={[styles.action, styles.primary]}
        >
          <Text style={styles.primaryText}>Keep mine</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => onResolve(conflict.recordId, 'server')}
          style={[styles.action, styles.secondary]}
        >
          <Text style={styles.secondaryText}>Use server</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    gap: 8,
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#FFF4E5',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E0B36A',
  },
  title: {
    color: '#0B1C30',
    fontFamily: 'Manrope',
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
  },
  detail: {
    color: '#45464D',
    fontFamily: 'Manrope',
    fontSize: 12,
    lineHeight: 17,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
  },
  action: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  primary: {
    backgroundColor: '#000000',
  },
  secondary: {
    borderWidth: 1,
    borderColor: '#000000',
  },
  primaryText: {
    color: '#FFFFFF',
    fontFamily: 'Manrope',
    fontSize: 12,
    fontWeight: '700',
  },
  secondaryText: {
    color: '#000000',
    fontFamily: 'Manrope',
    fontSize: 12,
    fontWeight: '700',
  },
});
