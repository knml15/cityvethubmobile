import React, { useState, useRef, useCallback, ComponentRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
  Modal,
  Image,
  ScrollView,
  Pressable,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppPalette, useThemedStyles } from '../../theme';
import { useAuthStore } from '../../store';
import { account, PUBLIC_PASSPORT_BASE_URL } from '../../api/client';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function LoginScreen({ navigation }: any) {
  const styles = useThemedStyles(baseStyles);
  const palette = useAppPalette();
  const insets = useSafeAreaInsets();
  const passwordInputRef = useRef<ComponentRef<typeof TextInput>>(null);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [focusedField, setFocusedField] = useState<
    'email' | 'password' | 'resetEmail' | null
  >(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  // Forgot Password Modal State
  const [resetModalVisible, setResetModalVisible] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetError, setResetError] = useState<string | null>(null);
  const [isSendingReset, setIsSendingReset] = useState(false);

  const { login, isLoading } = useAuthStore();

  const handleLogin = useCallback(async () => {
    if (isLoading) return;

    const cleanEmail = email.trim().toLowerCase();
    let valid = true;

    if (!cleanEmail) {
      setEmailError('Please enter your email address.');
      valid = false;
    } else if (!EMAIL_REGEX.test(cleanEmail)) {
      setEmailError('Please enter a valid email address.');
      valid = false;
    } else {
      setEmailError(null);
    }

    if (!password) {
      setPasswordError('Please enter your password.');
      valid = false;
    } else {
      setPasswordError(null);
    }

    if (!valid) return;

    await login({ email: cleanEmail, password });
  }, [email, password, isLoading, login]);

  const openResetModal = useCallback(() => {
    if (isLoading) return;
    setResetEmail(email.trim());
    setResetError(null);
    setResetModalVisible(true);
  }, [email, isLoading]);

  const closeResetModal = useCallback(() => {
    if (isSendingReset) return;
    setResetModalVisible(false);
  }, [isSendingReset]);

  const handlePasswordRecovery = async () => {
    if (isSendingReset) return;

    const cleanEmail = resetEmail.trim().toLowerCase();
    if (!cleanEmail) {
      setResetError('Please enter your registered email address.');
      return;
    }
    if (!EMAIL_REGEX.test(cleanEmail)) {
      setResetError('Please enter a valid email address.');
      return;
    }

    setResetError(null);
    setIsSendingReset(true);
    try {
      const recoveryRedirect = `${PUBLIC_PASSPORT_BASE_URL.replace(
        /\/+$/,
        ''
      )}/login.html`;
      await account.createRecovery(cleanEmail, recoveryRedirect);
      setResetModalVisible(false);
      setResetEmail('');
      Alert.alert(
        'Recovery Link Sent',
        'If an account matches that email, a password recovery link has been dispatched.'
      );
    } catch (error: any) {
      setResetError(
        error?.message || 'Unable to initiate password recovery at this moment.'
      );
    } finally {
      setIsSendingReset(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={[
        styles.container,
        { paddingTop: insets.top, paddingBottom: insets.bottom },
      ]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.formContainer}>
          {/* Brand Header */}
          <View style={styles.brandSection}>
            <View
              style={[
                styles.logoWrap,
                {
                  borderColor: palette.primaryMuted,
                  shadowColor: palette.primary,
                },
              ]}
            >
              <Image
                source={require('../../../assets/logo.png')}
                style={styles.logo}
                resizeMode="contain"
              />
            </View>
            <View
              style={[
                styles.badgePill,
                { backgroundColor: palette.primaryMuted },
              ]}
            >
              <Text style={[styles.badgePillText, { color: palette.primary }]}>
                ILIGAN CITY VETERINARY OFFICE
              </Text>
            </View>
            <Text style={styles.headerTitle}>CityVetHub</Text>
            <Text style={styles.subHeader}>
              Pet Owner & Field Officer Mobile Portal
            </Text>
          </View>

          {/* Credentials Card */}
          <View style={styles.formCard}>
            <View style={styles.inputContainer}>
              <Text style={styles.label}>Email Address</Text>
              <TextInput
                style={[
                  styles.input,
                  focusedField === 'email' && { borderColor: palette.primary },
                  emailError ? { borderColor: palette.danger } : null,
                ]}
                placeholder="Enter your email address"
                placeholderTextColor="#94A3B8"
                value={email}
                onChangeText={(val) => {
                  setEmail(val);
                  if (emailError) setEmailError(null);
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
                importantForAutofill="yes"
                returnKeyType="next"
                blurOnSubmit={false}
                onSubmitEditing={() => passwordInputRef.current?.focus()}
                editable={!isLoading}
              />
              {Boolean(emailError) && (
                <Text style={[styles.errorText, { color: palette.danger }]}>
                  {emailError}
                </Text>
              )}
            </View>

            <View style={styles.inputContainer}>
              <Text style={styles.label}>Password</Text>
              <View
                style={[
                  styles.passwordFieldWrap,
                  focusedField === 'password' && {
                    borderColor: palette.primary,
                  },
                  passwordError ? { borderColor: palette.danger } : null,
                ]}
              >
                <TextInput
                  ref={passwordInputRef}
                  style={styles.passwordInput}
                  placeholder="Enter your password"
                  placeholderTextColor="#94A3B8"
                  value={password}
                  onChangeText={(val) => {
                    setPassword(val);
                    if (passwordError) setPasswordError(null);
                  }}
                  onFocus={() => setFocusedField('password')}
                  onBlur={() =>
                    setFocusedField((prev) =>
                      prev === 'password' ? null : prev
                    )
                  }
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="password"
                  textContentType="password"
                  importantForAutofill="yes"
                  returnKeyType="go"
                  onSubmitEditing={handleLogin}
                  editable={!isLoading}
                />
                <TouchableOpacity
                  style={styles.passwordToggleBtn}
                  onPress={() => setShowPassword((prev) => !prev)}
                  disabled={isLoading}
                  accessibilityLabel={
                    showPassword ? 'Hide password' : 'Show password'
                  }
                  hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                >
                  <Text
                    style={[
                      styles.passwordToggleText,
                      { color: palette.primary },
                    ]}
                  >
                    {showPassword ? 'Hide' : 'Show'}
                  </Text>
                </TouchableOpacity>
              </View>
              {Boolean(passwordError) && (
                <Text style={[styles.errorText, { color: palette.danger }]}>
                  {passwordError}
                </Text>
              )}
            </View>

            <TouchableOpacity
              style={[styles.forgotBtn, isLoading && { opacity: 0.5 }]}
              onPress={openResetModal}
              disabled={isLoading}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={[styles.forgotText, { color: palette.primary }]}>
                Forgot Password?
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.loginButton,
                {
                  backgroundColor: palette.primary,
                  shadowColor: palette.primary,
                },
                isLoading && { opacity: 0.75 },
              ]}
              onPress={handleLogin}
              disabled={isLoading}
              activeOpacity={0.85}
            >
              {isLoading ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.loginButtonText}>Sign In</Text>
              )}
            </TouchableOpacity>
          </View>

          <Text style={styles.roleScopeHint}>
            Mobile access is for Pet Owners & approved Field Officers. CVO
            Administrators use the web portal.
          </Text>

          {/* Register Footer */}
          <View style={styles.registerContainer}>
            <Text style={styles.registerText}>Don't have an account? </Text>
            <TouchableOpacity
              onPress={() => navigation.navigate('Register')}
              disabled={isLoading}
              style={isLoading ? { opacity: 0.5 } : undefined}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={[styles.registerLink, { color: palette.primary }]}>
                Register here
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>

      {/* Password Recovery Modal */}
      <Modal
        visible={resetModalVisible}
        transparent
        animationType="fade"
        onRequestClose={closeResetModal}
      >
        <KeyboardAvoidingView
          style={styles.modalBackdrop}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={closeResetModal}
          />
          <View style={styles.modalCard}>
            <View style={styles.modalHeaderRow}>
              <Text style={styles.modalTitle}>Reset Password</Text>
              <TouchableOpacity
                style={styles.modalCloseBtn}
                onPress={closeResetModal}
                disabled={isSendingReset}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text
                  style={[styles.modalCloseText, { color: palette.secondary }]}
                >
                  ✕
                </Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.modalSub}>
              Enter the email linked to your CityVetHub account to receive a
              recovery link.
            </Text>
            <TextInput
              style={[
                styles.input,
                focusedField === 'resetEmail' && {
                  borderColor: palette.primary,
                },
                resetError ? { borderColor: palette.danger } : null,
              ]}
              placeholder="name@example.com"
              placeholderTextColor="#94A3B8"
              value={resetEmail}
              onChangeText={(val) => {
                setResetEmail(val);
                if (resetError) setResetError(null);
              }}
              onFocus={() => setFocusedField('resetEmail')}
              onBlur={() =>
                setFocusedField((prev) =>
                  prev === 'resetEmail' ? null : prev
                )
              }
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              textContentType="emailAddress"
              returnKeyType="send"
              autoFocus
              editable={!isSendingReset}
              onSubmitEditing={handlePasswordRecovery}
            />
            {Boolean(resetError) && (
              <Text style={[styles.errorText, { color: palette.danger }]}>
                {resetError}
              </Text>
            )}
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.cancelBtn, isSendingReset && { opacity: 0.5 }]}
                onPress={closeResetModal}
                disabled={isSendingReset}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.submitBtn,
                  { backgroundColor: palette.primary },
                  isSendingReset && { opacity: 0.75 },
                ]}
                onPress={handlePasswordRecovery}
                disabled={isSendingReset}
              >
                {isSendingReset ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <Text style={styles.submitBtnText}>Send Link</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const baseStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingVertical: 20,
  },
  formContainer: {
    paddingHorizontal: 22,
  },
  brandSection: {
    alignItems: 'center',
    marginBottom: 20,
  },
  logoWrap: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 2,
  },
  logo: {
    width: 64,
    height: 64,
  },
  badgePill: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 20,
    marginBottom: 8,
  },
  badgePillText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.6,
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
  formCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 22,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },
  inputContainer: { marginBottom: 16 },
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
  errorText: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 5,
  },
  forgotBtn: {
    alignSelf: 'flex-end',
    paddingVertical: 4,
    marginBottom: 16,
  },
  forgotText: {
    fontSize: 13,
    fontWeight: '700',
  },
  loginButton: {
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 3,
  },
  loginButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  roleScopeHint: {
    fontSize: 11,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 16,
    marginTop: 14,
    paddingHorizontal: 12,
  },
  registerContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 14,
    paddingVertical: 6,
  },
  registerText: { color: '#64748B', fontSize: 14 },
  registerLink: { fontSize: 14, fontWeight: '800' },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 22,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 4,
  },
  modalHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
  },
  modalCloseBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
  },
  modalCloseText: {
    fontSize: 16,
    fontWeight: '700',
  },
  modalSub: {
    fontSize: 13,
    color: '#64748B',
    marginBottom: 16,
    lineHeight: 18,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 18,
  },
  cancelBtn: {
    flex: 1,
    height: 46,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtnText: { color: '#64748B', fontSize: 13, fontWeight: '700' },
  submitBtn: {
    flex: 1.5,
    height: 46,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitBtnText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
});
