import { useLayoutEffect, useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';

import { LanguageSwitch } from '../components/LanguageSwitch';
import { Screen } from '../components/Screen';
import { syncNativeConfig } from '../lib/forward';
import { SmsForwarder } from '../lib/native';
import { updateProfile, type FilterMode } from '../lib/profile';
import { getSupabase } from '../lib/supabase';
import type { AppLanguage } from '../i18n';
import type { RootStackParamList } from '../navigation/types';
import { useProfileStore } from '../state/profile';

const FILTERS: FilterMode[] = ['all', 'senders', 'contains'];

export function SettingsScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const profile = useProfileStore(state => state.profile);
  const setProfile = useProfileStore(state => state.setProfile);
  const [filterText, setFilterText] = useState((profile?.filter_values ?? []).join(', '));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useLayoutEffect(() => {
    navigation.setOptions({ title: t('settings.title') });
  }, [navigation, t]);

  async function save(patch: Parameters<typeof updateProfile>[1]) {
    if (!profile) {
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const next = await updateProfile(profile.id, patch);
      setProfile(next);
      await syncNativeConfig(next);
    } catch {
      setError(t('settings.error'));
    } finally {
      setSaving(false);
    }
  }

  async function saveFilterText() {
    const filterValues = filterText
      .split(/[,\n]/)
      .map(value => value.trim())
      .filter(value => value.length > 0);
    await save({ filter_values: filterValues });
  }

  async function onLanguage(language: AppLanguage) {
    await save({ language });
  }

  async function signOut() {
    setSaving(true);
    setError(null);
    try {
      try {
        await SmsForwarder.setEnabled(false);
        await SmsForwarder.stopForegroundService();
      } catch {
        // Signing out still proceeds if the native module is unavailable.
      }
      await getSupabase().auth.signOut();
      setProfile(null);
      navigation.reset({ index: 0, routes: [{ name: 'Welcome' }] });
    } catch {
      setError(t('settings.error'));
      setSaving(false);
    }
  }

  return (
    <Screen>
      <Text style={styles.caption}>{t('settings.destination')}</Text>
      <Text style={styles.value}>{profile?.destination_email ?? '—'}</Text>
      <Text style={styles.hint}>{t('settings.destinationLocked')}</Text>

      <View style={styles.row}>
        <Text style={styles.label}>{t('settings.metadata')}</Text>
        <Switch
          disabled={!profile || saving}
          value={profile?.include_metadata ?? true}
          onValueChange={value => {
            save({ include_metadata: value });
          }}
        />
      </View>

      <Text style={styles.label}>{t('settings.filter')}</Text>
      <View style={styles.filters}>
        {FILTERS.map(mode => {
          const selected = profile?.filter_mode === mode;
          return (
            <Pressable
              key={mode}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              disabled={saving}
              onPress={() => {
                save({ filter_mode: mode });
              }}
              style={[styles.chip, selected && styles.chipSelected]}>
              <Text style={[styles.chipLabel, selected && styles.chipLabelSelected]}>
                {t(`settings.filter.${mode}`)}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {profile?.filter_mode === 'all' ? null : (
        <>
          <Text style={styles.caption}>{t('settings.filterValues')}</Text>
          <TextInput
            multiline
            placeholder={t('settings.filterValuesPlaceholder')}
            placeholderTextColor="#a8a29e"
            style={styles.input}
            value={filterText}
            onChangeText={setFilterText}
            onEndEditing={() => {
              saveFilterText();
            }}
          />
        </>
      )}

      <Text style={styles.label}>{t('settings.language')}</Text>
      <LanguageSwitch
        onChange={language => {
          onLanguage(language);
        }}
      />

      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Pressable
        accessibilityRole="button"
        disabled={saving}
        onPress={() => {
          signOut();
        }}
        style={styles.signOut}>
        <Text style={styles.signOutLabel}>{t('settings.signOut')}</Text>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  caption: { fontSize: 14, color: '#78716c', marginBottom: 4 },
  value: { fontSize: 17, color: '#1c1917' },
  hint: { fontSize: 14, color: '#a8a29e', marginBottom: 24 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  label: { fontSize: 16, fontWeight: '700', color: '#1c1917', marginBottom: 12 },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#d6d3d1',
    backgroundColor: '#ffffff',
  },
  chipSelected: { backgroundColor: '#1c1917', borderColor: '#1c1917' },
  chipLabel: { fontSize: 14, color: '#1c1917' },
  chipLabelSelected: { color: '#ffffff' },
  input: {
    borderWidth: 1,
    borderColor: '#d6d3d1',
    backgroundColor: '#ffffff',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    minHeight: 80,
    fontSize: 16,
    color: '#1c1917',
    marginBottom: 24,
    textAlignVertical: 'top',
  },
  error: { color: '#b91c1c', marginTop: 12, fontSize: 15 },
  signOut: { marginTop: 28, alignItems: 'center' },
  signOutLabel: { fontSize: 16, fontWeight: '600', color: '#b91c1c' },
});
