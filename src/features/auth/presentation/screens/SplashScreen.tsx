import { useEffect } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthViewModel } from '../hooks/useAuthViewModel';

export function SplashScreen() {
  const { restoreSession } = useAuthViewModel();

  useEffect(() => {
    restoreSession().catch(() => undefined);
  }, [restoreSession]);

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.content}>
        <View style={styles.brandLockup}>
          <View style={styles.logoStage}>
            <View style={styles.outerHalo} />
            <View style={styles.innerHalo} />
            <View style={styles.logoTile}>
              <Image
                source={require('../../../../shared/assets/trackit-logo.png')}
                style={styles.logoImage}
                resizeMode="contain"
              />
            </View>
            <View style={styles.boltBadge}>
              <Text style={styles.bolt}>ϟ</Text>
            </View>
          </View>

          <Text style={styles.brandName}>TrackIt</Text>
          <Text style={styles.tagline}>
            Precision Health. Anywhere, Anytime.
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F8F9FF',
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    paddingHorizontal: 16,
  },
  brandLockup: {
    alignItems: 'center',
    width: '100%',
    marginTop: -4,
  },
  logoStage: {
    width: 144,
    height: 144,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  outerHalo: {
    position: 'absolute',
    width: 144,
    height: 144,
    borderRadius: 72,
    backgroundColor: 'rgba(130, 245, 193, 0.26)',
  },
  innerHalo: {
    position: 'absolute',
    width: 128,
    height: 128,
    borderRadius: 64,
    backgroundColor: 'rgba(220, 233, 255, 0.64)',
  },
  logoTile: {
    width: 112,
    height: 112,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    borderRadius: 24,
    backgroundColor: '#131B2E',
    elevation: 9,
    shadowColor: '#0B1C30',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
  },
  logoImage: {
    width: '100%',
    height: '100%',
    borderRadius: 12,
  },
  boltBadge: {
    position: 'absolute',
    right: 0,
    bottom: 2,
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    elevation: 4,
    shadowColor: '#0B1C30',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
  },
  bolt: {
    color: '#006C4A',
    fontSize: 21,
    fontWeight: '700',
    lineHeight: 25,
  },
  brandName: {
    fontFamily: 'SpaceGrotesk',
    color: '#0B1C30',
    fontSize: 34,
    fontWeight: '700',
    lineHeight: 42,
  },
  tagline: {
    fontFamily: 'Manrope',
    maxWidth: 260,
    marginTop: 4,
    color: '#45464D',
    fontSize: 14,
    fontWeight: '400',
    lineHeight: 20,
    textAlign: 'center',
  },
});