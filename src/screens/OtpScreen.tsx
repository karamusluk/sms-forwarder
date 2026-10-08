import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';

import { PrimaryButton } from '../components/PrimaryButton';
import { Screen } from '../components/Screen';
import { syncNativeConfig } from '../lib/forward';
import { ensureProfile, updateProfile } from '../lib/profile';
import { SmsForwarder } from '../lib/native';
import { getSupabase } from '../lib/supabase';
import type { RootStackParamList } from '../navigation/types';
import { useLanguageStore } from '../state/language';
import { useProfileStore } from '../state/profile';

const RESEND_SECONDS = 30;

export function OtpScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, 'Otp'>>();
  const email = route.params.email;
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [verified, setVerified] = useState(false);
  const [cooldown, setCooldown] = useState(RESEND_SECONDS);
  const isVerifying = useRef(false);
  const succeeded = useRef(false);
  const codeRef = useRef('');

  useLayoutEffect(() => {
    navigation.setOptions({ title: t('otp.cta') });
  }, [navigation, t]);

  useEffect(() => {
    if (cooldown <= 0) {
      return;
    }
    const timer = setTimeout(() => setCooldown(value => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  function onCodeChange(value: string) {
    const next = value.replace(/\D/g, '').slice(0, 6);
    codeRef.current = next;
    setCode(next);
    if (next.length === 6) {
      verify(next);
    }
  }

  function verify(raw?: string) {
    if (isVerifying.current || succeeded.current) {
      return;
    }
    const token = (raw ?? codeRef.current).trim();
    if (!/^\d{6}$/.test(token)) {
      setError(t('otp.invalid'));
      return;
    }
    isVerifying.current = true;
    setLoading(true);
    setError(null);
    submit(token);
  }

  async function submit(token: string) {
    const supabase = getSupabase();
    try {
      const { data, error: verifyError } = await supabase.auth.verifyOtp({
        email,
        token,
        type: 'email',
      });
      if (succeeded.current) {
        return;
      }
      const session = data.session;
      const user = data.user;
      if (verifyError || !session || !user) {
        setError(t('otp.error'));
        return;
      }

      succeeded.current = true;
      setVerified(true);
      setError(null);

      let profile = await ensureProfile(user.id, user.email ?? email);
      const localLanguage = useLanguageStore.getState().language;
      if (profile.language !== localLanguage) {
        profile = await updateProfile(profile.id, { language: localLanguage });
      }
      useProfileStore.getState().setProfile(profile);
      let granted = false;
      try {
        await syncNativeConfig(profile);
        granted = await SmsForwarder.hasSmsPermission();
      } catch {
        granted = false;
      }
      navigation.reset({
        index: 0,
        routes: [{ name: granted ? 'Home' : 'Permission' }],
      });
    } catch {
      if (!succeeded.current) {
        setError(t('otp.error'));
      }
    } finally {
      if (!succeeded.current) {
        isVerifying.current = false;
        setLoading(false);
      }
    }
  }

  async function resend() {
    if (cooldown > 0 || isVerifying.current || succeeded.current) {
      return;
    }
    setError(null);
    const { error: otpError } = await getSupabase().auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true },
    });
    if (otpError) {
      setError(t('email.error'));
      return;
    }
    setCooldown(RESEND_SECONDS);
  }

  return (
    <Screen>
      <Text style={styles.title}>{t('otp.title')}</Text>
      <Text style={styles.email}>{email}</Text>
      <TextInput
        editable={!loading && !verified}
        keyboardType="number-pad"
        maxLength={6}
        placeholder="000000"
        placeholderTextColor="#a8a29e"
        style={styles.input}
        value={code}
        onChangeText={onCodeChange}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <PrimaryButton
        label={t('otp.cta')}
        loading={loading || verified}
        disabled={loading || verified}
        onPress={() => {
          verify();
        }}
      />
      <Pressable
        accessibilityRole="button"
        disabled={cooldown > 0 || loading}
        onPress={() => {
          resend();
        }}
        style={styles.resend}>
        <Text style={[styles.resendLabel, cooldown > 0 && styles.resendDisabled]}>
          {cooldown > 0 ? t('otp.resendIn', { seconds: cooldown }) : t('otp.resend')}
        </Text>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 22, lineHeight: 28, fontWeight: '700', color: '#1c1917' },
  email: { marginTop: 8, marginBottom: 20, fontSize: 16, color: '#57534e' },
  input: {
    borderWidth: 1,
    borderColor: '#d6d3d1',
    backgroundColor: '#ffffff',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 24,
    letterSpacing: 8,
    color: '#1c1917',
    marginBottom: 16,
  },
  error: { color: '#b91c1c', marginBottom: 16, fontSize: 15 },
  resend: { marginTop: 20, alignItems: 'center' },
  resendLabel: { fontSize: 16, color: '#1c1917', fontWeight: '600' },
  resendDisabled: { color: '#a8a29e' },
});
