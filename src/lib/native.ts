import {
  DeviceEventEmitter,
  type EmitterSubscription,
  type TurboModule,
  TurboModuleRegistry,
} from 'react-native';

export type SmsReceivedEvent = {
  sender: string;
  body: string;
  timestamp: number;
};

export type SmsForwarderConfig = {
  functionUrl: string;
  anonKey: string;
  accessToken: string;
  refreshToken: string;
  supabaseAuthUrl: string;
  destinationEmail: string;
  enabled: boolean;
  language?: string;
};

export type ForwardResultEvent = {
  dedupeKey: string;
  status: 'sent' | 'skipped' | 'failed';
  error?: string;
};

interface SmsForwarderModule extends TurboModule {
  hasSmsPermission(): Promise<boolean>;
  requestSmsPermission(): Promise<boolean>;
  setConfig(config: SmsForwarderConfig): Promise<void>;
  setEnabled(enabled: boolean): Promise<void>;
  startForegroundService(): Promise<void>;
  stopForegroundService(): Promise<void>;
  requestNotificationPermission(): Promise<boolean>;
  isIgnoringBatteryOptimizations(): Promise<boolean>;
  requestIgnoreBatteryOptimizations(): Promise<void>;
}

const EVENT_SMS_RECEIVED = 'onSmsReceived';
const EVENT_FORWARD_RESULT = 'onForwardResult';

function getModule(): SmsForwarderModule {
  const native = TurboModuleRegistry.get<SmsForwarderModule>('SmsForwarder');
  if (!native) {
    throw new Error('SmsForwarder native module is not available.');
  }
  return native;
}

export const SmsForwarder = {
  hasSmsPermission(): Promise<boolean> {
    return getModule().hasSmsPermission();
  },
  requestSmsPermission(): Promise<boolean> {
    return getModule().requestSmsPermission();
  },
  setConfig(config: SmsForwarderConfig): Promise<void> {
    return getModule().setConfig(config);
  },
  setEnabled(enabled: boolean): Promise<void> {
    return getModule().setEnabled(enabled);
  },
  startForegroundService(): Promise<void> {
    return getModule().startForegroundService();
  },
  stopForegroundService(): Promise<void> {
    return getModule().stopForegroundService();
  },
  requestNotificationPermission(): Promise<boolean> {
    return getModule().requestNotificationPermission();
  },
  isIgnoringBatteryOptimizations(): Promise<boolean> {
    return getModule().isIgnoringBatteryOptimizations();
  },
  requestIgnoreBatteryOptimizations(): Promise<void> {
    return getModule().requestIgnoreBatteryOptimizations();
  },
};

export function subscribeSmsReceived(
  listener: (event: SmsReceivedEvent) => void,
): EmitterSubscription {
  return DeviceEventEmitter.addListener(EVENT_SMS_RECEIVED, listener);
}

export function subscribeForwardResult(
  listener: (event: ForwardResultEvent) => void,
): EmitterSubscription {
  return DeviceEventEmitter.addListener(EVENT_FORWARD_RESULT, listener);
}
