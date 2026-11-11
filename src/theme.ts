import { useMemo } from 'react';
import { StyleSheet } from 'react-native';
import { useAuthStore } from './store';

/** CityVetHub design tokens. The authenticated preference is the source of truth. */
export const LIGHT = {
  background: '#F2F5FA', surface: '#FFFFFF', surfaceMuted: '#EAF1FB',
  text: '#162337', secondary: '#62748A', border: '#DEE5EF',
  primary: '#3478F6', primaryMuted: '#EAF2FF', danger: '#C54552',
};
export const DARK = {
  background: '#101721', surface: '#1B2635', surfaceMuted: '#25364B',
  text: '#F3F7FC', secondary: '#ABBBD0', border: '#35465D',
  primary: '#76A8FF', primaryMuted: '#213A61', danger: '#FB8794',
};

export function useAppPalette() {
  const dark = useAuthStore(s => s.user?.theme === 'dark');
  return dark ? DARK : LIGHT;
}

/**
 * Adapt older light-only StyleSheet declarations without deleting their geometry.
 * Preserves meaningful warning, success, and primary colors; transforms neutral
 * backgrounds, borders, and foregrounds in dark mode.
 */
export function useThemedStyles<T extends Record<string, any>>(base: T): T {
  const dark = useAuthStore(s => s.user?.theme === 'dark');
  return useMemo(() => {
    if (!dark) return base;
    const normalized: Record<string, any> = {};
    const backgrounds: Record<string, string> = {
      '#FFFFFF': DARK.surface, '#F8FAFC': DARK.background,
      '#F9FAFB': DARK.background, '#F1F5F9': DARK.surfaceMuted,
      '#F3F4F6': DARK.surfaceMuted, '#F0F9FF': DARK.surfaceMuted,
      '#EFF6FF': DARK.primaryMuted, '#EAF2FF': DARK.primaryMuted,
      '#F8FAFF': DARK.background, '#E2E8F0': DARK.border,
      '#F5F7FB': DARK.background, '#F0F4F8': DARK.surfaceMuted,
      '#F7FAFC': DARK.background,
    };
    const foregrounds: Record<string, string> = {
      '#0F172A': DARK.text, '#1E293B': DARK.text, '#334155': DARK.text,
      '#475569': DARK.secondary, '#64748B': DARK.secondary,
      '#6B7280': DARK.secondary, '#64748b': DARK.secondary,
      '#94A3B8': DARK.secondary, '#111827': DARK.text,
      '#374151': DARK.text, '#4B5563': DARK.secondary,
      '#222222': DARK.text, '#333333': DARK.text,
      '#1F2937': DARK.text,
    };
    const borderColors: Record<string, string> = {
      '#E2E8F0': DARK.border, '#CBD5E1': DARK.border,
      '#E5E7EB': DARK.border, '#D1D5DB': DARK.border,
      '#F1F5F9': DARK.border, '#E0E7FF': DARK.border,
    };
    for (const [key, style] of Object.entries(base)) {
      const flat: any = StyleSheet.flatten(style) || {};
      const copy: Record<string, any> = { ...flat };
      for (const field of ['backgroundColor', 'borderColor', 'borderTopColor', 'borderBottomColor', 'borderLeftColor', 'borderRightColor', 'color', 'placeholderTextColor']) {
        const v = copy[field];
        if (typeof v !== 'string') continue;
        const upper = v.toUpperCase();
        if (field === 'backgroundColor') {
          if (upper === '#1E293B' || upper === '#0F172A') copy[field] = '#172438';
          else if (backgrounds[upper]) copy[field] = backgrounds[upper];
        } else if (field === 'color' || field === 'placeholderTextColor') {
          if (foregrounds[upper]) copy[field] = foregrounds[upper];
          else if (upper === '#FFFFFF' && /(input|picker)/i.test(key)) copy[field] = DARK.text;
        } else if (borderColors[upper]) copy[field] = borderColors[upper];
      }
      normalized[key] = copy;
    }
    return normalized as T;
  }, [base, dark]);
}
