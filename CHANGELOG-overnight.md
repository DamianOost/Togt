# 🚀 Togt App — Overnight Improvements (Feb 28 → Mar 1)

## Session 1 (with Damian)
### Setup
- Cloned repo, installed PostgreSQL, created `togt` database, migrated schemas
- Upgraded from Expo SDK 50 → **SDK 54** (matching Expo Go on device)
- Backend running on port 3002 (persistent launchd service)
- First successful test on Damian's Android phone ✅

### Features Built
1. **Push Notifications** — Full backend + mobile implementation
   - expo-server-sdk on backend, notifications on all booking state changes
   - Gracefully disabled in Expo Go (works in dev/production builds)

2. **Date/Time Picker** — Replaced raw ISO text input with native pickers
   - Android: two-step (date → time), iOS: inline + spinner
   - en-ZA locale display

3. **Bottom Tab Navigation** — No more getting stuck
   - Customer: 🔍 Search + 📋 Bookings
   - Labourer: 🏠 Home + 📋 Jobs + 👤 Profile + 💰 Earnings
   - All screens have proper back buttons

4. **6 Test Labourers** — Seeded near Durban/Umhlanga
   - Sipho (Plumbing), Thandi (Electrical), Bongani (Painting), Zanele (Cleaning), Mandla (Carpentry), Patric (Garden)

## Session 2 (Overnight — George solo)
### Features Built
5. **Auth Persistence** — AsyncStorage session restore
   - Login once, stay logged in across app restarts
   - No more re-entering credentials every time

6. **Logout Buttons** — On both customer and labourer dashboards

7. **Booking Confirmation Dialog** — Shows full summary before confirming
   - Address, date/time, estimated hours, total price
   - Cancel or Confirm

8. **Skill Selector Chips** — In booking form
   - Tap chips instead of typing skill name
   - Shows the labourer's actual skills

9. **Auto GPS Update** — When labourer toggles "Available"
   - Sends current location to backend automatically
   - Customers always see fresh labourer positions

10. **Backend: GET /labourers/profile** — Own profile endpoint for labourer screen

### Bug Fixes
- 12+ bugs fixed during live testing session
- ESM/CJS module compatibility (React 19 + RN 0.81)
- Missing assets, packages, navigation routes
- Map marker coordinate parsing (string → float)

## What's Next (Recommended Priority)
1. **Image uploads** — Profile photos via Cloudinary
2. **In-app messaging** — Customer ↔ labourer chat
3. **Background location** — Track labourers en route
4. **Multi-language** — Zulu, Xhosa, Afrikaans, English
5. **Development build** — Unlock push notifications + native modules
6. **Admin dashboard** — Manage users, disputes, payouts
7. **Play Store submission** — Needs Google Play account, privacy policy, keystore
