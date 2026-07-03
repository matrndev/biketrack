import React, { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator, StyleSheet, StatusBar } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ensureSignedIn } from './src/auth';
import { useStore } from './src/store';
import Navigation from './src/navigation';
import { theme } from './src/theme';

export default function App() {
  const hydrate = useStore((s) => s.hydrate);
  const hydrated = useStore((s) => s.hydrated);
  const setUid = useStore((s) => s.setUid);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    hydrate();
    ensureSignedIn()
      .then((uid) => {
        setUid(uid);
        console.log('[auth] signed in as', uid);
      })
      .catch((e) => {
        console.error('[auth] failed', e);
        setError(String(e?.message ?? e));
      });
  }, []);

  if (!hydrated) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={theme.colors.accent} />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar barStyle="light-content" backgroundColor={theme.colors.bg} />
      {error ? (
        <View style={styles.center}>
          <Text style={styles.err}>{error}</Text>
        </View>
      ) : (
        <Navigation />
      )}
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    backgroundColor: theme.colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  err: { color: theme.colors.danger, fontSize: 15, textAlign: 'center' },
});
