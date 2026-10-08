import { useLayoutEffect, useState } from 'react';
import { StyleSheet, Text, TextInput } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';

import { PrimaryButton } from '../components/PrimaryButton';
import { Screen } from '../components/Screen';
import type { RootStackParamList } from '../navigation/types';
import { getSupabase, isSupabaseConfigured } from '../lib/supabase';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function EmailScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useLayoutEffect(() => {
    navigation.setOptions({ title: t('email.title') });
  }, [navigation, t]);

  async function sendCode() {
    const trimmed = email.trim().toLowerCase();
    if (!EMAIL_PATTERN.test(trimmed)) {
      setError(t('email.invalid'));
      return;
    }
    if (!isSupabaseConfigured) {
      setError(t('auth.notConfigured'));
      return;
    }
    setLoading(true);
    setError(null);
    const { error: otpError } = await getSupabase().auth.signInWithOtp({
      email: trimmed,
      options: { shouldCreateUser: true },
    });
    setLoading(false);
    if (otpError) {
      setError(t('email.error'));
      return;
    }
    navigation.navigate('Otp', { email: trimmed });
  }

  return (
    <Screen>
      <Text style={styles.label}>{t('email.title')}</Text>
      <TextInput
        autoCapitalize="none"
        autoComplete="email"
        autoCorrect={false}
        keyboardType="email-address"
        placeholder={t('email.placeholder')}
        placeholderTextColor="#a8a29e"
        style={styles.input}
        value={email}
        onChangeText={setEmail}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <PrimaryButton
        label={t('email.cta')}
        loading={loading}
        onPress={() => {
          sendCode();
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 16, fontWeight: '600', color: '#1c1917', marginBottom: 8 },
  input: {
    borderWidth: 1,
    borderColor: '#d6d3d1',
    backgroundColor: '#ffffff',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 17,
    color: '#1c1917',
    marginBottom: 16,
  },
  error: { color: '#b91c1c', marginBottom: 16, fontSize: 15 },
});
