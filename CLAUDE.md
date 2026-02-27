# Togt — Project Brief for Claude

## What is this?
Togt is an **Uber-for-labourers** mobile app for South Africa. It connects skilled Togt labourers (day workers) who struggle to find customers, with customers who need services. Think Uber but for plumbers, painters, builders, tilers, electricians, etc.

## Stack
| Layer | Tech |
|-------|------|
| Mobile | React Native (Expo) — iOS + Android |
| Backend | Node.js + Express |
| Database | PostgreSQL |
| Real-time GPS | Socket.io |
| Payments | Peach Payments (South African gateway) |
| State management | Redux Toolkit |

## Repository structure
```
/Togt
├── backend/               # Node.js API server
│   ├── src/
│   │   ├── config/        # db.js (PostgreSQL pool), env.js
│   │   ├── middleware/    # auth.js (JWT), errorHandler.js
│   │   ├── routes/        # auth, labourers, bookings, payments, ratings
│   │   ├── sockets/       # location.js — real-time GPS via Socket.io
│   │   └── db/migrations/ # 001_initial.sql — full schema
│   ├── package.json
│   └── .env.example       # copy to .env and fill in values
│
└── mobile/                # Expo React Native app
    ├── App.js             # Entry point — Redux Provider + AppNavigator
    ├── src/
    │   ├── navigation/    # AppNavigator, AuthStack, CustomerStack, LabourerStack
    │   ├── screens/
    │   │   ├── auth/      # OnboardingScreen, LoginScreen, RegisterScreen
    │   │   ├── customer/  # HomeMapScreen, LabourerProfileScreen, BookingFormScreen,
    │   │   │              # ActiveBookingScreen, PaymentScreen, RateScreen, MyBookingsScreen
    │   │   └── labourer/  # DashboardScreen, ProfileSetupScreen, JobRequestsScreen,
    │   │                  # ActiveJobScreen, EarningsScreen
    │   ├── components/    # StarRating, LabourerCard, BookingStatusBadge
    │   ├── services/      # api.js, authService, bookingService, locationService, socketService
    │   ├── store/         # authSlice.js, bookingSlice.js, store.js
    │   └── utils/         # formatters.js (ZAR currency, dates, status colours)
    └── package.json
```

## Database schema (PostgreSQL)
- `users` — id, name, email, phone, password_hash, role (customer|labourer), avatar_url
- `labourer_profiles` — user_id, skills[], hourly_rate, bio, id_number, is_available, current_lat/lng, rating_avg, rating_count
- `bookings` — id, customer_id, labourer_id, status, skill_needed, address, location_lat/lng, scheduled_at, hours_est, total_amount, notes
- `payments` — id, booking_id, amount, currency (ZAR), status, peach_checkout_id, peach_result_code
- `ratings` — id, booking_id, reviewer_id, reviewee_id, score (1-5), comment

## Booking state machine
```
pending → accepted → in_progress → completed
       → cancelled (by customer from pending or accepted)
       → cancelled (decline by labourer from pending)
```

## API endpoints
- `POST /auth/register` — role: 'customer' or 'labourer'
- `POST /auth/login` → returns accessToken + refreshToken
- `POST /auth/refresh`
- `GET /labourers?lat=&lng=&skill=&radius=` — Haversine geo-search
- `GET /labourers/:id` — profile + recent reviews
- `PUT /labourers/profile` — update skills, rate, bio (labourer only)
- `PUT /labourers/availability` — toggle is_available
- `PUT /labourers/location` — update GPS (polling fallback)
- `POST /bookings` — customer creates booking
- `GET /bookings/my` — own bookings (customer or labourer)
- `GET /bookings/:id`
- `PUT /bookings/:id/accept|decline|start|complete|cancel`
- `POST /payments/initiate` — creates Peach Payments checkout
- `POST /payments/webhook` — Peach result notification
- `GET /payments/status/:bookingId`
- `POST /ratings` — submit rating (auto-updates labourer rating_avg)
- `GET /ratings/labourer/:id`

## Real-time GPS
- Socket.io namespace: `/location`
- Auth: JWT token in `socket.handshake.auth.token`
- Labourer emits `location:update` with `{ bookingId, lat, lng }`
- Customer joins room `booking:{bookingId}` and receives updates live

## Environment variables needed
```bash
# backend/.env
DATABASE_URL=postgresql://user:pass@localhost:5432/togt
JWT_SECRET=...
JWT_REFRESH_SECRET=...
PEACH_ENTITY_ID=...
PEACH_ACCESS_TOKEN=...
PEACH_BASE_URL=https://eu-test.oppwa.com  # test env

# mobile — in app.json extra or .env
EXPO_PUBLIC_API_URL=http://localhost:3000
EXPO_PUBLIC_GOOGLE_MAPS_KEY=...
```

## How to run
```bash
# 1. Backend
cd backend
npm install
cp .env.example .env   # fill in values
npm run migrate        # runs SQL migrations against your PostgreSQL
npm run dev            # starts on port 3000

# 2. Mobile
cd mobile
npm install
npx expo start         # scan QR with Expo Go app
```

## What's been built (MVP complete)
- [x] User registration + login (customer and labourer roles)
- [x] Labourer profile: skills, hourly rate, bio, SA ID, photo
- [x] Availability toggle (appears/disappears on customer map)
- [x] GPS-based labourer discovery map with skill filters
- [x] End-to-end booking flow (request → accept → start → complete)
- [x] Live GPS tracking (Socket.io) — customer sees labourer moving on map
- [x] Peach Payments integration (ZAR, WebView checkout)
- [x] Star ratings + reviews after completed jobs
- [x] Labourer earnings screen

## What still needs to be built (next steps)
- [ ] Push notifications (Expo Notifications) for booking events
- [ ] Date/time picker UI for booking form (currently free-text ISO string)
- [ ] Image upload to cloud storage (currently stores URI directly)
- [ ] Admin dashboard for managing users and disputes
- [ ] Multi-language support (Zulu, Xhosa, Afrikaans, English)
- [ ] Background location permission for labourers en route
- [ ] Payment payout system for labourers
- [ ] In-app messaging between customer and labourer
- [ ] ID/skills verification workflow

## Brand colours
- Primary green: `#1A6B3A`
- Success: `#10B981`
- Warning/stars: `#F59E0B`
- Error: `#EF4444`
- Background: `#F9FAFB`
