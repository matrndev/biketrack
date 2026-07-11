// Ride settings, reached from the gear in the Ride screen header. Holds the
// "keep screen on" toggle (the activation effect itself lives in RideScreen,
// which stays mounted beneath this pushed screen); the switch just drives the
// shared store flag.
import React, { useState } from 'react';
import { Text, View, Switch, TextInput, StyleSheet } from 'react-native';
import { useStore } from '../store';
import { theme } from '../theme';

export default function SettingsScreen() {
  const keepAwake = useStore((s) => s.keepAwake);
  const setKeepAwake = useStore((s) => s.setKeepAwake);
  const commsDedup = useStore((s) => s.commsDedup);
  const setCommsDedup = useStore((s) => s.setCommsDedup);
  const gapAlertMeters = useStore((s) => s.gapAlertMeters);
  const setGapAlertMeters = useStore((s) => s.setGapAlertMeters);
  const [gapDraft, setGapDraft] = useState(String(gapAlertMeters));

  const commitGap = () => {
    const meters = Number.parseInt(gapDraft, 10);
    if (Number.isFinite(meters) && meters > 0) {
      setGapAlertMeters(meters);
      setGapDraft(String(meters));
    } else {
      setGapDraft(String(gapAlertMeters));
    }
  };

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
      <View style={styles.row}>
        <View style={styles.rowText}>
          <Text style={styles.rowLabel}>Merge duplicate alerts</Text>
          <Text style={styles.rowHint}>
            Your alerts merge with identical ones fired near the same spot
            instead of creating a new pin each time. Turn off to always send a
            separate alert.
          </Text>
        </View>
        <Switch
          accessibilityLabel="Merge duplicate alerts"
          value={commsDedup}
          onValueChange={setCommsDedup}
          trackColor={{ false: theme.colors.border, true: theme.colors.accent }}
          thumbColor={theme.colors.text}
        />
      </View>
      <View style={styles.row}>
        <View style={styles.rowText}>
          <Text style={styles.rowLabel}>Distance alert</Text>
          <Text style={styles.rowHint}>
            Warn when the gap to the rider behind grows past this distance, in
            meters.
          </Text>
        </View>
        <View style={styles.gapInputWrap}>
          <TextInput
            accessibilityLabel="Distance alert in meters"
            value={gapDraft}
            onChangeText={setGapDraft}
            onBlur={commitGap}
            onSubmitEditing={commitGap}
            keyboardType="number-pad"
            returnKeyType="done"
            maxLength={5}
            style={styles.gapInput}
          />
          <Text style={styles.gapUnit}>m</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: theme.colors.bg,
    padding: theme.spacing(2),
    gap: theme.spacing(1.5),
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
  gapInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing(0.5),
  },
  gapInput: {
    minWidth: 64,
    textAlign: 'right',
    paddingVertical: theme.spacing(1),
    paddingHorizontal: theme.spacing(1.5),
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceAlt,
    color: theme.colors.text,
    fontSize: theme.font.body,
    fontFamily: theme.family.medium,
  },
  gapUnit: {
    color: theme.colors.textDim,
    fontSize: theme.font.body,
    fontFamily: theme.family.regular,
  },
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
