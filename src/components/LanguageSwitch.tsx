import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { languages, type AppLanguage } from '../i18n';
import { useLanguageStore } from '../state/language';

type LanguageSwitchProps = {
  onChange?: (language: AppLanguage) => void;
};

export function LanguageSwitch({ onChange }: LanguageSwitchProps) {
  const { t } = useTranslation();
  const language = useLanguageStore(state => state.language);
  const setLanguage = useLanguageStore(state => state.setLanguage);

  return (
    <View style={styles.row}>
      {languages.map(code => {
        const selected = language === code;
        return (
          <Pressable
            key={code}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            onPress={() => {
              setLanguage(code);
              onChange?.(code);
            }}
            style={[styles.chip, selected && styles.chipSelected]}>
            <Text style={[styles.chipLabel, selected && styles.chipLabelSelected]}>
              {t(`language.${code}`)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 12 },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#d6d3d1',
    backgroundColor: '#ffffff',
  },
  chipSelected: { backgroundColor: '#1c1917', borderColor: '#1c1917' },
  chipLabel: { fontSize: 16, color: '#1c1917' },
  chipLabelSelected: { color: '#ffffff' },
});
