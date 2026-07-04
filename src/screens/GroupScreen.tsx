import React, { useEffect, useState } from 'react';
import {
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  View,
  Alert,
  ActivityIndicator,
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation';
import { useStore } from '../store';
import { useGroup, leaveGroup, startRide, qrPayload, Member } from '../groups';
import { useServerTimeOffset, agoLabel } from '../time';
import { requestTrackingPermissions, startTracking } from '../location';
import { theme } from '../theme';

export default function GroupScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const uid = useStore((s) => s.uid);
  const groupId = useStore((s) => s.groupId);
  const setGroupId = useStore((s) => s.setGroupId);
  const group = useGroup(groupId);
  const offset = useServerTimeOffset();
  const [leaving, setLeaving] = useState(false);
  const [starting, setStarting] = useState(false);
  const [trackErr, setTrackErr] = useState<string | null>(null);
  const [, tick] = useState(0);

  // Group deleted / access lost → clear the stored id and fall back home.
  useEffect(() => {
    if (group === null && !leaving) {
      setGroupId(null);
      navigation.reset({ index: 0, routes: [{ name: 'Home' }] });
    }
  }, [group, leaving]);

  // Ride started (by the leader, on any device) → everyone moves to the Ride
  // screen. Fires on mount too, so relaunching mid-ride lands there as well.
  // Deliberately keyed on the boolean: backing out of Ride mid-ride is allowed
  // (to check the roster / QR) and must not bounce straight back.
  const rideActive = !!group?.meta.rideStartedAt;
  useEffect(() => {
    if (rideActive) navigation.navigate('Ride');
  }, [rideActive]);

  // The interactive permission ask lives here (useRideLifecycle only
  // auto-starts once permissions exist). Idempotent, so re-mounts are fine.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await requestTrackingPermissions();
      if (cancelled) return;
      if (res.granted) {
        setTrackErr(null);
        await startTracking();
      } else {
        setTrackErr(res.reason ?? 'Location permission missing.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Re-render each second so "updated Ns ago" labels stay live.
  useEffect(() => {
    const iv = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(iv);
  }, []);

  if (!group) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={theme.colors.accent} />
      </View>
    );
  }

  const isLeader = group.meta.leaderId === uid;
  const roster = Object.entries(group.members).sort(
    ([, a], [, b]) => (a.joinedAt ?? 0) - (b.joinedAt ?? 0)
  );

  const confirmLeave = () => {
    const lastOne = roster.length === 1;
    Alert.alert(
      'Leave group?',
      lastOne
        ? 'You are the last user, the group will be deleted.'
        : isLeader
          ? 'Leadership passes to the next rider.'
          : 'You can join the group again later.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Leave',
          style: 'destructive',
          onPress: async () => {
            if (!groupId || !uid) return;
            setLeaving(true);
            try {
              await leaveGroup(groupId, uid);
            } finally {
              await setGroupId(null);
              navigation.reset({ index: 0, routes: [{ name: 'Home' }] });
            }
          },
        },
      ]
    );
  };

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.groupName}>{group.meta.name}</Text>

        <View style={styles.card}>
          <Text style={styles.cardLabel}>Invite code</Text>
          <View style={styles.qrWrap}>
            <QRCode
              value={qrPayload(group.meta.joinCode)}
              size={180}
              backgroundColor="#FFFFFF"
              color="#000000"
            />
          </View>
          <Text style={styles.joinCode}>{group.meta.joinCode}</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardLabel}>
            Riders ({roster.length})
          </Text>
          {roster.map(([memberId, member]: [string, Member]) => {
            const pres = group.presence[memberId];
            return (
              <View key={memberId} style={styles.memberRow}>
                <View
                  style={[
                    styles.presenceDot,
                    { backgroundColor: pres?.online ? theme.colors.success : theme.colors.border },
                  ]}
                />
                <View style={styles.memberInfo}>
                  <Text style={styles.memberName}>
                    {member.name}
                    {memberId === uid ? ' (you)' : ''}
                  </Text>
                  <Text style={styles.memberStatus}>
                    {pres?.updatedAt
                      ? `updated ${agoLabel(pres.updatedAt, offset)}`
                      : 'no signal yet'}
                  </Text>
                </View>
                {member.role === 'leader' && (
                  <Text style={styles.leaderBadge}>LEADER</Text>
                )}
              </View>
            );
          })}
        </View>
      </ScrollView>

      <View style={styles.footer}>
        {trackErr && <Text style={styles.trackErr}>⚠ {trackErr}</Text>}
        {isLeader ? (
          <Pressable
            style={[styles.startButton, starting && styles.startButtonBusy]}
            disabled={starting}
            onPress={async () => {
              if (!groupId) return;
              if (rideActive) {
                navigation.navigate('Ride');
                return;
              }
              setStarting(true);
              try {
                await startRide(groupId);
                // Navigation happens via the rideActive effect above.
              } catch (e: any) {
                Alert.alert('Could not start the ride', String(e?.message ?? e));
              } finally {
                setStarting(false);
              }
            }}
          >
            <Text style={styles.startText}>
              {rideActive ? 'Back to ride' : 'Start ride'}
            </Text>
          </Pressable>
        ) : rideActive ? (
          // Members can back out of the ride to check the roster/QR — give
          // them a way back in (the navigate effect only fires on ride start).
          <Pressable style={styles.startButton} onPress={() => navigation.navigate('Ride')}>
            <Text style={styles.startText}>Back to ride</Text>
          </Pressable>
        ) : (
          <Text style={styles.waitingHint}>
            Waiting for the leader to start the ride…
          </Text>
        )}
        <Pressable style={styles.leaveButton} onPress={confirmLeave}>
          <Text style={styles.leaveText}>Leave group</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.bg },
  center: {
    flex: 1,
    backgroundColor: theme.colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  container: {
    padding: theme.spacing(2),
    gap: theme.spacing(2),
  },
  groupName: {
    color: theme.colors.text,
    fontSize: theme.font.h1,
    fontFamily: theme.family.bold,
    marginTop: theme.spacing(1),
  },
  card: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    padding: theme.spacing(2),
    gap: theme.spacing(1),
  },
  cardLabel: {
    color: theme.colors.textDim,
    fontSize: theme.font.small,
    fontFamily: theme.family.medium,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  qrWrap: {
    alignSelf: 'center',
    backgroundColor: '#FFFFFF',
    padding: theme.spacing(1.5),
    borderRadius: theme.radius.sm,
    marginTop: theme.spacing(1),
  },
  joinCode: {
    color: theme.colors.text,
    fontSize: 40,
    fontFamily: 'monospace',
    letterSpacing: 10,
    textAlign: 'center',
  },
  hint: {
    color: theme.colors.textDim,
    fontSize: theme.font.small,
    fontFamily: theme.family.regular,
    textAlign: 'center',
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing(1.5),
    paddingVertical: theme.spacing(1),
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
  },
  presenceDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  memberInfo: { flex: 1 },
  memberName: {
    color: theme.colors.text,
    fontSize: theme.font.body,
    fontFamily: theme.family.medium,
  },
  memberStatus: {
    color: theme.colors.textDim,
    fontSize: theme.font.small,
    fontFamily: theme.family.regular,
  },
  trackErr: {
    color: theme.colors.warning,
    fontSize: theme.font.small,
    fontFamily: theme.family.regular,
    textAlign: 'center',
    marginBottom: theme.spacing(1),
  },
  leaderBadge: {
    color: theme.colors.accent,
    fontSize: theme.font.small,
    fontFamily: theme.family.bold,
    letterSpacing: 1,
  },
  footer: {
    padding: theme.spacing(2),
    gap: theme.spacing(1.5),
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    backgroundColor: theme.colors.bg,
  },
  startButton: {
    backgroundColor: theme.colors.accent,
    borderRadius: theme.radius.md,
    paddingVertical: theme.spacing(2),
    alignItems: 'center',
  },
  startButtonBusy: { opacity: 0.6 },
  startText: {
    color: '#000000',
    fontSize: theme.font.h2,
    fontFamily: theme.family.extraBold,
  },
  waitingHint: {
    color: theme.colors.textDim,
    fontSize: theme.font.small,
    fontFamily: theme.family.regular,
    textAlign: 'center',
  },
  leaveButton: {
    borderWidth: 1.5,
    borderColor: theme.colors.danger,
    borderRadius: theme.radius.md,
    paddingVertical: theme.spacing(2),
    alignItems: 'center',
  },
  leaveText: {
    color: theme.colors.danger,
    fontSize: theme.font.h2,
    fontFamily: theme.family.extraBold,
  },
});
