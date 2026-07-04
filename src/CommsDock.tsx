// The comms dock (PLAN §5.4): a big circular chat button floating bottom-center
// that opens a full-screen menu of thumb-sized one-tap alert buttons. Meant to
// be used at speed with one glove: huge targets, high contrast, menu anchored
// to the bottom with the most safety-critical buttons closest to the thumb.
import React, { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { COMM_DEFS, CommType, Severity } from './comms';
import { theme } from './theme';

export function severityColor(severity: Severity): string {
  switch (severity) {
    case 'critical':
      return theme.colors.danger;
    case 'important':
      return theme.colors.warning;
    case 'low':
      return theme.colors.accent;
  }
}

// Bottom-anchored grid, two per row: calmest at the top, critical at the
// bottom where the thumb already is. Pothole (the most-fired one) gets the
// full-width slot right above Close.
const MENU_ORDER: CommType[] = [
  'regroup',
  'slowing',
  'turn_left',
  'turn_right',
  'stopping',
  'car_back',
  'pothole',
];

const FAB = 68;

type Props = {
  onSend: (type: CommType) => void;
};

export default function CommsDock({ onSend }: Props) {
  const [open, setOpen] = useState(false);

  const fire = (type: CommType) => {
    setOpen(false);
    onSend(type);
  };

  return (
    <>
      <Pressable
        style={({ pressed }) => [styles.fab, pressed && styles.fabPressed]}
        onPress={() => setOpen(true)}
        hitSlop={8}
        accessibilityLabel="Open comms menu"
      >
        <Svg width={32} height={32} viewBox="0 0 24 24">
          <Path
            fill="#000000"
            d="M20 2H4a2 2 0 0 0-2 2v18l4-4h14a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2z"
          />
        </Svg>
      </Pressable>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setOpen(false)}
      >
        <Pressable style={styles.overlay} onPress={() => setOpen(false)}>
          {/* Swallow touches so taps between buttons don't close the menu. */}
          <View style={styles.menu} onStartShouldSetResponder={() => true}>
            <View style={styles.grid}>
              {MENU_ORDER.map((type) => {
                const def = COMM_DEFS[type];
                return (
                  <Pressable
                    key={type}
                    style={({ pressed }) => [
                      styles.button,
                      { borderColor: severityColor(def.severity) },
                      type === 'pothole' && styles.buttonWide,
                      pressed && styles.buttonPressed,
                    ]}
                    onPress={() => fire(type)}
                  >
                    <Text style={styles.buttonIcon}>{def.icon}</Text>
                    <Text style={styles.buttonLabel}>{def.label}</Text>
                  </Pressable>
                );
              })}
            </View>
            <Pressable style={styles.closeButton} onPress={() => setOpen(false)}>
              <Text style={styles.closeLabel}>Close</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    alignSelf: 'center',
    bottom: theme.spacing(5),
    width: FAB,
    height: FAB,
    borderRadius: FAB / 2,
    backgroundColor: theme.colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
  },
  fabPressed: { opacity: 0.8 },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.88)',
    justifyContent: 'flex-end',
  },
  menu: {
    padding: theme.spacing(2),
    gap: theme.spacing(1.5),
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing(1.5),
  },
  button: {
    flexGrow: 1,
    flexBasis: '45%',
    backgroundColor: theme.colors.surface,
    borderWidth: 2,
    borderRadius: theme.radius.lg,
    paddingVertical: theme.spacing(2),
    alignItems: 'center',
    gap: theme.spacing(0.5),
  },
  buttonWide: { flexBasis: '100%' },
  buttonPressed: { backgroundColor: theme.colors.surfaceAlt },
  buttonIcon: { fontSize: 30 },
  buttonLabel: {
    color: theme.colors.text,
    fontSize: theme.font.h2,
    fontFamily: theme.family.extraBold,
  },
  closeButton: {
    backgroundColor: theme.colors.surfaceAlt,
    borderRadius: theme.radius.md,
    paddingVertical: theme.spacing(2),
    alignItems: 'center',
  },
  closeLabel: {
    color: theme.colors.textDim,
    fontSize: theme.font.h2,
    fontFamily: theme.family.bold,
  },
});
