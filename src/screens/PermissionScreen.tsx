import { useLayoutEffect, useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';

import { PrimaryButton } from '../components/PrimaryButton';
import { Screen } from '../components/Screen';
import { SmsForwarder } from '../lib/native';
import type { RootStackParamList } from '../navigation/types';

export function PermissionScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [loading, setLoading] = useState(false);
  const [denied, setDenied] = useState(false);

  useLayoutEffect(() => {
    navigation.setOptions({ title: t('perm.title') });
  }, [navigation, t]);

  async function requestPermission() {
    setLoading(true);
    setDenied(false);
    try {
      const granted = await SmsForwarder.requestSmsPermission();
      if (!granted) {
        setDenied(true);
        return;
      }
      navigation.reset({ index: 0, routes: [{ name: 'Home' }] });
    } catch {
      setDenied(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Screen>
      <Text style={styles.title}>{t('perm.title')}</Text>
      <Text style={styles.body}>{t('perm.sms.explain')}</Text>
      {denied ? <Text style={styles.error}>{t('perm.denied')}</Text> : null}
      <PrimaryButton
        label={t('perm.cta')}
        loading={loading}
        onPress={() => {
          requestPermission();
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 28, lineHeight: 34, fontWeight: '700', color: '#1c1917' },
  body: {
    marginTop: 16,
    marginBottom: 24,
    fontSize: 17,
    lineHeight: 24,
    color: '#44403c',
  },
  error: { color: '#b91c1c', marginBottom: 16, fontSize: 15 },
});
