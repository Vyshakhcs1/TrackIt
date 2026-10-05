import { useState } from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PrimaryButton } from '../../../../shared/components/PrimaryButton/PrimaryButton';
import { TextField } from '../../../../shared/components/TextField/TextField';
import { useAuthViewModel } from '../hooks/useAuthViewModel';

export function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const auth = useAuthViewModel();

  const signIn = async () => {
    await auth.login(email, password);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.topBar}>
            <Image
              source={require('../../../../shared/assets/trackit-logo.png')}
              style={styles.headerLogo}
              resizeMode="contain"
            />
            <View style={styles.headerTitles}>
              <Text style={styles.eyebrow}>TRACKIT</Text>
              <Text style={styles.headerTitle}>Sign In</Text>
            </View>
          </View>

          <View style={styles.content}>
            <View style={styles.brandIntro}>
              <View style={styles.logoTile}>
                <Image
                  source={require('../../../../shared/assets/trackit-logo.png')}
                  style={styles.largeLogo}
                  resizeMode="contain"
                />
                <View style={styles.onlineDot} />
              </View>
              <Text style={styles.brandTitle}>TrackIt</Text>
              <Text style={styles.subtitle}>
                Your Clinical Health &amp; Offline Telemetry Vault
              </Text>
            </View>

            <View style={styles.formPanel}>
              <TextField
                label="Email address"
                leadingSymbol="▣"
                placeholder="name@example.com"
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                autoComplete="email"
                keyboardType="email-address"
                returnKeyType="next"
              />

              <View style={styles.passwordGroup}>
                <View style={styles.passwordLabelRow}>
                  <Text style={styles.fieldLabel}>MASTER VAULT PASSWORD</Text>
                  <Pressable accessibilityRole="button">
                    <Text style={styles.forgotKey}>Forgot Key?</Text>
                  </Pressable>
                </View>
                <TextField
                  label=""
                  leadingSymbol="⚿"
                  placeholder="••••••••••"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!passwordVisible}
                  autoCapitalize="none"
                  autoComplete="password"
                  returnKeyType="done"
                  onSubmitEditing={signIn}
                  trailing={
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={
                        passwordVisible ? 'Hide password' : 'Show password'
                      }
                      hitSlop={8}
                      onPress={() => setPasswordVisible(visible => !visible)}
                    >
                      <Text style={styles.visibilitySymbol}>
                        {passwordVisible ? '◉' : '◎'}
                      </Text>
                    </Pressable>
                  }
                />
              </View>

              {auth.error ? <Text style={styles.loginError}>{auth.error}</Text> : null}
              <PrimaryButton
                title={auth.status === 'signingIn' ? 'Signing In…' : 'Sign In to Health Vault'}
                trailingSymbol="→"
                disabled={auth.status === 'signingIn'}
                onPress={signIn}
              />
            </View>

            <Text style={styles.createVault}>
              Don’t have an account? <Text style={styles.createVaultAction}>Create Vault</Text>
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    backgroundColor: '#F8F9FF',
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 20,
  },
  topBar: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    backgroundColor: 'rgba(248,249,255,0.96)',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(198,198,205,0.4)',
  },
  headerLogo: {
    width: 32,
    height: 32,
  },
  headerTitles: {
    marginLeft: 10,
  },
  eyebrow: {
    color: '#45464D',
    fontFamily: 'Manrope',
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 14,
    letterSpacing: 0.8,
  },
  headerTitle: {
    color: '#0B1C30',
    fontFamily: 'Manrope',
    fontSize: 16,
    fontWeight: '600',
    lineHeight: 22,
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  brandIntro: {
    alignItems: 'center',
    marginBottom: 20,
  },
  logoTile: {
    width: 64,
    height: 64,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
    padding: 8,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    elevation: 3,
    shadowColor: '#0B1C30',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 5,
  },
  largeLogo: {
    width: '100%',
    height: '100%',
  },
  onlineDot: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: '#F8F9FF',
    backgroundColor: '#006C4A',
  },
  brandTitle: {
    color: '#0B1C30',
    fontFamily: 'SpaceGrotesk',
    fontSize: 34,
    fontWeight: '700',
    lineHeight: 42,
  },
  subtitle: {
    color: '#45464D',
    fontFamily: 'Manrope',
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 19,
    textAlign: 'center',
  },
  loginError: {
    color: '#BA1A1A',
    fontFamily: 'Manrope',
    fontSize: 12,
    lineHeight: 17,
  },
  formPanel: {
    gap: 16,
    padding: 16,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    elevation: 3,
    shadowColor: '#0B1C30',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
  },
  passwordGroup: {
    gap: 5,
  },
  passwordLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  fieldLabel: {
    color: '#45464D',
    fontFamily: 'Manrope',
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 14,
    letterSpacing: 0.66,
  },
  forgotKey: {
    color: '#188ACE',
    fontFamily: 'Manrope',
    fontSize: 12,
    fontWeight: '500',
    lineHeight: 16,
  },
  visibilitySymbol: {
    paddingLeft: 8,
    color: '#76777D',
    fontSize: 18,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 20,
    marginBottom: 16,
  },
  dividerLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#DCE9FF',
  },
  dividerText: {
    color: '#76777D',
    fontFamily: 'Manrope',
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 14,
    letterSpacing: 0.8,
  },
  createVault: {
    marginTop: 'auto',
    paddingTop: 12,
    color: '#45464D',
    fontFamily: 'Manrope',
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
  },
  createVaultAction: {
    color: '#0B1C30',
    fontFamily: 'Manrope',
    fontSize: 14,
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
});