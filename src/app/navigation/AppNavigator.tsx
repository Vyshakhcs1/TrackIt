import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAppSelector } from '../store/hooks';
import type { RootStackParamList } from './routes';
import { MainTabNavigator } from './MainTabNavigator';
import { SplashScreen } from '../../features/auth/presentation/screens/SplashScreen';
import { LoginScreen } from '../../features/auth/presentation/screens/LoginScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();

export function AppNavigator() {
  const authStatus = useAppSelector(state => state.auth.status);

  return (
    <Stack.Navigator
      initialRouteName="Splash"
      screenOptions={{ headerShown: false }}
    >
      {authStatus === 'restoring' ? (
        <Stack.Screen name="Splash" component={SplashScreen} />
      ) : authStatus === 'signedIn' ? (
        <Stack.Screen name="MainTabs" component={MainTabNavigator} />
      ) : (
        <Stack.Screen name="Login" component={LoginScreen} />
      )}
    </Stack.Navigator>
  );
}