import React, { useEffect, useState } from 'react';
import { Text, Pressable, StyleSheet, ScrollView, View } from 'react-native';
import { ref, set, onValue, serverTimestamp } from '@react-native-firebase/database';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation';
import { db } from '../firebase';
import { useStore, defaultInitials, DEFAULT_AVATAR_COLOR } from '../store';
import AvatarEditor from '../AvatarEditor';
import { useServerTimeOffset, agoLabel } from '../time';
import {
  requestTrackingPermissions,
  startTracking,
  stopTracking,
  isBatteryOptimized,
  openBatteryOptimizationSettings,
} from '../location';
import { theme } from '../theme';

export default function HomeScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const uid = useStore((s) => s.uid);
  const displayName = useStore((s) => s.displayName);
  const groupId = useStore((s) => s.groupId);
  const tracking = useStore((s) => s.tracking);
  const lastFix = useStore((s) => s.lastFix);
  const offset = useServerTimeOffset();
  const [lastBeat, setLastBeat] = useState<number | null>(null);
  const [batteryOpt, setBatteryOpt] = useState<boolean | null>(null);
  const [locErr, setLocErr] = useState<string | null>(null);
  const [, tick] = useState(0);
  const avatarColor = useStore((s) => s.avatarColor);
  const avatarInitials = useStore((s) => s.avatarInitials);
  const [editingAvatar, setEditingAvatar] = useState(false);

  // Battery-optimization status: poll every few seconds so it refreshes after
  // the user flips the exemption in system settings and comes back.
  useEffect(() => {
    const check = () => isBatteryOptimized().then(setBatteryOpt);
    check();
    const iv = setInterval(check, 5000);
    return () => clearInterval(iv);
  }, []);

  const toggleTracking = async () => {
    setLocErr(null);
    try {
      if (tracking) {
        await stopTracking();
      } else {
        const res = await requestTrackingPermissions();
        if (!res.granted) {
          setLocErr(res.reason ?? 'Permission missing.');
          return;
        }
        await startTracking();
      }
    } catch (e: any) {
      setLocErr(String(e?.message ?? e));
    }
  };

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
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.header}>
          <View style={styles.avatarWrap}>
            <Pressable
              accessibilityLabel="Edit avatar"
              style={[styles.avatar, { backgroundColor: avatarColor ?? DEFAULT_AVATAR_COLOR }]}
              onPress={() => setEditingAvatar(true)}
            >
              <Text style={styles.avatarText}>
                {avatarInitials ?? defaultInitials(displayName)}
              </Text>
            </Pressable>
            <Pressable
              accessibilityLabel="Edit avatar"
              hitSlop={8}
              style={styles.editBadge}
              onPress={() => setEditingAvatar(true)}
            >
              <Text style={styles.editBadgeText}>✎</Text>
            </Pressable>
          </View>
          <View style={styles.headerText}>
            <Text style={styles.greeting}>Hi, {displayName}</Text>
            <Text style={styles.deviceId}>Device {uid ?? 'signing in...'}</Text>
          </View>
        </View>
        
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Clock sync</Text>
          <Text style={styles.value}>server offset: {offset} ms</Text>
          <Text style={styles.value}>
            last heartbeat: {lastBeat ? agoLabel(lastBeat, offset) : '—'}
          </Text>
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardLabel}>Location</Text>
            <Pressable style={styles.chip} onPress={toggleTracking}>
              <Text style={styles.chipText}>{tracking ? 'Stop' : 'Start'}</Text>
            </Pressable>
          </View>
          <Text style={styles.value}>
            tracking:{' '}
            <Text style={{ color: tracking ? theme.colors.success : theme.colors.textDim }}>
              {tracking ? 'on (foreground service)' : 'off'}
            </Text>
          </Text>
          {lastFix ? (
            <>
              <Text style={styles.mono}>
                {lastFix.lat.toFixed(5)}, {lastFix.lng.toFixed(5)}
                {lastFix.accuracy != null ? `  ±${Math.round(lastFix.accuracy)} m` : ''}
              </Text>
              <Text style={styles.value}>
                speed:{' '}
                {lastFix.speed != null ? `${(lastFix.speed * 3.6).toFixed(1)} km/h` : '—'}
                {'    heading: '}
                {lastFix.heading != null && lastFix.heading >= 0
                  ? `${Math.round(lastFix.heading)}°`
                  : '?'}
              </Text>
              <Text style={styles.value}>
                battery:{' '}
                {lastFix.battery != null ? `${Math.round(lastFix.battery * 100)}%` : '—'}
                {'    fix age: '}
                {Math.max(0, Math.round((Date.now() - lastFix.timestamp) / 1000))}s
              </Text>
            </>
          ) : (
            <Text style={styles.value}>no fix yet</Text>
          )}
          {batteryOpt !== null && (
            <View style={styles.cardHeader}>
              <Text
                style={[
                  styles.value,
                  { color: batteryOpt ? theme.colors.warning : theme.colors.success },
                ]}
              >
                battery optimization: {batteryOpt ? 'ON!' : 'off'}
              </Text>
              {batteryOpt && (
                <Pressable style={styles.chip} onPress={openBatteryOptimizationSettings}>
                  <Text style={styles.chipText}>Fix</Text>
                </Pressable>
              )}
            </View>
          )}
          {locErr && <Text style={styles.locErr}>{locErr}</Text>}
        </View>
      </ScrollView>

      <AvatarEditor visible={editingAvatar} onClose={() => setEditingAvatar(false)} />

      <View style={styles.footer}>
        {groupId ? (
          <Pressable
            style={[styles.bigButton, styles.primary]}
            onPress={() => navigation.navigate('Group')}
          >
            <Text style={styles.primaryText}>Return to group</Text>
          </Pressable>
        ) : (
          <>
            <Pressable
              style={[styles.bigButton, styles.primary]}
              onPress={() => navigation.navigate('CreateGroup')}
            >
              <Text style={styles.primaryText}>Create group</Text>
            </Pressable>
            <Pressable
              style={[styles.bigButton, styles.outline]}
              onPress={() => navigation.navigate('Join')}
            >
              <Text style={styles.outlineText}>Join group</Text>
            </Pressable>
          </>
        )}
      </View>
    </View>
  );
}

const AVATAR = 60;

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.bg },
  container: {
    padding: theme.spacing(2),
    gap: theme.spacing(2),
  },
  footer: {
    padding: theme.spacing(2),
    gap: theme.spacing(1),
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    backgroundColor: theme.colors.bg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing(1.5),
    marginTop: theme.spacing(1),
  },
  headerText: { flex: 1 },
  avatarWrap: {
    width: AVATAR,
    height: AVATAR,
  },
  avatar: {
    width: AVATAR,
    height: AVATAR,
    borderRadius: AVATAR / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#000000',
    fontSize: 24,
    fontFamily: theme.family.extraBold,
  },
  editBadge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: theme.colors.surfaceAlt,
    // Ring in the screen background color so the badge reads as cut out of
    // the avatar circle instead of floating over it.
    borderWidth: 2,
    borderColor: theme.colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editBadgeText: {
    color: theme.colors.text,
    fontSize: 12,
  },
  greeting: {
    color: theme.colors.text,
    fontSize: theme.font.h1,
    fontFamily: theme.family.bold,
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
    fontFamily: theme.family.medium,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: theme.spacing(0.5),
  },
  deviceId: {
    color: theme.colors.textDim,
    fontSize: theme.font.small,
    fontFamily: 'monospace',
  },
  value: {
    color: theme.colors.text,
    fontSize: theme.font.body,
    fontFamily: theme.family.regular,
  },
  mono: {
    color: theme.colors.text,
    fontSize: theme.font.mono,
    fontFamily: 'monospace',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  chip: {
    backgroundColor: theme.colors.surfaceAlt,
    borderRadius: theme.radius.sm,
    paddingVertical: theme.spacing(0.5),
    paddingHorizontal: theme.spacing(1.5),
  },
  chipText: {
    color: theme.colors.accent,
    fontSize: theme.font.small,
    fontFamily: theme.family.bold,
  },
  locErr: {
    color: theme.colors.warning,
    fontSize: theme.font.small,
    fontFamily: theme.family.regular,
  },
  bigButton: {
    borderRadius: theme.radius.md,
    paddingVertical: theme.spacing(2.5),
    alignItems: 'center',
  },
  primary: { backgroundColor: theme.colors.accent },
  primaryText: {
    color: '#000000',
    fontSize: theme.font.h2,
    fontFamily: theme.family.extraBold,
  },
  outline: {
    borderWidth: 1.5,
    borderColor: theme.colors.accent,
  },
  outlineText: {
    color: theme.colors.accent,
    fontSize: theme.font.h2,
    fontFamily: theme.family.extraBold,
  },
});
