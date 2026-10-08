import { useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ActivityIndicator, StatusBar, StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { syncForwardingService, syncNativeConfig } from './lib/forward';
import { SmsForwarder, subscribeForwardResult } from './lib/native';
import { ensureProfile } from './lib/profile';
import { getSupabase, isSupabaseConfigured } from './lib/supabase';
import type { RootStackParamList } from './navigation/types';
import { EmailScreen } from './screens/EmailScreen';
import { HomeScreen } from './screens/HomeScreen';
import { OtpScreen } from './screens/OtpScreen';
import { PermissionScreen } from './screens/PermissionScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { WelcomeScreen } from './screens/WelcomeScreen';
import { useLanguageStore } from './state/language';
import { useProfileStore } from './state/profile';

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function App() {
  const [ready, setReady] = useState(false);
  const [initialRoute, setInitialRoute] = useState<keyof RootStackParamList>('Welcome');

  useEffect(() => {
    let cancelled = false;
    SmsForwarder.hasSmsPermission().catch(() => undefined);
    const subscription = subscribeForwardResult(event => {
      if (event.status === 'sent') {
        useProfileStore.getState().setForwardResult({ forwardedAt: Date.now(), error: null });
        return;
      }
      if (event.status === 'failed') {
        useProfileStore.getState().setForwardResult({ error: event.error ?? 'generic' });
      }
    });

    async function boot() {
      try {
        if (!isSupabaseConfigured) {
          return;
        }
        const supabase = getSupabase();
        const { data } = await supabase.auth.getSession();
        if (!data.session) {
          return;
        }
        const profile = await ensureProfile(
          data.session.user.id,
          data.session.user.email ?? '',
        );
        useProfileStore.getState().setProfile(profile);
        useLanguageStore.getState().setLanguage(profile.language);
        try {
          await syncNativeConfig(profile);
          if (profile.forwarding_enabled) {
            await syncForwardingService(true);
          }
        } catch {
          // Profile is loaded. Home can write native config again.
        }
        if (!cancelled) {
          setInitialRoute('Home');
        }
      } catch {
        if (!cancelled) {
          setInitialRoute('Welcome');
        }
      } finally {
        if (!cancelled) {
          setReady(true);
        }
      }
    }

    boot();
    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, []);

  if (!ready) {
    return (
      <SafeAreaProvider>
        <View style={styles.loading}>
          <ActivityIndicator color="#1c1917" />
        </View>
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar barStyle="dark-content" />
      <NavigationContainer>
        <Stack.Navigator
          initialRouteName={initialRoute}
          screenOptions={{
            headerShadowVisible: false,
            headerStyle: { backgroundColor: '#f7f5f2' },
            headerTintColor: '#1c1917',
            contentStyle: { backgroundColor: '#f7f5f2' },
          }}>
          <Stack.Screen
            name="Welcome"
            component={WelcomeScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen name="Email" component={EmailScreen} />
          <Stack.Screen name="Otp" component={OtpScreen} />
          <Stack.Screen name="Permission" component={PermissionScreen} />
          <Stack.Screen name="Home" component={HomeScreen} />
          <Stack.Screen name="Settings" component={SettingsScreen} />
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f7f5f2',
  },
});
