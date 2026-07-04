import React, { useState } from 'react';
import { Text, TextInput, Pressable, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation';
import { useStore } from '../store';
import { createGroup } from '../groups';
import KeyboardAwareScreen from '../KeyboardAwareScreen';
import { theme } from '../theme';

export default function CreateGroupScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const uid = useStore((s) => s.uid);
  const displayName = useStore((s) => s.displayName);
  const setGroupId = useStore((s) => s.setGroupId);

  const getDayOfWeek = () => {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return days[new Date().getDay()];
  };
  
  const [name, setName] = useState(displayName ? `${displayName}'s ${getDayOfWeek()} ride` : 'Group ride');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const trimmed = name.trim();

  const submit = async () => {
    if (!trimmed || !uid || !displayName || busy) return;
    setBusy(true);
    setError(null);
    try {
      const groupId = await createGroup(trimmed, uid, displayName);
      await setGroupId(groupId);
      // Reset so back doesn't return to this form.
      navigation.reset({ index: 0, routes: [{ name: 'Group' }] });
    } catch (e: any) {
      setError(String(e?.message ?? e));
      setBusy(false);
    }
  };

  return (
    <KeyboardAwareScreen contentStyle={styles.container}>
      <Text style={styles.label}>Group name</Text>
      <TextInput
        style={styles.input}
        value={name}
        onChangeText={setName}
        autoFocus
        maxLength={40}
        returnKeyType="done"
        onSubmitEditing={submit}
      />
      {error && <Text style={styles.error}>{error}</Text>}
      <Pressable
        style={[styles.button, (!trimmed || busy) && styles.buttonDisabled]}
        disabled={!trimmed || busy}
        onPress={submit}
      >
        <Text style={styles.buttonText}>{busy ? 'Creating…' : 'Create group'}</Text>
      </Pressable>
    </KeyboardAwareScreen>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: theme.spacing(2),
    paddingTop: theme.spacing(3),
  },
  label: {
    color: theme.colors.textDim,
    fontSize: theme.font.small,
    fontFamily: theme.family.medium,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: theme.spacing(1),
  },
  input: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    color: theme.colors.text,
    fontSize: theme.font.h2,
    fontFamily: theme.family.regular,
    paddingHorizontal: theme.spacing(2),
    paddingVertical: theme.spacing(2),
    marginBottom: theme.spacing(2),
  },
  button: {
    backgroundColor: theme.colors.accent,
    borderRadius: theme.radius.md,
    paddingVertical: theme.spacing(2.5),
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.4 },
  buttonText: {
    color: '#000000',
    fontSize: theme.font.h2,
    fontFamily: theme.family.extraBold,
  },
  error: {
    color: theme.colors.danger,
    fontSize: theme.font.body,
    fontFamily: theme.family.regular,
    marginBottom: theme.spacing(2),
  },
  hint: {
    color: theme.colors.textDim,
    fontSize: theme.font.small,
    fontFamily: theme.family.regular,
    textAlign: 'center',
    marginTop: theme.spacing(2),
  },
});
