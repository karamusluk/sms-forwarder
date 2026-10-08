import type { AppLanguage } from '../i18n';
import { getSupabase } from './supabase';

export type FilterMode = 'all' | 'senders' | 'contains';

export type Profile = {
  id: string;
  email: string;
  destination_email: string;
  destination_verified: boolean;
  forwarding_enabled: boolean;
  include_metadata: boolean;
  filter_mode: FilterMode;
  filter_values: string[];
  language: AppLanguage;
};

export async function ensureProfile(userId: string, email: string): Promise<Profile> {
  const supabase = getSupabase();
  const existing = await supabase
    .from('smsfwd_profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();
  if (existing.error) {
    throw existing.error;
  }
  if (existing.data) {
    return normalizeProfile(existing.data);
  }

  const inserted = await supabase
    .from('smsfwd_profiles')
    .insert({
      id: userId,
      email,
      destination_email: email,
    })
    .select('*')
    .single();
  if (!inserted.error && inserted.data) {
    return normalizeProfile(inserted.data);
  }

  const raced = await supabase
    .from('smsfwd_profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();
  if (raced.data) {
    return normalizeProfile(raced.data);
  }
  throw inserted.error ?? raced.error ?? new Error('profile_create_failed');
}

export async function updateProfile(
  userId: string,
  patch: Partial<
    Pick<
      Profile,
      | 'forwarding_enabled'
      | 'include_metadata'
      | 'filter_mode'
      | 'filter_values'
      | 'language'
    >
  >,
): Promise<Profile> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('smsfwd_profiles')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', userId)
    .select('*')
    .single();
  if (error) {
    throw error;
  }
  return normalizeProfile(data);
}

function normalizeProfile(row: Profile): Profile {
  return {
    ...row,
    filter_values: row.filter_values ?? [],
    language: row.language === 'en' ? 'en' : 'tr',
  };
}
