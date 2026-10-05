import { useState } from 'react';
import { ArrowRight, Bell, CloudUpload, LogOut, UserRound, Wifi, WifiOff, X } from 'lucide-react-native';
import { Alert, Image, Modal, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { useNetInfo } from '@react-native-community/netinfo';
import { useAppDispatch, useAppSelector } from '../../../app/store/hooks';
import { autoSyncPreferenceChanged } from '../../../app/store/slices/healthDataSlice';
import { useAuthViewModel } from '../../../features/auth/presentation/hooks/useAuthViewModel';
import { writeAutoSyncEnabled } from '../../data/autoSyncPreferenceStorage';

interface AppHeaderProps {
  headerSubtitle: string;
}

export function AppHeader({ headerSubtitle }: AppHeaderProps) {
  const auth = useAuthViewModel();
  const dispatch = useAppDispatch();
  const network = useNetInfo();
  const pendingSyncCount = useAppSelector(state => state.healthData.pendingSyncCount);
  const autoSyncEnabled = useAppSelector(state => state.healthData.autoSyncEnabled);
  const [profileVisible, setProfileVisible] = useState(false);
  const isOnline = network.isConnected === true && network.isInternetReachable !== false;
  const syncLabel = !isOnline ? 'OFFLINE' : pendingSyncCount > 0 ? 'PENDING' : 'SYNCED';
  const syncColor = !isOnline ? '#BA1A1A' : pendingSyncCount > 0 ? '#986500' : '#006C4A';

  const closeProfile = () => setProfileVisible(false);
  const logout = async () => {
    await auth.logout();
    closeProfile();
  };
  const toggleAutoSync = async (enabled: boolean) => {
    if (!auth.user) {
      return;
    }
    dispatch(autoSyncPreferenceChanged(enabled));
    try {
      await writeAutoSyncEnabled(auth.user.id, enabled);
    } catch {
      dispatch(autoSyncPreferenceChanged(!enabled));
      Alert.alert('Could not update auto-sync', 'Please try again.');
    }
  };

  return (
    <>
      <View style={styles.header}>
        <View style={styles.brand}>
          <Image
            source={require('../../assets/trackit-logo.png')}
            style={styles.logo}
            resizeMode="contain"
          />
          <View style={styles.copy}>
            <View style={styles.brandNameRow}>
              <Text style={styles.brandName}>TrackIt</Text>
              <View style={[styles.syncPill, { backgroundColor: `${syncColor}20` }]}>
                {!isOnline ? (
                  <WifiOff size={12} color={syncColor} strokeWidth={2.2} />
                ) : pendingSyncCount > 0 ? (
                  <CloudUpload size={12} color={syncColor} strokeWidth={2.2} />
                ) : (
                  <Wifi size={12} color={syncColor} strokeWidth={2.2} />
                )}
                <Text style={[styles.syncLabel, { color: syncColor }]}>{syncLabel}</Text>
              </View>
            </View>
            <Text style={styles.subtitle}>{headerSubtitle}</Text>
          </View>
        </View>
        <View style={styles.actions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Notifications"
            style={styles.notificationButton}
          >
            <Bell size={22} color="#45464D" strokeWidth={1.8} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Profile"
            onPress={() => setProfileVisible(true)}
            style={styles.avatar}
          >
            <UserRound size={17} color="#FFFFFF" strokeWidth={2} />
          </Pressable>
        </View>
      </View>

      <Modal
        visible={profileVisible}
        transparent
        animationType="slide"
        statusBarTranslucent
        onRequestClose={closeProfile}
      >
        <View style={styles.profileOverlay}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close profile"
            style={StyleSheet.absoluteFill}
            onPress={closeProfile}
          />
          <View style={styles.profileSheet}>
            <View style={styles.sheetHandle} />
            <View style={styles.profileHeader}>
              <View style={styles.profileIcon}>
                <UserRound size={42} color="#FFFFFF" strokeWidth={2} />
              </View>
              <View style={styles.profileCopy}>
                <Text numberOfLines={1} style={styles.profileName}>
                  {auth.user?.displayName ?? 'User'}
                </Text>
                <Text numberOfLines={1} style={styles.profileEmail}>
                  {auth.user?.email ?? ''}
                </Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close profile"
                hitSlop={8}
                onPress={closeProfile}
                style={styles.closeProfileButton}
              >
                <X size={24} color="#45464D" strokeWidth={2} />
              </Pressable>
            </View>
            <View style={styles.profileDivider} />
            <View style={styles.autoSyncRow}>
              <View style={styles.autoSyncCopy}>
                <Text style={styles.autoSyncTitle}>Auto-sync</Text>
                <Text style={styles.autoSyncSubtitle}>
                  {autoSyncEnabled ? 'Sync when online' : 'Sync manually'}
                </Text>
              </View>
              <Switch
                accessibilityLabel="Auto-sync"
                value={autoSyncEnabled}
                onValueChange={toggleAutoSync}
                trackColor={{ false: '#D8D8DD', true: '#9DDDC1' }}
                thumbColor={autoSyncEnabled ? '#006C4A' : '#FFFFFF'}
              />
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Log out"
              onPress={logout}
              style={({ pressed }) => [styles.logoutButton, pressed && styles.logoutPressed]}
            >
              <View style={styles.logoutIconTile}>
                <LogOut size={30} color="#C91C1C" strokeWidth={2.4} />
              </View>
              <View style={styles.logoutCopy}>
                <Text style={styles.logoutTitle}>Log Out</Text>
                <Text style={styles.logoutSubtitle}>Close session &amp; lock local vault</Text>
              </View>
              <ArrowRight size={32} color="#C91C1C" strokeWidth={2} />
            </Pressable>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  header: {
    height: 64,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(248,249,255,0.96)',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(198,198,205,0.4)',
  },
  brand: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  logo: {
    width: 32,
    height: 32,
    flexShrink: 0,
  },
  copy: {
    flex: 1,
    minWidth: 0,
  },
  brandNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  brandName: {
    color: '#0B1C30',
    fontFamily: 'Manrope',
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 22,
  },
  syncPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 12,
    backgroundColor: 'rgba(130,245,193,0.35)',
  },
  syncLabel: {
    color: '#006C4A',
    fontFamily: 'Manrope',
    fontSize: 9,
    fontWeight: '700',
    lineHeight: 12,
    letterSpacing: 0.5,
  },
  subtitle: {
    color: '#45464D',
    fontFamily: 'Manrope',
    fontSize: 12,
    lineHeight: 16,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  notificationButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
  },
  avatar: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    backgroundColor: '#000000',
  },
  profileOverlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingHorizontal: 3,
    paddingBottom: 4,
    backgroundColor: 'rgba(20,30,45,0.36)',
  },
  profileSheet: {
    width: '100%',
    paddingTop: 10,
    paddingBottom: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#D4D5DA',
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    elevation: 12,
    shadowColor: '#0B1C30',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.18,
    shadowRadius: 14,
  },
  sheetHandle: {
    width: 44,
    height: 4,
    alignSelf: 'center',
    marginBottom: 8,
    borderRadius: 2,
    backgroundColor: '#D9D9DE',
  },
  profileHeader: {
    minHeight: 74,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 18,
    paddingBottom: 12,
  },
  profileIcon: {
    width: 52,
    height: 52,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 26,
    backgroundColor: '#20314A',
  },
  profileCopy: {
    flex: 1,
    minWidth: 0,
  },
  profileName: {
    color: '#102136',
    fontFamily: 'Manrope',
    fontSize: 18,
    fontWeight: '700',
    lineHeight: 24,
  },
  profileEmail: {
    marginTop: 2,
    color: '#4B4C55',
    fontFamily: 'Manrope',
    fontSize: 14,
    lineHeight: 19,
  },
  closeProfileButton: {
    width: 36,
    height: 36,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileDivider: {
    height: StyleSheet.hairlineWidth,
    marginBottom: 13,
    backgroundColor: '#D8D8DD',
  },
  autoSyncRow: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginHorizontal: 18,
    marginBottom: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: '#F4F7F8',
  },
  autoSyncCopy: {
    flex: 1,
    minWidth: 0,
  },
  autoSyncTitle: {
    color: '#102136',
    fontFamily: 'Manrope',
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 19,
  },
  autoSyncSubtitle: {
    color: '#4B4C55',
    fontFamily: 'Manrope',
    fontSize: 12,
    lineHeight: 16,
  },
  logoutButton: {
    minHeight: 70,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: 18,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 16,
    backgroundColor: '#FFF0F0',
  },
  logoutPressed: {
    opacity: 0.82,
  },
  logoutIconTile: {
    width: 36,
    height: 36,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: '#FFDADA',
  },
  logoutCopy: {
    flex: 1,
    minWidth: 0,
  },
  logoutTitle: {
    color: '#C91C1C',
    fontFamily: 'Manrope',
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 22,
  },
  logoutSubtitle: {
    marginTop: 3,
    color: '#4B4C55',
    fontFamily: 'Manrope',
    fontSize: 12,
    lineHeight: 17,
  },
});