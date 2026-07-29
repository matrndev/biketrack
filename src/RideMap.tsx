// The ride map: teammates and active comm pins on a dark OSM basemap
// (MapLibre — no API key). The camera auto-fits the riders so the whole group
// is always in frame (pins render but don't steer the camera); any manual
// pan/zoom pauses following instead of fighting
// the gesture and surfaces a circular recenter button whose ring counts down
// the pause — tap to recenter now, or it snaps back by itself at zero.
import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  Camera,
  Map as MapLibreMap,
  Marker,
  type CameraRef,
  type LngLatBounds,
} from '@maplibre/maplibre-react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome';
import { faLocationCrosshairs } from '@fortawesome/free-solid-svg-icons';
import { COMM_DEFS, Comm } from './comms';
import { severityColor } from './CommsDock';
import type { Member } from './groups';
import type { RiderPoint } from './train';
import { useStore, defaultInitials, DEFAULT_AVATAR_COLOR } from './store';
import { theme } from './theme';

// CARTO dark matter — free raster-free GL style that matches the OLED theme.
const MAP_STYLE = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';

// How long a manual pan/zoom pauses camera-follow before it resumes on its own.
const AUTO_RECENTER_MS = 15_000;

/** Degenerate-safe bounds around every rider (comm pins are shown but don't
 * steer the camera — a far-away stale pin shouldn't zoom the group out), with
 * a minimum span so a single point doesn't fit to zoom level ∞. */
function fitAll(riders: RiderPoint[]): LngLatBounds | null {
  const lats: number[] = [];
  const lngs: number[] = [];
  for (const r of riders) {
    lats.push(r.lat);
    lngs.push(r.lng);
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
  // null → following (camera auto-fits); a timestamp → follow is paused by a
  // manual pan/zoom until that deadline. Every further gesture pushes it out.
  const [holdUntil, setHoldUntil] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const following = holdUntil == null;
  // My own avatar renders from the local store (always freshest), like the
  // ride rail; others' come from their synced member node.
  const avatarColor = useStore((s) => s.avatarColor);
  const avatarInitials = useStore((s) => s.avatarInitials);

  // While paused, tick fast enough for a smooth countdown ring; resume
  // following (which triggers the refit below) once the deadline passes.
  useEffect(() => {
    if (holdUntil == null) return;
    const iv = setInterval(() => {
      const t = Date.now();
      setNow(t);
      if (t >= holdUntil) setHoldUntil(null);
    }, 100);
    return () => clearInterval(iv);
  }, [holdUntil]);

  const bounds = fitAll(riders);
  const boundsKey = bounds ? bounds.map((n) => n.toFixed(4)).join(',') : '';
  const fitCamera = (duration: number) => {
    if (!bounds) return;
    camera.current?.fitBounds(bounds, {
      padding: { top: 48, right: 48, bottom: 96, left: 48 },
      duration,
    });
  };
  // Refit whenever positions/pins move — but only in follow mode. Keyed on the
  // rounded coordinates so identical snapshots don't re-animate the camera.
  useEffect(() => {
    if (following) fitCamera(600);
  }, [following, boundsKey]);

  return (
    <View style={styles.wrap}>
      <MapLibreMap
        style={styles.map}
        mapStyle={MAP_STYLE}
        compass={false}
        logo={false}
        attributionPosition={{ top: 8, right: 8 }}
        // The mount-time fit fires before the map is ready and gets dropped —
        // fit again once loaded so opening the ride screen starts centered.
        onDidFinishLoadingMap={() => {
          if (following) fitCamera(0);
        }}
        // A viewport change the camera didn't drive = the rider panned/zoomed.
        onRegionDidChange={(e) => {
          if (e.nativeEvent.userInteraction) {
            const t = Date.now();
            setNow(t);
            setHoldUntil(t + AUTO_RECENTER_MS);
          }
        }}
      >
        <Camera ref={camera} />
        {pins.map((c) => (
          <Marker
            key={c.id}
            id={`comm-${c.id}`}
            lngLat={[c.lng, c.lat]}
            style={styles.commMarker}
          >
            <View style={[styles.commPin, { borderColor: severityColor(c.severity) }]}>
              <FontAwesomeIcon
                icon={COMM_DEFS[c.type].icon}
                size={16}
                color={severityColor(c.severity)}
              />
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
          const heading =
            typeof r.heading === 'number' && Number.isFinite(r.heading) && r.heading >= 0
              ? r.heading % 360
              : null;
          return (
            <Marker
              key={r.id}
              id={`rider-${r.id}`}
              lngLat={[r.lng, r.lat]}
              style={styles.riderMarkerLayer}
            >
              <View style={styles.riderMarker}>
                {heading != null && (
                  <View
                    style={[
                      styles.headingIndicator,
                      { transform: [{ rotate: `${heading}deg` }] },
                    ]}
                  >
                    <Svg width={HEADING_PIN} height={HEADING_PIN}>
                      <Path
                        d="M 9 5.25 A 17 17 0 0 1 29 5.25"
                        stroke={color ?? theme.colors.text}
                        strokeWidth={3}
                        strokeLinecap="round"
                        fill="none"
                      />
                    </Svg>
                  </View>
                )}
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
              </View>
            </Marker>
          );
        })}
      </MapLibreMap>

      {holdUntil != null && (
        <Pressable style={styles.recenter} onPress={() => setHoldUntil(null)} hitSlop={8}>
          {/* The ring overlays the button edge; the crosshair centers via the
              Pressable's own alignment. */}
          <Svg width={RECENTER_D} height={RECENTER_D} style={StyleSheet.absoluteFill}>
            {/* Countdown ring: track + depleting arc, starting at 12 o'clock. */}
            <Circle
              cx={RECENTER_C}
              cy={RECENTER_C}
              r={RING_R}
              stroke={theme.colors.border}
              strokeWidth={RING_W}
              fill="none"
            />
            <Circle
              cx={RECENTER_C}
              cy={RECENTER_C}
              r={RING_R}
              stroke={theme.colors.accent}
              strokeWidth={RING_W}
              fill="none"
              strokeLinecap="round"
              strokeDasharray={`${RING_C}`}
              strokeDashoffset={
                RING_C *
                (1 - Math.max(0, Math.min(1, (holdUntil - now) / AUTO_RECENTER_MS)))
              }
              transform={`rotate(-90 ${RECENTER_C} ${RECENTER_C})`}
            />
          </Svg>
          <FontAwesomeIcon
            icon={faLocationCrosshairs}
            size={28}
            color={theme.colors.accent}
          />
        </Pressable>
      )}
    </View>
  );
}

const PIN = 30;
const HEADING_PIN = 38;

// Recenter button geometry: the countdown ring hugs the circular button edge.
const RECENTER_D = 56;
const RECENTER_C = RECENTER_D / 2;
const RING_W = 3;
const RING_R = (RECENTER_D - RING_W) / 2;
const RING_C = 2 * Math.PI * RING_R;

const styles = StyleSheet.create({
  // overflow hidden: markers for riders panned out of view are laid out past
  // the map's frame and would otherwise draw over the train rail beside it.
  wrap: { flex: 1, overflow: 'hidden' },
  map: { flex: 1 },
  // Native map annotations do not consistently respect React child order.
  // Explicit levels guarantee riders remain visible over coincident alerts.
  commMarker: { zIndex: 1 },
  riderMarkerLayer: { zIndex: 10 },
  riderMarker: {
    width: HEADING_PIN,
    height: HEADING_PIN,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headingIndicator: {
    position: 'absolute',
    inset: 0,
    alignItems: 'center',
  },
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
  commPinCount: {
    color: theme.colors.text,
    fontSize: 10,
    fontFamily: theme.family.bold,
  },
  recenter: {
    position: 'absolute',
    bottom: theme.spacing(2),
    right: theme.spacing(2),
    width: RECENTER_D,
    height: RECENTER_D,
    borderRadius: RECENTER_D / 2,
    backgroundColor: theme.colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
  },
});
