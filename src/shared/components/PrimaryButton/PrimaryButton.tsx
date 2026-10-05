import { Pressable, StyleSheet, Text } from 'react-native';
import type { PressableProps } from 'react-native';

interface PrimaryButtonProps extends Omit<PressableProps, 'children'> {
  title: string;
  trailingSymbol?: string;
}

export function PrimaryButton({
  title,
  trailingSymbol,
  style,
  ...pressableProps
}: PrimaryButtonProps) {
  return (
    <Pressable
      {...pressableProps}
      style={({ pressed }) => [
        styles.button,
        pressed && styles.pressed,
        typeof style === 'function' ? style({ pressed }) : style,
      ]}
    >
      <Text style={styles.title}>{title}</Text>
      {trailingSymbol ? (
        <Text style={styles.symbol}>{trailingSymbol}</Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#000000',
    elevation: 3,
    shadowColor: '#0B1C30',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.15,
    shadowRadius: 5,
  },
  pressed: {
    opacity: 0.88,
    transform: [{ scale: 0.99 }],
  },
  title: {
    color: '#FFFFFF',
    fontFamily: 'Manrope',
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 24,
  },
  symbol: {
    color: '#FFFFFF',
    fontSize: 20,
    lineHeight: 24,
  },
});