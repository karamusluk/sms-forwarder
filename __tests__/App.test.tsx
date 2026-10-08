/**
 * @format
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import App from '../src/App';

jest.mock('../src/lib/supabase', () => ({
  isSupabaseConfigured: false,
  getSupabase: () => {
    throw new Error('supabase is not configured in tests');
  },
  getSupabaseUrl: () => '',
  getSupabaseAnonKey: () => '',
  getForwardFunctionUrl: () => '',
  getSupabaseAuthUrl: () => '',
}));

jest.mock('../src/lib/native', () => ({
  subscribeSmsReceived: () => ({ remove: jest.fn() }),
  subscribeForwardResult: () => ({ remove: jest.fn() }),
  SmsForwarder: {
    hasSmsPermission: async () => false,
    requestSmsPermission: async () => false,
    requestNotificationPermission: async () => true,
    setConfig: async () => undefined,
    setEnabled: async () => undefined,
    startForegroundService: async () => undefined,
    stopForegroundService: async () => undefined,
    isIgnoringBatteryOptimizations: async () => true,
    requestIgnoreBatteryOptimizations: async () => undefined,
  },
}));

test('renders correctly', async () => {
  await ReactTestRenderer.act(() => {
    ReactTestRenderer.create(<App />);
  });
});
