import { useAppPalette, useThemedStyles } from '../../theme';
import AdoptionMatchesPanel from './AdoptionMatchesPanel';
import React, { useEffect, useState, useCallback } from 'react';
import { useLiveSync } from '../../utils/useLiveSync';
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
  KeyboardAvoidingView,
  Keyboard,
  Platform,
  TouchableWithoutFeedback,
} from 'react-native';
import { Picker } from '../../components/BreedPicker';
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
  const [isBrgyModalVisible, setIsBrgyModalVisible] = useState(false);
  const [brgySearchQuery, setBrgySearchQuery] = useState('');

  // Create Listing Modal State (Owner Only)
  const [isListModalVisible, setIsListModalVisible] = useState(false);
  const [isSubmittingListing, setIsSubmittingListing] = useState(false);
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

  useLiveSync(() => fetchAvailablePets(true), {
    enabled: !isListModalVisible && !matchesVisible && !isBrgyModalVisible,
  });

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchAvailablePets();
    setRefreshing(false);
  };

  const filteredBarangays = ILIGAN_BARANGAYS.filter((b) =>
    b.toLowerCase().includes(brgySearchQuery.trim().toLowerCase())
  );

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

  const hasActiveFilter =
    searchQuery.trim() !== '' ||
    speciesFilter !== 'All' ||
    housingFilter !== 'all' ||
    barangayFilter !== 'All';

  const handleOpenCreateListing = async () => {
    await loadUnlistedOwnedPets();
    setIsListModalVisible(true);
  };

  const handleCreateListing = async () => {
    if (isSubmittingListing) return;

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
      setIsSubmittingListing(true);
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
    } finally {
      setIsSubmittingListing(false);
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

    const statusUpper = String(item.status || '').toUpperCase();
    const isReserved = statusUpper === 'RESERVED';
    const isAdopted = statusUpper === 'ADOPTED';

    return (
      <TouchableOpacity
        style={styles.petCard}
        activeOpacity={0.88}
        onPress={() => openPetDetail(item)}
      >
        <View style={styles.imageContainer}>
          <Image
            source={{ uri: pet.photo }}
            style={styles.petImage}
            resizeMode="cover"
          />
          {/* Top Scrim Overlay for Badge Contrast on Light Photos */}
          <View style={styles.imageTopScrim} pointerEvents="none" />

          {/* Floating CVO Verified Badge (Top Left) */}
          {item.verificationStatus === 'verified' && (
            <View style={styles.floatingVerifiedBadge}>
              <Text style={styles.floatingVerifiedText}>✓ Verified</Text>
            </View>
          )}

          {/* Floating Status Badge (Top Right) */}
          <View
            style={[
              styles.floatingStatusBadge,
              isReserved
                ? styles.statusReserved
                : isAdopted
                ? styles.statusAdopted
                : styles.statusAvailable,
            ]}
          >
            <Text
              style={[
                styles.floatingStatusText,
                isReserved
                  ? styles.statusReservedText
                  : isAdopted
                  ? styles.statusAdoptedText
                  : styles.statusAvailableText,
              ]}
            >
              {item.status || 'AVAILABLE'}
            </Text>
          </View>
        </View>

        <View style={styles.cardInfo}>
          <View style={styles.cardHeaderRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.petName} numberOfLines={2}>
                {item.title || pet.name}
              </Text>
              <Text style={styles.petBreed}>
                {pet.breed} • {pet.species === 'CAT' ? 'Cat' : 'Dog'} • Brgy.{' '}
                {pet.barangay}
              </Text>
            </View>
          </View>

          {/* Owner & Meta Row */}
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
            <Text style={styles.ownerNameText} numberOfLines={1}>
              Posted by <Text style={{ fontWeight: '700' }}>{isMyListing ? 'You' : item.ownerDisplayName || 'Pet Owner'}</Text>
            </Text>
          </View>

          {/* Housing, Sex & Age Pills */}
          <View style={styles.tagRow}>
            <View style={styles.traitPill}>
              <Text style={styles.traitText}>{housingTag}</Text>
            </View>
            <View style={styles.metaTraitPill}>
              <Text style={styles.metaTraitText}>
                {pet.gender === 'FEMALE' ? '♀ Female' : '♂ Male'}
              </Text>
            </View>
            <View style={styles.metaTraitPill}>
              <Text style={styles.metaTraitText}>
                {pet.ageYears !== undefined ? `${pet.ageYears} yr(s)` : '1 yr'}
              </Text>
            </View>
            {isMyListing && (
              <View style={styles.myListingPill}>
                <Text style={styles.myListingText}>
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
              <Text style={{ fontSize: 15 }}>🎯</Text>
            </View>
            <View style={styles.matchingTextWrap}>
              <Text style={styles.matchingCardTitle}>
                Pet Matching Preferences
              </Text>
              <Text style={styles.matchingCardSub} numberOfLines={1}>
                • Instant alerts for matching breeds
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

      {/* Unified Search & Multi-Filter Control Panel */}
      <View style={styles.headerControlPanel}>
        {/* Row 1: Search & "+ List Pet" Action */}
        <View style={styles.searchRow}>
          <View style={styles.searchInputWrap}>
            <TextInput
              style={styles.searchInput}
              placeholder="Search by pet name, breed, or barangay..."
              placeholderTextColor="#94A3B8"
              value={searchQuery}
              onChangeText={setSearchQuery}
              returnKeyType="search"
            />
            {searchQuery.trim().length > 0 && (
              <TouchableOpacity
                style={styles.clearSearchBtn}
                onPress={() => setSearchQuery('')}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityRole="button"
                accessibilityLabel="Clear search input"
              >
                <Text style={styles.clearSearchText}>✕</Text>
              </TouchableOpacity>
            )}
          </View>
          {user?.contractRole !== 'officer' && (
            <TouchableOpacity
              style={styles.listPetBtn}
              onPress={handleOpenCreateListing}
            >
              <Text style={styles.listPetBtnText}>+ List Pet</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Row 2: Compact Species Segment */}
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

        {/* Row 3: Secondary Criteria Strip (Housing Pills + Compact Brgy Dropdown) */}
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

          {/* Modern Barangay Selector Trigger */}
          <TouchableOpacity
            style={styles.brgyPillBtn}
            onPress={() => setIsBrgyModalVisible(true)}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Filter by barangay"
          >
            <View style={styles.brgyPillLeft}>
              <Text style={styles.brgyPillIcon}>📍</Text>
              <Text style={styles.brgyPillText} numberOfLines={1}>
                {barangayFilter === 'All'
                  ? 'All 44 Iligan Barangays'
                  : `Brgy. ${barangayFilter}`}
              </Text>
            </View>
            <View style={styles.brgyPillRight}>
              {barangayFilter !== 'All' && (
                <TouchableOpacity
                  onPress={(e) => {
                    e.stopPropagation();
                    setBarangayFilter('All');
                  }}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  accessibilityRole="button"
                  accessibilityLabel="Clear barangay filter"
                >
                  <Text style={styles.brgyClearText}>Clear</Text>
                </TouchableOpacity>
              )}
              <Text style={styles.brgyPillChevron}>▾</Text>
            </View>
          </TouchableOpacity>
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
            <View style={styles.emptyBadge}>
              <Text style={{ fontSize: 24 }}>🐾</Text>
            </View>
            <Text style={styles.emptyTitle}>No Matching Adoption Listings</Text>
            <Text style={styles.emptySubtitle}>
              {hasActiveFilter
                ? 'No pets match your selected search or filter criteria. Try resetting them.'
                : 'Pull down to refresh or check back later for new pets.'}
            </Text>
            {hasActiveFilter && (
              <TouchableOpacity
                style={styles.resetFilterBtn}
                onPress={() => {
                  setSearchQuery('');
                  setSpeciesFilter('All');
                  setHousingFilter('all');
                  setBarangayFilter('All');
                }}
              >
                <Text style={styles.resetFilterText}>🔄 Reset All Filters</Text>
              </TouchableOpacity>
            )}
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
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View style={styles.modalOverlay}>
            <KeyboardAvoidingView
              behavior={Platform.OS === 'ios' ? 'padding' : undefined}
              style={styles.keyboardAvoidWrap}
            >
              <TouchableWithoutFeedback onPress={(e) => e.stopPropagation()}>
                <View style={styles.modalCard}>
                  <ScrollView
                    showsVerticalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                  >
                <Text style={styles.modalTitle}>List Owned Pet for Adoption</Text>
                <Text style={styles.modalSub}>
                  Select one of your unlisted pets from your inventory.
                </Text>

                <Text style={styles.fieldLabel}>Select Owned Pet *</Text>
                {unlistedPets.length === 0 ? (
                  <View style={styles.noUnlistedCard}>
                    <Text style={styles.noUnlistedText}>
                      All of your pets are already listed, or you have not added a
                      pet in Profile &gt; My Pets yet.
                    </Text>
                    <TouchableOpacity
                      style={styles.addPetShortcutBtn}
                      onPress={() => {
                        setIsListModalVisible(false);
                        navigation.navigate('UserProfile', { tab: 'pets' });
                      }}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.addPetShortcutText}>
                        + Add Pet in Profile &gt; My Pets
                      </Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <View style={styles.pickerBox}>
                    <Picker
                      title="Select Owned Pet"
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
                    title="Select Housing Requirement"
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
                    style={[
                      styles.submitBtn,
                      (isLoading || isSubmittingListing || unlistedPets.length === 0) && {
                        opacity: 0.6,
                      },
                    ]}
                    onPress={handleCreateListing}
                    disabled={isLoading || isSubmittingListing || unlistedPets.length === 0}
                  >
                    {isLoading || isSubmittingListing ? (
                      <ActivityIndicator color="#FFFFFF" />
                    ) : (
                      <Text style={styles.submitBtnText}>Publish Listing</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </ScrollView>
            </View>
          </TouchableWithoutFeedback>
        </KeyboardAvoidingView>
      </View>
    </TouchableWithoutFeedback>
  </Modal>

      {/* Modern Filter Sheet: Barangay Selector */}
      <Modal
        visible={isBrgyModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => {
          setIsBrgyModalVisible(false);
          setBrgySearchQuery('');
        }}
      >
        <TouchableWithoutFeedback
          onPress={() => {
            setIsBrgyModalVisible(false);
            setBrgySearchQuery('');
          }}
        >
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback onPress={(e) => e.stopPropagation()}>
              <View style={styles.brgySheetCard}>
                <View style={styles.brgySheetHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.brgySheetTitle}>Select Barangay</Text>
                    <Text style={styles.brgySheetSub}>
                      Filter adoption listings across Iligan City
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={styles.brgySheetCloseBtn}
                    onPress={() => {
                      setIsBrgyModalVisible(false);
                      setBrgySearchQuery('');
                    }}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    accessibilityRole="button"
                    accessibilityLabel="Close barangay filter"
                  >
                    <Text style={styles.brgySheetCloseText}>✕</Text>
                  </TouchableOpacity>
                </View>

                {/* Barangay Search Bar */}
                <View style={styles.brgySearchWrap}>
                  <TextInput
                    style={styles.brgySearchInput}
                    placeholder="Search barangay (e.g. Tubod, Pala-o)..."
                    placeholderTextColor="#94A3B8"
                    value={brgySearchQuery}
                    onChangeText={setBrgySearchQuery}
                    autoCapitalize="words"
                    clearButtonMode="while-editing"
                  />
                  {brgySearchQuery.length > 0 && (
                    <TouchableOpacity
                      style={styles.brgySearchClearBtn}
                      onPress={() => setBrgySearchQuery('')}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      accessibilityRole="button"
                      accessibilityLabel="Clear barangay search"
                    >
                      <Text style={styles.brgySearchClearText}>✕</Text>
                    </TouchableOpacity>
                  )}
                </View>

                {/* Barangay List */}
                <FlatList
                  data={filteredBarangays}
                  keyExtractor={(item) => item}
                  showsVerticalScrollIndicator={true}
                  keyboardShouldPersistTaps="handled"
                  style={styles.brgyList}
                  ListHeaderComponent={
                    !brgySearchQuery.trim() ? (
                      <TouchableOpacity
                        style={[
                          styles.brgyItemRow,
                          barangayFilter === 'All' && styles.brgyItemRowActive,
                        ]}
                        onPress={() => {
                          setBarangayFilter('All');
                          setIsBrgyModalVisible(false);
                          setBrgySearchQuery('');
                        }}
                      >
                        <Text
                          style={[
                            styles.brgyItemText,
                            barangayFilter === 'All' && styles.brgyItemTextActive,
                          ]}
                        >
                          📍 All 44 Iligan Barangays (Show All)
                        </Text>
                        {barangayFilter === 'All' && (
                          <Text style={styles.brgyCheckmark}>✓</Text>
                        )}
                      </TouchableOpacity>
                    ) : undefined
                  }
                  renderItem={({ item }) => {
                    const isSelected = barangayFilter === item;
                    return (
                      <TouchableOpacity
                        style={[
                          styles.brgyItemRow,
                          isSelected && styles.brgyItemRowActive,
                        ]}
                        onPress={() => {
                          setBarangayFilter(item);
                          setIsBrgyModalVisible(false);
                          setBrgySearchQuery('');
                        }}
                      >
                        <Text
                          style={[
                            styles.brgyItemText,
                            isSelected && styles.brgyItemTextActive,
                          ]}
                        >
                          Brgy. {item}
                        </Text>
                        {isSelected && (
                          <Text style={styles.brgyCheckmark}>✓</Text>
                        )}
                      </TouchableOpacity>
                    );
                  }}
                  ListEmptyComponent={
                    <View style={styles.brgyEmptyWrap}>
                      <Text style={styles.brgyEmptyText}>
                        No barangay found matching "{brgySearchQuery}"
                      </Text>
                    </View>
                  }
                />
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </View>
  );
}

const baseStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  matchingPreferencesCard: {
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  matchingIconBadge: {
    width: 28,
    height: 28,
    borderRadius: 7,
    backgroundColor: '#EFF6FF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  matchingTextWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  matchingCardTitle: {
    color: '#0F172A',
    fontSize: 13,
    fontWeight: '700',
  },
  matchingCardSub: {
    color: '#64748B',
    fontSize: 11,
    flex: 1,
  },
  matchingChevron: {
    fontSize: 18,
    color: '#94A3B8',
    fontWeight: '600',
    paddingRight: 2,
  },
  headerControlPanel: {
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderColor: '#E2E8F0',
    paddingBottom: 6,
  },
  searchRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 6,
    backgroundColor: '#FFFFFF',
    gap: 8,
    alignItems: 'center',
  },
  searchInputWrap: {
    flex: 1,
    position: 'relative',
    justifyContent: 'center',
  },
  searchInput: {
    width: '100%',
    height: 38,
    backgroundColor: '#F1F5F9',
    borderRadius: 8,
    paddingLeft: 12,
    paddingRight: 32,
    fontSize: 13,
    color: '#1E293B',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  clearSearchBtn: {
    position: 'absolute',
    right: 8,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  clearSearchText: {
    color: '#475569',
    fontSize: 10,
    fontWeight: '700',
  },
  listPetBtn: {
    height: 38,
    backgroundColor: '#16A34A',
    paddingHorizontal: 12,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listPetBtnText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  speciesRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 4,
    backgroundColor: '#FFFFFF',
    gap: 6,
  },
  speciesBtn: {
    flex: 1,
    paddingVertical: 6,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  speciesBtnActive: { backgroundColor: '#00AEEF', borderColor: '#00AEEF' },
  speciesBtnText: { fontSize: 12, fontWeight: '600', color: '#64748B' },
  speciesBtnTextActive: { color: '#FFFFFF', fontWeight: '700' },
  filterSection: {
    backgroundColor: '#FFFFFF',
    paddingTop: 4,
    paddingBottom: 4,
  },
  filterList: { paddingHorizontal: 16, gap: 6, marginBottom: 6 },
  filterPill: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  filterPillActive: { backgroundColor: '#00AEEF', borderColor: '#00AEEF' },
  filterPillText: { fontSize: 11, fontWeight: '600', color: '#475569' },
  filterPillTextActive: { color: '#FFFFFF', fontWeight: '700' },
  brgyPillBtn: {
    marginHorizontal: 16,
    marginBottom: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  brgyPillLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  brgyPillIcon: { fontSize: 14 },
  brgyPillText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1E293B',
    flex: 1,
  },
  brgyPillRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  brgyClearText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#00AEEF',
    paddingHorizontal: 4,
  },
  brgyPillChevron: {
    fontSize: 14,
    color: '#94A3B8',
    fontWeight: '700',
  },
  brgySheetCard: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: '82%',
    width: '100%',
  },
  brgySheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 14,
  },
  brgySheetTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1E293B',
  },
  brgySheetSub: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  brgySheetCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  brgySheetCloseText: {
    fontSize: 14,
    color: '#475569',
    fontWeight: '700',
  },
  brgySearchWrap: {
    position: 'relative',
    marginBottom: 12,
    justifyContent: 'center',
  },
  brgySearchInput: {
    height: 42,
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    paddingHorizontal: 14,
    paddingRight: 36,
    fontSize: 14,
    color: '#1E293B',
  },
  brgySearchClearBtn: {
    position: 'absolute',
    right: 10,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  brgySearchClearText: {
    fontSize: 11,
    color: '#475569',
    fontWeight: '700',
  },
  brgyList: {
    maxHeight: 400,
  },
  brgyItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 13,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderBottomWidth: 1,
    borderColor: '#F1F5F9',
  },
  brgyItemRowActive: {
    backgroundColor: '#EFF6FF',
  },
  brgyItemText: {
    fontSize: 14,
    color: '#334155',
    fontWeight: '500',
  },
  brgyItemTextActive: {
    color: '#00AEEF',
    fontWeight: '700',
  },
  brgyCheckmark: {
    fontSize: 16,
    color: '#00AEEF',
    fontWeight: '800',
  },
  brgyEmptyWrap: {
    paddingVertical: 32,
    alignItems: 'center',
  },
  brgyEmptyText: {
    fontSize: 13,
    color: '#94A3B8',
    textAlign: 'center',
  },
  feedList: { padding: 16, paddingBottom: 32 },
  petCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 8,
    elevation: 2,
  },
  imageContainer: {
    width: '100%',
    height: 195,
    position: 'relative',
    backgroundColor: '#F1F5F9',
  },
  petImage: { width: '100%', height: '100%' },
  imageTopScrim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 48,
    backgroundColor: 'rgba(15, 23, 42, 0.22)',
  },
  floatingStatusBadge: {
    position: 'absolute',
    top: 10,
    right: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.7)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.18,
    shadowRadius: 3,
    elevation: 2,
  },
  floatingStatusText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  statusAvailable: { backgroundColor: '#DCFCE7' },
  statusAvailableText: {
    color: '#166534',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  statusReserved: { backgroundColor: '#FEF3C7' },
  statusReservedText: {
    color: '#B45309',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  statusAdopted: { backgroundColor: '#E2E8F0' },
  statusAdoptedText: {
    color: '#475569',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  floatingVerifiedBadge: {
    position: 'absolute',
    top: 10,
    left: 10,
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.55)',
  },
  floatingVerifiedText: {
    color: '#38BDF8',
    fontSize: 10,
    fontWeight: '700',
  },
  cardInfo: { padding: 14 },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  petName: { fontSize: 16, fontWeight: '700', color: '#1E293B', lineHeight: 22 },
  petBreed: { fontSize: 12, color: '#64748B', marginTop: 3 },
  ownerMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
    marginBottom: 8,
  },
  ownerAvatarSmall: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  ownerAvatarPlaceholder: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#0284C7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ownerAvatarInitial: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
  ownerNameText: { fontSize: 12, color: '#475569' },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 2 },
  traitPill: {
    backgroundColor: '#F0F9FF',
    borderWidth: 1,
    borderColor: '#BAE6FD',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 6,
  },
  traitText: { color: '#0284C7', fontSize: 11, fontWeight: '600' },
  metaTraitPill: {
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  metaTraitText: {
    color: '#475569',
    fontSize: 11,
    fontWeight: '600',
  },
  myListingPill: {
    backgroundColor: '#DCFCE7',
    borderWidth: 1,
    borderColor: '#86EFAC',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 6,
  },
  myListingText: { color: '#166534', fontSize: 11, fontWeight: '700' },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 48,
    paddingHorizontal: 24,
  },
  emptyBadge: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 6,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 18,
  },
  resetFilterBtn: {
    marginTop: 14,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#EFF6FF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  resetFilterText: {
    color: '#0284C7',
    fontSize: 13,
    fontWeight: '700',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  keyboardAvoidWrap: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: '90%',
  },
  noUnlistedCard: {
    backgroundColor: '#FEF2F2',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#FECACA',
    marginTop: 4,
  },
  noUnlistedText: {
    color: '#991B1B',
    fontSize: 12,
    lineHeight: 18,
  },
  addPetShortcutBtn: {
    marginTop: 8,
    backgroundColor: '#DC2626',
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: 'center',
  },
  addPetShortcutText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
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