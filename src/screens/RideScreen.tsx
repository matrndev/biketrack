// Ride screen (M3+M4+M5): the train view plus the comms dock. One continuous
// vertical line top → bottom, a circle per rider ordered front → back along
// the direction of travel, with the space between circles proportional to the
// real gap in meters. Each rider shows a live speed readout and battery %.
// Over-threshold gaps turn the segment yellow; ride alerts (dropped
// connections, someone too far — PLAN §5.5) are spoken and surface as a top
// banner that auto-dismisses, so they never cover the comms dock. Comms:
// floating chat button bottom-center → big-button menu; active pins show as a
// strip under the header and are spoken via the announcer hook. Always pushed
// on top of the Group screen, which keeps handling group-gone cleanup beneath.
import React, { useEffect, useState } from 'react';
import {
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  View,
  Alert,
  ActivityIndicator,
  Vibration,
} from 'react-native';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation';
import { useStore } from '../store';
import { useGroup, endRide } from '../groups';
import { buildTrain, GAP_ALERT_METERS, RiderPoint } from '../train';
import {
  COMM_DEFS,
  CommType,
  activeComms,
  sendComm,
  useComms,
  useCommsAnnouncer,
} from '../comms';
import CommsDock, { severityColor } from '../CommsDock';
import RideMap from '../RideMap';
import { useRideAlerts, Straggler } from '../alerts';
import { useServerTimeOffset, serverNow, agoLabel } from '../time';
import { theme } from '../theme';

function elapsedLabel(startedAt: number, offset: number): string {
  const secs = Math.max(0, Math.floor((serverNow(offset) - startedAt) / 1000));
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  const mm = `${m}`.padStart(2, '0');
  const ss = `${s}`.padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${m}:${ss}`;
}

// Gap → segment height. Linear so on-screen spacing tracks real meters, with a
// floor so the label always fits and a cap so one straggler can't stretch the
// view into uselessness.
const PX_PER_METER = 3;
const GAP_MIN_PX = 48;
const GAP_MAX_PX = 400;
const gapHeight = (meters: number) =>
  Math.min(GAP_MAX_PX, Math.max(GAP_MIN_PX, meters * PX_PER_METER));

export default function RideScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const uid = useStore((s) => s.uid);
  const groupId = useStore((s) => s.groupId);
  const group = useGroup(groupId);
  const offset = useServerTimeOffset();
  const { comms, loaded: commsLoaded } = useComms(groupId, offset);
  useCommsAnnouncer(comms, commsLoaded, uid, offset, group?.members ?? {});
  const [, tick] = useState(0);
  // Driven by the switch on the Settings screen (shared via the store).
  const keepAwake = useStore((s) => s.keepAwake);

  // Keep the display on while the toggle is on; released on toggle-off and on
  // unmount so leaving the ride never leaves the screen pinned awake.
  useEffect(() => {
    if (!keepAwake) return;
    activateKeepAwakeAsync('ride');
    return () => {
      deactivateKeepAwake('ride');
    };
  }, [keepAwake]);

  const rideStartedAt = group?.meta.rideStartedAt ?? null;

  // Ride ended (by the leader, from any device) → pop back to the Group screen.
  useEffect(() => {
    if (group && !rideStartedAt && navigation.canGoBack()) navigation.goBack();
  }, [group && !rideStartedAt]);

  // Re-render each second: elapsed time, "updated Ns ago", and the train order
  // itself all follow live presence.
  useEffect(() => {
    const iv = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(iv);
  }, []);

  const located: RiderPoint[] = [];
  const unlocated: string[] = [];
  for (const memberId of Object.keys(group?.members ?? {})) {
    const p = group?.presence[memberId];
    if (p && typeof p.lat === 'number' && typeof p.lng === 'number') {
      located.push({
        id: memberId,
        lat: p.lat,
        lng: p.lng,
        heading: p.heading,
        speed: p.speed,
      });
    } else {
      unlocated.push(memberId);
    }
  }
  const train = buildTrain(located, group?.meta.leaderId ?? '');

  // The rider behind the widest gap — the alerts hook decides if it's "too far".
  let straggler: Straggler | null = null;
  if (train.gaps.length > 0) {
    const widest = train.gaps.indexOf(Math.max(...train.gaps));
    const behind = train.order[widest + 1];
    straggler = {
      name: group?.members[behind.id]?.name ?? 'A rider',
      meters: train.gaps[widest],
      isYou: behind.id === uid,
    };
  }
  const rideAlert = useRideAlerts(group, uid, offset, straggler, GAP_ALERT_METERS);

  if (!group) {
    // Group gone — GroupScreen (still mounted beneath) resets the stack home.
    return (
      <View style={styles.center}>
        <ActivityIndicator color={theme.colors.accent} />
      </View>
    );
  }

  const isLeader = group.meta.leaderId === uid;
  const pins = activeComms(comms, serverNow(offset));

  // One tap → pin at our current fix. Instant haptic confirm (the rider is
  // moving, not watching the screen); errors surface, success is silent.
  const sendAlert = (type: CommType) => {
    const fix = useStore.getState().lastFix;
    if (!groupId || !uid) return;
    if (!fix) {
      Alert.alert('No GPS fix yet', 'Comms are pinned to your position — wait for GPS.');
      return;
    }
    Vibration.vibrate(60);
    const dedup = useStore.getState().commsDedup;
    sendComm(groupId, uid, type, fix.lat, fix.lng, offset, dedup).catch((e: any) =>
      Alert.alert('Could not send', String(e?.message ?? e))
    );
  };

  const confirmEnd = () => {
    Alert.alert('End ride?', 'Everyone returns to the group screen.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'End ride',
        style: 'destructive',
        onPress: async () => {
          if (!groupId) return;
          try {
            await endRide(groupId);
          } catch (e: any) {
            Alert.alert('Could not end the ride', String(e?.message ?? e));
          }
        },
      },
    ]);
  };

  const riderRow = (memberId: string, noSignal: boolean) => {
    const member = group.members[memberId];
    const pres = group.presence[memberId];
    const leader = memberId === group.meta.leaderId;
    // GPS speed is m/s; Android reports -1 when unknown.
    const kmh =
      !noSignal && pres?.speed != null && pres.speed >= 0
        ? Math.round(pres.speed * 3.6)
        : null;
    // expo-battery reports 0..1 (negative when unavailable).
    const batteryPct =
      pres?.battery != null && pres.battery >= 0
        ? Math.round(pres.battery * 100)
        : null;
    // Compact two-line row — the rail shares the screen with the map now.
    return (
      <View key={memberId} style={[styles.riderRow, noSignal && styles.riderRowDim]}>
        <View
          style={[
            styles.riderDot,
            leader && styles.riderDotLeader,
            memberId === uid && styles.riderDotYou,
          ]}
        >
          <Text
            style={[styles.riderInitial, memberId === uid && styles.riderInitialYou]}
          >
            {(member?.name ?? '?').slice(0, 1).toUpperCase()}
          </Text>
        </View>
        <View style={styles.riderInfo}>
          <Text numberOfLines={1} style={styles.riderName}>
            {member?.name ?? 'Unknown'}
          </Text>
          {pres?.online === false ? (
            <Text style={[styles.riderSub, styles.riderStatusOffline]}>offline</Text>
          ) : noSignal ? (
            <Text style={styles.riderSub}>no signal</Text>
          ) : (
            <Text style={styles.riderSub}>
              <Text style={styles.riderSpeed}>{kmh ?? '–'}</Text> km/h
              {batteryPct != null && (
                <Text>
                  {' · '}
                  <Text
                    style={[
                      batteryPct <= 30 && styles.battWarn,
                      batteryPct <= 15 && styles.battLow,
                    ]}
                  >
                    {batteryPct}%
                  </Text>
                </Text>
              )}
            </Text>
          )}
        </View>
      </View>
    );
  };

  return (
    <View style={styles.screen}>
      {pins.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.commsStrip}
          contentContainerStyle={styles.commsStripContent}
        >
          {pins.map((c) => (
            <View
              key={c.id}
              style={[styles.commChip, { borderColor: severityColor(c.severity) }]}
            >
              <Text style={styles.commChipIcon}>{COMM_DEFS[c.type].icon}</Text>
              <View>
                <Text style={styles.commChipLabel}>
                  {COMM_DEFS[c.type].label}
                  {c.count > 1 ? ` ×${c.count}` : ''}
                </Text>
                <Text style={styles.commChipMeta}>
                  {c.createdBy === uid
                    ? 'You'
                    : group.members[c.createdBy]?.name ?? 'Unknown'}
                  {' · '}
                  {agoLabel(c.createdAt, offset)}
                </Text>
              </View>
            </View>
          ))}
        </ScrollView>
      )}

      {/* Train rail on the left, map filling the rest. The dock floats over
          both — the gap banner and the leader's footer stack below it, so
          alerts never cover the comms button. */}
      <View style={styles.body}>
        <ScrollView style={styles.rail} contentContainerStyle={styles.container}>
          {train.order.length > 0 && (
            <View style={styles.train}>
              {/* The one continuous line; riders' dots sit on top of it. */}
              <View style={styles.trainLine} />
              {train.order.map((rider, i) => {
                const gap = train.gaps[i]; // to the rider behind
                const wide = gap != null && gap > GAP_ALERT_METERS;
                return (
                  <View key={rider.id}>
                    {riderRow(rider.id, false)}
                    {gap != null && (
                      <View style={[styles.gapSegment, { height: gapHeight(gap) }]}>
                        {wide && <View style={styles.gapLineWide} />}
                        <Text style={[styles.gapLabel, wide && styles.gapLabelWide]}>
                          {Math.round(gap)} m
                        </Text>
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
          )}

          {train.order.length === 0 && (
            <Text style={styles.emptyHint}>Waiting for GPS fixes…</Text>
          )}

          {unlocated.length > 0 && (
            <View style={styles.noSignalBlock}>
              <Text style={styles.noSignalLabel}>NO POSITION</Text>
              {unlocated.map((memberId) => riderRow(memberId, true))}
            </View>
          )}
        </ScrollView>

        <RideMap
          riders={located}
          members={group.members}
          leaderId={group.meta.leaderId}
          uid={uid}
          pins={pins}
        />

        <CommsDock onSend={sendAlert} />
      </View>

      {/* Auto-dismissing alert banner (dropped connection / too far) — top
          only, so it never covers the comms dock or the gap labels in focus. */}
      {rideAlert && (
        <View
          style={[
            styles.alertBanner,
            rideAlert.tone === 'danger' && styles.alertBannerDanger,
          ]}
          pointerEvents="none"
        >
          <Text
            style={[styles.alertText, rideAlert.tone === 'danger' && styles.alertTextDanger]}
          >
            {rideAlert.message}
          </Text>
        </View>
      )}

      {isLeader && (
        <View style={styles.footer}>
          <Pressable style={styles.endButton} onPress={confirmEnd}>
            <Text style={styles.endText}>End ride</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const DOT = 44;
const LINE_X = DOT / 2 - 1; // centers the 2px line under the dots

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.bg },
  center: {
    flex: 1,
    backgroundColor: theme.colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  container: {
    padding: theme.spacing(1.5),
    flexGrow: 1,
  },
  body: { flex: 1, flexDirection: 'row' },
  rail: { width: '40%', flexGrow: 0 },
  commsStrip: { flexGrow: 0 },
  commsStripContent: {
    paddingHorizontal: theme.spacing(2),
    paddingTop: theme.spacing(1.5),
    gap: theme.spacing(1),
  },
  commChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing(1),
    backgroundColor: theme.colors.surface,
    borderWidth: 2,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing(1.5),
    paddingVertical: theme.spacing(1),
  },
  commChipIcon: { fontSize: 24 },
  commChipLabel: {
    color: theme.colors.text,
    fontSize: theme.font.body,
    fontFamily: theme.family.extraBold,
  },
  commChipMeta: {
    color: theme.colors.textDim,
    fontSize: theme.font.small,
    fontFamily: theme.family.medium,
  },
  train: {
    flexGrow: 1,
  },
  trainLine: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: LINE_X,
    width: 2,
    backgroundColor: theme.colors.border,
  },
  riderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing(1.5),
  },
  riderRowDim: { opacity: 0.5 },
  riderDot: {
    width: DOT,
    height: DOT,
    borderRadius: DOT / 2,
    backgroundColor: theme.colors.surfaceAlt,
    borderWidth: 2,
    borderColor: theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  riderDotLeader: { borderColor: theme.colors.accent },
  riderDotYou: { backgroundColor: theme.colors.accent, borderColor: theme.colors.accent },
  riderInitial: {
    color: theme.colors.text,
    fontSize: theme.font.body,
    fontFamily: theme.family.extraBold,
  },
  riderInitialYou: { color: '#000000' },
  riderInfo: { flex: 1 },
  riderName: {
    color: theme.colors.text,
    fontSize: theme.font.body,
    fontFamily: theme.family.medium,
  },
  riderSub: {
    color: theme.colors.textDim,
    fontSize: theme.font.small,
    fontFamily: theme.family.regular,
  },
  riderSpeed: {
    color: theme.colors.text,
    fontSize: theme.font.body,
    fontFamily: theme.family.extraBold,
  },
  riderStatusOffline: { color: theme.colors.warning },
  battWarn: { color: theme.colors.warning },
  battLow: { color: theme.colors.danger },
  gapSegment: {
    justifyContent: 'center',
  },
  gapLineWide: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: LINE_X,
    width: 2,
    backgroundColor: theme.colors.warning,
  },
  gapLabel: {
    alignSelf: 'flex-start',
    marginLeft: DOT + theme.spacing(1.5),
    color: theme.colors.text,
    fontSize: theme.font.body,
    backgroundColor: theme.colors.surfaceAlt,
    paddingHorizontal: theme.spacing(1),
    paddingVertical: 2,
    borderRadius: theme.radius.sm,
    fontWeight: "bold"
  },
  gapLabelWide: {
    color: theme.colors.warning,
    fontFamily: theme.family.bold,
  },
  emptyHint: {
    color: theme.colors.textDim,
    fontSize: theme.font.body,
    fontFamily: theme.family.regular,
    textAlign: 'center',
    marginTop: theme.spacing(4),
  },
  noSignalBlock: {
    marginTop: theme.spacing(4),
    gap: theme.spacing(1),
  },
  noSignalLabel: {
    color: theme.colors.textDim,
    fontSize: theme.font.small,
    fontFamily: theme.family.medium,
    letterSpacing: 1,
  },
  footer: {
    padding: theme.spacing(2),
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    backgroundColor: theme.colors.bg,
  },
  endButton: {
    borderWidth: 1.5,
    borderColor: theme.colors.danger,
    borderRadius: theme.radius.md,
    paddingVertical: theme.spacing(2),
    alignItems: 'center',
  },
  endText: {
    color: theme.colors.danger,
    fontSize: theme.font.h2,
    fontFamily: theme.family.extraBold,
  },
  alertBanner: {
    position: 'absolute',
    top: theme.spacing(1),
    left: theme.spacing(2),
    right: theme.spacing(2),
    backgroundColor: theme.colors.warning,
    borderRadius: theme.radius.md,
    paddingVertical: theme.spacing(1.5),
    paddingHorizontal: theme.spacing(2),
    alignItems: 'center',
    elevation: 8,
  },
  alertBannerDanger: { backgroundColor: theme.colors.danger },
  alertText: {
    color: '#000000',
    fontSize: theme.font.body,
    fontFamily: theme.family.extraBold,
    letterSpacing: 0.5,
  },
  alertTextDanger: { color: theme.colors.text },
});
