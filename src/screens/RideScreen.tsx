import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation';
import { useGroup } from '../groups';
import { useStore } from '../store';
import { agoLabel, useServerTimeOffset } from '../time';
import {
  buildTrainLayout,
  formatMeters,
  GAP_ALERT_THRESHOLD_M,
  type TrainRider,
} from '../train';
import { theme } from '../theme';

type Tab = 'map' | 'train';

export default function RideScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const groupId = useStore((s) => s.groupId);
  const setGroupId = useStore((s) => s.setGroupId);
  const group = useGroup(groupId);
  const offset = useServerTimeOffset();
  const [tab, setTab] = useState<Tab>('train');
  const [, tick] = useState(0);

  useEffect(() => {
    const iv = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    if (group === null) {
      setGroupId(null);
      navigation.reset({ index: 0, routes: [{ name: 'Home' }] });
    } else if (group && !group.meta.rideStartedAt) {
      navigation.reset({ index: 0, routes: [{ name: 'Group' }] });
    }
  }, [group]);

  const train = useMemo(
    () => (group ? buildTrainLayout(group, GAP_ALERT_THRESHOLD_M) : null),
    [group]
  );

  if (!group || !train) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={theme.colors.accent} />
      </View>
    );
  }

  const widestGap = train.gaps.reduce(
    (max, gap) => (gap.meters > max ? gap.meters : max),
    0
  );
  const hasWideGap = train.gaps.some((gap) => gap.overThreshold);

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <View style={styles.titleBlock}>
          <Text style={styles.eyebrow}>Ride active</Text>
          <Text style={styles.title}>{group.meta.name}</Text>
        </View>
        <Pressable
          style={styles.groupButton}
          onPress={() => navigation.navigate('Group', { allowDuringRide: true })}
        >
          <Text style={styles.groupButtonText}>Group</Text>
        </Pressable>
      </View>

      {hasWideGap && (
        <View style={styles.alertBanner}>
          <Text style={styles.alertText}>
            Gap open: {formatMeters(widestGap)} between riders
          </Text>
        </View>
      )}

      <View style={styles.segmented}>
        <SegmentButton active={tab === 'map'} label="Map" onPress={() => setTab('map')} />
        <SegmentButton active={tab === 'train'} label="Train" onPress={() => setTab('train')} />
      </View>

      {tab === 'train' ? (
        <TrainView train={train} offset={offset} />
      ) : (
        <MapStatusView riders={train.riders} offset={offset} />
      )}
    </View>
  );
}

function SegmentButton({
  active,
  label,
  onPress,
}: {
  active: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={[styles.segmentButton, active && styles.segmentButtonActive]}
      onPress={onPress}
    >
      <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{label}</Text>
    </Pressable>
  );
}

function TrainView({
  train,
  offset,
}: {
  train: ReturnType<typeof buildTrainLayout>;
  offset: number;
}) {
  if (!train.riders.length) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyTitle}>Waiting for GPS</Text>
        <Text style={styles.emptyText}>Riders appear here as their first location fix arrives.</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.trainWrap}>
      <View style={styles.trainLine} />
      {train.riders.map((rider, index) => {
        const gap = train.gaps[index];
        return (
          <View key={rider.uid} style={styles.trainItem}>
            <View style={styles.riderRow}>
              <View style={[styles.riderDot, !rider.online && styles.riderDotOffline]}>
                <Text style={styles.riderInitial}>{rider.name.trim().charAt(0).toUpperCase()}</Text>
              </View>
              <View style={styles.riderInfo}>
                <Text style={styles.riderName}>
                  {rider.name}
                  {rider.role === 'leader' ? ' - leader' : ''}
                </Text>
                <Text style={styles.riderMeta}>
                  {rider.updatedAt ? `updated ${agoLabel(rider.updatedAt, offset)}` : 'no heartbeat'}
                  {rider.speed != null ? ` - ${(rider.speed * 3.6).toFixed(1)} km/h` : ''}
                </Text>
              </View>
            </View>
            {gap && (
              <View style={[styles.gapRow, gap.overThreshold && styles.gapRowWide]}>
                <View style={[styles.gapStem, gap.overThreshold && styles.gapStemWide]} />
                <Text style={[styles.gapText, gap.overThreshold && styles.gapTextWide]}>
                  {formatMeters(gap.meters)}
                </Text>
              </View>
            )}
          </View>
        );
      })}

      {train.unlocated.length > 0 && (
        <View style={styles.unlocated}>
          <Text style={styles.unlocatedLabel}>No GPS fix</Text>
          {train.unlocated.map((rider) => (
            <Text key={rider.uid} style={styles.unlocatedName}>
              {rider.name}
              {rider.role === 'leader' ? ' - leader' : ''}
            </Text>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

function MapStatusView({ riders, offset }: { riders: TrainRider[]; offset: number }) {
  return (
    <ScrollView contentContainerStyle={styles.mapWrap}>
      {riders.map((rider) => (
        <View key={rider.uid} style={styles.locationRow}>
          <View style={[styles.locationDot, !rider.online && styles.locationDotOffline]} />
          <View style={styles.locationInfo}>
            <Text style={styles.locationName}>{rider.name}</Text>
            <Text style={styles.locationMeta}>
              {rider.lat.toFixed(5)}, {rider.lng.toFixed(5)}
            </Text>
            <Text style={styles.locationMeta}>
              {rider.updatedAt ? agoLabel(rider.updatedAt, offset) : 'no heartbeat'}
              {rider.battery != null ? ` - ${Math.round(rider.battery * 100)}% battery` : ''}
            </Text>
          </View>
        </View>
      ))}
    </ScrollView>
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: theme.spacing(2),
    gap: theme.spacing(1.5),
  },
  titleBlock: { flex: 1 },
  eyebrow: {
    color: theme.colors.success,
    fontSize: theme.font.small,
    fontFamily: theme.family.bold,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  title: {
    color: theme.colors.text,
    fontSize: theme.font.h1,
    fontFamily: theme.family.bold,
  },
  groupButton: {
    backgroundColor: theme.colors.surfaceAlt,
    borderRadius: theme.radius.sm,
    paddingVertical: theme.spacing(1),
    paddingHorizontal: theme.spacing(1.5),
  },
  groupButtonText: {
    color: theme.colors.text,
    fontSize: theme.font.small,
    fontFamily: theme.family.bold,
  },
  alertBanner: {
    marginHorizontal: theme.spacing(2),
    marginBottom: theme.spacing(1),
    borderWidth: 1,
    borderColor: theme.colors.warning,
    backgroundColor: '#211C00',
    borderRadius: theme.radius.sm,
    padding: theme.spacing(1.25),
  },
  alertText: {
    color: theme.colors.warning,
    fontSize: theme.font.body,
    fontFamily: theme.family.bold,
  },
  segmented: {
    flexDirection: 'row',
    marginHorizontal: theme.spacing(2),
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 4,
  },
  segmentButton: {
    flex: 1,
    borderRadius: 6,
    paddingVertical: theme.spacing(1),
    alignItems: 'center',
  },
  segmentButtonActive: { backgroundColor: theme.colors.accent },
  segmentText: {
    color: theme.colors.textDim,
    fontSize: theme.font.body,
    fontFamily: theme.family.bold,
  },
  segmentTextActive: { color: '#000000' },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing(3),
    gap: theme.spacing(1),
  },
  emptyTitle: {
    color: theme.colors.text,
    fontSize: theme.font.h2,
    fontFamily: theme.family.bold,
  },
  emptyText: {
    color: theme.colors.textDim,
    fontSize: theme.font.body,
    fontFamily: theme.family.regular,
    textAlign: 'center',
  },
  trainWrap: {
    padding: theme.spacing(2),
    paddingBottom: theme.spacing(4),
    minHeight: '100%',
  },
  trainLine: {
    position: 'absolute',
    top: theme.spacing(3),
    bottom: theme.spacing(3),
    left: theme.spacing(2) + 22,
    width: 3,
    backgroundColor: theme.colors.border,
  },
  trainItem: { minHeight: 112 },
  riderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing(1.5),
  },
  riderDot: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: theme.colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: theme.colors.bg,
  },
  riderDotOffline: { backgroundColor: theme.colors.border },
  riderInitial: {
    color: '#000000',
    fontSize: theme.font.h2,
    fontFamily: theme.family.extraBold,
  },
  riderInfo: {
    flex: 1,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.sm,
    padding: theme.spacing(1.25),
  },
  riderName: {
    color: theme.colors.text,
    fontSize: theme.font.body,
    fontFamily: theme.family.bold,
  },
  riderMeta: {
    color: theme.colors.textDim,
    fontSize: theme.font.small,
    fontFamily: theme.family.regular,
  },
  gapRow: {
    marginLeft: 22,
    height: 66,
    justifyContent: 'center',
    paddingLeft: theme.spacing(3),
  },
  gapRowWide: { height: 78 },
  gapStem: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
    backgroundColor: theme.colors.border,
  },
  gapStemWide: { backgroundColor: theme.colors.warning, width: 5 },
  gapText: {
    alignSelf: 'flex-start',
    color: theme.colors.textDim,
    backgroundColor: theme.colors.bg,
    fontSize: theme.font.body,
    fontFamily: theme.family.bold,
    paddingHorizontal: theme.spacing(1),
  },
  gapTextWide: { color: theme.colors.warning },
  unlocated: {
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    paddingTop: theme.spacing(2),
    gap: theme.spacing(0.5),
  },
  unlocatedLabel: {
    color: theme.colors.textDim,
    fontSize: theme.font.small,
    fontFamily: theme.family.bold,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  unlocatedName: {
    color: theme.colors.text,
    fontSize: theme.font.body,
    fontFamily: theme.family.regular,
  },
  mapWrap: {
    padding: theme.spacing(2),
    gap: theme.spacing(1),
  },
  locationRow: {
    flexDirection: 'row',
    gap: theme.spacing(1.5),
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.surface,
    padding: theme.spacing(1.5),
  },
  locationDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: theme.colors.success,
  },
  locationDotOffline: { backgroundColor: theme.colors.border },
  locationInfo: { flex: 1 },
  locationName: {
    color: theme.colors.text,
    fontSize: theme.font.body,
    fontFamily: theme.family.bold,
  },
  locationMeta: {
    color: theme.colors.textDim,
    fontSize: theme.font.small,
    fontFamily: 'monospace',
  },
});
