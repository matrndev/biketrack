// Ride screen (M3+M4+M5): the train view plus the comms dock. One continuous
// vertical line top → bottom, a circle per rider (customizer avatar color +
// initials) ordered front → back along the direction of travel, name plate
// under the circle, big speed/battery readout to its right. Gap segments track
// real meters but are squeezed proportionally to the rail's height so the
// whole train always fits on screen — no scrolling to find the last rider.
// Over-threshold gaps turn the segment yellow; ride alerts (dropped
// connections, someone too far — PLAN §5.5) are spoken and surface as a top
// banner that auto-dismisses, so they never cover the comms dock. Comms:
// floating chat button bottom-center → big-button menu; active pins show as a
// strip under the header and are spoken via the announcer hook. Always pushed
// on top of the Group screen, which keeps handling group-gone cleanup beneath.
import React, { useEffect, useState } from 'react';
import {
  Text,
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
import { useStore, defaultInitials, DEFAULT_AVATAR_COLOR } from '../store';
import { useGroup } from '../groups';
import { buildTrain, RiderPoint } from '../train';
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

// Gap → segment height. Ideal heights are linear in real meters (with a floor
// so the label always fits and a cap so one straggler can't dominate). When
// the ideal train is taller than the rail, every gap gives up height in
// proportion to what it has to spare (down to the floor), so the full train
// always fits the viewport and relative spacing is preserved.
const PX_PER_METER = 3;
const GAP_MIN_PX = 28;
const GAP_MAX_PX = 400;
const fitGapHeights = (gapsMeters: number[], available: number): number[] => {
  const ideal = gapsMeters.map((m) =>
    Math.min(GAP_MAX_PX, Math.max(GAP_MIN_PX, m * PX_PER_METER))
  );
  const total = ideal.reduce((a, b) => a + b, 0);
  if (total <= available) return ideal;
  const shrinkable = ideal.map((h) => h - GAP_MIN_PX);
  const totalShrinkable = shrinkable.reduce((a, b) => a + b, 0);
  if (totalShrinkable <= 0) return ideal;
  const k = Math.min(1, (total - available) / totalShrinkable);
  return ideal.map((h, i) => h - shrinkable[i] * k);
};

export default function RideScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const uid = useStore((s) => s.uid);
  const groupId = useStore((s) => s.groupId);
  const group = useGroup(groupId);
  const offset = useServerTimeOffset();
  const { comms, loaded: commsLoaded } = useComms(groupId, offset);
  useCommsAnnouncer(comms, commsLoaded, uid, offset, group?.members ?? {});
  const [, tick] = useState(0);
  // My own avatar renders from the local store (always freshest), like the
  // Group screen roster; others' come from their synced member node.
  const avatarColor = useStore((s) => s.avatarColor);
  const avatarInitials = useStore((s) => s.avatarInitials);
  // Measured rail height — the budget the gap segments must fit into.
  const [railH, setRailH] = useState(0);
  // Driven by the switch on the Settings screen (shared via the store).
  const keepAwake = useStore((s) => s.keepAwake);
  // Per-rider "too far" threshold, set on the Settings screen. Also drives the
  // wide-gap highlight in the rail so the two always agree.
  const gapAlertMeters = useStore((s) => s.gapAlertMeters);

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
  const rideAlert = useRideAlerts(group, uid, offset, straggler, gapAlertMeters);

  if (!group) {
    // Group gone — GroupScreen (still mounted beneath) resets the stack home.
    return (
      <View style={styles.center}>
        <ActivityIndicator color={theme.colors.accent} />
      </View>
    );
  }

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

  const riderRow = (memberId: string, noSignal: boolean) => {
    const member = group.members[memberId];
    const pres = group.presence[memberId];
    const leader = memberId === group.meta.leaderId;
    const isSelf = memberId === uid;
    const color = isSelf
      ? avatarColor ?? DEFAULT_AVATAR_COLOR
      : member?.avatarColor ?? null;
    const initials =
      (isSelf ? avatarInitials : member?.avatarInitials) ??
      defaultInitials(member?.name ?? null);
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
    // Avatar with the name plate below it; big speed/battery readout to the
    // right, aligned to the circle's center.
    return (
      <View key={memberId} style={[styles.riderRow, noSignal && styles.riderRowDim]}>
        <View style={styles.riderCol}>
          <View
            style={[
              styles.riderDot,
              color ? { backgroundColor: color } : styles.riderDotPlain,
              leader && styles.riderDotLeader,
            ]}
          >
            <Text style={[styles.riderInitial, !color && styles.riderInitialPlain]}>
              {initials}
            </Text>
          </View>
          <View style={styles.nameBox}>
            <Text numberOfLines={1} style={styles.riderName}>
              {member?.name ?? 'Unknown'}
            </Text>
          </View>
        </View>
        <View style={styles.riderStats}>
          {pres?.online === false ? (
            <Text style={[styles.riderStatus, styles.riderStatusOffline]}>offline</Text>
          ) : noSignal ? (
            <Text style={styles.riderStatus}>no signal</Text>
          ) : (
            <>
              <Text numberOfLines={1} style={styles.speedText}>
                {kmh ?? '–'}
                <Text style={styles.speedUnit}> km/h</Text>
              </Text>
              {batteryPct != null && (
                <Text
                  numberOfLines={1}
                  style={[
                    styles.battText,
                    batteryPct <= 30 && styles.battWarn,
                    batteryPct <= 15 && styles.battLow,
                  ]}
                >
                  {batteryPct}%
                </Text>
              )}
            </>
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
          both — the gap banner stacks below it, so alerts never cover the
          comms button. Gap segments are fitted to the measured rail height so
          the last rider is always on screen; the ScrollView only kicks in if
          even the minimum-height train can't fit (many riders, tiny screen). */}
      <View style={styles.body}>
        <ScrollView
          style={styles.rail}
          contentContainerStyle={styles.container}
          onLayout={(e) => setRailH(e.nativeEvent.layout.height)}
        >
          {train.order.length > 0 && (() => {
            // Height the fixed pieces consume; the rest is the gap budget.
            const fixedH =
              RAIL_PAD * 2 +
              train.order.length * ROW_H +
              (unlocated.length > 0
                ? theme.spacing(4) + NO_SIGNAL_LABEL_H +
                  unlocated.length * (ROW_H + theme.spacing(1))
                : 0);
            const gapHeights = fitGapHeights(train.gaps, railH - fixedH);
            return (
              <View style={styles.train}>
                {/* The one continuous line; riders' dots sit on top of it. */}
                <View style={styles.trainLine} />
                {train.order.map((rider, i) => {
                  const gap = train.gaps[i]; // to the rider behind
                  const wide = gap != null && gap > gapAlertMeters;
                  return (
                    <View key={rider.id}>
                      {riderRow(rider.id, false)}
                      {gap != null && (
                        <View style={[styles.gapSegment, { height: gapHeights[i] }]}>
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
            );
          })()}

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
    </View>
  );
}

const DOT = 44;
const COL_W = 60; // avatar column: circle + name plate, both centered
const LINE_X = COL_W / 2 - 1; // centers the 2px line under the dots
const NAME_MT = 2;
const NAME_H = 18;
// Fixed row height (avatar + name plate) — lets the gap-fit math know exactly
// how much of the rail the rows consume without a second layout pass.
const ROW_H = DOT + NAME_MT + NAME_H;
const RAIL_PAD = 8; // styles.container padding
const NO_SIGNAL_LABEL_H = 16; // small font line + block gap

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.bg },
  center: {
    flex: 1,
    backgroundColor: theme.colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  container: {
    padding: RAIL_PAD,
    flexGrow: 1,
  },
  body: { flex: 1, flexDirection: 'row' },
  rail: { width: 140, flexGrow: 0 },
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
    alignItems: 'flex-start',
    height: ROW_H,
    gap: theme.spacing(1),
  },
  riderRowDim: { opacity: 0.5 },
  riderCol: {
    width: COL_W,
    alignItems: 'center',
  },
  riderDot: {
    width: DOT,
    height: DOT,
    borderRadius: DOT / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // No custom color synced yet — neutral dot, like the Group screen roster.
  riderDotPlain: {
    backgroundColor: theme.colors.surfaceAlt,
    borderWidth: 2,
    borderColor: theme.colors.border,
  },
  // White ring so it stays visible on any avatar color (the accent doubles as
  // the default avatar color, so an accent ring would vanish on it).
  riderDotLeader: { borderWidth: 2, borderColor: '#FFFFFF' },
  riderInitial: {
    color: '#000000',
    fontSize: theme.font.body,
    fontFamily: theme.family.extraBold,
  },
  riderInitialPlain: { color: theme.colors.text },
  // Name plate under the circle; opaque so it masks the train line behind it.
  nameBox: {
    marginTop: NAME_MT,
    height: NAME_H,
    maxWidth: COL_W,
    justifyContent: 'center',
    paddingHorizontal: 6,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.surfaceAlt,
  },
  riderName: {
    color: theme.colors.text,
    fontSize: 11,
    fontFamily: theme.family.medium,
  },
  // Speed + battery column, centered on the full row (circle + name plate).
  riderStats: {
    flex: 1,
    height: ROW_H,
    justifyContent: 'center',
  },
  speedText: {
    color: theme.colors.text,
    fontSize: 26,
    fontFamily: theme.family.extraBold,
  },
  speedUnit: {
    color: theme.colors.textDim,
    fontSize: 12,
    fontFamily: theme.family.medium,
  },
  battText: {
    color: theme.colors.text,
    fontSize: 17,
    fontFamily: theme.family.medium,
  },
  riderStatus: {
    color: theme.colors.textDim,
    fontSize: theme.font.small,
    fontFamily: theme.family.regular,
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
    marginLeft: COL_W + theme.spacing(1),
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
