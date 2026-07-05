// Ride settings, reached from the gear in the Ride screen header. Holds the
// "keep screen on" toggle (the activation effect itself lives in RideScreen,
// which stays mounted beneath this pushed screen); the switch just drives the
// shared store flag.
import React from 'react';
import { Text, View, Switch, StyleSheet } from 'react-native';
import { useStore } from '../store';
import { theme } from '../theme';

export default function SettingsScreen() {
  const keepAwake = useStore((s) => s.keepAwake);
  const setKeepAwake = useStore((s) => s.setKeepAwake);

  return (
    <View style={styles.screen}>
      <View style={styles.row}>
        <View style={styles.rowText}>
          <Text style={styles.rowLabel}>Keep screen on</Text>
          <Text style={styles.rowHint}>
            Stops the display sleeping during the ride. Uses more battery.
          </Text>
        </View>
        <Switch
          accessibilityLabel="Keep screen on"
          value={keepAwake}
          onValueChange={setKeepAwake}
          trackColor={{ false: theme.colors.border, true: theme.colors.accent }}
          thumbColor={theme.colors.text}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: theme.colors.bg,
    padding: theme.spacing(2),
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing(2),
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    padding: theme.spacing(2),
  },
  rowText: { flex: 1, gap: theme.spacing(0.5) },
  rowLabel: {
    color: theme.colors.text,
    fontSize: theme.font.body,
    fontFamily: theme.family.medium,
  },
  rowHint: {
    color: theme.colors.textDim,
    fontSize: theme.font.small,
    fontFamily: theme.family.regular,
  },
});
