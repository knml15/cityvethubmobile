import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppPalette, useThemedStyles } from '../../theme';
import React, { useState } from 'react';
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
import { Picker } from '@react-native-picker/picker';
import {
  ILIGAN_BARANGAYS,
  IliganBarangay,
} from '../../store/types/constants';
import { authApi } from '../../api/auth';

export default function RegisterScreen({ navigation }: any) {
  const styles = useThemedStyles(baseStyles);
  const colors = useAppPalette();
  const insets = useSafeAreaInsets();
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

  // Field Officer optional metadata
  const [position, setPosition] = useState('Field Officer');
  const [employeeId, setEmployeeId] = useState('');

  const [consentChecked, setConsentChecked] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleRegister = async () => {
    if (!fullName.trim() || !email.trim() || !password || !contactNumber.trim()) {
      Alert.alert(
        'Missing Fields',
        'Please complete your Full Name, Email, Contact Number, and Password.'
      );
      return;
    }

    const phoneRegex = /^[+0-9 ()-]{7,40}$/;
    if (!phoneRegex.test(contactNumber.trim())) {
      Alert.alert(
        'Invalid Contact Number',
        'Please enter a valid contact number (7 to 40 digits).'
      );
      return;
    }

    if (password.length < 12) {
      Alert.alert(
        'Password Policy',
        'For account security, your password must be at least 12 characters long.'
      );
      return;
    }

    if (password !== confirmPassword) {
      Alert.alert('Password Mismatch', 'Your passwords do not match.');
      return;
    }

    if (!consentChecked) {
      Alert.alert(
        'Data Privacy Consent',
        'Please agree to the Data Privacy Act of 2012 terms to register.'
      );
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await authApi.registerAccount({
        fullName: fullName.trim(),
        email: email.trim().toLowerCase(),
        password,
        phone: contactNumber.trim(),
        address: address.trim() || `Brgy. ${barangay}, Iligan City`,
        barangay,
        requestedRole,
        position: requestedRole === 'officer' ? position : undefined,
        employeeId: requestedRole === 'officer' ? employeeId : undefined,
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
      Alert.alert(
        'Registration Failed',
        error?.message || 'Could not create your account. Please try again.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={[
        styles.container,
        { paddingTop: insets.top, paddingBottom: insets.bottom },
      ]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 60 : 24}
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[
          styles.scrollContainer,
          { paddingBottom: Math.max(140, insets.bottom + 120) },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.headerTitle}>Create Account</Text>
        <Text style={styles.subHeader}>
          Select your role in the Iligan City Vet Hub Ecosystem
        </Text>

        {/* Role Selector */}
        <View style={styles.roleSwitchRow}>
          <TouchableOpacity
            style={[
              styles.roleTab,
              requestedRole === 'owner' && styles.roleTabActive,
            ]}
            onPress={() => setRequestedRole('owner')}
          >
            <Text
              style={[
                styles.roleTabText,
                requestedRole === 'owner' && styles.roleTabTextActive,
              ]}
            >
              🐾 Pet Owner
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.roleTab,
              requestedRole === 'officer' && styles.roleTabActive,
            ]}
            onPress={() => setRequestedRole('officer')}
          >
            <Text
              style={[
                styles.roleTabText,
                requestedRole === 'officer' && styles.roleTabTextActive,
              ]}
            >
              🛡️ Field Officer / Vet
            </Text>
          </TouchableOpacity>
        </View>

        {requestedRole === 'officer' && (
          <View style={styles.officerNoticeBanner}>
            <Text style={styles.officerNoticeText}>
              Note: Field Officer registrations require CVO Administrator
              approval before login access is activated.
            </Text>
          </View>
        )}

        <View style={styles.inputContainer}>
          <Text style={styles.label}>Full Name</Text>
          <TextInput
            style={styles.input}
            placeholder="Juan Dela Cruz"
            placeholderTextColor={colors.secondary}
            value={fullName}
            onChangeText={setFullName}
          />
        </View>

        <View style={styles.inputContainer}>
          <Text style={styles.label}>Email Address</Text>
          <TextInput
            style={styles.input}
            placeholder="juan@example.com"
            placeholderTextColor={colors.secondary}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
          />
        </View>

        <View style={styles.inputContainer}>
          <Text style={styles.label}>Mobile / Contact Number</Text>
          <TextInput
            style={styles.input}
            placeholder="0917 123 4567"
            placeholderTextColor={colors.secondary}
            value={contactNumber}
            onChangeText={setContactNumber}
            keyboardType="phone-pad"
          />
        </View>

        <View style={styles.inputContainer}>
          <Text style={styles.label}>
            {requestedRole === 'officer'
              ? 'Assigned Barangay (Iligan City)'
              : 'Home Barangay (Iligan City)'}
          </Text>
          <View style={styles.pickerWrapper}>
            <Picker
              selectedValue={barangay}
              onValueChange={(val) => setBarangay(val as IliganBarangay)}
              style={{ color: colors.text, width: '100%' }}
              dropdownIconColor={colors.text}
            >
              {ILIGAN_BARANGAYS.map((brgy) => (
                <Picker.Item key={brgy} label={brgy} value={brgy} />
              ))}
            </Picker>
          </View>
        </View>

        <View style={styles.inputContainer}>
          <Text style={styles.label}>Street / Purok Address</Text>
          <TextInput
            style={styles.input}
            placeholder="Purok 3, Hinaplanon, Iligan City"
            placeholderTextColor={colors.secondary}
            value={address}
            onChangeText={setAddress}
          />
        </View>

        {requestedRole === 'officer' && (
          <View style={styles.row}>
            <View style={[styles.inputContainer, styles.halfInput]}>
              <Text style={styles.label}>Position / Title</Text>
              <TextInput
                style={styles.input}
                placeholder="Field Inspector"
                placeholderTextColor={colors.secondary}
                value={position}
                onChangeText={setPosition}
              />
            </View>
            <View style={[styles.inputContainer, styles.halfInput]}>
              <Text style={styles.label}>Employee / PRC ID</Text>
              <TextInput
                style={styles.input}
                placeholder="CVO-2026-01"
                placeholderTextColor={colors.secondary}
                value={employeeId}
                onChangeText={setEmployeeId}
              />
            </View>
          </View>
        )}

        <View style={styles.inputContainer}>
          <Text style={styles.label}>Password (12+ characters)</Text>
          <TextInput
            style={styles.input}
            placeholder="Create a strong password"
            placeholderTextColor={colors.secondary}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />
        </View>

        <View style={styles.inputContainer}>
          <Text style={styles.label}>Confirm Password</Text>
          <TextInput
            style={styles.input}
            placeholder="Re-enter your password"
            placeholderTextColor={colors.secondary}
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            secureTextEntry
          />
        </View>

        <TouchableOpacity
          style={styles.consentRow}
          onPress={() => setConsentChecked(!consentChecked)}
        >
          <View
            style={[styles.checkbox, consentChecked && styles.checkboxActive]}
          >
            {consentChecked && <Text style={styles.checkmark}>✓</Text>}
          </View>
          <Text style={styles.consentText}>
            I consent to the processing of my account data in accordance with
            RA 10173 (Data Privacy Act of 2012) and Iligan CVO guidelines.
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.registerButton}
          onPress={handleRegister}
          disabled={isSubmitting}
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

        <View style={styles.loginContainer}>
          <Text style={styles.loginText}>Already have an account? </Text>
          <TouchableOpacity onPress={() => navigation.navigate('Login')}>
            <Text style={styles.loginLink}>Sign In</Text>
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
    paddingHorizontal: 24,
    paddingTop: 28,
    paddingBottom: 140,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1E293B',
    textAlign: 'center',
    marginBottom: 4,
  },
  subHeader: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    marginBottom: 20,
  },
  roleSwitchRow: {
    flexDirection: 'row',
    backgroundColor: '#E2E8F0',
    borderRadius: 10,
    padding: 4,
    marginBottom: 16,
  },
  roleTab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  roleTabActive: {
    backgroundColor: '#FFFFFF',
  },
  roleTabText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
  },
  roleTabTextActive: {
    color: '#0284C7',
    fontWeight: 'bold',
  },
  officerNoticeBanner: {
    backgroundColor: '#FEF3C7',
    borderLeftWidth: 3,
    borderLeftColor: '#F59E0B',
    padding: 10,
    borderRadius: 6,
    marginBottom: 16,
  },
  officerNoticeText: {
    fontSize: 12,
    color: '#92400E',
    lineHeight: 17,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  inputContainer: { marginBottom: 14 },
  halfInput: { width: '48%' },
  label: {
    fontSize: 13,
    color: '#334155',
    marginBottom: 6,
    fontWeight: '700',
  },
  input: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 14,
    color: '#1E293B',
  },
  pickerWrapper: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    height: 52,
    justifyContent: 'center',
  },
  consentRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginVertical: 12,
    gap: 10,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderWidth: 2,
    borderColor: '#94A3B8',
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  checkboxActive: {
    backgroundColor: '#00AEEF',
    borderColor: '#00AEEF',
  },
  checkmark: { color: '#FFFFFF', fontSize: 12, fontWeight: 'bold' },
  consentText: {
    flex: 1,
    fontSize: 12,
    color: '#475569',
    lineHeight: 17,
  },
  registerButton: {
    backgroundColor: '#00AEEF',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  registerButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: 'bold',
  },
  loginContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 20,
  },
  loginText: { color: '#64748B', fontSize: 14 },
  loginLink: { color: '#00AEEF', fontSize: 14, fontWeight: 'bold' },
});