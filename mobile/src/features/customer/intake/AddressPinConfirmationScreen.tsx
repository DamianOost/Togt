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
  searchingAddresses: boolean;
  mapPreview: ReactNode | null;
  pinActionPending?: boolean;
  actionProblem?: string | null;
  translate?: CustomerIntakeTranslate;
  onBack: () => void;
  onSaveDraft: () => void;
  onAddressSearchChange: (query: string) => void;
  onSelectAddressSuggestion: (suggestion: AddressSearchSuggestion) => void;
  onManualAddressChange: (address: JobAddress) => void;
  onSelectSavedPlace: (place: SavedPlaceSummary) => void;
  onOpenPinPicker: () => void;
  onConfirmAddress: () => void;
}>;

function requiredAddressTextPresent(address: JobAddress): boolean {
  return Boolean(
    address.details.line1.trim()
      && address.details.city.trim()
      && address.details.province.trim(),
  );
}

function confirmationBlocker(address: JobAddress): string | null {
  if (!requiredAddressTextPresent(address)) {
    return 'Add the street address, city or town, and province.';
  }
  if (!isAddressResolutionDispatchSafe(address)) {
    return address.resolution.reasonCode === 'address_text_changed'
      ? 'The address changed—set the pin again.'
      : 'Set and accept the exact pin before confirming this address.';
  }
  return null;
}

export function AddressPinConfirmationScreen({
  address,
  addressSearchQuery,
  addressSuggestions,
  savedPlaces,
  connectionState,
  mapCapability,
  addressSearchCapability,
  searchingAddresses,
  mapPreview,
  pinActionPending = false,
  actionProblem = null,
  translate = translateCustomerIntake,
  onBack,
  onSaveDraft,
  onAddressSearchChange,
  onSelectAddressSuggestion,
  onManualAddressChange,
  onSelectSavedPlace,
  onOpenPinPicker,
  onConfirmAddress,
}: AddressPinConfirmationScreenProps) {
  const theme = useTogtTheme();
  const updateField = (field: keyof AddressDetails, value: string) => {
    onManualAddressChange(updateJobAddressDetail(address, field, value));
  };
  const coordinatesReady = isAddressResolutionDispatchSafe(address);
  const blocker = actionProblem ?? confirmationBlocker(address);
  const canConfirm = blocker === null;
  const pinActionLabel = coordinatesReady ? translate('address.adjustPin') : translate('address.setPin');
  const pinActionHint = !requiredAddressTextPresent(address)
    ? translate('address.pinNeedsAddress')
    : coordinatesReady
      ? translate('address.adjustPinHint')
      : translate('address.setPinHint');

  return (
    <AppScaffold
      bottomAction={(
        <View style={{ rowGap: theme.spacing.sm }}>
          {blocker ? (
            <Text
              accessibilityLiveRegion="polite"
              allowFontScaling
              style={[theme.typography.bodySmall, { color: actionProblem ? theme.colors.error : theme.colors.textSecondary }]}
              testID="address-confirm-blocker"
            >
              {blocker}
            </Text>
          ) : null}
          <Button
            accessibilityHint={blocker ?? 'Confirms this address and opens scheduling.'}
            fullWidth
            label={translate('address.confirm')}
            large
            disabled={!canConfirm}
            onPress={onConfirmAddress}
          />
          <Button fullWidth label={translate('common.saveDraft')} onPress={onSaveDraft} variant="tertiary" />
        </View>
      )}
      keyboardAware
      scrollable
      testID="address-pin-confirmation-screen"
      topBar={<TopAppBar onBack={onBack} title={translate('address.appBar')} />}
    >
      <View style={{ paddingBottom: theme.spacing.xxl, paddingTop: theme.spacing.md, rowGap: theme.spacing.xl }}>
        <ScreenHeading body={translate('address.privacy')} title={translate('address.title')} />
        {connectionState === 'offline' ? <OfflineBanner message={translate('address.offline')} /> : null}

        {addressSearchCapability.status === 'available' ? (
          <View style={{ rowGap: theme.spacing.sm }}>
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
          </View>
        ) : null}

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

        <View style={{ rowGap: theme.spacing.md }}>
          <SectionHeader subtitle={translate('address.locationDetailsBody')} title={translate('address.locationDetails')} />
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
        </View>

        <Surface
          accessibilityLabel={coordinatesReady ? translate('address.pinReady') : translate('address.pinMissing')}
          elevation="card"
          style={styles.locationCard}
          testID="exact-location-card"
          variant={coordinatesReady ? 'positive' : 'default'}
        >
          {coordinatesReady && mapCapability.status === 'available' && mapPreview ? (
            <View style={styles.preview}>{mapPreview}</View>
          ) : null}
          <View style={{ padding: theme.spacing.md, rowGap: theme.spacing.sm }}>
            <View style={[styles.row, { columnGap: theme.spacing.sm }]}>
              <View
                style={[
                  styles.iconWell,
                  {
                    backgroundColor: coordinatesReady ? theme.colors.actionPrimary : theme.colors.surfacePositive,
                    borderRadius: theme.radius.input,
                    minHeight: theme.sizing.touchTarget,
                    minWidth: theme.sizing.touchTarget,
                  },
                ]}
              >
                <IntakeIcon
                  name={coordinatesReady ? 'map-marker-check-outline' : 'map-marker-radius-outline'}
                  tone={coordinatesReady ? 'inverse' : 'primary'}
                />
              </View>
              <View style={styles.flex}>
                <Text accessibilityRole="header" allowFontScaling style={[theme.typography.h3, { color: theme.colors.text }]}>
                  {coordinatesReady ? translate('address.pinReady') : translate('address.exactLocation')}
                </Text>
                <Text allowFontScaling style={[theme.typography.bodySmall, { color: theme.colors.textSecondary }]}>
                  {coordinatesReady ? translate('address.pinReadyBody') : translate('address.exactLocationBody')}
                </Text>
              </View>
            </View>

            {mapCapability.status === 'available' ? (
              <>
                {!requiredAddressTextPresent(address) ? (
                  <Text allowFontScaling style={[theme.typography.bodySmall, { color: theme.colors.textSecondary }]}>
                    {translate('address.pinNeedsAddress')}
                  </Text>
                ) : null}
                <Button
                  accessibilityHint={pinActionHint}
                  disabled={!requiredAddressTextPresent(address) || pinActionPending}
                  fullWidth
                  label={pinActionLabel}
                  leading={<IntakeIcon name="map-marker-radius-outline" tone="primary" />}
                  loading={pinActionPending}
                  onPress={onOpenPinPicker}
                  testID={coordinatesReady ? 'adjust-exact-pin' : 'set-exact-pin'}
                  variant="secondary"
                />
              </>
            ) : (
              <>
                <CapabilityNotice capability={mapCapability} title={translate('address.map')} />
                <Button
                  accessibilityHint="Refreshes current map availability without changing the saved address or pin."
                  fullWidth
                  label={translate('common.retry')}
                  loading={pinActionPending}
                  onPress={onOpenPinPicker}
                  testID="retry-exact-pin-map"
                  variant="secondary"
                />
              </>
            )}
          </View>
        </Surface>

        <View style={{ rowGap: theme.spacing.md }}>
          <SectionHeader subtitle={translate('address.arrivalNotesBody')} title={translate('address.arrivalNotes')} />
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
        </View>
      </View>
    </AppScaffold>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  row: { alignItems: 'center', flexDirection: 'row' },
  locationCard: { padding: 0 },
  preview: { overflow: 'hidden' },
  iconWell: { alignItems: 'center', justifyContent: 'center' },
});

export default AddressPinConfirmationScreen;
