import CallButton from '../../components/CallButton';
import { useThemedStyles } from '../../theme';
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  TouchableOpacity,
  Modal,
  TextInput,
  Alert,
  ActivityIndicator,
  Switch,
} from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuthStore, useAdoptionStore } from '../../store/index';
import { operate } from '../../api/client';

export default function PetDetailScreen() {
  const styles = useThemedStyles(baseStyles);
  const route = useRoute();
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { user } = useAuthStore();
  const {
    submitApplication,
    incomingApplications,
    fetchIncomingApplications,
    reviewApplication,
    confirmTransfer,
    toggleListingVisibility,
    fetchAvailablePets,
    isLoading,
  } = useAdoptionStore();

  const params = route.params as any;
  const rawPet = params?.pet || {};
  const isOwnerOfListing = Boolean(
    params?.isOwned ||
      (user?.id &&
        rawPet.postedById &&
        String(rawPet.postedById) === String(user.id))
  );
  const isOfficer = user?.contractRole === 'officer';

  const pet = {
    id: String(rawPet.id || '1'),
    listingId: String(rawPet.listingId || rawPet.id || '1'),
    petId: String(rawPet.petId || rawPet.id || '1'),
    petProfileId: String(rawPet.petProfileId || rawPet.petId || '1'),
    title: rawPet.title || rawPet.name || 'Companion',
    name: rawPet.name || 'Companion',
    species: rawPet.species || 'Dog',
    breed: rawPet.breed || 'Aspin',
    age: rawPet.age || '1 yr(s)',
    gender: rawPet.gender || 'Male',
    barangay: rawPet.barangay || 'Poblacion',
    controlNumber: rawPet.controlNumber || 'QR-PASSPORT',
    status: String(rawPet.status || 'AVAILABLE').toUpperCase(),
    ownerDisplayName: rawPet.ownerDisplayName || 'Pet Owner',
    verificationStatus: rawPet.verificationStatus || 'draft',
    housingRequirement: rawPet.housingRequirement || 'any',
    photoUrl:
      rawPet.photoUrl ||
      'https://images.unsplash.com/photo-1543466835-00a7907e9de1?auto=format&fit=crop&w=600&q=80',
    description:
      rawPet.description ||
      'Companion animal listed for peer-to-peer adoption in Iligan City.',
    healthClearance:
      rawPet.healthClearance || 'Responsible adopter required.',
    temperament: Array.isArray(rawPet.temperament) ? rawPet.temperament : [],
    vaccinations: Array.isArray(rawPet.vaccinations) ? rawPet.vaccinations : [],
  };

  // Apply to Adopt Modal State (`applyAdoption`)
  const [modalVisible, setModalVisible] = useState(false);
  const [adopterContact, setAdopterContact] = useState<string>(
    user?.contactNumber || ''
  );
  const [adoptionReason, setAdoptionReason] = useState<string>('');

  // Owner Photo Sharing Modal State (`updateListingPhotos`)
  const [photoModalVisible, setPhotoModalVisible] = useState(false);
  const [publishPetPhoto, setPublishPetPhoto] = useState(true);
  const [publishOwnerPhoto, setPublishOwnerPhoto] = useState(
    Boolean(rawPet.ownerAvatarUrl)
  );
  const [isUpdatingPhotos, setIsUpdatingPhotos] = useState(false);

  useEffect(() => {
    if (isOwnerOfListing) {
      fetchIncomingApplications();
    }
  }, [isOwnerOfListing, fetchIncomingApplications]);

  const listingApplications = incomingApplications.filter(
    (app) => String(app.listingId) === String(pet.listingId)
  );

  const handleSubmitApplication = async () => {
    const cleanPhone = adopterContact.trim();
    const phoneRegex = /^[+0-9 ()-]{7,40}$/;
    if (!phoneRegex.test(cleanPhone)) {
      Alert.alert(
        'Invalid Contact Number',
        'Please enter a valid contact number (7 to 40 digits, e.g., 09171234567).'
      );
      return;
    }

    if (!adoptionReason.trim()) {
      Alert.alert(
        'Reason Required',
        'Please share why you would like to adopt this pet and describe your home environment.'
      );
      return;
    }

    try {
      await submitApplication({
        listingId: pet.listingId,
        pet: pet.petId,
        contactNumber: cleanPhone,
        contact_number: cleanPhone,
        message: adoptionReason.trim(),
        reason_for_adoption: adoptionReason.trim(),
        address: `Brgy. ${user?.barangay || 'Poblacion'}, Iligan City`,
        status: 'PENDING',
      });

      setModalVisible(false);
      setAdoptionReason('');

      Alert.alert(
        'Application Sent to Pet Owner!',
        `Your application for ${pet.name} has been sent directly to ${pet.ownerDisplayName}. You can track their decision in your Profile > Adoptions tab.`,
        [{ text: 'OK', onPress: () => navigation.goBack() }]
      );
    } catch (error: any) {
      Alert.alert(
        'Application Failed',
        error?.message || 'Could not submit your adoption application.'
      );
    }
  };

  const handleUpdateListingPhotos = async () => {
    setIsUpdatingPhotos(true);
    try {
      await operate('updateListingPhotos', {
        listingId: pet.listingId,
        publishPetPhoto,
        publishOwnerPhoto,
      });
      await fetchAvailablePets();
      setPhotoModalVisible(false);
      Alert.alert(
        'Listing Photos Updated',
        'Your photo-sharing consent for this listing has been updated.'
      );
    } catch (error: any) {
      Alert.alert(
        'Update Failed',
        error?.message || 'Could not update listing photo preferences.'
      );
    } finally {
      setIsUpdatingPhotos(false);
    }
  };

  const handleToggleListing = async () => {
    try {
      await toggleListingVisibility(pet.listingId);
      Alert.alert(
        'Listing Visibility Updated',
        'Your listing visibility has been toggled.'
      );
      navigation.goBack();
    } catch (error: any) {
      Alert.alert(
        'Error',
        error?.message || 'Could not toggle listing visibility.'
      );
    }
  };

  const handleOwnerDecision = (
    appId: string,
    applicantName: string,
    decision: 'approve' | 'decline'
  ) => {
    Alert.alert(
      decision === 'approve' ? 'Approve Application?' : 'Decline Application?',
      decision === 'approve'
        ? `Approve ${applicantName}? This reserves your listing immediately without needing CVO approval.`
        : `Decline ${applicantName}'s application?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: decision === 'approve' ? 'Approve' : 'Decline',
          style: decision === 'decline' ? 'destructive' : 'default',
          onPress: async () => {
            try {
              await reviewApplication(appId, decision);
              Alert.alert('Updated', `Application ${decision}d.`);
            } catch (err: any) {
              Alert.alert('Error', err?.message || 'Action failed.');
            }
          },
        },
      ]
    );
  };

  const handleOwnerConfirmTransfer = (appId: string, applicantName: string) => {
    Alert.alert(
      'Confirm Final Handover?',
      `Confirm that ${pet.name} has been physically handed over to ${applicantName}? Ownership of this pet, its QR passport, and medical records will automatically transfer to ${applicantName}.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm Transfer',
          onPress: async () => {
            try {
              await confirmTransfer(appId);
              Alert.alert(
                'Transfer Complete!',
                `Ownership of ${pet.name} has been transferred to ${applicantName}.`
              );
              navigation.goBack();
            } catch (err: any) {
              Alert.alert('Transfer Failed', err?.message || 'Could not complete handover.');
            }
          },
        },
      ]
    );
  };

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: 110 + insets.bottom },
        ]}
      >
        <Image
          source={{ uri: pet.photoUrl }}
          style={styles.petImage}
          resizeMode="cover"
        />

        <View style={styles.cardContent}>
          <View style={styles.headerRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.petName}>{pet.title}</Text>
              <Text style={styles.petSubtitle}>
                {pet.breed} • {pet.species} • {pet.age} • {pet.gender} • Brgy.{' '}
                {pet.barangay}
              </Text>
              <Text style={styles.ownerSubText}>
                Listed by: {isOwnerOfListing ? 'You' : pet.ownerDisplayName}
              </Text>
            </View>
            <View style={styles.statusBadge}>
              <Text style={styles.statusText}>{pet.status}</Text>
            </View>
          </View>

          <View style={styles.tokenBox}>
            <Text style={styles.tokenLabel}>
              {pet.verificationStatus === 'verified'
                ? '✓ CVO Verified Pet'
                : 'Personal QR Passport ID'}
            </Text>
            <Text style={styles.tokenValue}>{pet.controlNumber}</Text>
          </View>

          {/* Owner Controls if viewing own listing */}
          {isOwnerOfListing && (
            <View style={styles.ownerControlCard}>
              <Text style={styles.sectionTitle}>Manage My Listing</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TouchableOpacity
                  style={styles.ownerBtn}
                  onPress={() => setPhotoModalVisible(true)}
                >
                  <Text style={styles.ownerBtnText}>
                    📷 Photo Consent Options
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.ownerBtn, { borderColor: '#64748B' }]}
                  onPress={handleToggleListing}
                >
                  <Text style={[styles.ownerBtnText, { color: '#475569' }]}>
                    👁️ Hide / Restore Listing
                  </Text>
                </TouchableOpacity>
              </View>

              <Text style={[styles.sectionTitle, { marginTop: 14 }]}>
                Received Applications ({listingApplications.length})
              </Text>
              {listingApplications.length === 0 ? (
                <Text style={styles.bodyText}>
                  No applications received for this listing yet.
                </Text>
              ) : (
                listingApplications.map((app) => {
                  const st = String(app.status || 'PENDING').toUpperCase();
                  return (
                    <View key={String(app.id)} style={styles.vacCard}>
                      <View style={styles.vacHeader}>
                        <Text style={styles.vacName}>{app.applicantName}</Text>
                        <Text style={styles.vacDate}>{st}</Text>
                      </View>
                      <Text style={styles.bodyText}>
                        📞 {app.contactNumber || app.contact_number}
                      </Text>
                      <CallButton phone={app.contactNumber || app.contact_number}/>
                      <Text style={styles.bodyText}>💬 {app.message}</Text>

                      {st === 'PENDING' && (
                        <View
                          style={{
                            flexDirection: 'row',
                            gap: 8,
                            marginTop: 8,
                          }}
                        >
                          <TouchableOpacity
                            style={[
                              styles.ownerBtn,
                              { borderColor: '#D9534F' },
                            ]}
                            onPress={() =>
                              handleOwnerDecision(
                                String(app.id),
                                app.applicantName || 'Applicant',
                                'decline'
                              )
                            }
                          >
                            <Text
                              style={{ color: '#D9534F', fontWeight: 'bold' }}
                            >
                              Decline
                            </Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[
                              styles.ownerBtn,
                              {
                                backgroundColor: '#16A34A',
                                borderColor: '#16A34A',
                              },
                            ]}
                            onPress={() =>
                              handleOwnerDecision(
                                String(app.id),
                                app.applicantName || 'Applicant',
                                'approve'
                              )
                            }
                          >
                            <Text
                              style={{ color: '#FFFFFF', fontWeight: 'bold' }}
                            >
                              Approve & Reserve
                            </Text>
                          </TouchableOpacity>
                        </View>
                      )}

                      {(st === 'APPROVED' || st === 'OWNER_APPROVED') && (
                        <TouchableOpacity
                          style={[
                            styles.applyBtn,
                            { backgroundColor: '#0284C7', marginTop: 10 },
                          ]}
                          onPress={() =>
                            handleOwnerConfirmTransfer(
                              String(app.id),
                              app.applicantName || 'Adopter'
                            )
                          }
                        >
                          <Text style={styles.applyBtnText}>
                            🤝 Confirm Final Handover
                          </Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  );
                })
              )}
            </View>
          )}

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Housing & Details</Text>
            <View style={styles.tagWrap}>
              {(pet.temperament || []).map((tag: string, idx: number) => (
                <View key={idx} style={styles.tagPill}>
                  <Text style={styles.tagText}>{tag}</Text>
                </View>
              ))}
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Pet Story & Description</Text>
            <Text style={styles.bodyText}>{pet.description}</Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Adopter Requirements</Text>
            <View style={styles.clearanceBanner}>
              <Text style={styles.clearanceText}>✓ {pet.healthClearance}</Text>
            </View>
          </View>

          {pet.vaccinations.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>
                Official Veterinary Records
              </Text>
              {pet.vaccinations.map((vac: any, index: number) => (
                <View key={index} style={styles.vacCard}>
                  <View style={styles.vacHeader}>
                    <Text style={styles.vacName}>{vac.vaccine}</Text>
                    <Text style={styles.vacDate}>{vac.dateAdministered}</Text>
                  </View>
                  <Text style={styles.vacVet}>
                    Recorded by: {vac.administeringVet}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </View>
      </ScrollView>

      {/* Adopt Button: Shown only for Pet Owners viewing someone else's AVAILABLE listing */}
      {!isOwnerOfListing && !isOfficer && pet.status === 'AVAILABLE' && (
        <View
          style={[
            styles.bottomBar,
            { paddingBottom: insets.bottom > 0 ? insets.bottom : 12 },
          ]}
        >
          <TouchableOpacity
            style={styles.applyBtn}
            onPress={() => setModalVisible(true)}
          >
            <Text style={styles.applyBtnText}>Apply to Adopt {pet.name}</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Modal 1: Apply to Adopt (`applyAdoption`) */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalHeading}>
              Apply to Adopt {pet.name}
            </Text>
            <Text style={styles.modalSubheading}>
              Your application goes directly to {pet.ownerDisplayName} for
              review.
            </Text>

            <Text style={styles.fieldLabel}>
              Your Contact Number (Required) *
            </Text>
            <TextInput
              style={styles.textInput}
              value={adopterContact}
              onChangeText={setAdopterContact}
              placeholder="0917 123 4567"
              keyboardType="phone-pad"
              placeholderTextColor="#94A3B8"
            />

            <Text style={styles.fieldLabel}>
              Reason for Adoption & Home Setup (Required) *
            </Text>
            <TextInput
              style={[
                styles.textInput,
                { height: 100, textAlignVertical: 'top' },
              ]}
              value={adoptionReason}
              onChangeText={setAdoptionReason}
              placeholder="Tell the owner about your experience with pets, housing type, and why you'd love to adopt..."
              placeholderTextColor="#94A3B8"
              multiline
            />

            <View style={styles.modalActionRow}>
              <TouchableOpacity
                style={styles.cancelModalBtn}
                onPress={() => setModalVisible(false)}
                disabled={isLoading}
              >
                <Text style={styles.cancelModalBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.submitModalBtn}
                onPress={handleSubmitApplication}
                disabled={isLoading}
              >
                {isLoading ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.submitModalBtnText}>
                    Submit Application
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal 2: Update Listing Photo Consent (`updateListingPhotos`) */}
      <Modal
        visible={photoModalVisible}
        animationType="fade"
        transparent
        onRequestClose={() => setPhotoModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalHeading}>Listing Photo Sharing</Text>
            <View style={styles.switchRow}>
              <Text style={styles.bodyText}>Publish Pet Photo on Listing</Text>
              <Switch
                value={publishPetPhoto}
                onValueChange={setPublishPetPhoto}
              />
            </View>
            <View style={styles.switchRow}>
              <Text style={styles.bodyText}>
                Publish My Profile Avatar on Listing
              </Text>
              <Switch
                value={publishOwnerPhoto}
                onValueChange={setPublishOwnerPhoto}
              />
            </View>
            <View style={styles.modalActionRow}>
              <TouchableOpacity
                style={styles.cancelModalBtn}
                onPress={() => setPhotoModalVisible(false)}
              >
                <Text style={styles.cancelModalBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.submitModalBtn}
                onPress={handleUpdateListingPhotos}
                disabled={isUpdatingPhotos}
              >
                {isUpdatingPhotos ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.submitModalBtnText}>Save Preferences</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const baseStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  scrollContent: { backgroundColor: '#F8FAFC' },
  petImage: { width: '100%', height: 240 },
  cardContent: { padding: 16 },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  petName: { fontSize: 22, fontWeight: 'bold', color: '#1E293B' },
  petSubtitle: { fontSize: 13, color: '#64748B', marginTop: 2 },
  ownerSubText: {
    fontSize: 12,
    color: '#0284C7',
    fontWeight: '600',
    marginTop: 4,
  },
  statusBadge: {
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  statusText: { color: '#166534', fontSize: 11, fontWeight: 'bold' },
  tokenBox: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#E0F2FE',
    padding: 10,
    borderRadius: 8,
    marginVertical: 12,
  },
  tokenLabel: { fontSize: 12, fontWeight: '600', color: '#0369A1' },
  tokenValue: { fontSize: 12, fontWeight: 'bold', color: '#0284C7' },
  ownerControlCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#BAE6FD',
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
  },
  ownerBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#0284C7',
    paddingVertical: 9,
    borderRadius: 8,
    alignItems: 'center',
  },
  ownerBtnText: { color: '#0284C7', fontSize: 12, fontWeight: 'bold' },
  section: { marginBottom: 16 },
  sectionTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#1E293B',
    marginBottom: 8,
  },
  tagWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tagPill: {
    backgroundColor: '#EEF2F6',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
  },
  tagText: { fontSize: 12, fontWeight: '600', color: '#475569' },
  bodyText: { fontSize: 13, color: '#334155', lineHeight: 19 },
  clearanceBanner: {
    backgroundColor: '#F0FDF4',
    borderLeftWidth: 3,
    borderLeftColor: '#22C55E',
    padding: 10,
    borderRadius: 4,
  },
  clearanceText: { color: '#15803D', fontSize: 13, fontWeight: '600' },
  vacCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    padding: 10,
    marginBottom: 8,
  },
  vacHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  vacName: { fontSize: 13, fontWeight: 'bold', color: '#1E293B' },
  vacDate: { fontSize: 11, color: '#0284C7', fontWeight: 'bold' },
  vacVet: { fontSize: 11, color: '#94A3B8' },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  applyBtn: {
    backgroundColor: '#00AEEF',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  applyBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: 'bold' },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
  },
  modalHeading: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1E293B',
    marginBottom: 4,
  },
  modalSubheading: { fontSize: 12, color: '#64748B', marginBottom: 12 },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
    marginTop: 10,
    marginBottom: 6,
  },
  textInput: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#1E293B',
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  modalActionRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
    marginBottom: 10,
  },
  cancelModalBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    alignItems: 'center',
  },
  cancelModalBtnText: { color: '#64748B', fontSize: 13, fontWeight: '600' },
  submitModalBtn: {
    flex: 1.5,
    backgroundColor: '#00AEEF',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  submitModalBtnText: { color: '#FFFFFF', fontSize: 13, fontWeight: 'bold' },
});