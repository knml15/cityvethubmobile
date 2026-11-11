import React, { useEffect, useState } from 'react';
import { Picker } from '@react-native-picker/picker';
import { Text, TextInput, View } from 'react-native';
import { fallbackBreedCatalog, fetchBreedCatalog } from '../api/phase422';
import { useAppPalette } from '../theme';

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
          height: 52,
          justifyContent: 'center',
        }}
      >
        <Picker
          selectedValue={value}
          onValueChange={(v) => onChange(String(v))}
          style={{ color: colors.text, width: '100%' }}
          dropdownIconColor={colors.text}
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