// Ride settings, reached from the gear in the Ride screen header. Holds the
// "keep screen on" toggle (the activation effect itself lives in RideScreen,
// which stays mounted beneath this pushed screen); the switch just drives the
// shared store flag.
import React, { useState } from 'react';
import { Text, View, Switch, TextInput, Pressable, ScrollView, StyleSheet } from 'react-native';
import { type CommsButtonPosition, useStore } from '../store';
import { theme } from '../theme';

export default function SettingsScreen() {
  const keepAwake = useStore((s) => s.keepAwake);
  const setKeepAwake = useStore((s) => s.setKeepAwake);
  const maplessMode = useStore((s) => s.maplessMode);
  const setMaplessMode = useStore((s) => s.setMaplessMode);
  const commsDedup = useStore((s) => s.commsDedup);
  const setCommsDedup = useStore((s) => s.setCommsDedup);
  const commsButtonPosition = useStore((s) => s.commsButtonPosition);
  const setCommsButtonPosition = useStore((s) => s.setCommsButtonPosition);
  const commsAutoClose = useStore((s) => s.commsAutoClose);
  const setCommsAutoClose = useStore((s) => s.setCommsAutoClose);
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
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
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
          <Text style={styles.rowLabel}>Mapless mode</Text>
          <Text style={styles.rowHint}>
            Hides the map and does not download map tiles, reducing mobile data use.
          </Text>
        </View>
        <Switch
          accessibilityLabel="Mapless mode"
          accessibilityHint="Hides the map to reduce mobile data use"
          value={maplessMode}
          onValueChange={setMaplessMode}
          trackColor={{ false: theme.colors.border, true: theme.colors.accent }}
          thumbColor={theme.colors.text}
        />
      </View>
      <View style={styles.row}>
        <View style={styles.positionSetting}>
          <View style={styles.rowText}>
            <Text style={styles.rowLabel}>Comms button position</Text>
            <Text style={styles.rowHint}>
              Choose where the button sits along the bottom of the ride screen.
            </Text>
          </View>
          <View style={styles.positionSelector}>
            {(['left', 'center', 'right'] as CommsButtonPosition[]).map((position) => {
              const selected = position === commsButtonPosition;
              return (
                <Pressable
                  key={position}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  accessibilityLabel={`${position} comms button position`}
                  onPress={() => setCommsButtonPosition(position)}
                  style={({ pressed }) => [
                    styles.positionOption,
                    selected && styles.positionOptionSelected,
                    pressed && styles.positionOptionPressed,
                  ]}
                >
                  <Text
                    style={[
                      styles.positionOptionLabel,
                      selected && styles.positionOptionLabelSelected,
                    ]}
                  >
                    {position[0].toUpperCase() + position.slice(1)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </View>
      <View style={styles.row}>
        <View style={styles.rowText}>
          <Text style={styles.rowLabel}>Auto-close comms menu</Text>
          <Text style={styles.rowHint}>
            Closes the comms menu 10 seconds after you open it.
          </Text>
        </View>
        <Switch
          accessibilityLabel="Auto-close comms menu"
          accessibilityHint="Closes the comms menu after 10 seconds"
          value={commsAutoClose}
          onValueChange={setCommsAutoClose}
          trackColor={{ false: theme.colors.border, true: theme.colors.accent }}
          thumbColor={theme.colors.text}
        />
      </View>
      <View style={styles.row}>
        <View style={styles.rowText}>
          <Text style={styles.rowLabel}>Merge duplicate alerts</Text>
          <Text style={styles.rowHint}>
            Your alerts merge with identical ones fired near the same spot.
            Turn off to always send a
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
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: theme.colors.bg,
  },
  content: {
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
  positionSetting: { flex: 1, gap: theme.spacing(1.5) },
  positionSelector: {
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.sm,
    overflow: 'hidden',
  },
  positionOption: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: theme.spacing(1.25),
    backgroundColor: theme.colors.surfaceAlt,
  },
  positionOptionSelected: { backgroundColor: theme.colors.accent },
  positionOptionPressed: { opacity: 0.8 },
  positionOptionLabel: {
    color: theme.colors.textDim,
    fontSize: theme.font.body,
    fontFamily: theme.family.medium,
  },
  positionOptionLabelSelected: { color: theme.colors.bg },
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
