import { useCallback, useLayoutEffect, useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';

import { Screen } from '../components/Screen';
import { syncForwardingService, syncNativeConfig } from '../lib/forward';
import { SmsForwarder } from '../lib/native';
import { updateProfile } from '../lib/profile';
import type { RootStackParamList } from '../navigation/types';
import { useProfileStore } from '../state/profile';

function SettingsHeaderButton() {
  const { t } = useTranslation();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  return (
    <Pressable accessibilityRole="button" onPress={() => navigation.navigate('Settings')}>
      <Text style={styles.headerAction}>{t('home.settings')}</Text>
    </Pressable>
  );
}

function SettingsHeaderLink() {
  return <SettingsHeaderButton />;
}

export function HomeScreen() {
  const { t, i18n } = useTranslation();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const profile = useProfileStore(state => state.profile);
  const lastForwardedAt = useProfileStore(state => state.lastForwardedAt);
  const lastError = useProfileStore(state => state.lastError);
  const setProfile = useProfileStore(state => state.setProfile);
  const [smsGranted, setSmsGranted] = useState(false);
  const [batteryIgnored, setBatteryIgnored] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshStatus = useCallback(() => {
    SmsForwarder.hasSmsPermission()
      .then(setSmsGranted)
      .catch(() => setSmsGranted(false));
    SmsForwarder.isIgnoringBatteryOptimizations()
      .then(setBatteryIgnored)
      .catch(() => setBatteryIgnored(true));
  }, []);

  useFocusEffect(
    useCallback(() => {
      refreshStatus();
    }, [refreshStatus]),
  );

  useLayoutEffect(() => {
    navigation.setOptions({
      title: t('home.title'),
      headerBackVisible: false,
      headerRight: SettingsHeaderLink,
    });
  }, [navigation, t]);

  async function onToggle(enabled: boolean) {
    if (!profile || saving) {
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const next = await updateProfile(profile.id, { forwarding_enabled: enabled });
      setProfile(next);
      await syncNativeConfig(next);
      await syncForwardingService(enabled);
      if (enabled) {
        const granted = await SmsForwarder.hasSmsPermission();
        setSmsGranted(granted);
        const ignoring = await SmsForwarder.isIgnoringBatteryOptimizations();
        setBatteryIgnored(ignoring);
        if (!ignoring) {
          await SmsForwarder.requestIgnoreBatteryOptimizations();
        }
        if (!granted) {
          navigation.navigate('Permission');
        }
      }
    } catch {
      setError(t('settings.error'));
    } finally {
      setSaving(false);
    }
  }

  const locale = i18n.language === 'en' ? 'en-GB' : 'tr-TR';
  const forwardedLabel = lastForwardedAt
    ? t('home.lastForwarded', {
        time: new Date(lastForwardedAt).toLocaleString(locale),
      })
    : t('home.lastForwardedEmpty');
  const errorLabel = lastError
    ? t('home.lastError', { message: t(`home.error.${lastError}`, { defaultValue: t('home.error.generic') }) })
    : t('home.lastErrorNone');

  return (
    <Screen>
      <View style={styles.row}>
        <Text style={styles.label}>{t('home.toggle')}</Text>
        <Switch
          disabled={!profile || saving}
          value={profile?.forwarding_enabled ?? false}
          onValueChange={value => {
            onToggle(value);
          }}
        />
      </View>
      <Text style={styles.caption}>{t('settings.destination')}</Text>
      <Text style={styles.value}>{profile?.destination_email ?? '—'}</Text>
      <Text style={styles.caption}>{t('home.permission')}</Text>
      <View style={styles.row}>
        <Text style={styles.value}>
          {smsGranted ? t('home.permissionGranted') : t('home.permissionDenied')}
        </Text>
        {smsGranted ? null : (
          <Pressable accessibilityRole="button" onPress={() => navigation.navigate('Permission')}>
            <Text style={styles.link}>{t('home.grant')}</Text>
          </Pressable>
        )}
      </View>
      <Text style={styles.caption}>{t('home.battery')}</Text>
      <View style={styles.row}>
        <Text style={styles.value}>
          {batteryIgnored ? t('home.batteryIgnored') : t('home.batteryOptimized')}
        </Text>
        {batteryIgnored ? null : (
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              SmsForwarder.requestIgnoreBatteryOptimizations().catch(() => undefined);
            }}>
            <Text style={styles.link}>{t('home.batteryGrant')}</Text>
          </Pressable>
        )}
      </View>
      {batteryIgnored ? null : <Text style={styles.status}>{t('home.batteryExplain')}</Text>}
      <Text style={styles.status}>{forwardedLabel}</Text>
      <Text style={styles.status}>{errorLabel}</Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  label: { fontSize: 18, fontWeight: '700', color: '#1c1917' },
  caption: { fontSize: 14, color: '#78716c', marginBottom: 4 },
  value: { fontSize: 17, color: '#1c1917', marginBottom: 16 },
  link: { fontSize: 16, fontWeight: '600', color: '#1c1917' },
  status: { fontSize: 16, lineHeight: 22, color: '#44403c', marginBottom: 8 },
  error: { color: '#b91c1c', marginTop: 12, fontSize: 15 },
  headerAction: { fontSize: 16, fontWeight: '600', color: '#1c1917', paddingHorizontal: 4 },
});
