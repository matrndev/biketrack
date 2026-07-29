import React, { useState } from 'react';
import { Text, TextInput, Pressable, StyleSheet } from 'react-native';
import { useStore } from '../store';
import { theme } from '../theme';
import KeyboardAwareScreen from '../KeyboardAwareScreen';

export default function OnboardingScreen() {
  const setDisplayName = useStore((s) => s.setDisplayName);
  const [name, setName] = useState('');
  const trimmed = name.trim();

  const submit = () => {
    if (trimmed) setDisplayName(trimmed);
  };

  return (
    <KeyboardAwareScreen centered contentStyle={styles.container}>
      <Text style={styles.title}>BikeTrack</Text>
      <Text style={styles.subtitle}>Please create your user profile</Text>
      <TextInput
        style={styles.input}
        value={name}
        onChangeText={setName}
        placeholder="Your name"
        placeholderTextColor={theme.colors.textDim}
        autoFocus
        maxLength={24}
        returnKeyType="done"
        onSubmitEditing={submit}
      />
      <Pressable
        style={[styles.button, !trimmed && styles.buttonDisabled]}
        disabled={!trimmed}
        onPress={submit}
      >
        <Text style={styles.buttonText}>Continue</Text>
      </Pressable>
    </KeyboardAwareScreen>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: theme.spacing(3),
  },
  title: {
    color: theme.colors.text,
    fontSize: theme.font.h1,
    fontFamily: theme.family.extraBold,
    marginBottom: theme.spacing(1),
  },
  subtitle: {
    color: theme.colors.textDim,
    fontSize: theme.font.body,
    fontFamily: theme.family.regular,
    marginBottom: theme.spacing(3),
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
    paddingVertical: theme.spacing(2),
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.4 },
  buttonText: {
    color: '#000000',
    fontSize: theme.font.h2,
    fontFamily: theme.family.bold,
  },
});
