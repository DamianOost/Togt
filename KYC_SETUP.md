# KYC Setup Guide — Smile ID Integration

## What Was Built

The Togt app now has a full end-to-end KYC (Know Your Customer) verification flow:

- **Backend:** REST API routes at `/api/kyc/*` that call Smile ID's server-side API
- **Database:** `kyc_verifications` table + `kyc_status` column on `users`
- **Mobile:** A beautiful 4-step `KYCScreen.js` with SA ID validation, selfie capture, and success state
- **Auth:** `GET /api/auth/me` endpoint to refresh user profile (incl. `kyc_status`) on app start
- **Integration:** RegisterScreen → KYC prompt on new account; Unverified badges in customer home and labourer dashboard

---

## Running in Sandbox / Demo Mode (No Credentials Needed)

By default, the system runs in demo mode when `SMILE_PARTNER_ID=DEMO` (the default).

### To test the full flow:

1. Start the backend: `cd backend && npm start`
2. Start the mobile app: `cd mobile && npx expo start`
3. Register a new account
4. You'll be redirected to the KYC screen automatically
5. Enter any valid 13-digit SA ID number (e.g. `9001015009087` — try real format)
6. Tap **"Verify ID"** — in demo mode this returns a mock successful response
7. On the selfie screen, tap **"🧪 Simulate Selfie (Demo Mode)"** to skip the camera
8. You'll see the ✅ Identity Verified success screen

The `⚠️ Unverified` badge in the home/dashboard will change to `✅ Verified` after refresh.

### Valid SA ID test numbers:

Use the Luhn-compliant format. The app validates format locally before calling the API.
- `9001015009087` — 1990-01-01 born male
- `8001015009084` — 1980-01-01 born male

---

## Going Live — What Damian Needs to Do

### Step 1: Sign up for Smile ID

1. Go to **https://portal.usesmileid.com**
2. Sign up for a free account
3. Free tier: **300 verifications/month** — enough for MVP launch
4. Complete the partner onboarding form

### Step 2: Get Your Credentials

From the Smile ID portal, grab:
- **Partner ID** (looks like a number, e.g. `001`)
- **API Key** (long alphanumeric string)

### Step 3: Update Backend Environment Variables

Edit `/Users/georgeoosthuyzen/.openclaw/workspace/Togt/backend/.env`:

```
SMILE_PARTNER_ID=your_actual_partner_id
SMILE_API_KEY=your_actual_api_key
```

> **Note:** Keep `NODE_ENV` unset or `development` to use the Smile ID sandbox environment for testing.  
> Set `NODE_ENV=production` to use the live Smile ID API.

### Step 4: Test in Smile ID Sandbox

Smile ID provides a sandbox environment at `https://testapi.smileidentity.com/v1`.  
When `NODE_ENV` is not `production`, the backend automatically uses the sandbox URL.

Use Smile ID's test credentials from their portal to run real (but sandboxed) verifications.

### Step 5: Go Live

When you're ready for production:

```
NODE_ENV=production
SMILE_PARTNER_ID=your_partner_id
SMILE_API_KEY=your_api_key
```

The backend will switch to the live Smile ID API: `https://3eydmgh10d.execute-api.us-west-2.amazonaws.com/prod`

---

## API Reference

### `POST /api/kyc/verify-id`
Verifies a South African ID number against Home Affairs via Smile ID.

**Request:**
```json
{
  "idNumber": "9001015009087",
  "firstName": "John",
  "lastName": "Doe",
  "country": "ZA",
  "idType": "NATIONAL_ID"
}
```

**Response:**
```json
{
  "verified": true,
  "name": "JOHN DOE",
  "dob": "1990-01-01",
  "photo": null,
  "smile_job_id": "job_abc123"
}
```

### `POST /api/kyc/selfie-enroll`
Enrolls a selfie for biometric matching.

**Request:**
```json
{
  "selfieBase64": "...",
  "idNumber": "9001015009087"
}
```

**Response:**
```json
{
  "enrolled": true,
  "confidence": 0.97,
  "smile_job_id": "job_xyz456"
}
```

### `GET /api/kyc/status`
Returns the current user's KYC verification status.

**Response:**
```json
{
  "kyc_status": "verified",
  "verification": {
    "id_number": "900101XXXXX",
    "status": "verified",
    "verified_name": "JOHN DOE",
    "verified_at": "2026-03-02T11:00:00Z"
  }
}
```

### `GET /api/auth/me`
Returns full user profile including `kyc_status`. Call this on app start to refresh user state.

---

## Database Changes

Migration `003_kyc.sql` was already applied. It added:
- `kyc_verifications` table — full audit trail of all KYC attempts
- `kyc_status` column on `users` — `unverified | pending | verified | failed`

---

## Mobile UX

- **RegisterScreen** — navigates to KYC automatically after registration
- **KYCScreen** (`mobile/src/screens/shared/KYCScreen.js`) — 4-step flow with SA ID validation, selfie, success
- **DashboardScreen (Labourer)** — shows ⚠️/✅ badge with tap-to-verify
- **HomeMapScreen (Customer)** — shows ⚠️ banner with tap-to-verify
- Both customer and labourer stacks have the `KYC` route registered

---

## Pricing Reference (Smile ID)

| Tier | Volume | Cost |
|------|--------|------|
| Free | 300/month | $0 |
| Starter | up to 1,000/month | ~$0.20/verification |
| Growth | up to 10,000/month | ~$0.15/verification |

See https://usesmileid.com/pricing for current rates.
