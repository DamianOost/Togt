import React from 'react';
import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { AppScaffold, Button, Chip, OfflineBanner, SectionHeader, Surface, TextField, TopAppBar } from '../../../ui';
import { useTogtTheme } from '../../../design';
import { CapabilityNotice, IntakeIcon, ScreenHeading } from './components';
import { translateCustomerIntake } from './copy';
import type { CustomerIntakeTranslate } from './copy';
import { isAddressResolutionDispatchSafe, updateJobAddressDetail } from './model';
import type { AddressDetails, CapabilityState, JobAddress } from './model';

export type SavedPlaceSummary = Readonly<{
  placeId: string;
  label: string;
  address: JobAddress;
}>;

export type AddressSearchSuggestion = Readonly<{
  suggestionId: string;
  primaryLabel: string;
  secondaryLabel: string;
  address: JobAddress;
}>;

export type AddressPinConfirmationScreenProps = Readonly<{
  address: JobAddress;
  addressSearchQuery: string;
  addressSuggestions: readonly AddressSearchSuggestion[];
  savedPlaces: readonly SavedPlaceSummary[];
  connectionState: 'online' | 'offline';
  mapCapability: CapabilityState;
  addressSearchCapability: CapabilityState;
  currentLocationCapability: CapabilityState;
  addressResolutionCapability: CapabilityState;
  resolvingAddress: boolean;
  searchingAddresses: boolean;
  mapPreview: ReactNode | null;
  translate?: CustomerIntakeTranslate;
  onBack: () => void;
  onSaveDraft: () => void;
  onAddressSearchChange: (query: string) => void;
  onSelectAddressSuggestion: (suggestion: AddressSearchSuggestion) => void;
  onManualAddressChange: (address: JobAddress) => void;
  onSelectSavedPlace: (place: SavedPlaceSummary) => void;
  onUseCurrentLocation: () => void;
  onResolveManualAddress: (details: AddressDetails) => void;
  onCorrectPin: () => void;
  onConfirmAddress: () => void;
}>;

function addressReadyForConfirmation(address: JobAddress): boolean {
  return Boolean(
    address.details.line1.trim()
      && address.details.city.trim()
      && address.details.province.trim()
      && isAddressResolutionDispatchSafe(address),
  );
}

export function AddressPinConfirmationScreen({
  address,
  addressSearchQuery,
  addressSuggestions,
  savedPlaces,
  connectionState,
  mapCapability,
  addressSearchCapability,
  currentLocationCapability,
  addressResolutionCapability,
  resolvingAddress,
  searchingAddresses,
  mapPreview,
  translate = translateCustomerIntake,
  onBack,
  onSaveDraft,
  onAddressSearchChange,
  onSelectAddressSuggestion,
  onManualAddressChange,
  onSelectSavedPlace,
  onUseCurrentLocation,
  onResolveManualAddress,
  onCorrectPin,
  onConfirmAddress,
}: AddressPinConfirmationScreenProps) {
  const theme = useTogtTheme();
  const updateField = (field: keyof AddressDetails, value: string) => {
    onManualAddressChange(updateJobAddressDetail(address, field, value));
  };
  const coordinatesPresent = address.resolution.status === 'resolved';
  const coordinatesReady = isAddressResolutionDispatchSafe(address);
  const canResolve = connectionState === 'online' && addressResolutionCapability.status === 'available';
  const canConfirm = addressReadyForConfirmation(address);

  return (
    <AppScaffold
      bottomAction={(
        <View style={{ rowGap: theme.spacing.sm }}>
          <Button fullWidth label={translate('address.confirm')} large disabled={!canConfirm} onPress={onConfirmAddress} />
          <Button fullWidth label={translate('common.saveDraft')} onPress={onSaveDraft} variant="tertiary" />
        </View>
      )}
      keyboardAware
      scrollable
      testID="address-pin-confirmation-screen"
      topBar={<TopAppBar onBack={onBack} title={translate('address.title')} />}
    >
      <View style={{ paddingBottom: theme.spacing.xxl, paddingTop: theme.spacing.md, rowGap: theme.spacing.xl }}>
        <ScreenHeading body={translate('address.privacy')} title={translate('address.title')} />
        {connectionState === 'offline' ? <OfflineBanner message={translate('address.offline')} /> : null}

        <View style={{ rowGap: theme.spacing.sm }}>
          {addressSearchCapability.status === 'available' ? (
            <>
              <TextField
                accessibilityHint={translate('address.searchHint')}
                label={translate('address.search')}
                leading={<IntakeIcon name="map-search-outline" tone="secondary" />}
                onChangeText={onAddressSearchChange}
                placeholder={translate('address.searchHint')}
                value={addressSearchQuery}
              />
              {searchingAddresses ? (
                <Surface accessibilityLabel={translate('address.searchResults')} variant="subtle">
                  <View style={[styles.row, { columnGap: theme.spacing.sm }]}>
                    <IntakeIcon name="progress-clock" tone="secondary" />
                    <Text allowFontScaling style={[theme.typography.bodySmall, { color: theme.colors.textSecondary }]}>
                      {translate('address.searching')}
                    </Text>
                  </View>
                </Surface>
              ) : null}
              {addressSuggestions.length > 0 ? (
                <View accessibilityLabel={translate('address.searchResults')} style={{ rowGap: theme.spacing.xs }}>
                  {addressSuggestions.map((suggestion) => (
                    <Surface
                      accessibilityHint={suggestion.secondaryLabel}
                      accessibilityLabel={suggestion.primaryLabel}
                      key={suggestion.suggestionId}
                      onPress={() => onSelectAddressSuggestion(suggestion)}
                      style={{ padding: theme.spacing.sm }}
                    >
                      <View style={[styles.row, { columnGap: theme.spacing.sm }]}>
                        <IntakeIcon name="map-marker-outline" />
                        <View style={styles.flex}>
                          <Text allowFontScaling style={[theme.typography.label, { color: theme.colors.text }]}>
                            {suggestion.primaryLabel}
                          </Text>
                          <Text allowFontScaling style={[theme.typography.bodySmall, { color: theme.colors.textSecondary }]}>
                            {suggestion.secondaryLabel}
                          </Text>
                        </View>
                        <IntakeIcon name="chevron-right" tone="secondary" />
                      </View>
                    </Surface>
                  ))}
                </View>
              ) : null}
            </>
          ) : (
            <CapabilityNotice capability={addressSearchCapability} title={translate('address.search')} />
          )}
        </View>

        {savedPlaces.length > 0 ? (
          <View>
            <SectionHeader title={translate('address.savedPlaces')} />
            <ScrollView
              contentContainerStyle={{ columnGap: theme.spacing.xs, paddingVertical: theme.spacing.xs }}
              horizontal
              showsHorizontalScrollIndicator={false}
            >
              {savedPlaces.map((place) => (
                <Chip
                  key={place.placeId}
                  label={place.label}
                  onPress={() => onSelectSavedPlace(place)}
                  selected={address.entryMode === 'saved_place' && address.details.line1 === place.address.details.line1}
                  tone="brand"
                />
              ))}
            </ScrollView>
          </View>
        ) : null}

        <View style={{ rowGap: theme.spacing.sm }}>
          {currentLocationCapability.status === 'available' ? (
            <Button
              accessibilityHint={translate('address.currentLocationHint')}
              label={translate('address.currentLocation')}
              leading={<IntakeIcon name="crosshairs-gps" tone="primary" />}
              onPress={onUseCurrentLocation}
              variant="secondary"
            />
          ) : (
            <CapabilityNotice capability={currentLocationCapability} title={translate('address.currentLocation')} />
          )}
        </View>

        {mapCapability.status === 'available' && mapPreview ? (
          <Surface accessibilityLabel={translate('address.coordinatesReady')} style={styles.mapFrame}>
            {mapPreview}
            <Button
              label={translate('address.correctPin')}
              leading={<IntakeIcon name="map-marker-radius-outline" tone="primary" />}
              onPress={onCorrectPin}
              variant="secondary"
            />
          </Surface>
        ) : (
          <View style={{ rowGap: theme.spacing.sm }}>
            <Surface variant="subtle">
              <View style={[styles.row, { columnGap: theme.spacing.sm }]}>
                <IntakeIcon name="map-marker-off-outline" tone="secondary" />
                <Text allowFontScaling style={[theme.typography.body, styles.flex, { color: theme.colors.textSecondary }]}>
                  {translate('address.mapUnavailable')}
                </Text>
              </View>
            </Surface>
            <CapabilityNotice capability={mapCapability} title={translate('address.map')} />
          </View>
        )}

        <View style={{ rowGap: theme.spacing.md }}>
          <SectionHeader title={translate('address.manualTitle')} />
          <TextField
            label={translate('address.line1')}
            onChangeText={(value) => updateField('line1', value)}
            required
            value={address.details.line1}
          />
          <TextField
            label={translate('address.unit')}
            onChangeText={(value) => updateField('unitOrComplex', value)}
            value={address.details.unitOrComplex}
          />
          <TextField
            label={translate('address.suburb')}
            onChangeText={(value) => updateField('suburb', value)}
            value={address.details.suburb}
          />
          <TextField
            label={translate('address.city')}
            onChangeText={(value) => updateField('city', value)}
            required
            value={address.details.city}
          />
          <TextField
            label={translate('address.province')}
            onChangeText={(value) => updateField('province', value)}
            required
            value={address.details.province}
          />
          <TextField
            keyboardType="numeric"
            label={translate('address.postalCode')}
            onChangeText={(value) => updateField('postalCode', value)}
            value={address.details.postalCode}
          />
          <TextField
            label={translate('address.landmark')}
            onChangeText={(value) => updateField('landmark', value)}
            value={address.details.landmark}
          />
          <TextField
            label={translate('address.access')}
            multiline
            onChangeText={(value) => updateField('accessInstructions', value)}
            textAlignVertical="top"
            value={address.details.accessInstructions}
          />
          <Button
            disabled={!canResolve || resolvingAddress || !address.details.line1.trim() || !address.details.city.trim()}
            label={translate('address.resolve')}
            leading={<IntakeIcon name="map-search-outline" tone="primary" />}
            loading={resolvingAddress}
            onPress={() => onResolveManualAddress(address.details)}
            variant="secondary"
          />
          <CapabilityNotice capability={addressResolutionCapability} title={translate('address.resolve')} />
        </View>

        <Surface variant={coordinatesReady ? 'positive' : 'attention'}>
          <View style={[styles.row, { columnGap: theme.spacing.sm }]}>
            <IntakeIcon
              name={coordinatesReady ? 'map-marker-check-outline' : 'map-marker-alert-outline'}
              tone={coordinatesReady ? 'primary' : 'attention'}
            />
            <View style={styles.flex}>
              <Text allowFontScaling style={[theme.typography.label, { color: theme.colors.text }]}>
                {translate(coordinatesReady
                  ? 'address.coordinatesReady'
                  : coordinatesPresent
                    ? 'address.coordinatesUnverified'
                    : 'address.coordinatesMissing')}
              </Text>
              {!coordinatesReady ? (
                <Text allowFontScaling style={[theme.typography.bodySmall, { color: theme.colors.textSecondary }]}>
                  {translate(coordinatesPresent
                    ? 'address.coordinatesUnverifiedBody'
                    : 'address.coordinatesMissingBody')}
                </Text>
              ) : null}
            </View>
          </View>
        </Surface>
      </View>
    </AppScaffold>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  row: { alignItems: 'center', flexDirection: 'row' },
  mapFrame: { overflow: 'hidden' },
});

export default AddressPinConfirmationScreen;
