# TOGT Address and Pin Funnel Unblock Specification

- **Status:** Implementation-ready specification
- **Priority:** P0 customer-booking blocker
- **Applies to:** Android Grounded Momentum customer intake
- **First candidate:** `1.2.0` / `versionCode 4`
- **Governing release process:** `docs/superpowers/plans/2026-08-30-togt-apk-candidate-promotion-rollback-runbook.md`

## 1. Outcome

A fresh customer can enter a South African job address, place and explicitly accept an exact map pin, confirm the address, and reach Schedule without Places, autocomplete, reverse geocoding, or a new backend endpoint.

The implementation must preserve the approved Grounded Momentum visual standard, keep exact worker-location privacy unchanged, and fail closed without creating a false verified address.

## 2. Why this is P0

The current intake is deadlocked rather than merely degraded:

- `CustomerAddressRoute` provides no address suggestions or saved places;
- current-location and manual-resolution callbacks are no-ops;
- the map preview is absent; and
- confirmation correctly rejects every source except `map_pin`, `saved_verified_place`, or `provider_geocode`.

Manual text therefore cannot become dispatch-safe by construction. A previously persisted safe draft can bypass this only as legacy state; a fresh customer cannot continue from Address to Schedule.

This specification supersedes any wording that treats raw GPS coordinates plus instructions as a valid dispatch fallback. GPS is a camera seed only. The customer must explicitly bind the entered address to a pin or receive a canonical provider result.

## 3. Locked product decisions

1. Ship exact-pin confirmation before search and geocoding.
2. Wave 1 makes no Places, autocomplete, forward-geocoding, or reverse-geocoding request.
3. GPS centres the picker. It never persists `source: device_gps` as a confirmable address.
4. Only `Use this pin` binds the visible address fields to the current coordinate and writes `source: map_pin`.
5. Map callbacks, camera movement, and location callbacks never confirm automatically.
6. Manual address entry remains available when device location is denied. Manual text can be saved as a draft but cannot dispatch until a pin is accepted.
7. Editing a location-bearing field invalidates the old resolution. Editing private landmark/access notes never changes the coordinate.
8. Cancelling pin placement or adjustment leaves the persisted address unchanged.
9. Provider availability is read from the existing capability system. The route must not hardcode an available state.
10. Search and geocoding remain truthfully disabled until their separate backend and release gates pass.
11. Saved Places is the first cost-control follow-up and precedes provider search where practical.
12. Exact location remains hidden from workers until the existing approved reveal boundary.

## 4. Delivery boundary

### Wave 1 — exact-pin funnel unblock

Wave 1 includes:

- Android Google Maps display configuration through the existing native-provider path;
- capability-registry entries and mobile adaptation for `maps_display`, `address_search`, and `address_resolution`;
- raw six-field address entry;
- a dedicated exact-pin picker;
- explicit `Use this pin` resolution to `map_pin`;
- address confirmation and navigation to Schedule;
- truthful maps-off, permission-denied, stale-capability, and unresolved states;
- automated model, capability, component, and route tests; and
- candidate APK inspection on emulator and physical Android before promotion.

Wave 1 requires no database migration and no new address-provider endpoint.

### Wave 1b — Saved Places

Wave 1b includes protected, user-scoped Saved Places CRUD:

- list, add, rename, update, adjust pin/instructions, and delete in Account;
- selection during intake producing `saved_verified_place` with no provider call;
- snapshotting a selected place into the draft/booking so later deletion does not mutate it;
- re-verification when one of the six location-bearing fields changes; and
- preservation of exact-address worker privacy.

This is an additive database/API change and must follow the compatibility and migration rules in the release runbook.

### Wave 2 — provider-assisted usability

Wave 2 includes server-proxied:

- autocomplete;
- place details;
- forward geocoding; and
- reverse geocoding.

A successful canonical provider result writes `source: provider_geocode`. Provider credentials never enter mobile responses, telemetry, or logs. Search sessions are server-owned per active autocomplete interaction and rotate after selection, abandonment, timeout, or draft replacement.

## 5. Customer journey

```text
Customer enters six address fields
  → selects Set exact pin
  → picker opens at an existing pin, foreground GPS seed, or neutral default camera region
  → customer positions the map/pin
  → customer selects Use this pin
  → app binds the coordinate to the six-field fingerprint as map_pin
  → customer optionally adds landmark/access instructions
  → customer selects Confirm address
  → app records explicit confirmation and opens Schedule
```

If Maps is unavailable, the customer can save the typed draft and retry. The app must explain that an exact pin is required before booking; it must not imply that manual text is verified.

## 6. Address contract

### 6.1 Location-bearing fields

Only these fields define the address fingerprint:

```text
line1
unitOrComplex
suburb
city
province
postalCode
```

Keep their raw strings locally while the customer types. Trim and normalise only when committing a pin, saving a draft, or submitting. Per-keystroke trimming must not remove intentional spaces or make cursor behaviour unstable.

Required for pin binding and confirmation:

- `line1`
- `city`
- `province`

Optional:

- `unitOrComplex`
- `suburb`
- `postalCode`

Do not make unit/complex, suburb, or postal code mandatory merely to compensate for provider absence. The exact pin supplies operational precision while the required text remains a human-readable minimum.

### 6.2 Private instruction fields

These fields are not location-bearing and never enter the fingerprint:

```text
landmark
accessInstructions
```

They must never be overwritten by a map or address provider. Changing them preserves the safe coordinate and fingerprint but clears final address confirmation so the customer reviews the complete dispatch instruction once more.

### 6.3 Dispatch-safe sources

Dispatch-safe:

- `map_pin`
- `saved_verified_place`
- `provider_geocode`

Not dispatch-safe:

- `unresolved`
- `device_gps`
- `entered_coordinates`
- a default map centre
- a camera position that the customer has not explicitly accepted

### 6.4 Provider response boundary

A provider-resolution response may contain:

```text
addressDetails:
  line1
  unitOrComplex
  suburb
  city
  province
  postalCode

coordinates:
  latitude
  longitude

metadata:
  providerPlaceId
  formattedLabel
  granularity
  provenance
```

It must not contain or overwrite `landmark` or `accessInstructions`. If the provider omits `unitOrComplex`, preserve the customer's value rather than blanking it. Provider search-session tokens remain server-only and never appear in the mobile response; a separate opaque TOGT request/correlation ID may be returned when operationally required.

## 7. State model

### 7.1 Persistent address states

| State | Meaning | Confirm action |
|---|---|---|
| `editing_unresolved` | Raw address text may exist, but no safe source matches it. | Disabled with a visible reason. |
| `resolved_unconfirmed` | A dispatch-safe source and coordinate match the current six-field fingerprint. | Enabled when required fields are complete. |
| `confirmed` | The resolved address has been explicitly confirmed. | Continue to Schedule. |
| `dirty_after_resolution` | A location-bearing field changed after resolution. | Disabled until the pin/provider result is rebound. |

### 7.2 Ephemeral picker states

```text
closed
  → open / candidate_absent
  → candidate_seeded (valid existing pin or GPS) ─┐
  → candidate_positioned (explicit map/control) ──┤
                                                   → Use this pin
  → resolved_unconfirmed(source = map_pin)
```

The candidate coordinate is local to the picker until `Use this pin`. Opening Adjust Pin from a safe address seeds the candidate from the current coordinate. Back or Cancel discards the candidate and preserves the original safe address byte-for-byte.

When the picker opens, capture `draftId`, the committed draft revision, and the normalised six-field fingerprint. `Use this pin` must compare all three with current state. If the draft was edited, restored, replaced, or synchronised while the picker was open, reject the commit, discard the stale candidate, and show **The address changed—set the pin again**.

### 7.3 Transition rules

- GPS may seed the camera/candidate but may not mutate the persisted `JobAddress`.
- A neutral default camera region is never a candidate and leaves `Use this pin` disabled.
- Existing safe coordinates and valid foreground-GPS seeds are `candidate_seeded` and become eligible only through an explicit `Use this pin` action.
- Programmatic camera movement and `onRegionChangeComplete` never create `candidate_positioned`.
- Tap, drag, pan-plus-centre-pin, or an accessible position control can position a candidate.
- Reject missing, non-finite, `NaN`, latitude outside `[-90, 90]`, and longitude outside `[-180, 180]` coordinates.
- `Use this pin` always writes `map_pin`, never `device_gps`.
- Changing `line1`, `unitOrComplex`, `suburb`, `city`, `province`, or `postalCode` clears the persisted safe resolution and final confirmation.
- The previous coordinate may be retained only as an ephemeral starting candidate for the next picker session.
- Changing `landmark` or `accessInstructions` preserves the safe resolution and clears only final confirmation.
- Save Draft must never retain a stale resolution that no longer matches the normalised six-field fingerprint.
- Confirm must never silently return. A disabled state always has a visible, focusable explanation.

Raw-buffer and persistence contract:

- the first location-bearing keystroke marks the effective route dirty in memory immediately, so Confirm becomes unavailable before asynchronous persistence;
- committed draft writes atomically store the normalised text, incremented draft revision, fingerprint and either its matching safe resolution or `unresolved`—never new text with an old resolution;
- Save Draft and Back flush the raw buffer through that atomic write; **Set exact pin** first flushes and captures the committed revision/fingerprint before navigation, and `Use this pin` atomically adds the matching resolution;
- only the last explicitly committed/saved draft is guaranteed to survive process death; unsaved raw input and ephemeral picker candidates are not; and
- process restore loads one internally consistent committed revision and never combines newer text with an older safe coordinate.

## 8. Capability contract

The backend registry, `/api/capabilities` response, mobile feature-name registry, packaged allow-list, adapter, and tests must all recognise the same feature names.

| Capability | Packaged/build gate | Runtime gate | Wave 1 |
|---|---|---|---|
| `maps_display` | Google map provider selected and Android key packaged | Fresh server evidence plus explicit maps-display release approval | Available only when both pass |
| `address_search` | Search client path packaged | Explicit release approval plus validated backend provider configuration | Unavailable |
| `address_resolution` | Resolution client path packaged | Explicit release approval plus validated backend provider configuration | Unavailable |
| `foreground_location_updates` | Existing foreground location package and safe permission declaration | Fresh server capability | Enables the request path; camera centring only |

The server-side `maps_display` value is a release/kill gate, not proof that a particular APK contains a valid Android key. Effective map display is the intersection of packaged evidence and a fresh runtime snapshot.

Provider capabilities require both an explicit release flag and validated provider configuration. Environment-variable presence alone is not release evidence.

Device permission is separate state: `unknown_requestable`, `granted_precise`, `granted_approximate`, `denied_requestable`, or `blocked_settings`. Capability availability controls whether **Centre on my location** can request/use foreground location; denial disables only GPS centring and never Maps display or manual pin placement.

The route must refresh capabilities on screen focus and app foreground, schedule invalidation at `expires_at`, and re-evaluate effective capability immediately before opening the picker or binding a new pin. A capability object captured earlier in React state is not action-time evidence. If the snapshot expires while the picker is mounted, preserve the customer's draft/candidate locally, block `Use this pin`, and show a truthful refresh/retry state.

`Confirm address` always revalidates the safe source, draft revision and fingerprint. A committed, fingerprint-matching `map_pin` remains valid if `maps_display` later switches off; display capability gates new map operations, not already committed address evidence. If an incident must suspend address submission itself, use a separate server admission gate rather than silently redefining `map_pin`.

Capability and workflow reasons remain distinct:

- `disabled_in_this_build`
- `capability_data_expired`
- `maps_display_release_disabled`
- `address_search_release_disabled`
- `address_provider_not_configured`
- `pin_not_set`
- `address_changed_pin_recheck_required`
- `location_permission_denied`

`address_provider_not_configured` must never mean `pin_not_set`.

## 9. Screen and visual specification

Governing visual reference: `docs/design/togt-grounded-momentum-concept.png`.

### 9.1 Address screen

Use the approved Grounded Momentum system without introducing raw provider UI.

Order:

1. short app bar: **Job location**;
2. H1: **Confirm the job address**;
3. existing privacy explanation;
4. Saved Places and search only when truly available;
5. the six location-bearing fields;
6. exact-location card;
7. landmark and access-instruction fields;
8. sticky **Confirm address** action; and
9. tertiary **Save draft** action.

The exact-location card uses:

- warm cream/white surface;
- restrained border and elevation from semantic tokens;
- compact non-interactive map preview after resolution;
- emerald verified state with text and icon, never colour alone;
- **Set exact pin** before resolution; and
- **Adjust pin** after resolution.

When Maps is unavailable, show one concise capability notice near the exact-location card. Do not stack separate cards for search, current location, map, and pin when their underlying cause is the same.
An already committed safe pin remains represented by its textual verified summary, but no `MapView` mounts and Set/Adjust Pin remains unavailable until fresh capability evidence returns.

### 9.2 Pin picker

The picker is a dedicated full-screen or modal route, not an interactive map embedded in the long address `ScrollView`.

It contains:

- short Back/Cancel affordance and **Set exact pin** title;
- edge-to-edge lightly styled map with minimal provider chrome;
- emerald centre pin or draggable pin;
- opaque cream/white confirmation sheet;
- the normalised address label currently being paired with the candidate coordinate, visible and announced by TalkBack;
- concise status text;
- contextual **Centre on my location** action;
- primary **Use this pin** action; and
- truthful permission/loading/error feedback.

The map should feel native to TOGT: warm/light treatment, clean typography, emerald action, generous spacing, and no exposed Google autocomplete widget.

### 9.3 Behaviour at large text

The confirmation sheet may grow or scroll without hiding `Use this pin`. The address-screen sticky action must not overlap fields, keyboard, or Android system navigation at 200% font scale.

## 10. Permission and privacy rules

- Request foreground location only after the customer selects **Centre on my location**.
- Never request background location for this flow.
- Denial leaves manual map positioning available.
- Approximate location may seed the camera but gains no additional trust.
- Do not log exact coordinates, raw addresses, landmark text, access instructions, or the Android Maps key.
- Worker candidate and pre-route views continue to receive only the approved broad-area label.
- Exact-address reveal timing, cancellation revocation, and reassignment rules remain unchanged.

## 11. Accessibility acceptance

- All actions meet a minimum 48dp target.
- TalkBack labels and hints identify Set/Adjust Pin, Centre on My Location, Cancel, and Use This Pin.
- Pin state is represented in text, not map imagery or colour alone.
- Location progress, denial, candidate movement, and successful binding are announced without excessive repetition.
- `Use this pin` is TalkBack/keyboard activatable.
- Dragging is not the only available path. If native map gestures are unreliable with TalkBack, provide centre-based positioning or explicit accessible movement controls.
- A disabled Confirm control exposes a persistent accessible description linked to the visible blocker. If a race invalidates an action after it was enabled, focus moves to the new error.
- Normal and 200% font layouts pass screenshot and device review.

## 12. Implementation tickets

### LOC-00 — lock the contract

- Add this specification to the master-spec and readiness references.
- Record the current deadlock as a P0 release blocker.
- Add focused tests proving raw GPS/manual text cannot dispatch.

**Exit:** contract tests fail for the current deadlocked route and encode the desired safe sources.

### LOC-01 — capability registry end to end

- Add the three address/map entries to `backend/src/config/capabilities.js`.
- Add the matching mobile feature names, packaged gates, DTO adaptation, reason codes, and tests.
- Keep search and resolution runtime-off in Wave 1.
- Refresh on screen focus/app foreground, invalidate at snapshot expiry, and revalidate `maps_display` before picker open/new pin binding. Confirm revalidates safe source, draft revision, fingerprint and any separate submission-admission gate—not map-display availability.

**Exit:** package/server/stale/malformed combinations, including expiry while the route is mounted, fail closed with distinct reasons.

### LOC-02 — native Android map configuration

- Configure the existing provider path for Google Maps display.
- Use an Android-restricted key for package `za.togt.app` and the approved internal signer.
- Keep provider secrets out of Git, responses, logs, and evidence screenshots.
- Ensure the final manifest contains the expected Maps metadata without printing the key.

**Exit:** restricted key renders only in the intended signed candidate; Maps-off builds remain stable.

### LOC-03 — address form integrity

- Keep raw six-field values during editing.
- Commit normalised values at save/resolution/submission boundaries.
- Make fingerprint invalidation explicit and tested.
- Preserve landmark/access instructions separately.

**Exit:** ordinary typing is stable and no stale resolution survives a location-bearing edit.

### LOC-04 — premium pin picker

- Build the dedicated picker route/surface.
- Seed from an existing pin, requested foreground GPS, or neutral default camera region.
- Keep candidate state ephemeral until explicit acceptance.
- Implement Back/Cancel, Centre on My Location, and Use This Pin.
- Bind only when the captured `draftId`, revision and six-field fingerprint still match; reject invalid/out-of-range coordinates.

**Exit:** tap/drag/accessible placement works; an explicit acceptance can upgrade a valid GPS seed to `map_pin`; neutral/programmatic camera state cannot; stale picker commits fail; cancel is non-mutating.

### LOC-05 — address route convergence

- Replace unavailable placeholder wiring with snapshot-driven capability state.
- Mount the exact-location card and preview.
- Commit accepted candidate as `map_pin`.
- Confirm the safe address and navigate to Schedule.
- Collapse duplicate provider-off notices.

**Exit:** a fresh customer completes Address → Schedule without provider search/geocoding.

### LOC-06 — automated regression suite

- Add model, capability, component, navigation, draft persistence, and privacy tests.
- Cover permission allow/approximate/deny and Maps-off recovery.
- Cover address edit invalidation and instruction preservation.

**Exit:** LOC-00–07 focused tests plus the existing complete mobile/backend regression suites pass.

### LOC-07 — candidate APK gate

- Build the x86_64 emulator and ARM64 device members of candidate `1.2.0` / `versionCode 4`.
- Inspect manifests, permissions, components, ABI, signature, signer, runtime contract, hashes, and Maps metadata.
- Test clean install and same-signer upgrade from the promoted `versionCode 3` baseline.
- Capture normal/200% screenshots and physical-device evidence.

**Exit:** the exact ARM64 SHA-256 is ready for user approval; nothing is promoted yet.

### LOC-08 — Saved Places follow-up (non-blocking for Wave 1)

- Add protected user-scoped storage/API and Account CRUD.
- Add zero-provider-call selection in intake.
- Permit create/location-edit only from an existing dispatch-safe `map_pin` or `provider_geocode`; the service, never the client, assigns `saved_verified_place` provenance and fingerprint.
- Rehearse additive migration and previous-app compatibility.

**Exit:** repeat booking can produce `saved_verified_place` without a provider request.

### LOC-09 — provider-assisted search follow-up (non-blocking for Wave 1)

- Implement server-proxied search, detail, and resolution contracts.
- Implement interaction-scoped token lifecycle and provider safety.
- Enable only after configuration, commercial, privacy, and release gates pass.

**Exit:** canonical selection produces `provider_geocode`; provider outage leaves the pin path intact.

## 13. Test matrix

### Model and state tests

- `device_gps` and `entered_coordinates` never retain confirmation or dispatch.
- `map_pin`, `saved_verified_place`, and `provider_geocode` remain safe.
- `line1`, `city`, and `province` are required; unit/complex, suburb, and postal code remain optional.
- Each six-field edit invalidates resolution.
- Landmark/access edits preserve coordinates and do not enter the fingerprint.
- Cancelled picker leaves persisted draft state unchanged.
- Neutral default camera and programmatic movement cannot be accepted; a valid GPS seed requires explicit acceptance.
- Missing, non-finite, `NaN`, and out-of-range coordinates are rejected.
- A picker opened against an older draft ID/revision/fingerprint cannot commit.
- Atomic draft restore never combines newer address text with older safe resolution; unsaved picker candidates do not survive process death.

### Capability tests

- Package off/server on → off.
- Package on/server off → off.
- Package on/stale or malformed snapshot → off.
- Package on/fresh server on → on.
- A snapshot that expires while the picker/address route remains mounted blocks new picker/pin operations at action time until refresh succeeds.
- Capability-off does not revoke an already committed, fingerprint-matching safe pin.
- Search and resolution remain off in Wave 1.
- Distinct reason codes survive server-to-mobile adaptation.

### Component and route tests

- Fresh customer enters address, sets pin, confirms, and reaches Schedule.
- GPS only centres the camera.
- `Use this pin` creates `map_pin`.
- The picker confirmation sheet shows and announces the address being bound.
- Editing an address field shows **Check the pin again**.
- Editing private instructions does not remove the pin.
- Adjust Pin → Cancel preserves the original resolution.
- Confirm never silently no-ops.
- Provider-off messaging does not obscure the working pin route.
- An explicitly saved draft persists through process death and a same-signer APK upgrade; ephemeral picker state does not.

### Wave 1b/2 follow-up contract tests

These do not block LOC-00–07 or the Wave 1 candidate:

- Saved-place provenance is service-assigned only from an already dispatch-safe source.
- Saved place selection makes zero provider requests.
- Provider merges preserve private instructions and a customer-entered unit/complex.
- Provider session tokens never appear in mobile responses.

### APK and physical-device gate

- No background-location permission.
- No server-only credential or provider session token is packaged in the APK. The Android client Maps key is expected in manifest metadata, must be package/certificate restricted, and is redacted from logs/evidence.
- Maps metadata and package/signer restriction are verified.
- Clean install and `versionCode 3` → `versionCode 4` upgrade both pass.
- Precise, approximate, denied, and later-granted foreground location paths pass.
- Address → Schedule → Review works on the physical device.
- Back/Cancel, keyboard, large text, TalkBack, cold start, and process restore pass.
- Capability-off and expired snapshots fail closed with truthful recovery.
- A controlled Maps disable → refresh/expiry → restore drill records snapshot evidence, blocks new picker/pin operations while off, preserves an already committed safe pin, and loses no saved draft.
- Worker-facing privacy remains broad-area-only before the approved boundary.
- Screenshots match the approved Grounded Momentum concept before promotion.

## 14. Release and rollback

The first implementation is a candidate, not an accepted release. Follow the candidate lifecycle in the governing runbook:

```text
clean candidate commit
  → signed APK and manifest
  → static inspection
  → emulator clean/upgrade testing
  → exact ARM64 physical-device testing
  → user approval against SHA-256
  → promote exact tested bytes
```

Immediate failure containment is server capability-off. APK rollback is a same-signer forward rollback: rebuild the prior accepted source with a new higher `versionCode`. Never depend on installing a lower Android version code over a higher one.

## 15. Explicit exclusions

- Places/search/geocoding in Wave 1.
- Routing, ETA, turn-by-turn navigation, or service-area optimisation.
- Foreground journey sharing and all background tracking.
- Offline map-tile guarantees.
- Raw GPS as a dispatch-safe address.
- iOS delivery in this Android unblock.
- Any change to exact-address worker privacy timing.
- Production provider enablement without explicit release evidence.
- Extreme provider/map edge-case expansion beyond the core Address → Schedule deliverable.

## 16. Definition of done

Wave 1 is done only when:

- a fresh customer can reach Schedule through an explicitly accepted exact pin;
- safety invariants remain intact;
- the UI passes Grounded Momentum visual and accessibility review;
- LOC-00–07 focused tests and the existing complete automated regression suites pass; LOC-08/09 remain separately gated follow-ups;
- the exact candidate APK passes static, emulator, upgrade, and physical-device inspection;
- the user approves that APK's SHA-256; and
- only those exact tested bytes are promoted.
