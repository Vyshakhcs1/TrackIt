export type MainTabParamList = {
  Today: undefined;
  Analytics: undefined;
  LogMetric: undefined;
};

export type RootStackParamList = {
  Splash: undefined;
  Login: undefined;
  MainTabs: import('@react-navigation/native').NavigatorScreenParams<MainTabParamList> | undefined;
};