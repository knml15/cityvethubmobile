import { useAppPalette, useThemedStyles } from '../../theme';
import AdoptionMatchesPanel from './AdoptionMatchesPanel';
import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Image,
  TouchableOpacity,
  TextInput,
  RefreshControl,
  Modal,
  ScrollView,
  Switch,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { Query } from 'react-native-appwrite';
import { useAdoptionStore, useAuthStore } from '../../store/index';
import {
  databases,
  APPWRITE_DATABASE_ID,
  TABLES,
} from '../../api/client';
import { ILIGAN_BARANGAYS } from '../../store/types/constants';
import { PetProfileRow } from '../../store/types/pets';

export default function AdoptionFeed() {  
  const styles = useThemedStyles(baseStyles);
  const colors = useAppPalette();
  const navigation = useNavigation<any>();
  const { user } = useAuthStore();
  const { availablePets, fetchAvailablePets, listOwnPet, isLoading } =
    useAdoptionStore();

  const [refreshing, setRefreshing] = useState(false);
  const [matchesVisible,setMatchesVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [speciesFilter, setSpeciesFilter] = useState<'All' | 'Dog' | 'Cat'>(
    'All'
  );
  const [housingFilter, setHousingFilter] = useState<
    'all' | 'any' | 'apartment' | 'house' | 'yard'
  >('all');
  const [barangayFilter, setBarangayFilter] = useState<string>('All');

  // Create Listing Modal State (Owner Only)
  const [isListModalVisible, setIsListModalVisible] = useState(false);
  const [unlistedPets, setUnlistedPets] = useState<PetProfileRow[]>([]);
  const [selectedPetProfileId, setSelectedPetProfileId] = useState<string>('');
  const [listingTitle, setListingTitle] = useState('');
  const [listingDescription, setListingDescription] = useState('');
  const [listingRequirements, setListingRequirements] = useState(
    'Safe indoor/outdoor space and commitment to regular veterinary care.'
  );
  const [listingHousing, setListingHousing] = useState<
    'any' | 'apartment' | 'house' | 'yard'
  >('any');
  const [publishPetPhoto, setPublishPetPhoto] = useState(true);
  const [showOwnerName, setShowOwnerName] = useState(true);
  const [publishOwnerPhoto, setPublishOwnerPhoto] = useState(false);

  const loadUnlistedOwnedPets = useCallback(async () => {
    if (!user?.id || user.contractRole === 'officer') return;
    try {
      const ownedRes = await databases.listDocuments(
        APPWRITE_DATABASE_ID,
        TABLES.PET_PROFILES,
        [Query.equal('ownerId', String(user.id)), Query.limit(100)]
      );
      const allOwned = ownedRes.documents as unknown as PetProfileRow[];

      // Exclude pets that already have an active non-adopted listing
      const listedIds = new Set(
        availablePets
          .filter(
            (l) =>
              l.isActive !== false &&
              String(l.status || '').toUpperCase() !== 'ADOPTED'
          )
          .map((l) => String(l.petProfileId || l.petId))
      );

      const eligible = allOwned.filter((p) => !listedIds.has(p.$id));
      setUnlistedPets(eligible);
      if (eligible.length > 0) {
        setSelectedPetProfileId(eligible[0].$id);
        setListingTitle(`Adopt ${eligible[0].petName} (${eligible[0].breed})`);
      } else {
        setSelectedPetProfileId('');
      }
    } catch {
      setUnlistedPets([]);
    }
  }, [user, availablePets]);

  useFocusEffect(
    useCallback(() => {
      fetchAvailablePets();
    }, [fetchAvailablePets])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchAvailablePets();
    setRefreshing(false);
  };

  // Contract Section 08.E: Filter by species, housing, and barangay (NO activityLevel filter)
  const filteredPets = availablePets.filter((item) => {
    const pet = item.registered_pet;
    if (!pet) return false;

    const matchesSearch =
      (pet.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (pet.breed || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (item.title || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (pet.barangay || '').toLowerCase().includes(searchQuery.toLowerCase());

    const matchesSpecies =
      speciesFilter === 'All' ||
      (pet.species || '').toLowerCase() === speciesFilter.toLowerCase();

    const itemHousing = String(item.housingRequirement || 'any').toLowerCase();
    const matchesHousing =
      housingFilter === 'all' || itemHousing === housingFilter;

    const matchesBarangay =
      barangayFilter === 'All' || pet.barangay === barangayFilter;

    return (
      matchesSearch && matchesSpecies && matchesHousing && matchesBarangay
    );
  });

  const handleOpenCreateListing = async () => {
    await loadUnlistedOwnedPets();
    setIsListModalVisible(true);
  };

  const handleCreateListing = async () => {
    if (!selectedPetProfileId) {
      Alert.alert(
        'No Unlisted Pet Available',
        'Please add a pet in your Profile > My Pets tab first, or select a pet that is not already listed.'
      );
      return;
    }
    if (!listingTitle.trim() || !listingDescription.trim()) {
      Alert.alert(
        'Missing Fields',
        'Please provide a listing title and description.'
      );
      return;
    }

    try {
      await listOwnPet({
        petProfileId: selectedPetProfileId,
        title: listingTitle.trim(),
        description: listingDescription.trim(),
        requirements: listingRequirements.trim(),
        housingRequirement: listingHousing,
        publishPetPhoto,
        showOwnerName,
        publishOwnerPhoto,
      });
      setIsListModalVisible(false);
      setListingDescription('');
      Alert.alert(
        'Listed successfully',
        'Your pet is now visible on the Adoption Feed.'
      );
    } catch (error: any) {
      Alert.alert(
        'Could Not List Pet',
        error?.message ||
          'Failed to publish listing. Check that your pet has a photo if photo sharing is enabled.'
      );
    }
  };

  /** One listing-opening path for both feed cards and private match alerts. */
  const openPetDetail = (item: any) => {
    const pet = item.registered_pet;
    if (!pet) {
      Alert.alert('Listing unavailable', 'This adoption listing is no longer accessible.');
      return;
    }
    const isMyListing = Boolean(user?.id && String(item.postedById) === String(user.id));
    const housingTag = item.housingRequirement === 'apartment' ? '🏢 Apartment Friendly'
      : item.housingRequirement === 'house' ? '🏠 House Required'
      : item.housingRequirement === 'yard' ? '🌳 Yard Required' : '🏡 Any Housing';
    navigation.navigate('PetDetail', {
            pet: {
              id: String(item.id),
              listingId: String(item.listingId || item.id),
              petId: String(item.petId || pet.id),
              petProfileId: String(item.petProfileId || item.petId || pet.id),
              postedById: item.postedById,
              ownerDisplayName: item.ownerDisplayName || 'Pet Owner',
              ownerAvatarUrl: item.ownerAvatarUrl,
              verificationStatus: item.verificationStatus,
              housingRequirement: item.housingRequirement || 'any',
              isActive: item.isActive,
              title: item.title || pet.name,
              name: pet.name,
              species: pet.species === 'CAT' ? 'Cat' : 'Dog',
              breed: pet.breed,
              age:
                pet.ageYears !== undefined
                  ? `${pet.ageYears} yr(s)`
                  : '1 yr(s)',
              gender: pet.gender === 'FEMALE' ? 'Female' : 'Male',
              barangay: pet.barangay,
              controlNumber: pet.registration_number,
              status: item.status || 'AVAILABLE',
              photoUrl: pet.photo,
              description: item.adoption_reason,
              healthClearance: item.requirements,
              temperament: [housingTag],
              vaccinations: (pet.vaccinations || []).map((v: any) => ({
                vaccine: v.vaccine_name || 'Vaccination',
                dateAdministered: v.administered_date || 'Recorded',
                administeringVet: v.administered_by || 'CVO Officer',
              })),
            },
            isOwned: isMyListing,
          });
  };

  const renderPetItem = ({ item }: { item: any }) => {
    const pet = item.registered_pet;
    const isMyListing = Boolean(
      user?.id && String(item.postedById) === String(user.id)
    );
    const housingTag =
      item.housingRequirement === 'apartment'
        ? '🏢 Apartment Friendly'
        : item.housingRequirement === 'house'
        ? '🏠 House Required'
        : item.housingRequirement === 'yard'
        ? '🌳 Yard Required'
        : '🏡 Any Housing';

    return (
      <TouchableOpacity
        style={styles.petCard}
        activeOpacity={0.85}
        onPress={() => openPetDetail(item)}
      >
        <Image
          source={{ uri: pet.photo }}
          style={styles.petImage}
          resizeMode="cover"
        />

        <View style={styles.cardInfo}>
          <View style={styles.cardHeaderRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.petName}>{item.title || pet.name}</Text>
              <Text style={styles.petBreed}>
                {pet.breed} • {pet.species === 'CAT' ? 'Cat' : 'Dog'} • Brgy.{' '}
                {pet.barangay}
              </Text>
            </View>
            <View
              style={[
                styles.statusBadge,
                String(item.status).toUpperCase() === 'RESERVED' && {
                  backgroundColor: '#FEF3C7',
                },
              ]}
            >
              <Text
                style={[
                  styles.statusBadgeText,
                  String(item.status).toUpperCase() === 'RESERVED' && {
                    color: '#B45309',
                  },
                ]}
              >
                {item.status || 'AVAILABLE'}
              </Text>
            </View>
          </View>

          {/* Owner & Verification Row */}
          <View style={styles.ownerMetaRow}>
            {item.ownerAvatarUrl ? (
              <Image
                source={{ uri: item.ownerAvatarUrl }}
                style={styles.ownerAvatarSmall}
              />
            ) : (
              <View style={styles.ownerAvatarPlaceholder}>
                <Text style={styles.ownerAvatarInitial}>
                  {(item.ownerDisplayName || 'P')[0]}
                </Text>
              </View>
            )}
            <Text style={styles.ownerNameText}>
              Posted by {isMyListing ? 'You' : item.ownerDisplayName}
            </Text>
            {item.verificationStatus === 'verified' && (
              <View style={styles.verifiedPetPill}>
                <Text style={styles.verifiedPetPillText}>✓ CVO Verified</Text>
              </View>
            )}
          </View>

          {/* Housing & Barangay Pills */}
          <View style={styles.tagRow}>
            <View style={styles.traitPill}>
              <Text style={styles.traitText}>{housingTag}</Text>
            </View>
            {isMyListing && (
              <View
                style={[
                  styles.traitPill,
                  { backgroundColor: '#DCFCE7', borderColor: '#86EFAC' },
                ]}
              >
                <Text style={[styles.traitText, { color: '#166534' }]}>
                  My Listing (Tap to Manage)
                </Text>
              </View>
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      {user?.contractRole !== 'officer' && (
        <>
          <TouchableOpacity
            accessibilityRole="button"
            onPress={() => setMatchesVisible(true)}
            activeOpacity={0.8}
            style={styles.matchingPreferencesCard}
          >
            <View style={styles.matchingIconBadge}>
              <Text style={{ fontSize: 18 }}>🎯</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.matchingCardTitle}>
                Pet Matching Preferences
              </Text>
              <Text style={styles.matchingCardSub}>
                Set species, breed & age criteria for instant alerts
              </Text>
            </View>
            <Text style={styles.matchingChevron}>›</Text>
          </TouchableOpacity>
          <AdoptionMatchesPanel
            visible={matchesVisible}
            onClose={() => setMatchesVisible(false)}
            onOpenListing={async (listingId) => {
              setMatchesVisible(false);
              let match = availablePets.find(
                (item) => String(item.listingId || item.id) === listingId
              );
              if (!match) {
                await fetchAvailablePets();
                match = useAdoptionStore
                  .getState()
                  .availablePets.find(
                    (item) => String(item.listingId || item.id) === listingId
                  );
              }
              if (!match) {
                Alert.alert(
                  'Listing unavailable',
                  'This pet listing is no longer active, or you need to refresh the adoption feed.'
                );
                return;
              }
              openPetDetail(match);
            }}
          />
        </>
      )}
      {/* Top Search & "+ List My Pet" Button */}
      <View style={styles.searchRow}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search by pet name, breed, or barangay..."
          placeholderTextColor="#94A3B8"
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        {user?.contractRole !== 'officer' && (
          <TouchableOpacity
            style={styles.listPetBtn}
            onPress={handleOpenCreateListing}
          >
            <Text style={styles.listPetBtnText}>+ List Pet</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Filter 1: Species Selector */}
      <View style={styles.speciesRow}>
        {(['All', 'Dog', 'Cat'] as const).map((sp) => (
          <TouchableOpacity
            key={sp}
            style={[
              styles.speciesBtn,
              speciesFilter === sp && styles.speciesBtnActive,
            ]}
            onPress={() => setSpeciesFilter(sp)}
          >
            <Text
              style={[
                styles.speciesBtnText,
                speciesFilter === sp && styles.speciesBtnTextActive,
              ]}
            >
              {sp === 'All'
                ? '🐾 All Species'
                : sp === 'Dog'
                ? '🐶 Dogs'
                : '🐱 Cats'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Filter 2: Housing Requirement & Barangay Filter */}
      <View style={styles.filterSection}>
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={
            [
              { key: 'all', label: 'All Housing' },
              { key: 'any', label: 'Any Home' },
              { key: 'apartment', label: 'Apartment' },
              { key: 'house', label: 'House' },
              { key: 'yard', label: 'Yard Required' },
            ] as const
          }
          keyExtractor={(item) => item.key}
          contentContainerStyle={styles.filterList}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[
                styles.filterPill,
                housingFilter === item.key && styles.filterPillActive,
              ]}
              onPress={() => setHousingFilter(item.key)}
            >
              <Text
                style={[
                  styles.filterPillText,
                  housingFilter === item.key && styles.filterPillTextActive,
                ]}
              >
                {item.label}
              </Text>
            </TouchableOpacity>
          )}
        />

        <View style={styles.brgyFilterWrap}>
          <Picker
            selectedValue={barangayFilter}
            onValueChange={(v) => setBarangayFilter(String(v))}
            style={{ color: colors.text, width: '100%' }}
            dropdownIconColor={colors.text}
          >
            <Picker.Item label="📍 All 44 Iligan Barangays" value="All" />
            {ILIGAN_BARANGAYS.map((b) => (
              <Picker.Item key={b} label={`Brgy. ${b}`} value={b} />
            ))}
          </Picker>
        </View>
      </View>

      {/* Adoption Cards */}
      <FlatList
        data={filteredPets}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderPetItem}
        contentContainerStyle={styles.feedList}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={['#00AEEF']}
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyTitle}>No Matching Adoption Listings</Text>
            <Text style={styles.emptySubtitle}>
              Pull down to refresh or adjust your Species, Housing, or Barangay
              filters.
            </Text>
          </View>
        }
      />

      {/* Modal: List Owned Pet for Adoption (`listOwnPetForAdoption`) */}
      <Modal
        visible={isListModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setIsListModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.modalTitle}>List Owned Pet for Adoption</Text>
              <Text style={styles.modalSub}>
                Select one of your unlisted pets from your inventory.
              </Text>

              <Text style={styles.fieldLabel}>Select Owned Pet *</Text>
              {unlistedPets.length === 0 ? (
                <Text style={{ color: '#D9534F', fontSize: 12 }}>
                  All of your pets are already listed, or you have not added a
                  pet in Profile &gt; My Pets yet.
                </Text>
              ) : (
                <View style={styles.pickerBox}>
                  <Picker
                    selectedValue={selectedPetProfileId}
                    style={{ color: colors.text, width: '100%' }}
                    dropdownIconColor={colors.text}
                    onValueChange={(val) => {
                      setSelectedPetProfileId(String(val));
                      const found = unlistedPets.find((p) => p.$id === val);
                      if (found) {
                        setListingTitle(
                          `Adopt ${found.petName} (${found.breed})`
                        );
                      }
                    }}
                  >
                    {unlistedPets.map((p) => (
                      <Picker.Item
                        key={p.$id}
                        label={`${p.petName} (${p.species} • ${p.breed})`}
                        value={p.$id}
                      />
                    ))}
                  </Picker>
                </View>
              )}

              <Text style={styles.fieldLabel}>Listing Headline *</Text>
              <TextInput
                style={styles.textInput}
                value={listingTitle}
                onChangeText={setListingTitle}
                placeholder="e.g. Sweet Aspin Puppy Looking for Home"
              />

              <Text style={styles.fieldLabel}>Description / Pet Story *</Text>
              <TextInput
                style={[styles.textInput, { height: 75 }]}
                value={listingDescription}
                onChangeText={setListingDescription}
                placeholder="Share personality, habits, and reason for rehoming..."
                multiline
              />

              <Text style={styles.fieldLabel}>Adopter Requirements</Text>
              <TextInput
                style={styles.textInput}
                value={listingRequirements}
                onChangeText={setListingRequirements}
              />

              <Text style={styles.fieldLabel}>Housing Requirement</Text>
              <View style={styles.pickerBox}>
                <Picker
                  selectedValue={listingHousing}
                  onValueChange={(v) => setListingHousing(v as any)}
                  style={{ color: colors.text, width: '100%' }}
                  dropdownIconColor={colors.text}
                >
                  <Picker.Item label="Any Suitable Home" value="any" />
                  <Picker.Item label="Apartment Friendly" value="apartment" />
                  <Picker.Item label="House Required" value="house" />
                  <Picker.Item label="Fenced Yard Required" value="yard" />
                </Picker>
              </View>

              <Text style={styles.fieldLabel}>Photo & Identity Consent</Text>
              <View style={styles.switchRow}>
                <Text style={styles.switchLabel}>Publish Pet Photo</Text>
                <Switch
                  value={publishPetPhoto}
                  onValueChange={setPublishPetPhoto}
                />
              </View>
              <View style={styles.switchRow}>
                <Text style={styles.switchLabel}>Show My Name on Listing</Text>
                <Switch
                  value={showOwnerName}
                  onValueChange={setShowOwnerName}
                />
              </View>
              <View style={styles.switchRow}>
                <Text style={styles.switchLabel}>
                  Publish My Avatar on Listing
                </Text>
                <Switch
                  value={publishOwnerPhoto}
                  onValueChange={setPublishOwnerPhoto}
                />
              </View>

              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={styles.cancelBtn}
                  onPress={() => setIsListModalVisible(false)}
                >
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.submitBtn}
                  onPress={handleCreateListing}
                  disabled={isLoading || unlistedPets.length === 0}
                >
                  {isLoading ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <Text style={styles.submitBtnText}>Publish Listing</Text>
                  )}
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const baseStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  matchingPreferencesCard: {
    marginHorizontal: 15,
    marginTop: 10,
    marginBottom: 8,
    padding: 12,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  matchingIconBadge: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#EFF6FF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  matchingCardTitle: {
    color: '#0F172A',
    fontSize: 14,
    fontWeight: '700',
  },
  matchingCardSub: {
    color: '#64748B',
    fontSize: 11,
    marginTop: 2,
  },
  matchingChevron: {
    fontSize: 22,
    color: '#94A3B8',
    fontWeight: '600',
    paddingRight: 4,
  },
  searchRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 6,
    backgroundColor: '#FFFFFF',
    gap: 8,
    alignItems: 'center',
  },
  searchInput: {
    flex: 1,
    backgroundColor: '#F1F5F9',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 13,
    color: '#1E293B',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  listPetBtn: {
    backgroundColor: '#16A34A',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
  },
  listPetBtnText: { color: '#FFFFFF', fontSize: 12, fontWeight: 'bold' },
  speciesRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#FFFFFF',
    gap: 8,
  },
  speciesBtn: {
    flex: 1,
    paddingVertical: 6,
    borderRadius: 6,
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  speciesBtnActive: { backgroundColor: '#00AEEF', borderColor: '#00AEEF' },
  speciesBtnText: { fontSize: 12, fontWeight: '600', color: '#64748B' },
  speciesBtnTextActive: { color: '#FFFFFF', fontWeight: 'bold' },
  filterSection: {
    backgroundColor: '#FFFFFF',
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderColor: '#E2E8F0',
  },
  filterList: { paddingHorizontal: 16, gap: 8, marginBottom: 6 },
  filterPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  filterPillActive: { backgroundColor: '#00AEEF', borderColor: '#00AEEF' },
  filterPillText: { fontSize: 11, fontWeight: '600', color: '#475569' },
  filterPillTextActive: { color: '#FFFFFF', fontWeight: 'bold' },
  brgyFilterWrap: {
    marginHorizontal: 16,
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    height: 44,
    justifyContent: 'center',
  },
  feedList: { padding: 16, paddingBottom: 32 },
  petCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
    elevation: 2,
  },
  petImage: { width: '100%', height: 185 },
  cardInfo: { padding: 14 },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  petName: { fontSize: 17, fontWeight: 'bold', color: '#1E293B' },
  petBreed: { fontSize: 12, color: '#64748B', marginTop: 2 },
  statusBadge: {
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusBadgeText: { color: '#166534', fontSize: 10, fontWeight: 'bold' },
  ownerMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginVertical: 8,
  },
  ownerAvatarSmall: { width: 22, height: 22, borderRadius: 11 },
  ownerAvatarPlaceholder: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#0284C7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ownerAvatarInitial: { color: '#FFFFFF', fontSize: 11, fontWeight: 'bold' },
  ownerNameText: { fontSize: 12, color: '#475569', fontWeight: '600' },
  verifiedPetPill: {
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  verifiedPetPillText: { fontSize: 10, fontWeight: 'bold', color: '#166534' },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  traitPill: {
    backgroundColor: '#F0F9FF',
    borderWidth: 1,
    borderColor: '#BAE6FD',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  traitText: { color: '#0284C7', fontSize: 11, fontWeight: '600' },
  emptyContainer: { alignItems: 'center', paddingVertical: 48 },
  emptyTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#334155',
    marginBottom: 4,
  },
  emptySubtitle: { fontSize: 13, color: '#94A3B8', textAlign: 'center' },
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
    maxHeight: '90%',
  },
  modalTitle: { fontSize: 18, fontWeight: 'bold', color: '#1E293B' },
  modalSub: { fontSize: 12, color: '#64748B', marginBottom: 12 },
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
  pickerBox: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    height: 50,
    justifyContent: 'center',
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  switchLabel: { fontSize: 12, color: '#334155', flex: 1 },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 18,
    marginBottom: 10,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    alignItems: 'center',
  },
  cancelBtnText: { color: '#64748B', fontWeight: '600' },
  submitBtn: {
    flex: 1.5,
    backgroundColor: '#00AEEF',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  submitBtnText: { color: '#FFFFFF', fontWeight: 'bold' },
});