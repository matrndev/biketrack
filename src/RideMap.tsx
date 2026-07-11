// The ride map: teammates and active comm pins on a dark OSM basemap
// (MapLibre — no API key). The camera auto-fits everything so the whole group
// is always in frame; any manual pan/zoom pauses following and surfaces a
// recenter button instead of fighting the gesture.
import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  Camera,
  Map as MapLibreMap,
  Marker,
  type CameraRef,
  type LngLatBounds,
} from '@maplibre/maplibre-react-native';
import { COMM_DEFS, Comm } from './comms';
import { severityColor } from './CommsDock';
import type { Member } from './groups';
import type { RiderPoint } from './train';
import { useStore, defaultInitials, DEFAULT_AVATAR_COLOR } from './store';
import { theme } from './theme';

// CARTO dark matter — free raster-free GL style that matches the OLED theme.
const MAP_STYLE = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';

/** Degenerate-safe bounds around every rider and pin, with a minimum span so a
 * single point doesn't fit to zoom level ∞. */
function fitAll(riders: RiderPoint[], pins: Comm[]): LngLatBounds | null {
  const lats: number[] = [];
  const lngs: number[] = [];
  for (const r of riders) {
    lats.push(r.lat);
    lngs.push(r.lng);
  }
  for (const p of pins) {
    lats.push(p.lat);
    lngs.push(p.lng);
  }
  if (lats.length === 0) return null;
  const MIN_SPAN = 0.004; // ≈400 m — sane zoom when everyone is bunched up
  let west = Math.min(...lngs);
  let east = Math.max(...lngs);
  let south = Math.min(...lats);
  let north = Math.max(...lats);
  if (east - west < MIN_SPAN) {
    const mid = (east + west) / 2;
    west = mid - MIN_SPAN / 2;
    east = mid + MIN_SPAN / 2;
  }
  if (north - south < MIN_SPAN) {
    const mid = (north + south) / 2;
    south = mid - MIN_SPAN / 2;
    north = mid + MIN_SPAN / 2;
  }
  return [west, south, east, north];
}

type Props = {
  riders: RiderPoint[];
  members: Record<string, Member>;
  leaderId: string;
  uid: string | null;
  pins: Comm[];
};

export default function RideMap({ riders, members, leaderId, uid, pins }: Props) {
  const camera = useRef<CameraRef>(null);
  const [follow, setFollow] = useState(true);
  // My own avatar renders from the local store (always freshest), like the
  // ride rail; others' come from their synced member node.
  const avatarColor = useStore((s) => s.avatarColor);
  const avatarInitials = useStore((s) => s.avatarInitials);

  // Refit whenever positions/pins move — but only in follow mode. Keyed on the
  // rounded coordinates so identical snapshots don't re-animate the camera.
  const bounds = fitAll(riders, pins);
  const boundsKey = bounds ? bounds.map((n) => n.toFixed(4)).join(',') : '';
  useEffect(() => {
    if (!follow || !bounds) return;
    camera.current?.fitBounds(bounds, {
      padding: { top: 48, right: 48, bottom: 96, left: 48 },
      duration: 600,
    });
  }, [follow, boundsKey]);

  return (
    <View style={styles.wrap}>
      <MapLibreMap
        style={styles.map}
        mapStyle={MAP_STYLE}
        compass={false}
        logo={false}
        attributionPosition={{ top: 8, right: 8 }}
        // A viewport change the camera didn't drive = the rider panned/zoomed.
        onRegionDidChange={(e) => {
          if (e.nativeEvent.userInteraction) setFollow(false);
        }}
      >
        <Camera ref={camera} />
        {pins.map((c) => (
          <Marker key={c.id} id={`comm-${c.id}`} lngLat={[c.lng, c.lat]}>
            <View style={[styles.commPin, { borderColor: severityColor(c.severity) }]}>
              <Text style={styles.commPinIcon}>{COMM_DEFS[c.type].icon}</Text>
              {c.count > 1 && <Text style={styles.commPinCount}>×{c.count}</Text>}
            </View>
          </Marker>
        ))}
        {riders.map((r) => {
          const isSelf = r.id === uid;
          const color = isSelf
            ? avatarColor ?? DEFAULT_AVATAR_COLOR
            : members[r.id]?.avatarColor ?? null;
          const initials =
            (isSelf ? avatarInitials : members[r.id]?.avatarInitials) ??
            defaultInitials(members[r.id]?.name ?? null);
          return (
            <Marker key={r.id} id={`rider-${r.id}`} lngLat={[r.lng, r.lat]}>
              <View
                style={[
                  styles.riderPin,
                  color ? { backgroundColor: color } : styles.riderPinPlain,
                  r.id === leaderId && styles.riderPinLeader,
                ]}
              >
                <Text style={[styles.riderPinText, !color && styles.riderPinTextPlain]}>
                  {initials}
                </Text>
              </View>
            </Marker>
          );
        })}
      </MapLibreMap>

      {!follow && (
        <Pressable style={styles.recenter} onPress={() => setFollow(true)} hitSlop={8}>
          <Text style={styles.recenterText}>RECENTER</Text>
        </Pressable>
      )}
    </View>
  );
}

const PIN = 30;

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  map: { flex: 1 },
  riderPin: {
    width: PIN,
    height: PIN,
    borderRadius: PIN / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // No custom color synced yet — neutral dot, like the ride rail's.
  riderPinPlain: {
    backgroundColor: theme.colors.surfaceAlt,
    borderWidth: 2,
    borderColor: theme.colors.border,
  },
  // White ring so it stays visible on any avatar color (the accent doubles as
  // the default avatar color, so an accent ring would vanish on it).
  riderPinLeader: { borderWidth: 2, borderColor: '#FFFFFF' },
  riderPinText: {
    color: '#000000',
    fontSize: theme.font.small,
    fontFamily: theme.family.extraBold,
  },
  riderPinTextPlain: { color: theme.colors.text },
  commPin: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderWidth: 2,
    borderRadius: theme.radius.sm,
    paddingHorizontal: 4,
    paddingVertical: 2,
    gap: 2,
  },
  commPinIcon: { fontSize: 16 },
  commPinCount: {
    color: theme.colors.text,
    fontSize: 10,
    fontFamily: theme.family.bold,
  },
  recenter: {
    position: 'absolute',
    bottom: theme.spacing(2),
    right: theme.spacing(2),
    backgroundColor: theme.colors.surfaceAlt,
    borderWidth: 1.5,
    borderColor: theme.colors.accent,
    borderRadius: theme.radius.md,
    paddingVertical: theme.spacing(1),
    paddingHorizontal: theme.spacing(1.5),
    elevation: 4,
  },
  recenterText: {
    color: theme.colors.accent,
    fontSize: theme.font.small,
    fontFamily: theme.family.bold,
    letterSpacing: 1,
  },
});
