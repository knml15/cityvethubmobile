import React, { useState, useRef, useCallback, ComponentRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppPalette, useThemedStyles } from '../../theme';
import { useAuthStore } from '../../store';
import { Picker } from '../../components/BreedPicker';
import {
  ILIGAN_BARANGAYS,
  IliganBarangay,
} from '../../store/types/constants';
import { authApi } from '../../api/auth';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_REGEX = /^[+0-9 ()-]{7,40}$/;

type FieldErrors = {
  fullName?: string;
  email?: string;
  contactNumber?: string;
  password?: string;
  confirmPassword?: string;
  consent?: string;
  submit?: string;
};

type FocusableField =
  | 'fullName'
  | 'email'
  | 'contactNumber'
  | 'address'
  | 'position'
  | 'employeeId'
  | 'password'
  | 'confirmPassword'
  | null;

export default function RegisterScreen({ navigation }: any) {
  const styles = useThemedStyles(baseStyles);
  const colors = useAppPalette();
  const isDark = useAuthStore((s) => s.user?.theme === 'dark');
  const insets = useSafeAreaInsets();

  const scrollViewRef = useRef<ComponentRef<typeof ScrollView>>(null);
  const emailRef = useRef<ComponentRef<typeof TextInput>>(null);
  const contactRef = useRef<ComponentRef<typeof TextInput>>(null);
  const addressRef = useRef<ComponentRef<typeof TextInput>>(null);
  const positionRef = useRef<ComponentRef<typeof TextInput>>(null);
  const employeeIdRef = useRef<ComponentRef<typeof TextInput>>(null);
  const passwordRef = useRef<ComponentRef<typeof TextInput>>(null);
  const confirmPasswordRef = useRef<ComponentRef<typeof TextInput>>(null);
  const securityCardY = useRef<number>(0);

  const [requestedRole, setRequestedRole] = useState<'owner' | 'officer'>(
    'owner'
  );
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [contactNumber, setContactNumber] = useState('');
  const [barangay, setBarangay] = useState<IliganBarangay>('Hinaplanon');
  const [address, setAddress] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Field Officer optional metadata
  const [position, setPosition] = useState('Field Officer');
  const [employeeId, setEmployeeId] = useState('');

  const [consentChecked, setConsentChecked] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [focusedField, setFocusedField] = useState<FocusableField>(null);
  const [errors, setErrors] = useState<FieldErrors>({});

  const clearError = useCallback((key: keyof FieldErrors) => {
    setErrors((prev) => {
      if (!prev[key] && !prev.submit) return prev;
      const next = { ...prev };
      delete next[key];
      delete next.submit;
      return next;
    });
  }, []);

  const switchRole = useCallback(
    (nextRole: 'owner' | 'officer') => {
      if (isSubmitting || requestedRole === nextRole) return;
      setRequestedRole(nextRole);
      setFocusedField(null);
      setErrors((prev) => {
        if (!prev.submit) return prev;
        const next = { ...prev };
        delete next.submit;
        return next;
      });
    },
    [isSubmitting, requestedRole]
  );

  const handleRegister = useCallback(async () => {
    if (isSubmitting) return;

    const cleanName = fullName.trim();
    const cleanEmail = email.trim().toLowerCase();
    const cleanPhone = contactNumber.trim();
    const nextErrors: FieldErrors = {};

    if (!cleanName) {
      nextErrors.fullName = 'Please enter your full name.';
    }
    if (!cleanEmail) {
      nextErrors.email = 'Please enter your email address.';
    } else if (!EMAIL_REGEX.test(cleanEmail)) {
      nextErrors.email = 'Please enter a valid email address.';
    }
    if (!cleanPhone) {
      nextErrors.contactNumber = 'Please enter your contact number.';
    } else if (!PHONE_REGEX.test(cleanPhone)) {
      nextErrors.contactNumber =
        'Enter a valid contact number (7 to 40 digits).';
    }
    if (!password) {
      nextErrors.password = 'Please create a password.';
    } else if (password.length < 12) {
      nextErrors.password =
        'For account security, password must be at least 12 characters.';
    }
    if (!confirmPassword) {
      nextErrors.confirmPassword = 'Please confirm your password.';
    } else if (password !== confirmPassword) {
      nextErrors.confirmPassword = 'Your passwords do not match.';
    }
    if (!consentChecked) {
      nextErrors.consent =
        'Please agree to the Data Privacy Act of 2012 terms to register.';
    }

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      if (
        nextErrors.fullName ||
        nextErrors.email ||
        nextErrors.contactNumber
      ) {
        scrollViewRef.current?.scrollTo({ y: 0, animated: true });
      } else if (nextErrors.password || nextErrors.confirmPassword) {
        scrollViewRef.current?.scrollTo({
          y: Math.max(0, securityCardY.current - 20),
          animated: true,
        });
      }
      return;
    }

    setErrors({});
    setIsSubmitting(true);
    try {
      const result = await authApi.registerAccount({
        fullName: cleanName,
        email: cleanEmail,
        password,
        phone: cleanPhone,
        address: address.trim() || `Brgy. ${barangay}, Iligan City`,
        barangay,
        requestedRole,
        position: requestedRole === 'officer' ? position.trim() : undefined,
        employeeId: requestedRole === 'officer' ? employeeId.trim() : undefined,
        assignedArea: requestedRole === 'officer' ? barangay : undefined,
      });

      if (result.pendingOfficer) {
        Alert.alert(
          'Awaiting CVO Approval',
          'Your Field Officer account has been submitted for verification.\n\nYou will be able to sign in once a CVO Administrator approves your account.',
          [{ text: 'Back to Login', onPress: () => navigation.navigate('Login') }]
        );
      } else {
        Alert.alert(
          'Registration Complete',
          'Your Pet Owner account has been created and a verification link has been sent to your email address. Please sign in.',
          [{ text: 'Sign In', onPress: () => navigation.navigate('Login') }]
        );
      }
    } catch (error: any) {
      console.error('Appwrite Registration Error:', error);
      setErrors({
        submit:
          error?.message || 'Could not create your account. Please try again.',
      });
    } finally {
      setIsSubmitting(false);
    }
  }, [
    isSubmitting,
    fullName,
    email,
    contactNumber,
    password,
    confirmPassword,
    consentChecked,
    address,
    barangay,
    requestedRole,
    position,
    employeeId,
    navigation,
  ]);

  const successColor = isDark ? '#4ADE80' : '#16A34A';
  const passwordMeetsLength = password.length >= 12;
  const passwordsMatch =
    confirmPassword.length > 0 && password === confirmPassword;

  return (
    <KeyboardAvoidingView
      style={[
        styles.container,
        { paddingTop: insets.top, paddingBottom: insets.bottom },
      ]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 60 : 12}
    >
      <ScrollView
        ref={scrollViewRef}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[
          styles.scrollContainer,
          { paddingBottom: Math.max(120, insets.bottom + 80) },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Header Section */}
        <View style={styles.headerSection}>
          <Text style={styles.headerTitle}>Create Account</Text>
          <Text style={styles.subHeader}>
            Select your role in the Iligan City Vet Hub Ecosystem
          </Text>
        </View>

        {/* Role Selector */}
        <View style={styles.roleSwitchRow}>
          <TouchableOpacity
            style={[
              styles.roleTab,
              requestedRole === 'owner' && styles.roleTabActive,
              isSubmitting && { opacity: 0.6 },
            ]}
            onPress={() => switchRole('owner')}
            disabled={isSubmitting}
            activeOpacity={0.8}
          >
            <Text
              style={[
                styles.roleTabText,
                requestedRole === 'owner' && {
                  color: colors.primary,
                  fontWeight: '800',
                },
              ]}
            >
              🐾 Pet Owner
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.roleTab,
              requestedRole === 'officer' && styles.roleTabActive,
              isSubmitting && { opacity: 0.6 },
            ]}
            onPress={() => switchRole('officer')}
            disabled={isSubmitting}
            activeOpacity={0.8}
          >
            <Text
              style={[
                styles.roleTabText,
                requestedRole === 'officer' && {
                  color: colors.primary,
                  fontWeight: '800',
                },
              ]}
            >
              🛡️ Field Officer / Vet
            </Text>
          </TouchableOpacity>
        </View>

        {requestedRole === 'officer' && (
          <View
            style={[
              styles.officerNoticeBanner,
              isDark && {
                backgroundColor: 'rgba(245, 158, 11, 0.14)',
                borderColor: 'rgba(251, 191, 36, 0.35)',
                borderLeftColor: '#FBBF24',
              },
            ]}
          >
            <Text
              style={[
                styles.officerNoticeTitle,
                isDark && { color: '#FDE68A' },
              ]}
            >
              🛡️ CVO Verification Required
            </Text>
            <Text
              style={[
                styles.officerNoticeText,
                isDark && { color: '#FCD34D' },
              ]}
            >
              Field Officer accounts require review and activation by a City
              Veterinary Office administrator before protected screens and
              incident forms can be accessed.
            </Text>
          </View>
        )}

        {/* Card 1: Personal & Contact Details */}
        <View style={styles.formCard}>
          <Text style={styles.cardSectionTitle}>👤 Personal & Contact Details</Text>

          <View style={styles.inputContainer}>
            <Text style={styles.label}>Full Name *</Text>
            <TextInput
              style={[
                styles.input,
                focusedField === 'fullName' && { borderColor: colors.primary },
                errors.fullName ? { borderColor: colors.danger } : null,
              ]}
              placeholder="Juan Dela Cruz"
              placeholderTextColor={colors.secondary}
              value={fullName}
              onChangeText={(val) => {
                setFullName(val);
                clearError('fullName');
              }}
              onFocus={() => setFocusedField('fullName')}
              onBlur={() => {
                setFocusedField((prev) =>
                  prev === 'fullName' ? null : prev
                );
                setFullName((prev) => prev.trim());
              }}
              autoCapitalize="words"
              autoComplete="name"
              textContentType="name"
              returnKeyType="next"
              blurOnSubmit={false}
              onSubmitEditing={() => emailRef.current?.focus()}
              editable={!isSubmitting}
            />
            {Boolean(errors.fullName) && (
              <Text style={[styles.errorText, { color: colors.danger }]}>
                {errors.fullName}
              </Text>
            )}
          </View>

          <View style={styles.inputContainer}>
            <Text style={styles.label}>Email Address *</Text>
            <TextInput
              ref={emailRef}
              style={[
                styles.input,
                focusedField === 'email' && { borderColor: colors.primary },
                errors.email ? { borderColor: colors.danger } : null,
              ]}
              placeholder="juan@example.com"
              placeholderTextColor={colors.secondary}
              value={email}
              onChangeText={(val) => {
                setEmail(val);
                clearError('email');
              }}
              onFocus={() => setFocusedField('email')}
              onBlur={() => {
                setFocusedField((prev) => (prev === 'email' ? null : prev));
                setEmail((prev) => prev.trim());
              }}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              textContentType="emailAddress"
              returnKeyType="next"
              blurOnSubmit={false}
              onSubmitEditing={() => contactRef.current?.focus()}
              editable={!isSubmitting}
            />
            {Boolean(errors.email) && (
              <Text style={[styles.errorText, { color: colors.danger }]}>
                {errors.email}
              </Text>
            )}
          </View>

          <View style={styles.inputContainer}>
            <Text style={styles.label}>Mobile / Contact Number *</Text>
            <TextInput
              ref={contactRef}
              style={[
                styles.input,
                focusedField === 'contactNumber' && {
                  borderColor: colors.primary,
                },
                errors.contactNumber ? { borderColor: colors.danger } : null,
              ]}
              placeholder="0917 123 4567"
              placeholderTextColor={colors.secondary}
              value={contactNumber}
              onChangeText={(val) => {
                setContactNumber(val);
                clearError('contactNumber');
              }}
              onFocus={() => setFocusedField('contactNumber')}
              onBlur={() => {
                setFocusedField((prev) =>
                  prev === 'contactNumber' ? null : prev
                );
                setContactNumber((prev) => prev.trim());
              }}
              keyboardType="phone-pad"
              autoComplete="tel"
              textContentType="telephoneNumber"
              returnKeyType="next"
              blurOnSubmit={false}
              onSubmitEditing={() => addressRef.current?.focus()}
              editable={!isSubmitting}
            />
            {Boolean(errors.contactNumber) && (
              <Text style={[styles.errorText, { color: colors.danger }]}>
                {errors.contactNumber}
              </Text>
            )}
          </View>

          <View style={styles.inputContainer}>
            <Text style={styles.label}>
              {requestedRole === 'officer'
                ? 'Assigned Barangay (Iligan City) *'
                : 'Home Barangay (Iligan City) *'}
            </Text>
            <View style={styles.pickerWrapper}>
              <Picker
                selectedValue={barangay}
                onValueChange={(val) => setBarangay(val as IliganBarangay)}
                title={
                  requestedRole === 'officer'
                    ? 'Assigned Barangay (Iligan City)'
                    : 'Home Barangay (Iligan City)'
                }
                searchable
                enabled={!isSubmitting}
              >
                {ILIGAN_BARANGAYS.map((brgy) => (
                  <Picker.Item key={brgy} label={brgy} value={brgy} />
                ))}
              </Picker>
            </View>
          </View>

          <View style={styles.inputContainer}>
            <Text style={styles.label}>Street / Purok Address (Optional)</Text>
            <TextInput
              ref={addressRef}
              style={[
                styles.input,
                focusedField === 'address' && { borderColor: colors.primary },
              ]}
              placeholder="Purok 3, Hinaplanon, Iligan City"
              placeholderTextColor={colors.secondary}
              value={address}
              onChangeText={setAddress}
              onFocus={() => setFocusedField('address')}
              onBlur={() => {
                setFocusedField((prev) => (prev === 'address' ? null : prev));
                setAddress((prev) => prev.trim());
              }}
              autoComplete="street-address"
              textContentType="streetAddressLine1"
              returnKeyType="next"
              blurOnSubmit={false}
              onSubmitEditing={() =>
                requestedRole === 'officer'
                  ? positionRef.current?.focus()
                  : passwordRef.current?.focus()
              }
              editable={!isSubmitting}
            />
            <Text style={[styles.helperText, { color: colors.secondary }]}>
              Defaults to Brgy. {barangay}, Iligan City if left blank.
            </Text>
          </View>

          {requestedRole === 'officer' && (
            <View style={styles.row}>
              <View style={[styles.inputContainer, styles.halfInput]}>
                <Text style={styles.label} numberOfLines={1}>
                  Position (Optional)
                </Text>
                <TextInput
                  ref={positionRef}
                  style={[
                    styles.input,
                    focusedField === 'position' && {
                      borderColor: colors.primary,
                    },
                  ]}
                  placeholder="Field Inspector"
                  placeholderTextColor={colors.secondary}
                  value={position}
                  onChangeText={setPosition}
                  onFocus={() => setFocusedField('position')}
                  onBlur={() => {
                    setFocusedField((prev) =>
                      prev === 'position' ? null : prev
                    );
                    setPosition((prev) => prev.trim());
                  }}
                  returnKeyType="next"
                  blurOnSubmit={false}
                  onSubmitEditing={() => employeeIdRef.current?.focus()}
                  editable={!isSubmitting}
                />
              </View>
              <View style={[styles.inputContainer, styles.halfInput]}>
                <Text style={styles.label} numberOfLines={1}>
                  Employee / PRC ID (Optional)
                </Text>
                <TextInput
                  ref={employeeIdRef}
                  style={[
                    styles.input,
                    focusedField === 'employeeId' && {
                      borderColor: colors.primary,
                    },
                  ]}
                  placeholder="CVO-2026-01"
                  placeholderTextColor={colors.secondary}
                  value={employeeId}
                  onChangeText={setEmployeeId}
                  onFocus={() => setFocusedField('employeeId')}
                  onBlur={() => {
                    setFocusedField((prev) =>
                      prev === 'employeeId' ? null : prev
                    );
                    setEmployeeId((prev) => prev.trim());
                  }}
                  autoCapitalize="characters"
                  returnKeyType="next"
                  blurOnSubmit={false}
                  onSubmitEditing={() => passwordRef.current?.focus()}
                  editable={!isSubmitting}
                />
              </View>
            </View>
          )}
        </View>

        {/* Card 2: Account Security */}
        <View
          style={styles.formCard}
          onLayout={(e) => {
            securityCardY.current = e.nativeEvent.layout.y;
          }}
        >
          <Text style={styles.cardSectionTitle}>🔒 Account Security</Text>

          <View style={styles.inputContainer}>
            <Text style={styles.label}>Password (12+ characters) *</Text>
            <View
              style={[
                styles.passwordFieldWrap,
                focusedField === 'password' && { borderColor: colors.primary },
                errors.password ? { borderColor: colors.danger } : null,
              ]}
            >
              <TextInput
                ref={passwordRef}
                style={styles.passwordInput}
                placeholder="Create a strong password"
                placeholderTextColor={colors.secondary}
                value={password}
                onChangeText={(val) => {
                  setPassword(val);
                  clearError('password');
                }}
                onFocus={() => setFocusedField('password')}
                onBlur={() =>
                  setFocusedField((prev) => (prev === 'password' ? null : prev))
                }
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="password-new"
                textContentType="newPassword"
                returnKeyType="next"
                blurOnSubmit={false}
                onSubmitEditing={() => confirmPasswordRef.current?.focus()}
                editable={!isSubmitting}
              />
              <TouchableOpacity
                style={styles.passwordToggleBtn}
                onPress={() => setShowPassword((prev) => !prev)}
                disabled={isSubmitting}
                accessibilityLabel={
                  showPassword ? 'Hide password' : 'Show password'
                }
                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
              >
                <Text
                  style={[
                    styles.passwordToggleText,
                    { color: colors.primary },
                  ]}
                >
                  {showPassword ? 'Hide' : 'Show'}
                </Text>
              </TouchableOpacity>
            </View>
            {Boolean(errors.password) ? (
              <Text style={[styles.errorText, { color: colors.danger }]}>
                {errors.password}
              </Text>
            ) : (
              <Text
                style={[
                  styles.helperText,
                  {
                    color: passwordMeetsLength
                      ? successColor
                      : colors.secondary,
                  },
                ]}
              >
                {password.length === 0
                  ? 'Minimum 12 characters required for account security.'
                  : passwordMeetsLength
                  ? '✓ 12+ characters requirement met'
                  : `${password.length} / 12 characters minimum`}
              </Text>
            )}
          </View>

          <View style={[styles.inputContainer, { marginBottom: 4 }]}>
            <Text style={styles.label}>Confirm Password *</Text>
            <View
              style={[
                styles.passwordFieldWrap,
                focusedField === 'confirmPassword' && {
                  borderColor: colors.primary,
                },
                errors.confirmPassword ? { borderColor: colors.danger } : null,
              ]}
            >
              <TextInput
                ref={confirmPasswordRef}
                style={styles.passwordInput}
                placeholder="Re-enter your password"
                placeholderTextColor={colors.secondary}
                value={confirmPassword}
                onChangeText={(val) => {
                  setConfirmPassword(val);
                  clearError('confirmPassword');
                }}
                onFocus={() => setFocusedField('confirmPassword')}
                onBlur={() =>
                  setFocusedField((prev) =>
                    prev === 'confirmPassword' ? null : prev
                  )
                }
                secureTextEntry={!showConfirmPassword}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="password-new"
                textContentType="newPassword"
                returnKeyType="go"
                onSubmitEditing={handleRegister}
                editable={!isSubmitting}
              />
              <TouchableOpacity
                style={styles.passwordToggleBtn}
                onPress={() => setShowConfirmPassword((prev) => !prev)}
                disabled={isSubmitting}
                accessibilityLabel={
                  showConfirmPassword
                    ? 'Hide confirm password'
                    : 'Show confirm password'
                }
                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
              >
                <Text
                  style={[
                    styles.passwordToggleText,
                    { color: colors.primary },
                  ]}
                >
                  {showConfirmPassword ? 'Hide' : 'Show'}
                </Text>
              </TouchableOpacity>
            </View>
            {Boolean(errors.confirmPassword) ? (
              <Text style={[styles.errorText, { color: colors.danger }]}>
                {errors.confirmPassword}
              </Text>
            ) : (
              confirmPassword.length > 0 && (
                <Text
                  style={[
                    styles.helperText,
                    {
                      color: passwordsMatch ? successColor : colors.danger,
                    },
                  ]}
                >
                  {passwordsMatch
                    ? '✓ Passwords match'
                    : '✕ Passwords do not match'}
                </Text>
              )
            )}
          </View>
        </View>

        {/* Data Privacy Consent */}
        <TouchableOpacity
          style={[
            styles.consentRow,
            errors.consent && {
              borderWidth: 1,
              borderColor: colors.danger,
              borderRadius: 12,
              padding: 10,
            },
          ]}
          onPress={() => {
            if (isSubmitting) return;
            setConsentChecked((prev) => !prev);
            clearError('consent');
          }}
          disabled={isSubmitting}
          activeOpacity={0.8}
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
        >
          <View
            style={[
              styles.checkbox,
              consentChecked && {
                backgroundColor: colors.primary,
                borderColor: colors.primary,
              },
              errors.consent && !consentChecked
                ? { borderColor: colors.danger }
                : null,
            ]}
          >
            {consentChecked && <Text style={styles.checkmark}>✓</Text>}
          </View>
          <Text style={styles.consentText}>
            I consent to the processing of my account data in accordance with
            RA 10173 (Data Privacy Act of 2012) and Iligan CVO guidelines. *
          </Text>
        </TouchableOpacity>
        {Boolean(errors.consent) && (
          <Text
            style={[
              styles.errorText,
              { color: colors.danger, marginTop: -4, marginBottom: 8 },
            ]}
          >
            {errors.consent}
          </Text>
        )}

        {Boolean(errors.submit) && (
          <View
            style={[
              styles.submitErrorBanner,
              {
                backgroundColor: isDark
                  ? 'rgba(239, 68, 68, 0.16)'
                  : '#FEF2F2',
                borderColor: colors.danger,
              },
            ]}
          >
            <Text style={[styles.submitErrorText, { color: colors.danger }]}>
              {errors.submit}
            </Text>
          </View>
        )}

        {/* Register Button */}
        <TouchableOpacity
          style={[
            styles.registerButton,
            {
              backgroundColor: colors.primary,
              shadowColor: colors.primary,
            },
            isSubmitting && { opacity: 0.75 },
          ]}
          onPress={handleRegister}
          disabled={isSubmitting}
          activeOpacity={0.85}
        >
          {isSubmitting ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.registerButtonText}>
              {requestedRole === 'officer'
                ? 'Submit Officer Application'
                : 'Create Pet Owner Account'}
            </Text>
          )}
        </TouchableOpacity>

        {/* Sign In Footer */}
        <View style={styles.loginContainer}>
          <Text style={styles.loginText}>Already have an account? </Text>
          <TouchableOpacity
            onPress={() => navigation.navigate('Login')}
            disabled={isSubmitting}
            style={isSubmitting ? { opacity: 0.5 } : undefined}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={[styles.loginLink, { color: colors.primary }]}>
              Sign In
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const baseStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  scrollContainer: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 140,
  },
  headerSection: {
    alignItems: 'center',
    marginBottom: 18,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: '#0F172A',
    textAlign: 'center',
    marginBottom: 4,
  },
  subHeader: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
  },
  roleSwitchRow: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: 12,
    padding: 4,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  roleTab: {
    flex: 1,
    minHeight: 42,
    paddingVertical: 10,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  roleTabActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  roleTabText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
  },
  officerNoticeBanner: {
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderLeftWidth: 4,
    borderLeftColor: '#F59E0B',
    padding: 12,
    borderRadius: 10,
    marginBottom: 16,
  },
  officerNoticeTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#92400E',
    marginBottom: 4,
  },
  officerNoticeText: {
    fontSize: 12,
    color: '#78350F',
    lineHeight: 18,
  },
  formCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 14,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
  },
  cardSectionTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 14,
  },
  row: {
    flexDirection: 'row',
    gap: 10,
  },
  inputContainer: { marginBottom: 14 },
  halfInput: { flex: 1 },
  label: {
    fontSize: 13,
    color: '#334155',
    marginBottom: 6,
    fontWeight: '700',
  },
  input: {
    height: 48,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 12,
    paddingHorizontal: 14,
    fontSize: 14,
    color: '#0F172A',
  },
  passwordFieldWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 48,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 12,
  },
  passwordInput: {
    flex: 1,
    height: '100%',
    paddingHorizontal: 14,
    fontSize: 14,
    color: '#0F172A',
  },
  passwordToggleBtn: {
    minWidth: 52,
    height: '100%',
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  passwordToggleText: {
    fontSize: 12,
    fontWeight: '700',
  },
  helperText: {
    fontSize: 11,
    fontWeight: '600',
    marginTop: 5,
  },
  errorText: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 5,
  },
  pickerWrapper: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 12,
    height: 48,
    justifyContent: 'center',
  },
  consentRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginVertical: 12,
    paddingHorizontal: 4,
    gap: 10,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderWidth: 2,
    borderColor: '#94A3B8',
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  checkmark: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
  consentText: {
    flex: 1,
    fontSize: 12,
    color: '#475569',
    lineHeight: 18,
  },
  submitErrorBanner: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 10,
  },
  submitErrorText: {
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
  },
  registerButton: {
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 3,
  },
  registerButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  loginContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 20,
    paddingVertical: 6,
  },
  loginText: { color: '#64748B', fontSize: 14 },
  loginLink: { fontSize: 14, fontWeight: '800', paddingVertical: 4 },
});
