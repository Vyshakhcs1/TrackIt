import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { healthConnectPackage } from '../../health/healthConnectProvider';
import type { HealthConnectStatus } from '../../health/healthConnectTypes';

interface HealthConnectBannerProps {
  status: HealthConnectStatus;
  onConnect: () => void;
}

const messages: Partial<Record<HealthConnectStatus, { text: string; action?: string }>> = {
  unavailable: { text: 'Health Connect is not available on this device, so steps, sleep and calories cannot be loaded.' },
  update_required: { text: 'Update Health Connect to load steps, sleep and calories.', action: 'Update' },
  permission_needed: { text: 'Allow Health Connect access to see your steps, sleep and calories.', action: 'Connect' },
  partial: { text: 'Some Health Connect permissions are missing, so part of your data is not shown.', action: 'Review' },
  error: { text: 'Could not read Health Connect.', action: 'Retry' },
};

export function HealthConnectBanner({ status, onConnect }: HealthConnectBannerProps) {
  const message = messages[status];
  if (!message) {
    return null;
  }

  const onPress = status === 'update_required'
    ? () => {
        Linking.openURL(`market://details?id=${healthConnectPackage}`).catch(() => undefined);
      }
    : onConnect;

  return (
    <View style={styles.banner} accessibilityRole="alert">
      <Text style={styles.text}>{message.text}</Text>
      {message.action ? (
        <Pressable accessibilityRole="button" onPress={onPress} style={styles.action}>
          <Text style={styles.actionText}>{message.action}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#EFF4FF',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#C6C6CD',
  },
  text: {
    flex: 1,
    color: '#45464D',
    fontFamily: 'Manrope',
    fontSize: 12,
    lineHeight: 17,
  },
  action: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#000000',
  },
  actionText: {
    color: '#FFFFFF',
    fontFamily: 'Manrope',
    fontSize: 12,
    fontWeight: '700',
  },
});
