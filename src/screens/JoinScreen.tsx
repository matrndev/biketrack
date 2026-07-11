import React, { useRef, useState } from 'react';
import { Text, TextInput, Pressable, StyleSheet, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation';
import { useStore } from '../store';
import { joinGroup, parseJoinCode } from '../groups';
import {
  useConnected,
  withTimeout,
  WRITE_TIMEOUT_MS,
  OFFLINE_MESSAGE,
  TIMEOUT_MESSAGE,
} from '../connection';
import { theme } from '../theme';
import KeyboardAwareScreen from '../KeyboardAwareScreen';

export default function JoinScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const uid = useStore((s) => s.uid);
  const displayName = useStore((s) => s.displayName);
  const setGroupId = useStore((s) => s.setGroupId);

  const [permission, requestPermission] = useCameraPermissions();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const connected = useConnected();
  // QR fires the scan callback many times per second — latch on the first hit.
  const scanLock = useRef(false);

  const join = async (joinCode: string) => {
    if (!uid || !displayName || busy) return;
    if (!connected) {
      // Release the QR latch so scanning works again once we're back online.
      scanLock.current = false;
      setError(OFFLINE_MESSAGE);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { avatarColor, avatarInitials } = useStore.getState();
      const groupId = await withTimeout(
        joinGroup(joinCode, uid, displayName, avatarColor, avatarInitials),
        WRITE_TIMEOUT_MS,
        TIMEOUT_MESSAGE
      );
      await setGroupId(groupId);
      navigation.reset({ index: 0, routes: [{ name: 'Group' }] });
    } catch (e: any) {
      setError(String(e?.message ?? e));
      setBusy(false);
      scanLock.current = false;
    }
  };

  const onScan = ({ data }: { data: string }) => {
    if (scanLock.current || busy) return;
    const parsed = parseJoinCode(data);
    if (!parsed) return; // not our QR — keep scanning
    scanLock.current = true;
    setCode(parsed);
    join(parsed);
  };

  const submitManual = () => {
    const parsed = parseJoinCode(code);
    if (!parsed) {
      setError('Enter the 6-digit code.');
      return;
    }
    join(parsed);
  };

  return (
    <KeyboardAwareScreen contentStyle={styles.container}>
      <View style={styles.scannerBox}>
        {permission?.granted ? (
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={onScan}
          />
        ) : (
          <View style={styles.permissionPrompt}>
            <Text style={styles.permissionText}>
              Point the camera at the group's QR code.
            </Text>
            <Pressable style={styles.smallButton} onPress={requestPermission}>
              <Text style={styles.smallButtonText}>Enable camera</Text>
            </Pressable>
          </View>
        )}
      </View>

      

      <TextInput
        style={styles.codeInput}
        value={code}
        onChangeText={(t) => setCode(t.replace(/\D/g, '').slice(0, 6))}
        placeholder="000000"
        placeholderTextColor={theme.colors.textDim}
        keyboardType="number-pad"
        maxLength={6}
        returnKeyType="done"
        onSubmitEditing={submitManual}
      />
      {!connected && <Text style={styles.error}>{OFFLINE_MESSAGE}</Text>}
      {error && <Text style={styles.error}>{error}</Text>}
      <Pressable
        style={[styles.button, (code.length !== 6 || busy || !connected) && styles.buttonDisabled]}
        disabled={code.length !== 6 || busy || !connected}
        onPress={submitManual}
      >
        <Text style={styles.buttonText}>{busy ? 'Joining…' : 'Join'}</Text>
      </Pressable>
    </KeyboardAwareScreen>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: theme.spacing(2),
  },
  scannerBox: {
    aspectRatio: 1,
    borderRadius: theme.radius.md,
    overflow: 'hidden',
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  permissionPrompt: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing(2),
    padding: theme.spacing(3),
  },
  permissionText: {
    color: theme.colors.textDim,
    fontSize: theme.font.body,
    fontFamily: theme.family.regular,
    textAlign: 'center',
  },
  smallButton: {
    borderWidth: 1.5,
    borderColor: theme.colors.accent,
    borderRadius: theme.radius.sm,
    paddingVertical: theme.spacing(1),
    paddingHorizontal: theme.spacing(2),
  },
  smallButtonText: {
    color: theme.colors.accent,
    fontSize: theme.font.body,
    fontFamily: theme.family.bold,
  },
  divider: {
    color: theme.colors.textDim,
    fontSize: theme.font.small,
    fontFamily: theme.family.medium,
    textAlign: 'center',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginVertical: theme.spacing(2),
  },
  codeInput: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    color: theme.colors.text,
    fontSize: 32,
    fontFamily: 'monospace',
    letterSpacing: 12,
    textAlign: 'center',
    paddingVertical: theme.spacing(2),
    marginVertical: theme.spacing(2),
  },
  button: {
    backgroundColor: theme.colors.accent,
    borderRadius: theme.radius.md,
    paddingVertical: theme.spacing(2.5),
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.4 },
  buttonText: {
    color: '#000000',
    fontSize: theme.font.h2,
    fontFamily: theme.family.extraBold,
  },
  error: {
    color: theme.colors.danger,
    fontSize: theme.font.body,
    fontFamily: theme.family.regular,
    textAlign: 'center',
    marginBottom: theme.spacing(2),
  },
});
