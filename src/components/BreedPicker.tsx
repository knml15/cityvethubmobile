import React, { useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { fallbackBreedCatalog, fetchBreedCatalog } from '../api/phase422';
import { useAppPalette } from '../theme';

export interface PickerItemProps {
  label: string;
  value: any;
  color?: string;
  enabled?: boolean;
}

function PickerItem(_props: PickerItemProps): React.ReactElement | null {
  return null;
}

export interface ActionSheetPickerProps<T = any> {
  selectedValue?: T;
  onValueChange?: (itemValue: T, itemIndex: number) => void;
  style?: any;
  dropdownIconColor?: string;
  enabled?: boolean;
  title?: string;
  searchable?: boolean;
  children?: React.ReactNode;
}

function extractPickerItems(
  children: React.ReactNode
): Array<{ label: string; value: any }> {
  const list: Array<{ label: string; value: any }> = [];
  React.Children.forEach(children, (child) => {
    if (!React.isValidElement(child)) return;
    const props: any = child.props;
    if (
      child.type === PickerItem ||
      (props && ('label' in props || 'value' in props) && !props.children)
    ) {
      list.push({
        label: String(props.label ?? props.value ?? ''),
        value: props.value,
      });
    } else if (props && props.children) {
      list.push(...extractPickerItems(props.children));
    }
  });
  return list;
}

function inferSheetTitle(
  explicitTitle: string | undefined,
  items: Array<{ label: string; value: any }>
): string {
  if (explicitTitle && explicitTitle.trim()) return explicitTitle.trim();
  const values = items.map((i) => String(i.value ?? ''));
  const labels = items.map((i) => String(i.label ?? ''));

  if (values.includes('Hinaplanon') || values.includes('Poblacion')) {
    return 'Select Barangay';
  }
  if (labels.some((l) => l.includes('Incident Categories'))) {
    return 'Filter Incident Category';
  }
  if (
    values.includes('Dog') &&
    values.includes('Cat') &&
    items.length <= 4
  ) {
    return 'Select Species';
  }
  if (
    values.includes('Male') &&
    values.includes('Female') &&
    items.length <= 4
  ) {
    return 'Select Sex';
  }
  if (values.includes('Alive') && values.includes('Deceased')) {
    return 'Select Vital Status';
  }
  if (values.includes('apartment') && values.includes('yard')) {
    return 'Select Housing Requirement';
  }
  if (values.includes('Calico') || values.includes('Brindle')) {
    return 'Select Coat Color';
  }
  if (labels.some((l) => l.toLowerCase().includes('unknown / not'))) {
    return 'Select Parent Pet';
  }
  if (
    items[0] &&
    String(items[0].value ?? '') === '' &&
    /^(select|any)\s+/i.test(items[0].label)
  ) {
    return items[0].label;
  }
  return 'Select an Option';
}

/**
 * Modern Action Sheet / Modal Sheet selector that replaces native Android `<Picker>` spinners.
 * Eliminates vertical text clipping, supports dark/light themes, and provides instant search on long lists.
 */
function ActionSheetPickerComponent<T = any>({
  selectedValue,
  onValueChange,
  enabled = true,
  title,
  searchable,
  children,
}: ActionSheetPickerProps<T>) {
  const colors = useAppPalette();
  const [visible, setVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const items = useMemo(() => extractPickerItems(children), [children]);

  const selectedOption = useMemo(() => {
    const match = items.find(
      (it) => String(it.value ?? '') === String(selectedValue ?? '')
    );
    return match || items[0] || null;
  }, [items, selectedValue]);

  const sheetTitle = useMemo(
    () => inferSheetTitle(title, items),
    [title, items]
  );

  const showSearch = searchable ?? items.length > 5;

  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return items;
    return items.filter((it) => it.label.toLowerCase().includes(q));
  }, [items, searchQuery]);

  const isPlaceholder =
    selectedOption &&
    String(selectedOption.value ?? '') === '' &&
    /^(select|choose|no active)\b/i.test(selectedOption.label);

  const closeSheet = () => {
    setVisible(false);
    setSearchQuery('');
  };

  return (
    <>
      <TouchableOpacity
        style={[
          sheetStyles.triggerBtn,
          enabled === false && { opacity: 0.55 },
        ]}
        onPress={() => {
          if (enabled === false) return;
          Keyboard.dismiss();
          setSearchQuery('');
          setVisible(true);
        }}
        activeOpacity={0.75}
        accessibilityRole="button"
        accessibilityLabel={sheetTitle}
      >
        <Text
          style={[
            sheetStyles.triggerText,
            { color: isPlaceholder ? colors.secondary : colors.text },
          ]}
          numberOfLines={1}
        >
          {selectedOption ? selectedOption.label : 'Select an option'}
        </Text>
        <View
          style={[
            sheetStyles.chevronBadge,
            {
              backgroundColor: colors.background,
              borderColor: colors.border,
            },
          ]}
        >
          <Text style={[sheetStyles.chevronIcon, { color: colors.secondary }]}>
            ▾
          </Text>
        </View>
      </TouchableOpacity>

      <Modal
        visible={visible}
        animationType="slide"
        transparent
        onRequestClose={closeSheet}
      >
        <TouchableWithoutFeedback onPress={closeSheet}>
          <View style={sheetStyles.overlay}>
            <KeyboardAvoidingView
              behavior={Platform.OS === 'ios' ? 'padding' : undefined}
              style={sheetStyles.keyboardWrap}
            >
              <TouchableWithoutFeedback onPress={(e) => e.stopPropagation()}>
                <View
                  style={[
                    sheetStyles.sheetCard,
                    {
                      backgroundColor: colors.surface,
                      borderColor: colors.border,
                    },
                  ]}
                >
                  <View
                    style={[
                      sheetStyles.dragHandle,
                      { backgroundColor: colors.border },
                    ]}
                  />

                  <View style={sheetStyles.headerRow}>
                    <View style={{ flex: 1 }}>
                      <Text
                        style={[sheetStyles.sheetTitle, { color: colors.text }]}
                      >
                        {sheetTitle}
                      </Text>
                      <Text
                        style={[
                          sheetStyles.sheetSubtitle,
                          { color: colors.secondary },
                        ]}
                      >
                        {items.length}{' '}
                        {items.length === 1 ? 'option' : 'options'} available
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={[
                        sheetStyles.closeBtn,
                        { backgroundColor: colors.surfaceMuted },
                      ]}
                      onPress={closeSheet}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      accessibilityRole="button"
                      accessibilityLabel="Close selection sheet"
                    >
                      <Text
                        style={[
                          sheetStyles.closeBtnText,
                          { color: colors.text },
                        ]}
                      >
                        ✕
                      </Text>
                    </TouchableOpacity>
                  </View>

                  {showSearch && (
                    <View style={sheetStyles.searchWrap}>
                      <TextInput
                        style={[
                          sheetStyles.searchInput,
                          {
                            backgroundColor: colors.background,
                            borderColor: colors.border,
                            color: colors.text,
                          },
                        ]}
                        placeholder="Type to filter options..."
                        placeholderTextColor={colors.secondary}
                        value={searchQuery}
                        onChangeText={setSearchQuery}
                        autoCapitalize="none"
                      />
                      {searchQuery.length > 0 && (
                        <TouchableOpacity
                          style={[
                            sheetStyles.searchClearBtn,
                            { backgroundColor: colors.surfaceMuted },
                          ]}
                          onPress={() => setSearchQuery('')}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                          <Text
                            style={[
                              sheetStyles.searchClearText,
                              { color: colors.text },
                            ]}
                          >
                            ✕
                          </Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  )}

                  <FlatList
                    data={filteredItems}
                    keyExtractor={(item, idx) =>
                      `${String(item.value ?? '')}-${idx}`
                    }
                    showsVerticalScrollIndicator={true}
                    keyboardShouldPersistTaps="handled"
                    style={sheetStyles.list}
                    renderItem={({ item }) => {
                      const isSelected =
                        String(item.value ?? '') ===
                        String(selectedValue ?? '');
                      return (
                        <TouchableOpacity
                          style={[
                            sheetStyles.optionRow,
                            { borderBottomColor: colors.border },
                            isSelected && {
                              backgroundColor: colors.primaryMuted,
                              borderColor: '#00AEEF',
                            },
                          ]}
                          onPress={() => {
                            const origIndex = items.findIndex(
                              (it) =>
                                String(it.value ?? '') ===
                                String(item.value ?? '')
                            );
                            closeSheet();
                            onValueChange?.(
                              item.value as T,
                              origIndex >= 0 ? origIndex : 0
                            );
                          }}
                          activeOpacity={0.75}
                        >
                          <Text
                            style={[
                              sheetStyles.optionText,
                              { color: colors.text },
                              isSelected && sheetStyles.optionTextSelected,
                            ]}
                          >
                            {item.label}
                          </Text>
                          {isSelected && (
                            <View style={sheetStyles.checkBadge}>
                              <Text style={sheetStyles.checkText}>✓</Text>
                            </View>
                          )}
                        </TouchableOpacity>
                      );
                    }}
                    ListEmptyComponent={
                      <View style={sheetStyles.emptyWrap}>
                        <Text
                          style={[
                            sheetStyles.emptyText,
                            { color: colors.secondary },
                          ]}
                        >
                          No matching options found for "{searchQuery}"
                        </Text>
                      </View>
                    }
                  />
                </View>
              </TouchableWithoutFeedback>
            </KeyboardAvoidingView>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </>
  );
}

export const Picker = Object.assign(ActionSheetPickerComponent, {
  Item: PickerItem,
});

/** Always retain old pet breed value, including names absent from the current API list. */
export default function BreedPicker({
  species,
  value,
  onChange,
}: {
  species: 'Dog' | 'Cat';
  value: string;
  onChange: (breed: string) => void;
}) {
  const colors = useAppPalette();
  const [available, setAvailable] = useState<string[]>(
    fallbackBreedCatalog[species]
  );

  useEffect(() => {
    let alive = true;
    setAvailable(fallbackBreedCatalog[species]);
    fetchBreedCatalog(species)
      .then((result) => {
        if (alive && result.length) setAvailable(result);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [species]);

  const choices = ['', ...new Set([...available, value].filter(Boolean))];

  return (
    <View>
      <View
        style={{
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: 10,
          backgroundColor: colors.surfaceMuted,
          marginBottom: 8,
          minHeight: 48,
          justifyContent: 'center',
        }}
      >
        <Picker
          title={`Select ${species} Breed`}
          selectedValue={value}
          onValueChange={(v) => onChange(String(v))}
        >
          {choices.map((v) => (
            <Picker.Item key={v} label={v || 'Select a breed'} value={v} />
          ))}
        </Picker>
      </View>
      <Text style={{ color: colors.secondary, fontSize: 11, marginBottom: 4 }}>
        Not listed? Enter your pet's breed below.
      </Text>
      <TextInput
        style={{
          borderWidth: 1,
          borderRadius: 10,
          borderColor: colors.border,
          backgroundColor: colors.surfaceMuted,
          padding: 10,
          color: colors.text,
          marginBottom: 12,
        }}
        placeholder="Other / mixed breed"
        placeholderTextColor={colors.secondary}
        maxLength={100}
        value={value}
        onChangeText={onChange}
      />
    </View>
  );
}

const sheetStyles = StyleSheet.create({
  triggerBtn: {
    width: '100%',
    minHeight: 44,
    paddingHorizontal: 14,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  triggerText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
  },
  chevronBadge: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chevronIcon: {
    fontSize: 12,
    fontWeight: '800',
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    justifyContent: 'flex-end',
  },
  keyboardWrap: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheetCard: {
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderTopWidth: 1,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 24,
    maxHeight: '80%',
    width: '100%',
  },
  dragHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 12,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 14,
  },
  sheetTitle: {
    fontSize: 17,
    fontWeight: '700',
  },
  sheetSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnText: {
    fontSize: 14,
    fontWeight: '700',
  },
  searchWrap: {
    position: 'relative',
    marginBottom: 12,
    justifyContent: 'center',
  },
  searchInput: {
    height: 42,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingRight: 38,
    fontSize: 14,
  },
  searchClearBtn: {
    position: 'absolute',
    right: 10,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchClearText: {
    fontSize: 11,
    fontWeight: '700',
  },
  list: {
    maxHeight: 380,
  },
  optionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 13,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    marginBottom: 2,
  },
  optionText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
    paddingRight: 8,
  },
  optionTextSelected: {
    color: '#00AEEF',
    fontWeight: '700',
  },
  checkBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#00AEEF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  emptyWrap: {
    paddingVertical: 28,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 13,
    textAlign: 'center',
  },
});