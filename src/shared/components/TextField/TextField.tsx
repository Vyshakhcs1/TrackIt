import { StyleSheet, Text, TextInput, View } from 'react-native';
import type { TextInputProps } from 'react-native';

interface TextFieldProps extends TextInputProps {
  label?: string;
  leadingSymbol: string;
  trailing?: React.ReactNode;
}

export function TextField({
  label,
  leadingSymbol,
  trailing,
  style,
  ...inputProps
}: TextFieldProps) {
  return (
    <View style={styles.container}>
      {label ? <Text style={styles.label}>{label.toUpperCase()}</Text> : null}
      <View style={styles.inputShell}>
        <Text style={styles.leadingSymbol}>{leadingSymbol}</Text>
        <TextInput
          {...inputProps}
          style={[styles.input, style]}
          placeholderTextColor="#76777D"
          selectionColor="#006C4A"
        />
        {trailing}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 5,
  },
  label: {
    color: '#45464D',
    fontFamily: 'Manrope',
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 14,
    letterSpacing: 0.66,
  },
  inputShell: {
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#EFF4FF',
  },
  leadingSymbol: {
    width: 25,
    color: '#76777D',
    fontSize: 18,
    textAlign: 'left',
  },
  input: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 0,
    color: '#0B1C30',
    fontFamily: 'Manrope',
    fontSize: 14,
    lineHeight: 20,
  },
});