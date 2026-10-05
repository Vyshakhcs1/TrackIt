import { StyleSheet, Text, View } from 'react-native';

interface PlaceholderScreenProps {
  title: string;
}

export function PlaceholderScreen({ title }: PlaceholderScreenProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8F9FF',
  },
  title: {
    color: '#0B1C30',
    fontFamily: 'SpaceGrotesk',
    fontSize: 24,
    fontWeight: '700',
  },
});