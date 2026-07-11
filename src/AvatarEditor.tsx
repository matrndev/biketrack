// Modal editor for the user's avatar (opened from the pencil badge on the
// Home screen): pick a background color from the preset palette and set the
// letters shown in the circle (max 2). Both persist via the store; clearing
// the letters falls back to the display name's first letter on save.
import React, { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useStore, defaultInitials, DEFAULT_AVATAR_COLOR } from './store';
import { theme } from './theme';

// Bright enough that the black initials stay readable on every swatch.
export const AVATAR_COLORS = [
  '#4C9EFF',
  '#40C8E0',
  '#30D158',
  '#FFD60A',
  '#FF9F0A',
  '#FF6B6B',
  '#FF6EC7',
  '#BF5AF2',
  '#FFFFFF',
  '#9A9A9A',
];

type Props = { visible: boolean; onClose: () => void };

export default function AvatarEditor({ visible, onClose }: Props) {
  const displayName = useStore((s) => s.displayName);
  const avatarColor = useStore((s) => s.avatarColor);
  const avatarInitials = useStore((s) => s.avatarInitials);
  const setAvatar = useStore((s) => s.setAvatar);
  const [color, setColor] = useState(avatarColor ?? DEFAULT_AVATAR_COLOR);
  const [letters, setLetters] = useState(avatarInitials ?? defaultInitials(displayName));

  // Re-seed the drafts from the saved values each time the editor opens, so
  // a cancelled edit doesn't leak into the next one.
  useEffect(() => {
    if (visible) {
      setColor(avatarColor ?? DEFAULT_AVATAR_COLOR);
      setLetters(avatarInitials ?? defaultInitials(displayName));
    }
  }, [visible]);

  const save = () => {
    const initials = letters.trim().toUpperCase().slice(0, 2) || defaultInitials(displayName);
    setAvatar(color, initials);
    onClose();
  };

  const previewLetters = letters.trim().toUpperCase() || defaultInitials(displayName);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.card} onPress={() => {}}>
          <Text style={styles.title}>Edit avatar</Text>

          <View style={[styles.preview, { backgroundColor: color }]}>
            <Text style={styles.previewText}>{previewLetters}</Text>
          </View>

          <Text style={styles.sectionLabel}>Color</Text>
          <View style={styles.swatches}>
            {AVATAR_COLORS.map((c) => (
              <Pressable
                key={c}
                accessibilityLabel={`Avatar color ${c}`}
                style={[styles.swatch, { backgroundColor: c }]}
                onPress={() => setColor(c)}
              >
                {c === color && <Text style={styles.swatchCheck}>✓</Text>}
              </Pressable>
            ))}
          </View>

          <Text style={styles.sectionLabel}>Letters</Text>
          <TextInput
            accessibilityLabel="Avatar letters"
            value={letters}
            onChangeText={(t) => setLetters(t.toUpperCase())}
            maxLength={2}
            autoCapitalize="characters"
            autoCorrect={false}
            style={styles.lettersInput}
          />

          <View style={styles.actions}>
            <Pressable style={[styles.button, styles.buttonOutline]} onPress={onClose}>
              <Text style={styles.buttonOutlineText}>Cancel</Text>
            </Pressable>
            <Pressable style={[styles.button, styles.buttonPrimary]} onPress={save}>
              <Text style={styles.buttonPrimaryText}>Save</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const PREVIEW = 72;
const SWATCH = 40;

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing(3),
  },
  card: {
    alignSelf: 'stretch',
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.lg,
    padding: theme.spacing(2.5),
    gap: theme.spacing(1.5),
  },
  title: {
    color: theme.colors.text,
    fontSize: theme.font.h2,
    fontFamily: theme.family.bold,
  },
  preview: {
    alignSelf: 'center',
    width: PREVIEW,
    height: PREVIEW,
    borderRadius: PREVIEW / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewText: {
    color: '#000000',
    fontSize: 28,
    fontFamily: theme.family.extraBold,
  },
  sectionLabel: {
    color: theme.colors.textDim,
    fontSize: theme.font.small,
    fontFamily: theme.family.medium,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  swatches: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing(1.5),
  },
  swatch: {
    width: SWATCH,
    height: SWATCH,
    borderRadius: SWATCH / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Black check on the selected swatch — visible on every bright color,
  // unlike a border, which vanishes on the white swatch.
  swatchCheck: {
    color: '#000000',
    fontSize: 20,
    fontFamily: theme.family.extraBold,
  },
  lettersInput: {
    alignSelf: 'flex-start',
    minWidth: 72,
    textAlign: 'center',
    paddingVertical: theme.spacing(1),
    paddingHorizontal: theme.spacing(1.5),
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceAlt,
    color: theme.colors.text,
    fontSize: theme.font.h2,
    fontFamily: theme.family.bold,
    letterSpacing: 2,
  },
  actions: {
    flexDirection: 'row',
    gap: theme.spacing(1),
    marginTop: theme.spacing(0.5),
  },
  button: {
    flex: 1,
    borderRadius: theme.radius.md,
    paddingVertical: theme.spacing(1.5),
    alignItems: 'center',
  },
  buttonPrimary: { backgroundColor: theme.colors.accent },
  buttonPrimaryText: {
    color: '#000000',
    fontSize: theme.font.body,
    fontFamily: theme.family.extraBold,
  },
  buttonOutline: {
    borderWidth: 1.5,
    borderColor: theme.colors.border,
  },
  buttonOutlineText: {
    color: theme.colors.text,
    fontSize: theme.font.body,
    fontFamily: theme.family.bold,
  },
});
