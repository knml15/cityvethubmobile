import React, { useState } from 'react';
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuthStore } from '../../store';
import { authApi } from '../../api/auth';
import {
  normalizeBarangay,
  ILIGAN_BARANGAYS,
} from '../../store/types/constants';
import { Picker } from '@react-native-picker/picker';
import { useAppPalette } from '../../theme';
import CallButton from '../../components/CallButton';

const Panel = ({ title, hint, children, colors }: any) => (
  <View
    style={{
      borderRadius: 20,
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderWidth: 1,
      padding: 17,
      marginBottom: 16,
    }}
  >
    <Text style={{ color: colors.text, fontSize: 17, fontWeight: '800' }}>
      {title}
    </Text>
    {!!hint && (
      <Text
        style={{
          color: colors.secondary,
          marginTop: 5,
          marginBottom: 15,
          fontSize: 12,
          lineHeight: 18,
        }}
      >
        {hint}
      </Text>
    )}
    {children}
  </View>
);

const Action = ({
  label,
  onPress,
  colors,
  secondary = false,
  danger = false,
  disabled = false,
}: any) => (
  <TouchableOpacity
    accessibilityRole="button"
    disabled={disabled}
    onPress={onPress}
    style={{
      backgroundColor: danger
        ? '#FFF0F1'
        : secondary
        ? colors.surfaceMuted
        : '#3478F6',
      padding: 14,
      borderRadius: 12,
      alignItems: 'center',
      marginTop: 10,
      opacity: disabled ? 0.5 : 1,
    }}
  >
    <Text
      style={{
        fontWeight: '800',
        color: danger ? '#B63343' : secondary ? colors.text : '#FFFFFF',
      }}
    >
      {label}
    </Text>
  </TouchableOpacity>
);

/** Shared Settings for Pet Owner and Field Officer. Admin features deliberately absent. */
export default function SettingsScreen() {
  const colors = useAppPalette();
  const insets = useSafeAreaInsets();
  const { user, refreshSession, logout, setTheme } = useAuthStore();

  const [name, setName] = useState(user?.fullName || '');
  const [phone, setPhone] = useState(user?.contactNumber || '');
  const [address, setAddress] = useState(user?.address || '');
  const [barangay, setBarangay] = useState(normalizeBarangay(user?.barangay));
  const [position, setPosition] = useState(user?.position || 'Field Officer');
  const [employeeId, setEmployeeId] = useState(user?.employeeId || '');
  const [assignedArea, setAssignedArea] = useState(
    normalizeBarangay(user?.assignedArea || user?.barangay)
  );
  const [shareAvatarOnListings, setShareAvatarOnListings] = useState<boolean>(
    Boolean(user?.shareAvatarOnListings)
  );

  const [busy, setBusy] = useState(false);
  const [securityAction, setSecurityAction] = useState<
    'password' | 'email' | null
  >(null);
  const [existingPassword, setExistingPassword] = useState('');
  const [securityValue, setSecurityValue] = useState('');
  const [securityConfirm, setSecurityConfirm] = useState('');
  const [localAvatar, setLocalAvatar] = useState<string | null>(null);

  const isOfficer = user?.contractRole === 'officer';

  const inputStyle = {
    color: colors.text,
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 11,
    paddingHorizontal: 12,
    paddingVertical: 11,
    marginTop: 5,
    marginBottom: 12,
    fontSize: 14,
  } as const;

  const label = (caption: string) => (
    <Text style={{ color: colors.secondary, fontSize: 12, fontWeight: '700' }}>
      {caption}
    </Text>
  );

  const saveProfile = async () => {
    if (!name.trim()) return Alert.alert('Required', 'Enter your full name.');
    setBusy(true);
    try {
      await authApi.saveProfile({
        fullName: name.trim(),
        phone: phone.trim(),
        address: address.trim(),
        barangay,
        ...(isOfficer ? { position, employeeId, assignedArea } : {}),
      });
      if (!isOfficer) {
        await authApi.setProfilePhotoSharing(shareAvatarOnListings);
      }
      await refreshSession();
      Alert.alert('Saved', 'Your account information was updated.');
    } catch (e: any) {
      Alert.alert('Profile update failed', e?.message || 'Try again.');
    } finally {
      setBusy(false);
    }
  };

  const changePhoto = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.75,
      });
      if (result.canceled || !result.assets?.[0]) return;
      setBusy(true);
      const asset = result.assets[0];
      await authApi.uploadAndSaveAvatar(asset);
      setLocalAvatar(asset.uri);
      await refreshSession();
      Alert.alert(
        'Profile photo updated',
        'Your uploaded photo has been saved to Appwrite.'
      );
    } catch (e: any) {
      Alert.alert(
        'Photo upload failed',
        e?.message || 'Please retry with a JPG or PNG under 5 MB.'
      );
    } finally {
      setBusy(false);
    }
  };

  const chooseTheme = async (choice: 'light' | 'dark') => {
    try {
      await setTheme(choice);
    } catch (e: any) {
      Alert.alert(
        'Theme preference',
        e?.message || 'Unable to save preference.'
      );
    }
  };

  const saveSecurity = async () => {
    if (!existingPassword)
      return Alert.alert('Required', 'Enter your current password.');
    if (
      securityAction === 'password' &&
      (securityValue.length < 12 || securityValue !== securityConfirm)
    ) {
      return Alert.alert(
        'Password rules',
        'Use at least 12 characters and make sure the confirmation matches.'
      );
    }
    if (
      securityAction === 'email' &&
      !/^\S+@\S+\.\S+$/.test(securityValue.trim())
    ) {
      return Alert.alert('Invalid email', 'Enter a valid new email address.');
    }
    setBusy(true);
    try {
      if (securityAction === 'password')
        await authApi.changePassword(existingPassword, securityValue);
      else await authApi.changeEmail(securityValue.trim(), existingPassword);
      await refreshSession();
      setSecurityAction(null);
      setExistingPassword('');
      setSecurityValue('');
      setSecurityConfirm('');
      Alert.alert(
        'Account updated',
        'Your security information has been changed.'
      );
    } catch (e: any) {
      Alert.alert(
        'Could not update account',
        e?.message || 'Please check your current password.'
      );
    } finally {
      setBusy(false);
    }
  };

  const confirmLogout = () =>
    Alert.alert(
      'Sign out of CityVetHub?',
      'You can log back in with the same account.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Sign Out', style: 'destructive', onPress: () => logout() },
      ]
    );

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 20}
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          padding: 16,
          paddingBottom: Math.max(140, insets.bottom + 120),
        }}
      >
        <Text
          style={{
            fontSize: 26,
            color: colors.text,
            fontWeight: '900',
            marginBottom: 6,
          }}
        >
          Settings
        </Text>
        <Text style={{ color: colors.secondary, marginBottom: 20 }}>
          Your account, appearance, and security.
        </Text>

        <Panel
          title="My account"
          hint="Changes are shared with the CityVetHub website."
          colors={colors}
        >
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 14,
              marginBottom: 16,
            }}
          >
            {localAvatar || user?.profileImageUrl ? (
              <Image
                source={{ uri: localAvatar || user?.profileImageUrl }}
                style={{
                  width: 68,
                  height: 68,
                  borderRadius: 34,
                  backgroundColor: colors.surfaceMuted,
                }}
              />
            ) : (
              <View
                style={{
                  width: 68,
                  height: 68,
                  borderRadius: 34,
                  justifyContent: 'center',
                  alignItems: 'center',
                  backgroundColor: colors.primaryMuted,
                }}
              >
                <Text
                  style={{
                    color: colors.primary,
                    fontSize: 23,
                    fontWeight: '900',
                  }}
                >
                  {(user?.fullName || 'U')[0]}
                </Text>
              </View>
            )}
            <View style={{ flex: 1 }}>
              <Text
                style={{ color: colors.text, fontWeight: '800', fontSize: 17 }}
              >
                {user?.fullName}
              </Text>
              <Text
                style={{
                  color: colors.secondary,
                  fontSize: 12,
                  marginTop: 5,
                }}
              >
                {isOfficer ? 'Field Officer' : 'Pet Owner'}
              </Text>
              <TouchableOpacity
                onPress={changePhoto}
                disabled={busy}
                style={{ marginTop: 9 }}
              >
                <Text style={{ color: colors.primary, fontWeight: '800' }}>
                  📷 Change profile picture
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {label('Full name')}
          <TextInput
            style={inputStyle}
            value={name}
            onChangeText={setName}
            placeholder="Full name"
            placeholderTextColor={colors.secondary}
          />

          {label('Contact number')}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <TextInput
              style={[inputStyle, { flex: 1 }]}
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
              placeholderTextColor={colors.secondary}
            />
            <CallButton phone={phone} />
          </View>

          {label('Barangay')}
          <View
            style={[inputStyle, { paddingHorizontal: 0, paddingVertical: 0 }]}
          >
            <Picker
              selectedValue={barangay}
              onValueChange={(value) => setBarangay(normalizeBarangay(value))}
              style={{ color: colors.text }}
            >
              {ILIGAN_BARANGAYS.map((b) => (
                <Picker.Item key={b} label={b} value={b} />
              ))}
            </Picker>
          </View>

          {label('Home address')}
          <TextInput
            style={inputStyle}
            value={address}
            onChangeText={setAddress}
            placeholderTextColor={colors.secondary}
          />

          {isOfficer ? (
            <>
              {label('Position')}
              <TextInput
                style={inputStyle}
                value={position}
                onChangeText={setPosition}
              />
              {label('Employee/PRC ID')}
              <TextInput
                style={inputStyle}
                value={employeeId}
                onChangeText={setEmployeeId}
              />
              {label('Assigned barangay')}
              <View style={[inputStyle, { padding: 0 }]}>
                <Picker
                  selectedValue={assignedArea}
                  onValueChange={(value) =>
                    setAssignedArea(normalizeBarangay(value))
                  }
                  style={{ color: colors.text }}
                >
                  {ILIGAN_BARANGAYS.map((b) => (
                    <Picker.Item key={b} label={b} value={b} />
                  ))}
                </Picker>
              </View>
            </>
          ) : (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingVertical: 8,
              }}
            >
              <Text
                style={{
                  color: colors.text,
                  fontSize: 13,
                  fontWeight: '600',
                  flex: 1,
                }}
              >
                Show my profile avatar on my adoption listings
              </Text>
              <Switch
                value={shareAvatarOnListings}
                onValueChange={setShareAvatarOnListings}
              />
            </View>
          )}

          <Action
            label={busy ? 'Saving…' : 'Save account details'}
            onPress={saveProfile}
            colors={colors}
            disabled={busy}
          />
        </Panel>

        <Panel
          title="Appearance"
          hint="Your selected theme is saved to your Appwrite account and follows you between sessions."
          colors={colors}
        >
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {(['light', 'dark'] as const).map((value) => (
              <TouchableOpacity
                key={value}
                onPress={() => chooseTheme(value)}
                style={{
                  flex: 1,
                  borderWidth: 2,
                  borderColor:
                    user?.theme === value ? colors.primary : colors.border,
                  backgroundColor:
                    user?.theme === value
                      ? colors.primaryMuted
                      : colors.surface,
                  alignItems: 'center',
                  padding: 16,
                  borderRadius: 14,
                }}
              >
                <Text style={{ fontSize: 19 }}>
                  {value === 'light' ? '☀️' : '🌙'}
                </Text>
                <Text style={{ color: colors.text, fontWeight: '800' }}>
                  {value === 'light' ? 'Light' : 'Dark'}{' '}
                  {user?.theme === value ? '✓' : ''}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </Panel>

        <Panel
          title="Security & session"
          hint="Change your password securely from the account service. Never share a session or server API key."
          colors={colors}
        >
          <Text style={{ color: colors.secondary, marginBottom: 6 }}>
            Signed in as {user?.email}
          </Text>
          <Action
            label="Change password"
            secondary
            colors={colors}
            onPress={() => setSecurityAction('password')}
          />
          <Action
            label="Change email"
            secondary
            colors={colors}
            onPress={() => setSecurityAction('email')}
          />
          <Action
            label="Sign out"
            danger
            colors={colors}
            onPress={confirmLogout}
          />
        </Panel>
      </ScrollView>

      <Modal
        visible={securityAction !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setSecurityAction(null)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{
            flex: 1,
            backgroundColor: 'rgba(0,0,0,.55)',
            justifyContent: 'center',
            padding: 18,
          }}
        >
          <View
            style={{
              borderRadius: 20,
              backgroundColor: colors.surface,
              padding: 18,
            }}
          >
            <Text
              style={{
                color: colors.text,
                fontSize: 19,
                fontWeight: '900',
                marginBottom: 16,
              }}
            >
              {securityAction === 'password'
                ? 'Change password'
                : 'Change email'}
            </Text>
            {label('Current password')}
            <TextInput
              style={inputStyle}
              value={existingPassword}
              onChangeText={setExistingPassword}
              secureTextEntry
              autoCapitalize="none"
              placeholder="Current password"
              placeholderTextColor={colors.secondary}
            />
            {label(
              securityAction === 'password' ? 'New password' : 'New email'
            )}
            <TextInput
              style={inputStyle}
              value={securityValue}
              onChangeText={setSecurityValue}
              secureTextEntry={securityAction === 'password'}
              autoCapitalize="none"
              placeholderTextColor={colors.secondary}
              keyboardType={
                securityAction === 'email' ? 'email-address' : 'default'
              }
            />
            {securityAction === 'password' && (
              <>
                {label('Confirm new password')}
                <TextInput
                  style={inputStyle}
                  value={securityConfirm}
                  onChangeText={setSecurityConfirm}
                  secureTextEntry
                  placeholderTextColor={colors.secondary}
                />
              </>
            )}
            <Action
              label={busy ? 'Saving…' : 'Save changes'}
              disabled={busy}
              onPress={saveSecurity}
              colors={colors}
            />
            <Action
              label="Cancel"
              secondary
              colors={colors}
              onPress={() => setSecurityAction(null)}
            />
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </KeyboardAvoidingView>
  );
}