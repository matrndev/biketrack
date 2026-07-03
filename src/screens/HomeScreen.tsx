import React, { useEffect, useState } from 'react';
import { Text, Pressable, StyleSheet, ScrollView, View } from 'react-native';
import { ref, set, onValue, serverTimestamp } from '@react-native-firebase/database';
import { db } from '../firebase';
import { useStore } from '../store';
import { useServerTimeOffset, agoLabel } from '../time';
import { theme } from '../theme';

export default function HomeScreen() {
  const uid = useStore((s) => s.uid);
  const displayName = useStore((s) => s.displayName);
  const offset = useServerTimeOffset();
  const [lastBeat, setLastBeat] = useState<number | null>(null);
  const [, tick] = useState(0);

  // RTDB smoke test: write a heartbeat every 5s and read it back. Proves the
  // round-trip and that server timestamps land. Removed once real presence lands.
  useEffect(() => {
    if (!uid) return;
    const beatRef = ref(db, `_debug/${uid}`);
    const write = () => set(beatRef, { name: displayName, updatedAt: serverTimestamp() });
    write();
    const iv = setInterval(write, 5000);
    const unsub = onValue(beatRef, (snap) => {
      const v = snap.val();
      if (v && typeof v.updatedAt === 'number') setLastBeat(v.updatedAt);
    });
    return () => {
      clearInterval(iv);
      unsub();
    };
  }, [uid, displayName]);

  // Re-render each second so the "ago" label stays live.
  useEffect(() => {
    const iv = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(iv);
  }, []);

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.container}
    >
      <Text style={styles.greeting}>Hi, {displayName}</Text>

      <View style={styles.card}>
        <Text style={styles.cardLabel}>Device ID</Text>
        <Text style={styles.mono}>{uid ?? 'signing in…'}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardLabel}>Clock sync (RTDB)</Text>
        <Text style={styles.value}>server offset: {offset} ms</Text>
        <Text style={styles.value}>
          last heartbeat: {lastBeat ? agoLabel(lastBeat, offset) : '—'}
        </Text>
      </View>

      <Pressable style={[styles.bigButton, styles.primary]} onPress={() => {}}>
        <Text style={styles.primaryText}>Create group</Text>
      </Pressable>
      <Pressable style={[styles.bigButton, styles.outline]} onPress={() => {}}>
        <Text style={styles.outlineText}>Join group</Text>
      </Pressable>
      <Text style={styles.hint}>Group flows arrive in M1.</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.bg },
  container: {
    padding: theme.spacing(2),
    gap: theme.spacing(2),
  },
  greeting: {
    color: theme.colors.text,
    fontSize: theme.font.h2,
    fontWeight: '700',
    marginTop: theme.spacing(1),
  },
  card: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    padding: theme.spacing(2),
    gap: theme.spacing(0.5),
  },
  cardLabel: {
    color: theme.colors.textDim,
    fontSize: theme.font.small,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: theme.spacing(0.5),
  },
  value: { color: theme.colors.text, fontSize: theme.font.body },
  mono: {
    color: theme.colors.text,
    fontSize: theme.font.mono,
    fontFamily: 'monospace',
  },
  bigButton: {
    borderRadius: theme.radius.md,
    paddingVertical: theme.spacing(2.5),
    alignItems: 'center',
  },
  primary: { backgroundColor: theme.colors.accent },
  primaryText: { color: '#000000', fontSize: theme.font.h2, fontWeight: '800' },
  outline: {
    borderWidth: 1.5,
    borderColor: theme.colors.accent,
  },
  outlineText: { color: theme.colors.accent, fontSize: theme.font.h2, fontWeight: '800' },
  hint: {
    color: theme.colors.textDim,
    fontSize: theme.font.small,
    textAlign: 'center',
    marginTop: theme.spacing(1),
  },
});
