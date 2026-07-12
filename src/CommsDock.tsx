// The comms dock (PLAN §5.4): a big circular chat button floating bottom-center
// that opens a full-screen menu of thumb-sized one-tap alert buttons. Meant to
// be used at speed with one glove: huge targets, high contrast, menu anchored
// to the bottom with the most safety-critical buttons closest to the thumb.
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome';
import { faComment } from '@fortawesome/free-solid-svg-icons';
import { COMM_DEFS, CommType, Severity } from './comms';
import { type CommsButtonPosition, useStore } from './store';
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
// bottom where the thumb already is. Danger (the most-fired one) gets the
// full-width slot right above Close.
const MENU_ORDER: CommType[] = [
  'turn_left',
  'turn_right',
  'regroup',
  'slowing',
  'stopping',
  'car_back',
  'danger',
];

const FAB = 68;
const AUTO_CLOSE_MS = 10_000;
const CLOSE_BORDER_WIDTH = 3;
const AnimatedPath = Animated.createAnimatedComponent(Path);

type Props = {
  onSend: (type: CommType) => void;
  position: CommsButtonPosition;
};

export default function CommsDock({ onSend, position }: Props) {
  const [open, setOpen] = useState(false);
  const [closeSize, setCloseSize] = useState({ width: 0, height: 0 });
  const commsAutoClose = useStore((s) => s.commsAutoClose);
  const countdown = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    countdown.stopAnimation();
    countdown.setValue(0);

    if (!open || !commsAutoClose) return;

    Animated.timing(countdown, {
      toValue: 1,
      duration: AUTO_CLOSE_MS,
      useNativeDriver: false,
    }).start(({ finished }) => {
      if (finished) setOpen(false);
    });

    return () => countdown.stopAnimation();
  }, [commsAutoClose, countdown, open]);

  const fire = (type: CommType) => {
    setOpen(false);
    onSend(type);
  };

  const closeBorderInset = CLOSE_BORDER_WIDTH / 2;
  const closeBorderRadius = Math.min(
    theme.radius.md,
    Math.max(0, (closeSize.height - CLOSE_BORDER_WIDTH) / 2),
  );
  const closeBorderPath = [
    `M ${closeSize.width / 2} ${closeBorderInset}`,
    `H ${closeBorderInset + closeBorderRadius}`,
    `A ${closeBorderRadius} ${closeBorderRadius} 0 0 0 ${closeBorderInset} ${closeBorderInset + closeBorderRadius}`,
    `V ${closeSize.height - closeBorderInset - closeBorderRadius}`,
    `A ${closeBorderRadius} ${closeBorderRadius} 0 0 0 ${closeBorderInset + closeBorderRadius} ${closeSize.height - closeBorderInset}`,
    `H ${closeSize.width - closeBorderInset - closeBorderRadius}`,
    `A ${closeBorderRadius} ${closeBorderRadius} 0 0 0 ${closeSize.width - closeBorderInset} ${closeSize.height - closeBorderInset - closeBorderRadius}`,
    `V ${closeBorderInset + closeBorderRadius}`,
    `A ${closeBorderRadius} ${closeBorderRadius} 0 0 0 ${closeSize.width - closeBorderInset - closeBorderRadius} ${closeBorderInset}`,
    `H ${closeSize.width / 2}`,
  ].join(' ');
  const closeBorderLength =
    2 * (closeSize.width + closeSize.height - 2 * CLOSE_BORDER_WIDTH) +
    (2 * Math.PI - 8) * closeBorderRadius;

  return (
    <>
      <Pressable
        style={({ pressed }) => [
          styles.fab,
          position === 'left'
            ? styles.fabLeft
            : position === 'right'
              ? styles.fabRight
              : styles.fabCenter,
          pressed && styles.fabPressed,
        ]}
        onPress={() => setOpen(true)}
        hitSlop={8}
        accessibilityLabel="Open comms menu"
      >
        <FontAwesomeIcon icon={faComment} size={32} color="#000000" />
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
                      type === 'danger' && styles.buttonWide,
                      pressed && styles.buttonPressed,
                    ]}
                    onPress={() => fire(type)}
                  >
                    <FontAwesomeIcon
                      icon={def.icon}
                      size={30}
                      color={severityColor(def.severity)}
                    />
                    <Text style={styles.buttonLabel}>{def.label}</Text>
                  </Pressable>
                );
              })}
            </View>
            <Pressable
              style={styles.closeButton}
              onPress={() => setOpen(false)}
              onLayout={({ nativeEvent }) => setCloseSize(nativeEvent.layout)}
              accessibilityRole="button"
              accessibilityLabel={
                commsAutoClose ? 'Close comms menu, closes automatically after 10 seconds' : 'Close comms menu'
              }
            >
              <Text style={styles.closeLabel}>Close</Text>
              {closeSize.width > 0 && closeSize.height > 0 && (
                <Svg pointerEvents="none" style={StyleSheet.absoluteFill}>
                  <Path
                    d={closeBorderPath}
                    fill="none"
                    stroke={theme.colors.border}
                    strokeWidth={CLOSE_BORDER_WIDTH}
                  />
                  {commsAutoClose && (
                    <AnimatedPath
                      d={closeBorderPath}
                      fill="none"
                      stroke={theme.colors.accent}
                      strokeWidth={CLOSE_BORDER_WIDTH}
                      strokeLinecap="round"
                      strokeDasharray={closeBorderLength}
                      strokeDashoffset={countdown.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0, -closeBorderLength],
                      })}
                    />
                  )}
                </Svg>
              )}
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
    bottom: theme.spacing(5),
    width: FAB,
    height: FAB,
    borderRadius: FAB / 2,
    backgroundColor: theme.colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
    zIndex: 10,
  },
  fabLeft: { left: theme.spacing(3) },
  fabCenter: {
    left: '50%',
    transform: [{ translateX: -FAB / 2 }],
  },
  fabRight: { right: theme.spacing(3) },
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
    overflow: 'hidden',
  },
  closeLabel: {
    color: theme.colors.textDim,
    fontSize: theme.font.h2,
    fontFamily: theme.family.bold,
  },
});
