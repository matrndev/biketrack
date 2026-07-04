import React from 'react';
import { Text, Pressable, StyleSheet, Alert } from 'react-native';
import { NavigationContainer, DarkTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useStore } from './store';
import { resetIdentity } from './auth';
import { leaveGroup } from './groups';
import { useRideLifecycle } from './ride';
import OnboardingScreen from './screens/OnboardingScreen';
import HomeScreen from './screens/HomeScreen';
import CreateGroupScreen from './screens/CreateGroupScreen';
import JoinScreen from './screens/JoinScreen';
import GroupScreen from './screens/GroupScreen';
import RideScreen from './screens/RideScreen';
import { theme } from './theme';

export type RootStackParamList = {
  Onboarding: undefined;
  Home: undefined;
  CreateGroup: undefined;
  Join: undefined;
  Group: { allowDuringRide?: boolean } | undefined;
  Ride: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

const navTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: theme.colors.bg,
    card: theme.colors.bg,
    text: theme.colors.text,
    border: theme.colors.border,
    primary: theme.colors.accent,
  },
};

// Header "Log out": discards the anonymous identity. Leaves the active group
// first (best-effort) so the member entry doesn't linger, then mints a fresh
// UID and clears local state — the nav gate drops back to Onboarding.
function LogoutButton() {
  const confirm = () => {
    Alert.alert(
      'Log out?',
      'This removes your user account from this device. You will need to log back in with a new identity to use the app.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Log out',
          style: 'destructive',
          onPress: async () => {
            const { uid, groupId, setUid, reset } = useStore.getState();
            try {
              if (uid && groupId) await leaveGroup(groupId, uid).catch(() => {});
              const newUid = await resetIdentity();
              setUid(newUid);
              await reset();
            } catch (e: any) {
              Alert.alert('Log out failed', String(e?.message ?? e));
            }
          },
        },
      ]
    );
  };

  return (
    <Pressable style={logoutStyles.button} onPress={confirm} hitSlop={8}>
      <Text style={logoutStyles.text}>Log out</Text>
    </Pressable>
  );
}

const logoutStyles = StyleSheet.create({
  button: {
    backgroundColor: theme.colors.surfaceAlt,
    borderRadius: theme.radius.sm,
    paddingVertical: theme.spacing(0.75),
    paddingHorizontal: theme.spacing(1.5),
  },
  text: {
    color: theme.colors.textDim,
    fontSize: theme.font.small,
    fontFamily: theme.family.medium,
  },
});

export default function Navigation() {
  // Gate purely on displayName: no name yet → onboard; otherwise → home.
  const displayName = useStore((s) => s.displayName);
  // Hydrated before Navigation mounts (App gates on it), so this is stable at
  // first render: relaunching while in a group goes straight to the Group screen.
  const groupId = useStore((s) => s.groupId);
  // Presence + GPS tracking follow group membership, whatever screen is shown.
  useRideLifecycle();

  return (
    <NavigationContainer theme={navTheme}>
      <Stack.Navigator
        initialRouteName={!displayName ? 'Onboarding' : groupId ? 'Group' : 'Home'}
        screenOptions={{
          headerStyle: { backgroundColor: theme.colors.bg },
          headerTintColor: theme.colors.text,
          headerTitleStyle: { fontFamily: theme.family.bold },
          contentStyle: { backgroundColor: theme.colors.bg },
        }}
      >
        {displayName ? (
          <>
            <Stack.Screen
              name="Home"
              component={HomeScreen}
              options={{ title: 'BikeTrack', headerRight: () => <LogoutButton /> }}
            />
            <Stack.Screen
              name="CreateGroup"
              component={CreateGroupScreen}
              options={{ title: 'Create group' }}
            />
            <Stack.Screen name="Join" component={JoinScreen} options={{ title: 'Join group' }} />
            <Stack.Screen name="Group" component={GroupScreen} options={{ title: 'Group' }} />
            <Stack.Screen name="Ride" component={RideScreen} options={{ title: 'Ride' }} />
          </>
        ) : (
          <Stack.Screen
            name="Onboarding"
            component={OnboardingScreen}
            options={{ headerShown: false }}
          />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
