import { SmsForwarder } from './native';
import type { Profile } from './profile';
import {
  getForwardFunctionUrl,
  getSupabase,
  getSupabaseAnonKey,
  getSupabaseAuthUrl,
  isSupabaseConfigured,
} from './supabase';

export async function syncNativeConfig(profile: Profile): Promise<void> {
  if (!isSupabaseConfigured) {
    return;
  }
  const { data } = await getSupabase().auth.getSession();
  const session = data.session;
  if (!session) {
    return;
  }
  await SmsForwarder.setConfig({
    functionUrl: getForwardFunctionUrl(),
    anonKey: getSupabaseAnonKey(),
    accessToken: session.access_token,
    refreshToken: session.refresh_token,
    supabaseAuthUrl: getSupabaseAuthUrl(),
    destinationEmail: profile.destination_email,
    enabled: profile.forwarding_enabled,
    language: profile.language,
  });
  await SmsForwarder.setEnabled(profile.forwarding_enabled);
}

export async function syncForwardingService(enabled: boolean): Promise<void> {
  if (enabled) {
    await SmsForwarder.requestNotificationPermission();
    await SmsForwarder.startForegroundService();
    return;
  }
  await SmsForwarder.stopForegroundService();
}
