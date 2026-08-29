# TOGT Grounded Momentum brand usage

Status: implementation identity for the 1.1.0 internal test build. Public use still requires final owner approval and the photography/legal releases described below.

## Identity

The core mark is a flat Emerald `T` crossed by an Ink route that rises to the right. It represents useful work moving from a grounded starting point to a clear outcome. The same source mark generates the launcher icon, adaptive icon, splash and monochrome notification glyph and appears beside the in-app TOGT wordmark.

Source and generated assets:

- `mobile/assets/brand/togt-mark.svg` — canonical editable mark.
- `mobile/assets/icon.png` — opaque launcher artwork.
- `mobile/assets/adaptive-icon.png` — transparent adaptive foreground and in-app mark.
- `mobile/assets/splash.png` — cream launch canvas with the canonical mark.
- `mobile/assets/notification-icon.png` — Android monochrome notification glyph.
- `mobile/scripts/generate-brand-assets.cjs` — deterministic asset generator.

Keep clear space around the mark equal to at least one quarter of its visible width. At small sizes, use the mark without the descriptor. Use `TOGT` in uppercase as the product name; visible marketplace copy uses `Worker`, never the internal compatibility term `labourer`.

## Colour and type

The approved light identity uses Emerald `#12844E`, pressed Emerald `#0D6D40`, Veld Ink `#0F1F1B`, and Cream `#F7F4EF`. Amber is reserved for timed attention; red is reserved for errors, emergencies and destructive actions. White is used for opaque transactional surfaces.

Manrope is the display family and Inter is the body family. Both are bundled from their licensed Google Fonts packages with system fallbacks. Prices, timers and earnings use tabular numerals. Essential copy is never smaller than 12dp and must remain usable at 200% font scaling.

Only semantic implementation tokens may introduce colour, typography, spacing or motion into new product code. Accessible pairings and responsive breakpoints are enforced by `mobile/tests/design/designSystemSource.test.cjs`.

## Surface character

Home, onboarding, discovery, empty states and success moments may be expressive. Identity, address, scope, pricing, payment, verification and safety stay calm, opaque and high contrast. Borders come before shadows. Translucency is limited to optional navigation/map controls with an opaque fallback.

The product must not use:

- gradients behind body copy or full-content glassmorphism;
- emoji as interface icons;
- legacy navy/gold styling;
- a tool, paint roller, hammer or unrelated trade object as the TOGT mark;
- stretched, rotated, outlined, shadow-heavy or multi-colour variants of the mark;
- generic verification ticks, fabricated workers or unsupported trust/payment/safety claims;
- the Emerald action colour as a service/category colour.

## Photography direction

Photography should show real South African customers and Workers in real environments, with clear consent and dignity. Favour natural light, useful hand movement, visible context and an honest in-progress or completed outcome. Avoid staged stock gestures, unsafe work practices, poverty framing, identifiable private documents, vehicle plates, house numbers, gate codes or unapproved minors.

Before a photograph ships, retain a model/property release, purpose and channel consent, photographer licence/provenance, capture date, expiry/withdrawal contact and approved crop set. Record whether the person is a real marketplace participant or a commissioned model; never imply marketplace history that does not exist.

Capture landscape, 4:5 and 9:16 safety crops with the subject and work legible under text-safe overlays. Do not place important detail in Android cut-out, status-bar, gesture or CTA zones. Image alt text describes the visible task and context without inferring identity, skill, verification or outcome.

Until approved released photography exists, product surfaces use the deterministic mark, vector service iconography, layout and truthful data states rather than generated or fabricated people.

## Approval checks

Before public release, verify the identity at launcher, adaptive-mask, splash, in-app, notification, monochrome and low-quality-display sizes; confirm font licensing/bundling; run AA contrast, compact width, 200% font and TalkBack checks; and obtain named approval for identity, photography and public-facing copy. Dark theme remains off until every semantic token has an approved contrast-tested mapping.
