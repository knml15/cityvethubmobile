import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Picker } from '../../components/BreedPicker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppPalette, useThemedStyles } from '../../theme';
import {
  defaultMatchPreferences,
  fallbackBreedCatalog,
  fetchBreedCatalog,
  getMatchPreferences,
  PetMatchPreference,
  PetSexPreference,
  PetSpeciesPreference,
  saveMatchPreferences,
} from '../../api/phase422';

const COLORS = [
  '',
  'Black',
  'White',
  'Brown',
  'Cream',
  'Gray',
  'Orange',
  'Golden',
  'Tan',
  'Ginger',
  'Calico',
  'Tortoiseshell',
  'Tabby',
  'Brindle',
  'Spotted',
  'Mixed',
  'Other / Unknown',
];

const SPECIES_OPTIONS: Array<{
  value: PetSpeciesPreference;
  label: string;
  icon: string;
}> = [
  { value: 'Any', label: 'Any', icon: '🐾' },
  { value: 'Dog', label: 'Dog', icon: '🐶' },
  { value: 'Cat', label: 'Cat', icon: '🐱' },
];

const SEX_OPTIONS: Array<{
  value: PetSexPreference;
  label: string;
}> = [
  { value: 'Any', label: 'Any' },
  { value: 'Male', label: '♂ Male' },
  { value: 'Female', label: '♀ Female' },
];

const AGE_PRESETS: Array<{ label: string; min: string; max: string }> = [
  { label: 'Puppy/Kitten (0–1)', min: '0', max: '1' },
  { label: 'Young (1–3)', min: '1', max: '3' },
  { label: 'Adult (3–7)', min: '3', max: '7' },
  { label: 'Senior (7+)', min: '7', max: '40' },
  { label: 'Any (0–40)', min: '0', max: '40' },
];

interface MatchSnapshot {
  prefs: PetMatchPreference;
  ageMin: string;
  ageMax: string;
}

// Centralized notification delivery integration (readMatchNotification and My match notifications handled via Global Notification Center)
export default function AdoptionMatchesPanel({
  visible,
  onClose,
  onOpenListing,
}: {
  visible: boolean;
  onClose: () => void;
  onOpenListing?: (listingId: string) => void;
}) {
  const colors = useAppPalette();
  const styles = useThemedStyles(baseStyles);
  const insets = useSafeAreaInsets();

  const [prefs, setPrefs] = useState<PetMatchPreference>(
    defaultMatchPreferences
  );
  const [breeds, setBreeds] = useState<string[]>(fallbackBreedCatalog.Dog);
  const [breedsLoading, setBreedsLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(false);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [error, setError] = useState('');
  const [ageMin, setAgeMin] = useState('0');
  const [ageMax, setAgeMax] = useState('40');
  const [savedSnapshot, setSavedSnapshot] = useState<MatchSnapshot>({
    prefs: defaultMatchPreferences,
    ageMin: '0',
    ageMax: '40',
  });

  // Preserve chosen breed per species so accidental taps on "Any" or switching species don't wipe user's choice
  const breedMemoryRef = useRef<Partial<Record<'Dog' | 'Cat', string>>>({});
  const hasLoadedRef = useRef(false);

  const setPreference = <K extends keyof PetMatchPreference>(
    key: K,
    value: PetMatchPreference[K]
  ) => setPrefs((current) => ({ ...current, [key]: value }));

  const load = useCallback(async (isInitial = false) => {
    if (isInitial) setInitialLoading(true);
    else setLoading(true);
    setError('');
    try {
      const saved = await getMatchPreferences();
      const minStr = String(saved.minAgeYears);
      const maxStr = String(saved.maxAgeYears);
      if ((saved.species === 'Dog' || saved.species === 'Cat') && saved.breed) {
        breedMemoryRef.current[saved.species] = saved.breed;
      }
      setPrefs(saved);
      setAgeMin(minStr);
      setAgeMax(maxStr);
      setSavedSnapshot({ prefs: saved, ageMin: minStr, ageMax: maxStr });
      hasLoadedRef.current = true;
      setHasLoadedOnce(true);
    } catch (e: any) {
      setError(e?.message || 'Unable to load your adoption preferences.');
    } finally {
      setInitialLoading(false);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (visible) {
      load(!hasLoadedRef.current);
    } else {
      Keyboard.dismiss();
    }
  }, [visible, load]);

  useEffect(() => {
    if (!visible) return;
    if (prefs.species === 'Any') {
      setBreeds([]);
      setBreedsLoading(false);
      return;
    }
    let current = true;
    setBreeds(fallbackBreedCatalog[prefs.species]);
    setBreedsLoading(true);
    fetchBreedCatalog(prefs.species)
      .then((list) => {
        if (current && list.length) setBreeds(list);
      })
      .catch(() => {})
      .finally(() => {
        if (current) setBreedsLoading(false);
      });
    return () => {
      current = false;
    };
  }, [prefs.species, visible]);

  const ageError = useMemo(() => {
    if (ageMin === '' || ageMax === '') {
      return 'Enter whole-number ages between 0 and 40.';
    }
    const min = Number(ageMin);
    const max = Number(ageMax);
    if (!Number.isInteger(min) || !Number.isInteger(max)) {
      return 'Please use whole numbers for both age limits.';
    }
    if (min < 0 || min > 40 || max < 0 || max > 40) {
      return 'Age limits must be between 0 and 40 years.';
    }
    if (min > max) {
      return 'Minimum age cannot exceed maximum age.';
    }
    return '';
  }, [ageMin, ageMax]);

  const isDirty = useMemo(() => {
    if (ageMin !== savedSnapshot.ageMin || ageMax !== savedSnapshot.ageMax) {
      return true;
    }
    const a = prefs;
    const b = savedSnapshot.prefs;
    return (
      a.species !== b.species ||
      a.breed !== b.breed ||
      a.color !== b.color ||
      a.sex !== b.sex ||
      a.isEnabled !== b.isEnabled ||
      a.pushEnabled !== b.pushEnabled
    );
  }, [prefs, ageMin, ageMax, savedSnapshot]);

  const isAtDefault = useMemo(() => {
    return (
      prefs.species === defaultMatchPreferences.species &&
      prefs.breed === defaultMatchPreferences.breed &&
      prefs.color === defaultMatchPreferences.color &&
      prefs.sex === defaultMatchPreferences.sex &&
      ageMin === String(defaultMatchPreferences.minAgeYears) &&
      ageMax === String(defaultMatchPreferences.maxAgeYears)
    );
  }, [prefs, ageMin, ageMax]);

  const summaryItems = useMemo(() => {
    const parts: string[] = [];
    if (prefs.species === 'Dog') parts.push('🐶 Dog');
    else if (prefs.species === 'Cat') parts.push('🐱 Cat');
    else parts.push('🐾 Any Species');

    if (prefs.species !== 'Any' && prefs.breed) parts.push(prefs.breed);
    if (prefs.color) parts.push(prefs.color);
    if (prefs.sex !== 'Any') parts.push(prefs.sex === 'Male' ? '♂ Male' : '♀ Female');

    if (!ageError) {
      parts.push(`${ageMin}–${ageMax} yr(s)`);
    }
    return parts;
  }, [prefs, ageMin, ageMax, ageError]);

  const handleSelectSpecies = (nextSpecies: PetSpeciesPreference) => {
    setPrefs((curr) => {
      if (curr.species === nextSpecies) return curr;
      if ((curr.species === 'Dog' || curr.species === 'Cat') && curr.breed) {
        breedMemoryRef.current[curr.species] = curr.breed;
      }
      const restoredBreed =
        nextSpecies === 'Dog' || nextSpecies === 'Cat'
          ? breedMemoryRef.current[nextSpecies] || ''
          : '';
      return {
        ...curr,
        species: nextSpecies,
        breed: restoredBreed,
      };
    });
  };

  const handleResetFilters = () => {
    Keyboard.dismiss();
    breedMemoryRef.current = {};
    setPrefs((curr) => ({
      ...curr,
      species: defaultMatchPreferences.species,
      breed: defaultMatchPreferences.breed,
      color: defaultMatchPreferences.color,
      sex: defaultMatchPreferences.sex,
    }));
    setAgeMin(String(defaultMatchPreferences.minAgeYears));
    setAgeMax(String(defaultMatchPreferences.maxAgeYears));
  };

  const handleAttemptClose = () => {
    if (busy) return;
    Keyboard.dismiss();
    if (hasLoadedOnce && isDirty) {
      Alert.alert(
        'Discard unsaved changes?',
        'You have unsaved edits to your adoption matching preferences.',
        [
          { text: 'Keep Editing', style: 'cancel' },
          {
            text: 'Discard',
            style: 'destructive',
            onPress: () => {
              setPrefs(savedSnapshot.prefs);
              setAgeMin(savedSnapshot.ageMin);
              setAgeMax(savedSnapshot.ageMax);
              onClose();
            },
          },
        ]
      );
      return;
    }
    onClose();
  };

  const save = async () => {
    Keyboard.dismiss();
    if (ageError) {
      Alert.alert('Invalid Age Range', ageError);
      return;
    }
    setBusy(true);
    try {
      const min = Number(ageMin);
      const max = Number(ageMax);
      const updated: PetMatchPreference = {
        ...prefs,
        breed: prefs.species === 'Any' ? '' : prefs.breed,
        minAgeYears: min,
        maxAgeYears: max,
      };
      await saveMatchPreferences(updated);
      setPrefs(updated);
      setSavedSnapshot({
        prefs: updated,
        ageMin: String(min),
        ageMax: String(max),
      });
      hasLoadedRef.current = true;
      setHasLoadedOnce(true);
      Alert.alert(
        'Saved successfully',
        'New matching adoption listings will alert you via the Notification Center and Push Notifications.'
      );
      onClose();
    } catch (e: any) {
      Alert.alert('Unable to save', e?.message || 'Check your input and retry.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={handleAttemptClose}
      presentationStyle="pageSheet"
    >
      <View
        style={[
          styles.container,
          { paddingTop: Math.max(insets.top, 16) },
        ]}
      >
        {/* Header */}
        <View style={styles.headerRow}>
          <View style={{ flex: 1, paddingRight: 10 }}>
            <Text style={styles.headerTitle}>🎯 Adoption matching</Text>
            <Text style={styles.headerSubtitle}>
              Get alerts whenever a companion matches your criteria
            </Text>
          </View>
          <View style={styles.headerActions}>
            {!isAtDefault && !initialLoading && (
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Reset filters to any"
                onPress={handleResetFilters}
                style={styles.resetHeaderBtn}
                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
              >
                <Text style={styles.resetHeaderText}>Reset</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Close adoption matching"
              onPress={handleAttemptClose}
              style={styles.closeButton}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={styles.closeButtonText}>✕</Text>
            </TouchableOpacity>
          </View>
        </View>

        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          {initialLoading ? (
            <View style={styles.loadingCenter}>
              <ActivityIndicator size="large" color="#00AEEF" />
              <Text style={styles.loadingText}>
                Loading your match preferences...
              </Text>
            </View>
          ) : (
            <ScrollView
              contentContainerStyle={styles.scrollContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              refreshControl={
                <RefreshControl
                  refreshing={loading}
                  onRefresh={() => load(false)}
                  colors={['#00AEEF']}
                />
              }
            >
              {!!error && (
                <View
                  style={[
                    styles.errorBanner,
                    {
                      backgroundColor: colors.surface,
                      borderColor: colors.danger,
                    },
                  ]}
                >
                  <Text style={[styles.errorBannerText, { color: colors.danger }]}>
                    {error}
                  </Text>
                  <TouchableOpacity
                    accessibilityRole="button"
                    onPress={() => load(!hasLoadedOnce)}
                    style={[styles.retryBtn, { borderColor: colors.danger }]}
                  >
                    <Text style={[styles.retryBtnText, { color: colors.danger }]}>
                      Retry
                    </Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* Live Criteria Summary Strip */}
              <View style={styles.summaryCard}>
                <View style={styles.summaryTopRow}>
                  <Text style={styles.summaryHeading}>Active Match Profile</Text>
                  <View
                    style={[
                      styles.statusBadge,
                      prefs.isEnabled
                        ? styles.statusBadgeActive
                        : styles.statusBadgePaused,
                    ]}
                  >
                    <Text
                      style={[
                        styles.statusBadgeText,
                        prefs.isEnabled
                          ? styles.statusBadgeTextActive
                          : styles.statusBadgeTextPaused,
                      ]}
                    >
                      {prefs.isEnabled ? '● Active' : '⏸ Paused'}
                    </Text>
                  </View>
                </View>
                <Text style={styles.summaryValue} numberOfLines={2}>
                  {summaryItems.join(' • ')}
                </Text>
              </View>

              {/* Form Fields Card */}
              <View style={styles.cardSection}>
                <Text style={styles.sectionHeader}>🔍 Companion Criteria</Text>

                {/* Pet Species Segmented Pills */}
                <Text style={styles.fieldLabel}>Pet Species</Text>
                <View style={styles.segmentedRow}>
                  {SPECIES_OPTIONS.map((opt) => {
                    const active = prefs.species === opt.value;
                    return (
                      <TouchableOpacity
                        key={opt.value}
                        accessibilityRole="button"
                        accessibilityState={{ selected: active }}
                        onPress={() => handleSelectSpecies(opt.value)}
                        activeOpacity={0.8}
                        style={[
                          styles.segmentBtn,
                          active && styles.segmentBtnActive,
                        ]}
                      >
                        <Text
                          style={[
                            styles.segmentText,
                            active && styles.segmentTextActive,
                          ]}
                        >
                          {opt.icon} {opt.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* Breed Action Sheet Picker */}
                <View style={styles.labelWithStatus}>
                  <Text style={styles.fieldLabel}>Breed</Text>
                  {breedsLoading && prefs.species !== 'Any' && (
                    <View style={styles.inlineLoaderRow}>
                      <ActivityIndicator size="small" color="#00AEEF" />
                      <Text style={styles.inlineLoaderText}>
                        Updating catalog...
                      </Text>
                    </View>
                  )}
                </View>
                {prefs.species === 'Any' ? (
                  <View style={[styles.pickerBox, styles.disabledBox]}>
                    <Text style={styles.disabledText}>
                      Choose Dog or Cat above to filter by breed
                    </Text>
                  </View>
                ) : (
                  <View style={styles.pickerBox}>
                    <Picker
                      title={`Select ${prefs.species} Breed`}
                      selectedValue={prefs.breed}
                      onValueChange={(v) => {
                        const breedVal = String(v);
                        if (prefs.species === 'Dog' || prefs.species === 'Cat') {
                          breedMemoryRef.current[prefs.species] = breedVal;
                        }
                        setPreference('breed', breedVal);
                      }}
                      style={{ color: colors.text, width: '100%' }}
                      dropdownIconColor={colors.text}
                    >
                      <Picker.Item label="Any Breed" value="" />
                      {[
                        ...new Set([...breeds, prefs.breed].filter(Boolean)),
                      ].map((b) => (
                        <Picker.Item key={b} label={b} value={b} />
                      ))}
                    </Picker>
                  </View>
                )}

                {/* Coat Color Action Sheet Picker */}
                <Text style={styles.fieldLabel}>Coat Color</Text>
                <View style={styles.pickerBox}>
                  <Picker
                    title="Select Coat Color"
                    selectedValue={prefs.color}
                    onValueChange={(v) => setPreference('color', String(v))}
                    style={{ color: colors.text, width: '100%' }}
                    dropdownIconColor={colors.text}
                  >
                    <Picker.Item label="Any Coat Color" value="" />
                    {[
                      ...new Set(
                        [...COLORS, prefs.color].filter((x) => Boolean(x))
                      ),
                    ].map((c) => (
                      <Picker.Item key={c} label={c} value={c} />
                    ))}
                  </Picker>
                </View>

                {/* Sex Segmented Pills */}
                <Text style={styles.fieldLabel}>Sex</Text>
                <View style={styles.segmentedRow}>
                  {SEX_OPTIONS.map((opt) => {
                    const active = prefs.sex === opt.value;
                    return (
                      <TouchableOpacity
                        key={opt.value}
                        accessibilityRole="button"
                        accessibilityState={{ selected: active }}
                        onPress={() => setPreference('sex', opt.value)}
                        activeOpacity={0.8}
                        style={[
                          styles.segmentBtn,
                          active && styles.segmentBtnActive,
                        ]}
                      >
                        <Text
                          style={[
                            styles.segmentText,
                            active && styles.segmentTextActive,
                          ]}
                        >
                          {opt.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* Age Range Fields + Presets + Inline Validation */}
                <Text style={styles.fieldLabel}>Preferred Age Range (0–40 yrs)</Text>
                <View style={styles.ageRow}>
                  <View style={styles.ageCol}>
                    <Text style={styles.ageSubLabel}>Minimum</Text>
                    <View
                      style={[
                        styles.ageInputWrap,
                        !!ageError && { borderColor: colors.danger },
                      ]}
                    >
                      <TextInput
                        keyboardType="number-pad"
                        maxLength={2}
                        value={ageMin}
                        onChangeText={(t) => setAgeMin(t.replace(/[^0-9]/g, ''))}
                        placeholder="0"
                        placeholderTextColor={colors.secondary}
                        style={styles.ageInput}
                        returnKeyType="done"
                      />
                      <Text style={styles.ageUnit}>yr(s)</Text>
                    </View>
                  </View>

                  <View style={styles.ageCol}>
                    <Text style={styles.ageSubLabel}>Maximum</Text>
                    <View
                      style={[
                        styles.ageInputWrap,
                        !!ageError && { borderColor: colors.danger },
                      ]}
                    >
                      <TextInput
                        keyboardType="number-pad"
                        maxLength={2}
                        value={ageMax}
                        onChangeText={(t) => setAgeMax(t.replace(/[^0-9]/g, ''))}
                        placeholder="40"
                        placeholderTextColor={colors.secondary}
                        style={styles.ageInput}
                        returnKeyType="done"
                      />
                      <Text style={styles.ageUnit}>yr(s)</Text>
                    </View>
                  </View>
                </View>

                {!!ageError && (
                  <Text style={[styles.inlineErrorText, { color: colors.danger }]}>
                    {ageError}
                  </Text>
                )}

                <View style={styles.presetChipsRow}>
                  {AGE_PRESETS.map((preset) => {
                    const selected =
                      ageMin === preset.min && ageMax === preset.max;
                    return (
                      <TouchableOpacity
                        key={preset.label}
                        accessibilityRole="button"
                        onPress={() => {
                          Keyboard.dismiss();
                          setAgeMin(preset.min);
                          setAgeMax(preset.max);
                        }}
                        style={[
                          styles.presetChip,
                          selected && styles.presetChipActive,
                        ]}
                      >
                        <Text
                          style={[
                            styles.presetChipText,
                            selected && styles.presetChipTextActive,
                          ]}
                        >
                          {preset.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              {/* Notification Alert Toggles */}
              <View style={styles.togglesCard}>
                <Text style={styles.sectionHeader}>🔔 Alert Delivery</Text>

                <View style={styles.switchRow}>
                  <View style={{ flex: 1, paddingRight: 12 }}>
                    <Text style={styles.switchTitle}>
                      Enable Adoption Matching
                    </Text>
                    <Text style={styles.switchDesc}>
                      Receive alerts in the notification bell when pets match
                      your criteria
                    </Text>
                  </View>
                  <Switch
                    value={prefs.isEnabled}
                    onValueChange={(v) => setPreference('isEnabled', v)}
                    trackColor={{ false: colors.border, true: '#00AEEF' }}
                    thumbColor="#FFFFFF"
                  />
                </View>

                <View style={styles.switchDivider} />

                <View
                  style={[
                    styles.switchRow,
                    !prefs.isEnabled && styles.switchRowDisabled,
                  ]}
                >
                  <View style={{ flex: 1, paddingRight: 12 }}>
                    <Text style={styles.switchTitle}>
                      Device Push Notifications
                    </Text>
                    <Text style={styles.switchDesc}>
                      {prefs.isEnabled
                        ? 'Receive native lock-screen push alerts when new matching pets are listed'
                        : 'Enable Adoption Matching above to receive lock-screen push notifications'}
                    </Text>
                  </View>
                  <Switch
                    value={prefs.pushEnabled}
                    disabled={!prefs.isEnabled}
                    onValueChange={(v) => setPreference('pushEnabled', v)}
                    trackColor={{ false: colors.border, true: '#00AEEF' }}
                    thumbColor="#FFFFFF"
                  />
                </View>
              </View>
            </ScrollView>
          )}

          {/* Sticky Footer CTA Bar */}
          <View
            style={[
              styles.footerBar,
              { paddingBottom: Math.max(insets.bottom, 14) },
            ]}
          >
            <TouchableOpacity
              accessibilityRole="button"
              disabled={busy || initialLoading || Boolean(ageError) || (hasLoadedOnce && !isDirty)}
              onPress={save}
              activeOpacity={0.85}
              style={[
                styles.saveButton,
                (busy ||
                  initialLoading ||
                  Boolean(ageError) ||
                  (hasLoadedOnce && !isDirty)) &&
                  styles.saveButtonDisabled,
              ]}
            >
              {busy ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.saveButtonText}>
                  {hasLoadedOnce && !isDirty && !ageError
                    ? '✓ Preferences Saved'
                    : 'Save my preferences'}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const baseStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  headerRow: {
    paddingHorizontal: 20,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
  },
  headerTitle: {
    fontSize: 18,
    color: '#0F172A',
    fontWeight: '800',
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  resetHeaderBtn: {
    paddingVertical: 7,
    paddingHorizontal: 11,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  resetHeaderText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F1F5F9',
  },
  closeButtonText: {
    color: '#334155',
    fontWeight: '800',
    fontSize: 15,
  },
  loadingCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 12,
  },
  loadingText: {
    fontSize: 13,
    color: '#64748B',
    fontWeight: '600',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 24,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 14,
  },
  errorBannerText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
  },
  retryBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  retryBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
  summaryCard: {
    backgroundColor: '#EFF6FF',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#BAE6FD',
    marginBottom: 14,
  },
  summaryTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  summaryHeading: {
    fontSize: 11,
    fontWeight: '800',
    color: '#0284C7',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  statusBadgeActive: {
    backgroundColor: '#DCFCE7',
  },
  statusBadgePaused: {
    backgroundColor: '#E2E8F0',
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  statusBadgeTextActive: {
    color: '#166534',
  },
  statusBadgeTextPaused: {
    color: '#475569',
  },
  summaryValue: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
    lineHeight: 18,
  },
  cardSection: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 14,
  },
  sectionHeader: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 6,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 6,
    marginTop: 10,
  },
  labelWithStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  inlineLoaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  inlineLoaderText: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '600',
  },
  segmentedRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 4,
  },
  segmentBtn: {
    flex: 1,
    minHeight: 40,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  segmentBtnActive: {
    backgroundColor: '#00AEEF',
    borderColor: '#00AEEF',
  },
  segmentText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#475569',
  },
  segmentTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  pickerBox: {
    backgroundColor: '#F8FAFC',
    borderColor: '#E2E8F0',
    borderWidth: 1,
    borderRadius: 10,
    minHeight: 48,
    justifyContent: 'center',
    marginBottom: 4,
  },
  disabledBox: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 14,
  },
  disabledText: {
    color: '#94A3B8',
    fontSize: 13,
  },
  ageRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 2,
  },
  ageCol: {
    flex: 1,
  },
  ageSubLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
    marginBottom: 4,
  },
  ageInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderColor: '#E2E8F0',
    borderWidth: 1,
    borderRadius: 10,
    height: 46,
    paddingHorizontal: 12,
  },
  ageInput: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: '#0F172A',
    padding: 0,
  },
  ageUnit: {
    fontSize: 12,
    fontWeight: '600',
    color: '#94A3B8',
    marginLeft: 4,
  },
  inlineErrorText: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 6,
  },
  presetChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 10,
  },
  presetChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  presetChipActive: {
    backgroundColor: '#00AEEF',
    borderColor: '#00AEEF',
  },
  presetChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
  },
  presetChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  togglesCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 8,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  switchRowDisabled: {
    opacity: 0.48,
  },
  switchTitle: {
    color: '#0F172A',
    fontWeight: '700',
    fontSize: 14,
  },
  switchDesc: {
    color: '#64748B',
    fontSize: 11,
    lineHeight: 16,
    marginTop: 2,
  },
  switchDivider: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginVertical: 10,
  },
  footerBar: {
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  saveButton: {
    backgroundColor: '#00AEEF',
    borderRadius: 12,
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#00AEEF',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 2,
  },
  saveButtonDisabled: {
    opacity: 0.55,
    elevation: 0,
    shadowOpacity: 0,
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 15,
  },
});
