// Screen wrapper that keeps text inputs visible above the software keyboard.
// On Android, Expo's edge-to-edge mode stops the window from auto-resizing for
// the keyboard, and KeyboardAvoidingView with behavior=undefined is a no-op —
// so inputs get covered. Here we use `padding` behavior on both platforms and
// offset by the nav header height, wrapped in a ScrollView so anything still
// taller than the visible area can be scrolled into view.
import React, { useContext } from 'react';
import {
  KeyboardAvoidingView,
  ScrollView,
  StyleSheet,
  ViewStyle,
  StyleProp,
} from 'react-native';
import { HeaderHeightContext } from '@react-navigation/elements';
import { theme } from './theme';

type Props = {
  children: React.ReactNode;
  /** Padding/layout for the scroll content (a screen's old `container` style). */
  contentStyle?: StyleProp<ViewStyle>;
  /** Vertically center the content (e.g. the onboarding screen). */
  centered?: boolean;
};

export default function KeyboardAwareScreen({ children, contentStyle, centered }: Props) {
  // undefined when the screen has no header (headerShown: false) → 0 offset.
  const headerHeight = useContext(HeaderHeightContext) ?? 0;

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior="padding"
      keyboardVerticalOffset={headerHeight}
    >
      <ScrollView
        style={styles.flex}
        contentContainerStyle={[
          styles.content,
          centered && styles.centered,
          contentStyle,
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: theme.colors.bg },
  content: { flexGrow: 1 },
  centered: { justifyContent: 'center' },
});
