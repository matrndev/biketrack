# BikeTrack — Plan

A group-riding companion app. Each rider mounts their phone on the handlebars (or runs a
sound-only, screen-off mode). The group sees each other's live position on a map and a
"train view," and fires big one-tap comms ("pothole", "car back", "regroup") that drop
geo-pinned, spoken alerts to everyone.

---

## 1. Decisions (locked)

| Area | Choice | Why |
|------|--------|-----|
| Platform | **Android first** | All the hard constraints (background execution, screen-off GPS, battery) are Android. iOS later. |
| Framework | **Expo + development build** (config plugins, custom dev client — *not* Expo Go) | Fast iteration while still allowing native background location + native Firebase. |
| Realtime backend | **Firebase Realtime Database (RTDB)** | Built for 1–2 Hz location/presence writes; native `onDisconnect`; built-in server-time offset solves clock sync. |
| Identity | **Firebase Anonymous Auth** | No login UX, but every device gets a stable UID → we can write real security rules. |

### Non-goals (explicitly out of scope for now)
- User registration / login screens.
- Crash detection.
- Yes/no question comms.
- Mesh networking / offline-first. **We assume mobile data + internet.** We surface
  connectivity problems (heartbeats, alerts) but do not try to work around them.
- Curved/route-aware distance in the train view — **straight-line only** for v1.

---

## 2. Tech Stack

- **Expo (dev build)** + TypeScript
- **@react-native-firebase/app + /database + /auth** (Anonymous Auth + RTDB)
- **react-native-maps** (Google Maps) — pins + polyline
- **expo-location** — foreground + background location with an Android **foreground service**
  - *Fallback/upgrade path:* `react-native-background-geolocation` (transistorsoft) if
    expo-location's screen-off reliability isn't good enough. Has an Expo config plugin.
- **expo-speech** — text-to-speech for spoken comms
- **expo-camera** — QR scanning for group join
- **expo-keep-awake** / native flags — keep screen behavior sane while mounted
- **expo-battery** — report battery level in presence
- **zustand** (or Redux Toolkit) — local app state
- **@react-native-community/netinfo** — detect our own connectivity for the UI banner

---

## 3. Core Concepts

### Identity without accounts
On first launch: sign in anonymously → Firebase UID becomes the permanent device/rider id.
The user just picks a **display name** (stored locally + in the group). No email, no password.

### Groups & joining
- **Create group** → creator becomes `leader`. We generate a group and a **6-digit join code**.
- **Join** via either:
  - **QR scan** (encodes the groupId + code), or
  - typing the **6-digit code**.
- A `joinCodes/{code} → groupId` reverse-lookup node makes the 6-digit path a single read.
- Join codes are rotatable/expirable by the leader (nice-to-have).
- A rider can be in one active group at a time (v1).

### Clock sync (solved by RTDB)
- **All authoritative timestamps are server timestamps** (`firebase.database.ServerValue.TIMESTAMP`).
- For "n seconds ago" we read RTDB's **`.info/serverTimeOffset`** once and keep it live. This
  gives each client the estimated skew between its clock and the server, so we can render
  accurate relative times without a custom sync protocol. This is the whole clock-sync story.

---

## 4. Data Model (RTDB)

```
groups/
  {groupId}/
    meta/
      name
      leaderId
      createdAt            (server ts)
      joinCode             "482913"
    members/
      {uid}/
        name
        role               "leader" | "member"
        joinedAt           (server ts)
    presence/
      {uid}/
        lat, lng
        heading, speed, accuracy
        battery            0..1
        sharingLocation    bool        # false = comms-only mode
        online             bool        # maintained via onDisconnect
        updatedAt          (server ts) # heartbeat
    comms/
      {commsId}/
        type               "pothole" | "slowing" | "stopping" | "regroup"
                            | "turn_left" | "turn_right" | "car_back"
        severity           "critical" | "important" | "low"
        lat, lng
        dedupKey           "{type}:{geohash5}"   # see §5.4
        createdBy          uid
        createdAt          (server ts)
        expiresAt          (ms)                  # auto-stale
        count              int                   # merged duplicates

joinCodes/
  {code} -> groupId
```

**Security rules (sketch):** a signed-in user may read/write a group only if their uid exists
under `groups/{groupId}/members`. Join writes are gated by a valid `joinCodes/{code}`. Presence
under `presence/{uid}` writable only by that uid.

**Presence / disconnect:** on entering a group each client sets up
`presence/{uid}/online = true` and `onDisconnect().update({ online: false })`. RTDB flips it
server-side when the socket dies → this powers the "connection dropped" alert.

---

## 5. Feature Implementation

### 5.1 Real-time location tracking
- expo-location task pushes fixes at an adaptive rate (see §6 battery). On each fix:
  write `presence/{uid}` with lat/lng/heading/speed/accuracy/battery + server `updatedAt`.
- Subscribe to `groups/{groupId}/presence` → drives both map and train view.
- Respect `sharingLocation` flag: when off, stop writing location but keep presence/heartbeat +
  comms.

### 5.2 Map view (pins)
- react-native-maps, one marker per member (color/initial per rider, leader highlighted).
- Comms pins rendered as distinct markers; tapping shows type/severity/age.
- OLED dark map style. Auto-follow-me toggle vs. fit-all-riders.

### 5.3 Train view (gaps)
- One vertical line, a circle per rider ordered by position along the group.
- **Ordering:** project each rider onto the line between group leader and last rider (or onto
  the average heading vector) to get a 1-D position; sort by that.
- **Gap label** between adjacent circles = straight-line (haversine) distance in meters.
- Highlight gaps over a configurable threshold (e.g. >50 m) → ties into "too far" alert.

### 5.4 Comms buttons
- Large, thumb-sized, high-contrast grid — usable at speed, one tap.
- Types: pothole, slowing, stopping, regroup here, turn left, turn right, car back.
- On tap: capture current lat/lng → write a `comms/{id}` with type, **severity**, server
  `createdAt`, `expiresAt` (type-dependent TTL), and a `dedupKey`.
- **Spoken notification** via expo-speech on every recipient (respecting audio mode/severity).
- **"Notify when riders reach the pin":** each client tracks active comms pins *ahead* of it;
  when it comes within a threshold (e.g. 40 m) and is approaching, speak once per pin
  (dedupe per-rider-per-pin locally so it doesn't repeat).
- **Severity** controls prominence: critical = louder/repeat + strong haptic + banner;
  low = subtle chime.

#### Dedup (§comms)
- Two riders hitting "pothole" at ~the same spot should show **one** pin.
- `dedupKey = "{type}:{geohash@precision≈150m}"`. Before write, check for an existing
  non-expired comms with the same `dedupKey`; if found, **increment `count`** and refresh
  `expiresAt` instead of creating a new pin.
- Do this atomically with an RTDB transaction, or centralize in a **Cloud Function**
  triggered on `comms` writes (cleaner; also handles TTL cleanup). Decide during build; start
  client-side transaction, move to a function if races appear.

### 5.5 Alerts
- **Connection dropped:** presence `online=false` (via onDisconnect) OR `updatedAt` older than
  N seconds → mark that rider stale on map/train, spoken + visual alert to the group.
- **Too far / dropped off the back:** last rider's gap in train view exceeds threshold →
  alert leader and/or the straggler.
- Alerts are **non-distractive**: a bottom banner / edge indicator that never overlaps the
  comms buttons or the primary map focus.

---

## 6. Battery Strategy
- **OLED-true-black dark theme** everywhere; dim/auto-dim while mounted.
- **Adaptive GPS cadence:** high rate when moving fast/among tight gaps, back off when stopped
  or spread out. Balance vs. `distanceInterval`.
- **Toggles:**
  - *Location sharing off* — comms + heartbeat only.
  - *Audio-only / screen-off mode* — screen off, foreground service + TTS keep running; all
    interaction is spoken. This is the marquee low-power mode.
- Report `battery` in presence so the group can see who's about to die.

---

## 7. Android Background Execution (the hard part)
- Register a **foreground service** for location (expo-location `foregroundService` config) so
  Android won't kill tracking when screen is off / app backgrounded.
- Persistent notification while a ride is active ("CycleTrack — sharing location").
- Request the right permissions: `ACCESS_FINE_LOCATION`, `ACCESS_BACKGROUND_LOCATION`,
  `FOREGROUND_SERVICE` + `FOREGROUND_SERVICE_LOCATION`, `POST_NOTIFICATIONS`.
- Guide the user to disable battery optimization for the app (OEM-specific: Samsung/Xiaomi/etc.
  are aggressive) — in-app prompt + deep link to settings.
- **Screen-off audio mode** must keep the service + TTS alive; verify on a real, aggressive OEM
  device, not just the emulator.
- If expo-location proves unreliable here, swap the location layer to
  `react-native-background-geolocation` (isolated behind our own location module so the rest of
  the app doesn't change).

---

## 8. Connectivity / Heartbeats
- Every presence write carries a server `updatedAt`; UI shows **"Phoebe · updated 5s ago"**
  using `serverTimeOffset` for correctness.
- NetInfo watches *our own* connection → shows a subtle "you're offline" banner, positioned so
  it never covers comms buttons or critical map info.
- No mesh, no offline queue in v1 (explicit non-goal). RTDB's local persistence + auto-reconnect
  handles brief blips; anything longer surfaces as a heartbeat/staleness alert.

---

## 9. Screens & Navigation
1. **Onboarding** — pick display name (first launch, anonymous sign-in behind the scenes).
2. **Home** — Create group / Join group (QR or 6-digit).
3. **Join** — camera QR scanner + manual code entry.
4. **Ride** (main) — tabbed/toggled **Map** ↔ **Train view**, comms button dock, alert banner,
   mode toggles (share location, audio-only).
5. **Group / members** — roster, leader controls, join code + QR to show others, leave group.
6. **Settings** — theme, GPS cadence, TTS voice/volume, battery-optimization helper.

---

## 10. Milestones

**M0 — Foundation**
Expo dev build boots on a real Android phone; Firebase wired; anonymous auth; RTDB rules;
true-black theme + nav skeleton.

**M1 — Groups**
Create group, 6-digit code + QR, join by both paths, members roster, leave.

**M2 — Live location**
Foreground-service tracking, presence writes, map with live pins, `serverTimeOffset`,
"updated Ns ago" heartbeats, onDisconnect online/offline.

**M3 — Train view**
1-D ordering, haversine gaps, over-threshold highlighting.

**M4 — Comms**
Big-button dock, geo-pinned comms with severity, TTS, "reached the pin" spoken alerts,
dedup, TTL expiry.

**M5 — Alerts & battery modes**
Dropped-connection + too-far alerts (non-distractive banners), location-sharing-off mode,
**audio-only screen-off mode**, battery reporting.

**M6 — Field hardening**
Battery-optimization/OEM survival testing, adaptive GPS cadence tuning, real-ride testing with
the group, dedup race fixes (→ Cloud Function if needed).

---

## 11. Open Questions / Risks
- **Screen-off reliability on aggressive OEMs** is the top risk. Budget device testing early;
  keep transistorsoft as the fallback.
- **Group size:** designed for ~5–15. If groups get much larger, reconsider presence write
  fan-out and map marker perf.
- **Dedup location:** start client-side transaction; promote to a Cloud Function if we see
  races or want server-side TTL cleanup (needs Blaze plan — confirm that's acceptable).
- **Map provider:** react-native-maps → Google Maps needs an API key + billing. Confirm ok, or
  we evaluate an alternative tile source.
- **TTS quality/latency** at speed with wind noise — may need a Bluetooth-audio recommendation
  and volume ducking.
