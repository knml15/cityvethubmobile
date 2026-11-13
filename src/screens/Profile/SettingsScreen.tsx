import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
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
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuthStore } from '../../store';
import { authApi } from '../../api/auth';
import {
  ILIGAN_BARANGAYS,
  IliganBarangay,
  normalizeBarangay,
} from '../../store/types/constants';
import { Picker } from '../../components/BreedPicker';
import { useAppPalette } from '../../theme';
import CallButton from '../../components/CallButton';

type Palette = ReturnType<typeof useAppPalette>;

type SemanticTokens = {
  dangerBg: string;
  dangerBorder: string;
  dangerText: string;
  onPrimary: string;
};

type PanelProps = {
  title: string;
  hint?: string;
  badgeText?: string;
  colors: Palette;
  children: React.ReactNode;
};

const Panel = ({ title, hint, badgeText, colors, children }: PanelProps) => (
  <View
    style={[
      styles.panel,
      {
        backgroundColor: colors.surface,
        borderColor: colors.border,
      },
    ]}
  >
    <View style={styles.panelHeaderRow}>
      <Text style={[styles.panelTitle, { color: colors.text }]}>{title}</Text>
      {!!badgeText && (
        <View
          style={[
            styles.unsavedChip,
            {
              backgroundColor: colors.primaryMuted,
              borderColor: colors.border,
            },
          ]}
        >
          <Text style={[styles.unsavedChipText, { color: colors.primary }]}>
            {badgeText}
          </Text>
        </View>
      )}
    </View>
    {!!hint && (
      <Text style={[styles.panelHint, { color: colors.secondary }]}>{hint}</Text>
    )}
    {children}
  </View>
);

type ActionProps = {
  label: string;
  onPress: () => void;
  colors: Palette;
  semanticColors: SemanticTokens;
  secondary?: boolean;
  danger?: boolean;
  disabled?: boolean;
  loading?: boolean;
};

const Action = ({
  label,
  onPress,
  colors,
  semanticColors,
  secondary = false,
  danger = false,
  disabled = false,
  loading = false,
}: ActionProps) => {
  const bgColor = danger
    ? semanticColors.dangerBg
    : secondary
    ? colors.surfaceMuted
    : colors.primary;
  const borderColor = danger
    ? semanticColors.dangerBorder
    : secondary
    ? colors.border
    : 'transparent';
  const fgColor = danger
    ? semanticColors.dangerText
    : secondary
    ? colors.text
    : semanticColors.onPrimary;

  return (
    <TouchableOpacity
      accessibilityRole="button"
      disabled={disabled || loading}
      onPress={onPress}
      activeOpacity={0.8}
      style={[
        styles.actionBtn,
        {
          backgroundColor: bgColor,
          borderColor,
          opacity: disabled || loading ? 0.5 : 1,
        },
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fgColor} size="small" />
      ) : (
        <Text style={[styles.actionBtnText, { color: fgColor }]}>{label}</Text>
      )}
    </TouchableOpacity>
  );
};

type PasswordFieldProps = {
  inputRef?: React.RefObject<React.ComponentRef<typeof TextInput> | null>;
  value: string;
  onChangeText: (val: string) => void;
  visible: boolean;
  onToggleVisible: () => void;
  placeholder: string;
  colors: Palette;
  returnKeyType?: 'next' | 'done';
  blurOnSubmit?: boolean;
  onSubmitEditing?: () => void;
};

const PasswordField = ({
  inputRef,
  value,
  onChangeText,
  visible,
  onToggleVisible,
  placeholder,
  colors,
  returnKeyType = 'done',
  blurOnSubmit = true,
  onSubmitEditing,
}: PasswordFieldProps) => (
  <View
    style={[
      styles.passwordRow,
      {
        backgroundColor: colors.surfaceMuted,
        borderColor: colors.border,
      },
    ]}
  >
    <TextInput
      ref={inputRef}
      style={[styles.passwordInput, { color: colors.text }]}
      value={value}
      onChangeText={onChangeText}
      secureTextEntry={!visible}
      autoCapitalize="none"
      autoCorrect={false}
      maxLength={128}
      placeholder={placeholder}
      placeholderTextColor={colors.secondary}
      returnKeyType={returnKeyType}
      blurOnSubmit={blurOnSubmit}
      onSubmitEditing={onSubmitEditing}
    />
    <TouchableOpacity
      onPress={onToggleVisible}
      style={styles.eyeToggleBtn}
      accessibilityRole="button"
    >
      <Text style={[styles.eyeToggleText, { color: colors.primary }]}>
        {visible ? 'Hide' : 'Show'}
      </Text>
    </TouchableOpacity>
  </View>
);

/** Shared Settings for Pet Owner and Field Officer. Admin features deliberately absent. */
export default function SettingsScreen() {
  const colors = useAppPalette();
  const insets = useSafeAreaInsets();
  const { user, refreshSession, logout, setTheme, setPushNotifications } =
    useAuthStore();

  const isDark = user?.theme === 'dark';
  const semanticColors = useMemo<SemanticTokens>(
    () => ({
      dangerBg: isDark ? '#3E1C24' : '#FEF2F2',
      dangerBorder: isDark ? '#662A36' : '#FCA5A5',
      dangerText: colors.danger,
      onPrimary: isDark ? '#0F172A' : '#FFFFFF',
    }),
    [isDark, colors.danger]
  );

  const isOfficer = user?.contractRole === 'officer';

  // Form drafts
  const [name, setName] = useState(user?.fullName || '');
  const [phone, setPhone] = useState(user?.contactNumber || '');
  const [address, setAddress] = useState(user?.address || '');
  const [barangay, setBarangay] = useState<IliganBarangay>(
    normalizeBarangay(user?.barangay)
  );
  const [position, setPosition] = useState(user?.position || 'Field Officer');
  const [employeeId, setEmployeeId] = useState(user?.employeeId || '');
  const [assignedArea, setAssignedArea] = useState<IliganBarangay>(
    normalizeBarangay(user?.assignedArea || user?.barangay)
  );
  const [shareAvatarOnListings, setShareAvatarOnListings] = useState<boolean>(
    Boolean(user?.shareAvatarOnListings)
  );

  // Scoped loading & transient UI states
  const [savingProfile, setSavingProfile] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [savingSecurity, setSavingSecurity] = useState(false);
  const [savingTheme, setSavingTheme] = useState<'light' | 'dark' | null>(null);
  const [savingPush, setSavingPush] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const [localAvatar, setLocalAvatar] = useState<string | null>(null);
  const [avatarLoadError, setAvatarLoadError] = useState(false);

  // Security modal drafts
  const [securityAction, setSecurityAction] = useState<
    'password' | 'email' | null
  >(null);
  const [existingPassword, setExistingPassword] = useState('');
  const [securityValue, setSecurityValue] = useState('');
  const [securityConfirm, setSecurityConfirm] = useState('');
  const [showExistingPw, setShowExistingPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);

  // Focus refs for sequential keyboard traversal
  type InputRef = React.ComponentRef<typeof TextInput>;
  const phoneInputRef = useRef<InputRef>(null);
  const addressInputRef = useRef<InputRef>(null);
  const positionInputRef = useRef<InputRef>(null);
  const employeeIdInputRef = useRef<InputRef>(null);
  const secNewInputRef = useRef<InputRef>(null);
  const secConfirmInputRef = useRef<InputRef>(null);

  const hasFocusedOnceRef = useRef(false);

  const userBaseline = useMemo(
    () => ({
      name: user?.fullName || '',
      phone: user?.contactNumber || '',
      address: user?.address || '',
      barangay: normalizeBarangay(user?.barangay),
      position: user?.position || 'Field Officer',
      employeeId: user?.employeeId || '',
      assignedArea: normalizeBarangay(user?.assignedArea || user?.barangay),
      shareAvatarOnListings: Boolean(user?.shareAvatarOnListings),
    }),
    [
      user?.fullName,
      user?.contactNumber,
      user?.address,
      user?.barangay,
      user?.position,
      user?.employeeId,
      user?.assignedArea,
      user?.shareAvatarOnListings,
    ]
  );

  const isDirty = useMemo(() => {
    if (name !== userBaseline.name) return true;
    if (phone !== userBaseline.phone) return true;
    if (address !== userBaseline.address) return true;
    if (barangay !== userBaseline.barangay) return true;
    if (isOfficer) {
      if (position !== userBaseline.position) return true;
      if (employeeId !== userBaseline.employeeId) return true;
      if (assignedArea !== userBaseline.assignedArea) return true;
    } else if (shareAvatarOnListings !== userBaseline.shareAvatarOnListings) {
      return true;
    }
    return false;
  }, [
    name,
    phone,
    address,
    barangay,
    isOfficer,
    position,
    employeeId,
    assignedArea,
    shareAvatarOnListings,
    userBaseline,
  ]);

  const applyBaselineToForm = useCallback(
    (baseline: typeof userBaseline) => {
      setName(baseline.name);
      setPhone(baseline.phone);
      setAddress(baseline.address);
      setBarangay(baseline.barangay);
      setPosition(baseline.position);
      setEmployeeId(baseline.employeeId);
      setAssignedArea(baseline.assignedArea);
      setShareAvatarOnListings(baseline.shareAvatarOnListings);
    },
    []
  );

  // Sync incoming session refreshes without clobbering unsaved user edits
  useEffect(() => {
    if (!isDirty) {
      applyBaselineToForm(userBaseline);
    }
  }, [isDirty, userBaseline, applyBaselineToForm]);

  useEffect(() => {
    setAvatarLoadError(false);
  }, [localAvatar, user?.profileImageUrl]);

  useFocusEffect(
    useCallback(() => {
      if (!hasFocusedOnceRef.current) {
        hasFocusedOnceRef.current = true;
        return;
      }
      refreshSession().catch(() => {});
    }, [refreshSession])
  );

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await refreshSession();
    } catch {
      // Keep existing user snapshot if offline
    } finally {
      setRefreshing(false);
    }
  };

  const renderFieldLabel = (caption: string) => (
    <Text style={[styles.fieldLabel, { color: colors.secondary }]}>
      {caption}
    </Text>
  );

  const themedInputStyle = [
    styles.textInput,
    {
      color: colors.text,
      backgroundColor: colors.surfaceMuted,
      borderColor: colors.border,
    },
  ];

  const themedPickerBoxStyle = [
    styles.pickerBox,
    {
      backgroundColor: colors.surfaceMuted,
      borderColor: colors.border,
    },
  ];

  const saveProfile = async () => {
    Keyboard.dismiss();
    if (!name.trim()) {
      return Alert.alert('Required', 'Enter your full name.');
    }
    const cleanPhone = phone.trim();
    if (cleanPhone) {
      const digitsOnly = cleanPhone.replace(/[^\d]/g, '');
      if (digitsOnly.length < 7 || !/^[0-9+\-\s()]+$/.test(cleanPhone)) {
        return Alert.alert(
          'Invalid contact number',
          'Enter a valid phone number (at least 7 digits).'
        );
      }
    }
    setSavingProfile(true);
    try {
      await authApi.saveProfile({
        fullName: name.trim(),
        phone: cleanPhone,
        address: address.trim(),
        barangay,
        ...(isOfficer
          ? {
              position: position.trim() || 'Field Officer',
              employeeId: employeeId.trim(),
              assignedArea,
            }
          : {}),
      });
      if (!isOfficer) {
        await authApi.setProfilePhotoSharing(shareAvatarOnListings);
      }
      await refreshSession();
      Alert.alert('Saved successfully', 'Your account information was updated.');
    } catch (e: any) {
      Alert.alert('Profile update failed', e?.message || 'Try again.');
    } finally {
      setSavingProfile(false);
    }
  };

  const changePhoto = async () => {
    if (uploadingAvatar) return;
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.75,
      });
      if (result.canceled || !result.assets?.[0]) return;
      setUploadingAvatar(true);
      const asset = result.assets[0];
      await authApi.uploadAndSaveAvatar(asset);
      setLocalAvatar(asset.uri);
      await refreshSession();
      Alert.alert('Saved successfully', 'Your profile photo has been updated.');
    } catch (e: any) {
      Alert.alert(
        'Photo upload failed',
        e?.message || 'Please retry with a JPG or PNG under 5 MB.'
      );
    } finally {
      setUploadingAvatar(false);
    }
  };

  const chooseTheme = async (choice: 'light' | 'dark') => {
    if (savingTheme !== null || activeTheme === choice) return;
    setSavingTheme(choice);
    try {
      await setTheme(choice);
    } catch (e: any) {
      Alert.alert(
        'Theme preference',
        e?.message || 'Unable to save preference.'
      );
    } finally {
      setSavingTheme(null);
    }
  };

  const togglePushNotifications = async (val: boolean) => {
    if (savingPush) return;
    setSavingPush(true);
    try {
      await setPushNotifications(val);
    } catch (e: any) {
      Alert.alert(
        'Push notifications',
        e?.message || 'Unable to update push notification preference.'
      );
    } finally {
      setSavingPush(false);
    }
  };

  const openSecurityModal = (mode: 'password' | 'email') => {
    setExistingPassword('');
    setSecurityValue('');
    setSecurityConfirm('');
    setShowExistingPw(false);
    setShowNewPw(false);
    setShowConfirmPw(false);
    setSecurityAction(mode);
  };

  const closeSecurityModal = () => {
    if (savingSecurity) return;
    Keyboard.dismiss();
    setSecurityAction(null);
    setExistingPassword('');
    setSecurityValue('');
    setSecurityConfirm('');
    setShowExistingPw(false);
    setShowNewPw(false);
    setShowConfirmPw(false);
  };

  const securityValidationError = useMemo(() => {
    if (!securityAction) return null;
    if (!existingPassword) return 'Enter your current password.';
    if (securityAction === 'password') {
      if (securityValue.length < 12) {
        return `New password must be at least 12 characters (${securityValue.length}/12).`;
      }
      if (securityValue !== securityConfirm) {
        return 'New password and confirmation do not match.';
      }
    } else if (!/^\S+@\S+\.\S+$/.test(securityValue.trim())) {
      return 'Enter a valid email address.';
    }
    return null;
  }, [securityAction, existingPassword, securityValue, securityConfirm]);

  const saveSecurity = async () => {
    Keyboard.dismiss();
    if (securityValidationError) {
      return Alert.alert(
        securityAction === 'password' ? 'Password rules' : 'Check input',
        securityValidationError
      );
    }
    setSavingSecurity(true);
    try {
      if (securityAction === 'password') {
        await authApi.changePassword(existingPassword, securityValue);
      } else {
        await authApi.changeEmail(securityValue.trim(), existingPassword);
      }
      await refreshSession();
      setSecurityAction(null);
      setExistingPassword('');
      setSecurityValue('');
      setSecurityConfirm('');
      Alert.alert(
        'Saved successfully',
        'Your security information has been updated.'
      );
    } catch (e: any) {
      Alert.alert(
        'Could not update account',
        e?.message || 'Please check your current password.'
      );
    } finally {
      setSavingSecurity(false);
    }
  };

  const confirmLogout = () => {
    if (loggingOut) return;
    Alert.alert(
      'Sign out of CityVetHub?',
      'You can log back in with the same account.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: async () => {
            setLoggingOut(true);
            try {
              await logout();
            } catch (e: any) {
              Alert.alert(
                'Sign out failed',
                e?.message || 'Unable to end your session. Please try again.'
              );
            } finally {
              setLoggingOut(false);
            }
          },
        },
      ]
    );
  };

  const activeTheme: 'light' | 'dark' =
    user?.theme === 'dark' ? 'dark' : 'light';
  const avatarUri = localAvatar || user?.profileImageUrl || '';
  const displayName = (user?.fullName || name || 'CityVetHub User').trim();
  const displayInitial = (displayName[0] || 'U').toUpperCase();

  return (
    <KeyboardAvoidingView
      style={[styles.screenRoot, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 20}
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            colors={[colors.primary]}
            tintColor={colors.primary}
          />
        }
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: Math.max(140, insets.bottom + 120) },
        ]}
      >
        <Text style={[styles.screenTitle, { color: colors.text }]}>
          Settings
        </Text>
        <Text style={[styles.screenSubtitle, { color: colors.secondary }]}>
          Your account, appearance, and security preferences.
        </Text>

        <Panel
          title="My account"
          hint="Changes are shared with the CityVetHub website."
          badgeText={isDirty ? 'Unsaved changes' : undefined}
          colors={colors}
        >
          <View
            style={[styles.profileHeaderRow, { borderBottomColor: colors.border }]}
          >
            <TouchableOpacity
              onPress={changePhoto}
              disabled={uploadingAvatar}
              style={styles.avatarTouchable}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel="Change profile photo"
            >
              {avatarUri && !avatarLoadError ? (
                <Image
                  source={{ uri: avatarUri }}
                  style={[
                    styles.avatarImage,
                    { backgroundColor: colors.surfaceMuted },
                  ]}
                  onError={() => setAvatarLoadError(true)}
                />
              ) : (
                <View
                  style={[
                    styles.avatarFallback,
                    { backgroundColor: colors.primaryMuted },
                  ]}
                >
                  <Text
                    style={[
                      styles.avatarFallbackText,
                      { color: colors.primary },
                    ]}
                  >
                    {displayInitial}
                  </Text>
                </View>
              )}

              {uploadingAvatar ? (
                <View style={styles.avatarOverlay}>
                  <ActivityIndicator color="#FFFFFF" size="small" />
                </View>
              ) : (
                <View
                  style={[
                    styles.avatarCameraBadge,
                    {
                      backgroundColor: colors.primary,
                      borderColor: colors.surface,
                    },
                  ]}
                >
                  <Text style={styles.avatarCameraIcon}>📷</Text>
                </View>
              )}
            </TouchableOpacity>

            <View style={styles.profileHeaderMeta}>
              <Text
                style={[styles.profileDisplayName, { color: colors.text }]}
                numberOfLines={2}
              >
                {displayName}
              </Text>
              <View style={styles.roleRow}>
                <View
                  style={[
                    styles.roleBadge,
                    { backgroundColor: colors.primaryMuted },
                  ]}
                >
                  <Text
                    style={[styles.roleBadgeText, { color: colors.primary }]}
                  >
                    {isOfficer ? 'Field Officer' : 'Pet Owner'}
                  </Text>
                </View>
              </View>
              <TouchableOpacity
                onPress={changePhoto}
                disabled={uploadingAvatar}
                style={[
                  styles.changePhotoBtn,
                  uploadingAvatar && styles.dimmedControl,
                ]}
                activeOpacity={0.7}
              >
                <Text
                  style={[styles.changePhotoText, { color: colors.primary }]}
                >
                  {uploadingAvatar
                    ? 'Uploading profile picture...'
                    : 'Change profile picture'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {renderFieldLabel('Full name *')}
          <TextInput
            style={themedInputStyle}
            value={name}
            onChangeText={setName}
            placeholder="Full name"
            placeholderTextColor={colors.secondary}
            maxLength={128}
            returnKeyType="next"
            blurOnSubmit={false}
            onSubmitEditing={() => phoneInputRef.current?.focus()}
          />

          {renderFieldLabel('Contact number')}
          <View style={styles.phoneRow}>
            <TextInput
              ref={phoneInputRef}
              style={[themedInputStyle, styles.phoneInputFlex]}
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
              maxLength={11}
              placeholder="09XXXXXXXXX"
              placeholderTextColor={colors.secondary}
              returnKeyType="next"
              blurOnSubmit={false}
              onSubmitEditing={() => addressInputRef.current?.focus()}
            />
            <CallButton phone={phone} />
          </View>

          {renderFieldLabel('Barangay')}
          <View style={themedPickerBoxStyle}>
            <Picker
              selectedValue={barangay}
              onValueChange={(value) => setBarangay(normalizeBarangay(value))}
              style={{ color: colors.text, width: '100%' }}
              dropdownIconColor={colors.text}
            >
              {ILIGAN_BARANGAYS.map((b) => (
                <Picker.Item key={b} label={b} value={b} />
              ))}
            </Picker>
          </View>

          {renderFieldLabel('Home address')}
          <TextInput
            ref={addressInputRef}
            style={themedInputStyle}
            value={address}
            onChangeText={setAddress}
            placeholder="Complete home address..."
            placeholderTextColor={colors.secondary}
            maxLength={200}
            returnKeyType={isOfficer ? 'next' : 'done'}
            blurOnSubmit={!isOfficer}
            onSubmitEditing={() => {
              if (isOfficer) positionInputRef.current?.focus();
            }}
          />

          {isOfficer ? (
            <>
              {renderFieldLabel('Position')}
              <TextInput
                ref={positionInputRef}
                style={themedInputStyle}
                value={position}
                onChangeText={setPosition}
                placeholder="e.g. Field Officer"
                placeholderTextColor={colors.secondary}
                maxLength={100}
                returnKeyType="next"
                blurOnSubmit={false}
                onSubmitEditing={() => employeeIdInputRef.current?.focus()}
              />
              {renderFieldLabel('Employee/PRC ID')}
              <TextInput
                ref={employeeIdInputRef}
                style={themedInputStyle}
                value={employeeId}
                onChangeText={setEmployeeId}
                placeholder="Employee or PRC ID"
                placeholderTextColor={colors.secondary}
                maxLength={60}
                returnKeyType="done"
              />
              {renderFieldLabel('Assigned barangay')}
              <View style={themedPickerBoxStyle}>
                <Picker
                  selectedValue={assignedArea}
                  onValueChange={(value) =>
                    setAssignedArea(normalizeBarangay(value))
                  }
                  style={{ color: colors.text, width: '100%' }}
                  dropdownIconColor={colors.text}
                >
                  {ILIGAN_BARANGAYS.map((b) => (
                    <Picker.Item key={b} label={b} value={b} />
                  ))}
                </Picker>
              </View>
            </>
          ) : (
            <View style={styles.switchRow}>
              <Text style={[styles.switchLabel, { color: colors.text }]}>
                Show my profile avatar on my adoption listings
              </Text>
              <Switch
                value={shareAvatarOnListings}
                onValueChange={setShareAvatarOnListings}
                trackColor={{ false: colors.border, true: colors.primary }}
                thumbColor="#FFFFFF"
              />
            </View>
          )}

          <Action
            label={isDirty ? 'Save account details' : 'Account details up to date'}
            onPress={saveProfile}
            colors={colors}
            semanticColors={semanticColors}
            disabled={!isDirty || savingProfile}
            loading={savingProfile}
          />
        </Panel>

        <Panel
          title="Notifications"
          hint={
            isOfficer
              ? 'Receive lock-screen push alerts for new citizen incident reports, declared outbreaks, staff advisories, and community activity.'
              : 'Receive lock-screen push alerts for adoption applications, pet matches, CVO verifications, medical records, community activity, and outbreak advisories.'
          }
          colors={colors}
        >
          <View style={styles.pushRow}>
            <View style={styles.pushTextCol}>
              <Text style={[styles.pushTitle, { color: colors.text }]}>
                Push notifications
              </Text>
              <Text style={[styles.pushSubtitle, { color: colors.secondary }]}>
                {savingPush
                  ? 'Updating device preference...'
                  : user?.pushNotificationsEnabled !== false
                  ? 'Enabled on this device'
                  : 'Muted on this device'}
              </Text>
            </View>
            <Switch
              value={user?.pushNotificationsEnabled !== false}
              onValueChange={togglePushNotifications}
              disabled={savingPush}
              trackColor={{ false: colors.border, true: colors.primary }}
              thumbColor="#FFFFFF"
            />
          </View>
        </Panel>

        <Panel
          title="Appearance"
          hint="Your selected theme is saved to your account and follows you between sessions."
          colors={colors}
        >
          <View style={styles.themeGrid}>
            {(['light', 'dark'] as const).map((value) => {
              const isSelected = activeTheme === value;
              const isSavingThis = savingTheme === value;
              return (
                <TouchableOpacity
                  key={value}
                  onPress={() => chooseTheme(value)}
                  disabled={savingTheme !== null}
                  activeOpacity={0.85}
                  style={[
                    styles.themeCard,
                    {
                      borderColor: isSelected ? colors.primary : colors.border,
                      backgroundColor: isSelected
                        ? colors.primaryMuted
                        : colors.surface,
                      shadowColor: isSelected ? colors.primary : 'transparent',
                      shadowOpacity: isSelected ? 0.15 : 0,
                      elevation: isSelected ? 2 : 0,
                      opacity: savingTheme !== null && !isSavingThis ? 0.65 : 1,
                    },
                  ]}
                >
                  <Text style={styles.themeEmoji}>
                    {value === 'light' ? '☀️' : '🌙'}
                  </Text>
                  <Text
                    style={[
                      styles.themeLabel,
                      { color: isSelected ? colors.primary : colors.text },
                    ]}
                  >
                    {value === 'light' ? 'Light Mode' : 'Dark Mode'}
                  </Text>
                  <View
                    style={[
                      styles.themeStatusPill,
                      {
                        backgroundColor: isSelected
                          ? colors.primary
                          : colors.surfaceMuted,
                        borderColor: isSelected
                          ? 'transparent'
                          : colors.border,
                      },
                    ]}
                  >
                    {isSavingThis ? (
                      <ActivityIndicator
                        color={
                          isSelected ? semanticColors.onPrimary : colors.primary
                        }
                        size="small"
                      />
                    ) : (
                      <Text
                        style={[
                          styles.themeStatusText,
                          {
                            color: isSelected
                              ? semanticColors.onPrimary
                              : colors.secondary,
                          },
                        ]}
                      >
                        {isSelected ? '✓ Active' : 'Tap to apply'}
                      </Text>
                    )}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        </Panel>

        <Panel
          title="Security & credentials"
          hint="Manage your account password and email address. Never share your password with anyone."
          colors={colors}
        >
          <View
            style={[
              styles.emailBanner,
              {
                backgroundColor: colors.surfaceMuted,
                borderColor: colors.border,
              },
            ]}
          >
            <Text style={[styles.emailBannerLabel, { color: colors.secondary }]}>
              CURRENT ACCOUNT EMAIL
            </Text>
            <Text style={[styles.emailBannerValue, { color: colors.text }]}>
              {user?.email || 'Not set'}
            </Text>
          </View>

          <Action
            label="Change password"
            secondary
            colors={colors}
            semanticColors={semanticColors}
            onPress={() => openSecurityModal('password')}
          />
          <Action
            label="Change email"
            secondary
            colors={colors}
            semanticColors={semanticColors}
            onPress={() => openSecurityModal('email')}
          />
        </Panel>

        <Panel
          title="Session & sign out"
          hint="Signing out will end your current session on this device. You can log back in at any time."
          colors={colors}
        >
          <Action
            label="Sign out"
            danger
            colors={colors}
            semanticColors={semanticColors}
            disabled={loggingOut}
            loading={loggingOut}
            onPress={confirmLogout}
          />
        </Panel>
      </ScrollView>

      <Modal
        visible={securityAction !== null}
        transparent
        animationType="fade"
        onRequestClose={closeSecurityModal}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View
            style={[
              styles.modalCard,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
                paddingBottom: Math.max(20, insets.bottom + 8),
              },
            ]}
          >
            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.modalHeaderRow}>
                <Text style={[styles.modalTitle, { color: colors.text }]}>
                  {securityAction === 'password'
                    ? 'Change password'
                    : 'Change email'}
                </Text>
                <TouchableOpacity
                  onPress={closeSecurityModal}
                  disabled={savingSecurity}
                  style={[
                    styles.modalCloseBtn,
                    { backgroundColor: colors.surfaceMuted },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel="Close dialog"
                >
                  <Text style={[styles.modalCloseText, { color: colors.secondary }]}>
                    ✕
                  </Text>
                </TouchableOpacity>
              </View>

              {renderFieldLabel('Current password *')}
              <PasswordField
                value={existingPassword}
                onChangeText={setExistingPassword}
                visible={showExistingPw}
                onToggleVisible={() => setShowExistingPw((prev) => !prev)}
                placeholder="Current password"
                colors={colors}
                returnKeyType="next"
                blurOnSubmit={false}
                onSubmitEditing={() => secNewInputRef.current?.focus()}
              />

              {renderFieldLabel(
                securityAction === 'password'
                  ? 'New password (min 12 characters) *'
                  : 'New email address *'
              )}
              {securityAction === 'password' ? (
                <PasswordField
                  inputRef={secNewInputRef}
                  value={securityValue}
                  onChangeText={setSecurityValue}
                  visible={showNewPw}
                  onToggleVisible={() => setShowNewPw((prev) => !prev)}
                  placeholder="At least 12 characters"
                  colors={colors}
                  returnKeyType="next"
                  blurOnSubmit={false}
                  onSubmitEditing={() => secConfirmInputRef.current?.focus()}
                />
              ) : (
                <TextInput
                  ref={secNewInputRef}
                  style={themedInputStyle}
                  value={securityValue}
                  onChangeText={setSecurityValue}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  maxLength={160}
                  placeholder="name@example.com"
                  placeholderTextColor={colors.secondary}
                  returnKeyType="done"
                />
              )}

              {securityAction === 'password' && (
                <>
                  {renderFieldLabel('Confirm new password *')}
                  <PasswordField
                    inputRef={secConfirmInputRef}
                    value={securityConfirm}
                    onChangeText={setSecurityConfirm}
                    visible={showConfirmPw}
                    onToggleVisible={() => setShowConfirmPw((prev) => !prev)}
                    placeholder="Re-enter new password"
                    colors={colors}
                    returnKeyType="done"
                  />
                </>
              )}

              {!!(existingPassword || securityValue || securityConfirm) &&
                !!securityValidationError && (
                  <Text
                    style={[
                      styles.validationHint,
                      { color: semanticColors.dangerText },
                    ]}
                  >
                    {securityValidationError}
                  </Text>
                )}

              <Action
                label="Save changes"
                disabled={savingSecurity || Boolean(securityValidationError)}
                loading={savingSecurity}
                onPress={saveSecurity}
                colors={colors}
                semanticColors={semanticColors}
              />
              <Action
                label="Cancel"
                secondary
                disabled={savingSecurity}
                colors={colors}
                semanticColors={semanticColors}
                onPress={closeSecurityModal}
              />
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screenRoot: { flex: 1 },
  scrollContent: { padding: 16 },
  screenTitle: { fontSize: 26, fontWeight: '900', marginBottom: 6 },
  screenSubtitle: { marginBottom: 20, fontSize: 13 },
  panel: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 18,
    marginBottom: 16,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  panelHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  panelTitle: { fontSize: 18, fontWeight: '800', flex: 1 },
  unsavedChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
  },
  unsavedChipText: { fontSize: 11, fontWeight: '700' },
  panelHint: {
    marginTop: 4,
    marginBottom: 16,
    fontSize: 12,
    lineHeight: 18,
  },
  actionBtn: {
    borderWidth: 1,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
    minHeight: 48,
  },
  actionBtnText: { fontWeight: '800', fontSize: 14 },
  profileHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginBottom: 18,
    paddingBottom: 16,
    borderBottomWidth: 1,
  },
  avatarTouchable: { position: 'relative' },
  avatarImage: { width: 76, height: 76, borderRadius: 38 },
  avatarFallback: {
    width: 76,
    height: 76,
    borderRadius: 38,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarFallbackText: { fontSize: 26, fontWeight: '900' },
  avatarOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 38,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarCameraBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 26,
    height: 26,
    borderRadius: 13,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
  },
  avatarCameraIcon: { fontSize: 12 },
  profileHeaderMeta: { flex: 1, minWidth: 0 },
  profileDisplayName: { fontWeight: '800', fontSize: 18 },
  roleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  roleBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  roleBadgeText: { fontSize: 11, fontWeight: '700' },
  changePhotoBtn: {
    marginTop: 4,
    minHeight: 36,
    paddingVertical: 6,
    paddingRight: 8,
    justifyContent: 'center',
    alignSelf: 'flex-start',
  },
  changePhotoText: { fontWeight: '800', fontSize: 13 },
  dimmedControl: { opacity: 0.6 },
  fieldLabel: { fontSize: 12, fontWeight: '700' },
  textInput: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 48,
    marginTop: 5,
    marginBottom: 14,
    fontSize: 14,
  },
  phoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 5,
    marginBottom: 14,
  },
  phoneInputFlex: { flex: 1, marginTop: 0, marginBottom: 0 },
  pickerBox: {
    borderWidth: 1,
    borderRadius: 12,
    minHeight: 52,
    justifyContent: 'center',
    marginTop: 5,
    marginBottom: 14,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    marginBottom: 6,
  },
  switchLabel: {
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
    marginRight: 12,
  },
  pushRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  pushTextCol: { flex: 1, marginRight: 12 },
  pushTitle: { fontSize: 14, fontWeight: '700' },
  pushSubtitle: { fontSize: 12, marginTop: 2 },
  themeGrid: { flexDirection: 'row', gap: 12 },
  themeCard: {
    flex: 1,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 12,
    borderRadius: 14,
    minHeight: 132,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
  },
  themeEmoji: { fontSize: 28, marginBottom: 6 },
  themeLabel: { fontWeight: '800', fontSize: 14 },
  themeStatusPill: {
    marginTop: 10,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 10,
    borderWidth: 1,
    minHeight: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  themeStatusText: { fontSize: 11, fontWeight: '700' },
  emailBanner: {
    padding: 12,
    borderRadius: 10,
    marginBottom: 14,
    borderWidth: 1,
  },
  emailBannerLabel: { fontSize: 11, fontWeight: '600' },
  emailBannerValue: { fontSize: 14, fontWeight: '700', marginTop: 2 },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    padding: 18,
  },
  modalCard: {
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 20,
    paddingTop: 20,
    maxHeight: '88%',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 5,
  },
  modalHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
    gap: 12,
  },
  modalTitle: { fontSize: 19, fontWeight: '900', flex: 1 },
  modalCloseBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCloseText: { fontSize: 14, fontWeight: '800' },
  passwordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    height: 48,
    paddingLeft: 14,
    paddingRight: 6,
    marginTop: 5,
    marginBottom: 14,
  },
  passwordInput: {
    flex: 1,
    fontSize: 14,
    height: '100%',
  },
  eyeToggleBtn: {
    paddingHorizontal: 10,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  eyeToggleText: { fontSize: 12, fontWeight: '700' },
  validationHint: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 6,
    lineHeight: 17,
  },
});
