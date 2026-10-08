import { StyleSheet, Text } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';

import { LanguageSwitch } from '../components/LanguageSwitch';
import { PrimaryButton } from '../components/PrimaryButton';
import { Screen } from '../components/Screen';
import type { RootStackParamList } from '../navigation/types';

export function WelcomeScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  return (
    <Screen includeTop>
      <Text style={styles.title}>{t('welcome.title')}</Text>
      <Text style={styles.body}>{t('welcome.body')}</Text>
      <Text style={styles.warning}>{t('welcome.warning')}</Text>
      <LanguageSwitch />
      <PrimaryButton label={t('welcome.start')} onPress={() => navigation.navigate('Email')} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: 32,
    lineHeight: 38,
    fontWeight: '700',
    color: '#1c1917',
  },
  body: {
    marginTop: 16,
    fontSize: 17,
    lineHeight: 24,
    color: '#44403c',
  },
  warning: {
    marginTop: 12,
    marginBottom: 28,
    fontSize: 15,
    lineHeight: 22,
    color: '#78716c',
  },
});
