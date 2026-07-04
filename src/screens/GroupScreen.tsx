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
import { useGroup, leaveGroup, qrPayload, Member } from '../groups';
import { theme } from '../theme';

export default function GroupScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const uid = useStore((s) => s.uid);
  const groupId = useStore((s) => s.groupId);
  const setGroupId = useStore((s) => s.setGroupId);
  const group = useGroup(groupId);
  const [leaving, setLeaving] = useState(false);

  // Group deleted / access lost → clear the stored id and fall back home.
  useEffect(() => {
    if (group === null && !leaving) {
      setGroupId(null);
      navigation.reset({ index: 0, routes: [{ name: 'Home' }] });
    }
  }, [group, leaving]);

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
        ? 'You are the last rider — the group will be deleted.'
        : isLeader
          ? 'Leadership passes to the next rider.'
          : undefined,
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
          <Text style={styles.cardLabel}>Invite riders</Text>
          <View style={styles.qrWrap}>
            <QRCode
              value={qrPayload(group.meta.joinCode)}
              size={180}
              backgroundColor="#FFFFFF"
              color="#000000"
            />
          </View>
          <Text style={styles.joinCode}>{group.meta.joinCode}</Text>
          <Text style={styles.hint}>Scan the QR or type the code on the join screen.</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardLabel}>
            Riders ({roster.length})
          </Text>
          {roster.map(([memberId, member]: [string, Member]) => (
            <View key={memberId} style={styles.memberRow}>
              <Text style={styles.memberName}>
                {member.name}
                {memberId === uid ? ' (you)' : ''}
              </Text>
              {member.role === 'leader' && (
                <Text style={styles.leaderBadge}>LEADER</Text>
              )}
            </View>
          ))}
        </View>
      </ScrollView>

      <View style={styles.footer}>
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
    justifyContent: 'space-between',
    paddingVertical: theme.spacing(1),
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
  },
  memberName: {
    color: theme.colors.text,
    fontSize: theme.font.body,
    fontFamily: theme.family.medium,
  },
  leaderBadge: {
    color: theme.colors.accent,
    fontSize: theme.font.small,
    fontFamily: theme.family.bold,
    letterSpacing: 1,
  },
  footer: {
    padding: theme.spacing(2),
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    backgroundColor: theme.colors.bg,
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
