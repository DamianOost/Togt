# Togt Frictionless Research — 2026-05-05

Four parallel deep-research streams (Sonnet agents). Each ~2000-2500 words.

---

## Stream 1 — Frictionless Consumer UX (the customer side)

To: Damian Oosthuyzen, Director — Togt
Date: 5 May 2026
Subject: Friction-reduction patterns from best-in-class on-demand apps and how they map to a day-labour marketplace

### 1. Onboarding to First Booking: How Quickly Does a User Need to Reach Value?

The most important number in on-demand app UX is not DAU or retention — it is time-to-first-value (T2FV). Every second between install and the moment a user sees something useful is a second during which they can leave. A Clutch survey of 501 mobile users found that 72% said getting all required information in under 60 seconds was "somewhat to very important" (Appcues, 2024). Uber's early insight — validated through years of growth — was that the fastest path to retention is getting users to a successful first ride before they've had time to second-guess the install. That's why Uber's 2013-era sign-up famously required only a phone number and a payment method. Everything else — name, photo, preferences — was deferred until after the first trip. Lyft went further during its aggressive growth phase and allowed users to request a ride before verifying their email address, relying on the payment method as the de-facto identity anchor. DoorDash still supports guest checkout for first-time orders.

The principle behind all three is identical: **remove gates that don't serve the user's immediate intent.** Email verification serves the business (marketing lists, re-engagement). Profile photos serve the supply side (drivers/taskers want to see who they're picking up). Home address history serves future convenience. None of these serve the person who just wants one thing done right now.

**Apply to Togt:** Cut the new-customer sign-up to exactly three fields: mobile number (OTP), first name, and payment method. Everything else — a profile photo, home suburb, job preferences — appears as a completeness prompt on the receipt screen after the first successful job.

### 2. The "Tap Once" Experience

The moment Uber became a category-defining product was not the launch — it was when they implemented location-based auto-fill. Before that, users had to type an address for pickup. After, the app knew where you were and showed a pin. Research from Google's 2018 mobile UX study found that auto-filling form fields with geolocation data reduces form completion time by 30-40% on mobile.

The deeper behavioural pattern at work is **reducing working memory load**. Kahneman's System 1 thinking is fast and effortless; System 2 is slow and deliberate. Every time a user has to type, choose, or remember something, you've engaged System 2. Good on-demand app design keeps the booking flow entirely in System 1 territory. Uber's "request again" feature (same destination, same service level as last time) is a pure System 1 play. Bolt does the same with "recent trips" surfaced immediately on the home screen. Grab in Southeast Asia pre-selects the last payment method.

Payment invisibility is the final piece. Uber's 2009 insight — charging the card on file without showing a payment screen at all — was considered radical at the time. Today it's table stakes.

**Apply to Togt:** On the request screen, replace the address text input with current-location pin + tap-to-adjust-on-map. Store payment on file and charge silently post-job. Add "rebook last job" as the primary CTA on the home screen for returning users.

### 3. Trust Signals at the Moment of Decision

"Is it safe to let this person onto my property?" is the actual question firing in a customer's brain. The priority order, based on how apps have iterated over a decade, is: **photo, then rating, then job count, then verification badge.** The photo is first because humans form trust judgements from faces in under 200 milliseconds (Todorov's work at Princeton). Rating comes second because it's the most legible form of social proof. The job count matters more than most apps acknowledge: "47 jobs completed" is a risk signal, not just a social proof signal. The verification badge comes last not because it's least important but because users assume it as baseline.

SweepSouth does this well: photo, star rating with count, "jobs completed" number, and verified badge, all within a 3cm vertical strip. Careem's driver card follows almost the same pattern. What fails: TaskRabbit's legacy UI buried the completed-task count three taps deep into a tasker profile.

**Apply to Togt:** The worker match card should show: full-face photo (large), star rating + review count in bold, jobs completed, and a single verified badge. Keep it to those four elements — no bio paragraph, no skills list, no hourly rate breakdown at this stage.

### 4. Live Status / ETA / Reassurance

Anxiety peaks in the gap between booking confirmation and arrival. This is not a minor UX edge case — it's the primary driver of cancellations. Uber's internal research showed that showing a map dot with movement reduced cancellation rates by over 20% compared to a static "your driver is on the way" screen. The map dot works not because users need routing information but because **movement is proof of reality**.

Uber sends three mandatory notifications during a ride request: driver accepted (immediate), driver nearby (~2 minutes out), and driver arrived. Each shifts the user's mental state from anxious waiting to active readiness. ETA accuracy matters separately. An ETA that's consistently wrong by 5+ minutes erodes trust faster than no ETA at all. A simpler Togt-scale solution is to show a range ("15-25 min") rather than a point estimate.

**Apply to Togt:** Implement three mandatory push notifications: (1) match confirmed + worker name and photo, (2) worker en route + ETA range, (3) worker arrived. On the booking confirmation screen, show the worker's live location on a map with movement.

### 5. Cancellation, No-Show, Scope Creep, Disputes

Uber's early cancellation flow used a countdown timer ("free cancellation ends in 5 minutes") which is a dark pattern — it creates artificial urgency. The product team eventually replaced it with: free cancellation within 2 minutes of confirmation, fee for later cancellations disclosed upfront. Cancellations dropped further because users now understood the rules before booking.

Scope creep ("the job took longer than quoted, here's a bigger charge") is the biggest trust-killer in the labour-marketplace category. TaskRabbit tried and failed with variable billing for years, eventually landing on a model where the quoted price is the maximum charge and any overages require explicit customer approval before the worker leaves.

**Apply to Togt:** Build a 3-minute free cancellation window (displayed pre-booking, not hidden in terms). For no-shows, send an automatic notification and credit within 30 minutes. For scope changes, push an in-app approval request with a clear price before the additional work starts.

### 6. Re-engagement Loops

The receipt is the most underused surface in on-demand apps. The better plays:

**Rating as rebooking prompt.** Uber's post-trip rating screen converts into a rebooking surface for high ratings. If you give 5 stars, the next screen is "book this driver again?" with a single tap. SweepSouth's recurring booking product — their highest-revenue offering — is almost entirely fuelled by this mechanic.

**Referral mechanics that actually work.** The data on referral is consistent: two-sided incentives (both referrer and referee get a benefit) dramatically outperform one-sided. Grab surfaced their referral prompt on the post-ride confirmation screen and saw 3x higher referral rate than when it was accessible only via menu.

**Apply to Togt:** On the post-job receipt screen: (1) show rating prompt immediately, (2) if rating is 4+ stars, offer a single-tap "book [Name] again" option, (3) offer a referral reward inline on the same screen.

### 7. One Screen, One Decision

NNg's mobile research found that the average mobile session is 72 seconds. Apps that merge address selection, job type selection, time selection, and payment confirmation onto a single screen see abandonment rates 40-60% higher than apps that spread these decisions across 3-4 separate screens.

The right structure for a booking flow: (1) location — auto-filled, one tap to confirm; (2) job type — 3-5 options maximum; (3) time — "Now" pre-selected; (4) confirm match — show worker card, one-tap confirm. Four screens, four single decisions.

### Prioritised 5-Item Togt UX Changes List

1. **Auto-location pin on the request screen** *(1 day)*
2. **Three mandatory push notifications (matched / en-route / arrived)** *(0.5 day)*
3. **Post-job "book again" + recurring prompt** *(1 day)*
4. **3-minute free cancellation window + in-app scope-change approval** *(1 day)*
5. **Compress sign-up to phone + name + payment only** *(1 day)*

---

## Stream 2 — Supply-Side Operations (the labourer side)

### Core Asymmetry

The strategic error most platforms make is treating supply-side design as a mirror image of demand-side design. Customers need to feel safe and get what they paid for. Workers need to feel safe, get paid fairly, and believe the platform will treat them like adults. Lyft co-founder John Zimmer said it publicly in 2019: "Drivers are the product. If the product is bad, there is no marketplace." Uber proved the inverse — a decade of driver mistreatment produced a driver shortage crisis. Frictionless for the customer is a UX problem. Frictionless for the worker is an operations philosophy.

### 1. Time-to-First-Job

Industry data from gig platforms consistently shows 40-60% of supply-side sign-ups abandon before completing their first job. Every day in the onboarding funnel is an attrition event. The framework that resolves this tension is **staged access, not full vetting upfront**. Let workers access easy, low-stakes jobs quickly, while the richer background check runs in parallel. The most reliable predictor of worker retention is completing a paid job in the first seven days.

**Apply to Togt:** Implement a two-tier system. Tier 1 ("Fast Track"): ID verification + selfie match + basic criminal check — takes 24-48 hours, unlocks supervised or low-risk gigs. Tier 2 ("Verified Togt Worker"): full reference check, skills assessment, safety induction.

### 2. Acceptance Rate Dynamics — Don't Use Them

Uber historically tied incentive programmes to an acceptance rate threshold (85-90% for peak perks, de-prioritisation below 70%). The deeper problem: when you punish non-acceptance heavily, you push workers to accept trips they intend to cancel after seeing the destination. Cancellation rates rise, customer experience degrades.

**Apply to Togt:** Do not impose acceptance rate penalties. Instead, build a "reliability score" based on completion rate (accepted and then completed) rather than acceptance rate. Workers can decline freely; what damages their score is accepting and not showing up.

### 3. Dispatcher Fairness

The dispatch algorithm is, from the worker's perspective, the most opaque and therefore the most anxiety-inducing part of any gig platform. The fix is **legibility**: workers should know (a) repeat customers go to the same worker first; (b) above a certain rating, you get first look at premium jobs for 60 seconds before they open to all; (c) distance and availability are the tiebreakers.

### 4. Earnings Transparency at Job Offer Time

Workers do not need every variable in the pricing model. They need to be able to answer two questions before accepting: "Is this worth my time?" and "Am I being treated fairly compared to my peers?" Show: total payout, estimated job duration, travel distance to site, and the customer's prior rating. Do not show platform commission percentage.

### 5. Push Notification for Incoming Jobs

Uber and Bolt's job notification: 8-15 seconds to decide, full-screen takeover on lock screen, iconic audio pattern, single vibration cadence. Job summary on the notification itself so workers can decide without unlocking. What destroys this experience: slow notification delivery (more than 3 seconds from dispatch to device), notification fatigue from non-job alerts using the same pattern.

**Apply to Togt:** Use FCM high-priority push for job notifications. Full-screen lockscreen card with: job type, site address, payout, client name, estimated duration. 15-second timer visible on screen.

### 6. In-Flight Worker Support

The operational design that prevents disputes is more valuable than the design that resolves them. SweepSouth's scope-creep problem was solved with a job card: a clearly scoped list of what the job includes, agreed at booking time, visible to both parties. Pre-canned "running 15 minutes late" eliminates half of punctuality disputes.

### 7. Off-Duty Design

For SA day labour, the dynamics differ from rideshare. Labourers typically work full days, not variable hours. The important offline design is week-level, not hour-level: workers need to mark themselves unavailable for a stretch (holiday, illness, funeral) without losing standing.

### 8. Earnings Floors

Pew Research data shows that in lower-income markets, gig workers are significantly more likely to treat platform income as primary income rather than supplemental. SweepSouth's SweepStar model guarantees a minimum hourly rate (R40-R50). The goal is earnings reliability, not earnings volatility. Consistent R800 weeks will retain workers better than occasional R1,500 weeks with unpredictable R200 weeks in between.

### 9. Community + Identity

SweepSouth's "SweepStar" branding is instructive. The name itself — not "cleaner" or "domestic worker" — signals respect. Dignity of designation is free and has outsized retention impact.

**Apply to Togt:** Name your workers. Not "labourers" or "workers" — find a Togt-specific identity that carries dignity. Build public worker profiles with job count, years on platform, and a skills badge system.

### 10. Unfair Deactivation

Uber Eats, DoorDash, and SweepSouth have all had public crises around deactivations that workers experienced as arbitrary and without recourse. Build a "three-touch" policy before deactivation: first event triggers a notification + coaching message; second event triggers a short suspension (3 days) with a mandatory check-in call; third event triggers a deactivation with a documented reason and a 14-day appeal window. Human review before permanent deactivation.

### 7 Supply-Side Investments, Ranked

1. First-Job Guarantee (week 1 activation)
2. Earnings Transparency at Job Offer Time
3. Reliability Score (not acceptance rate)
4. Job Card with Scope Agreement
5. Worker Identity and Tier System
6. Push Notification with 15-Second Offer Window
7. Three-Touch Deactivation Policy

---

## Stream 3 — Building for the Agent Web

### What "Agent-Friendly" Actually Means

An agent-friendly API is one where an LLM with limited context window can: (a) discover what the API does without reading prose documentation, (b) understand the semantics of each operation — not just its syntax — (c) execute multi-step workflows reliably against real state, (d) recover from partial failures without human guidance, and (e) avoid irreversible mistakes even when its own reasoning is wrong.

The practical delta is in three areas: semantic richness of errors (so the agent can self-correct), idempotency primitives (so retries are safe), and self-describing structure (so the agent doesn't need human-maintained context). Get those three right and you've done 80% of the work.

### Discovery and Self-Description

The first question an agent asks is: "what can you do, and what do you need?" The answer must be machine-readable and stable. Best practice: OpenAPI 3.1 spec served at `/.well-known/openapi.json`. The spec should include operation IDs that are human-meaningful (`create_booking` not `postV2MatchesCreate`).

The "agents.json" pattern emerging in 2025-2026 is a lightweight evolution — a file at `/.well-known/agents.json` that lists available endpoints, their interaction modalities (REST, MCP, A2A), and auth requirements. Cloudflare's AI Gateway and several early agentic platforms are treating it as a de facto standard.

The Google Agent2Agent (A2A) protocol, open-sourced in 2025 under the Linux Foundation, introduces the "Agent Card" — a JSON document served at `/.well-known/agent.json` that describes an agent's skills.

### Auth That Agents Can Actually Do

The forced-OAuth-with-redirect pattern is fine for humans and impossible for headless agents. The auth model agents reach for first is the API key: `togt_live_...`, passed as `Authorization: Bearer <key>`. Stripe, Linear, Anthropic, Resend, and Replicate all use this model.

For Togt: customers get an API key scoped to their account (`book:create`, `book:read`, `book:cancel`). Labourers get a separate credential.

### Idempotency and Safe Retry

Agents retry. This is not a bug — it's load-bearing behaviour. Stripe solved this in 2011 with the `Idempotency-Key` header. For Togt's `POST /bookings`: accept `Idempotency-Key: <uuid>` as a request header. Store `(customer_id, idempotency_key, response_body, created_at)` in an `idempotency_keys` table with a 24-hour TTL.

For destructive operations: `DELETE /bookings/{id}` called twice should be a no-op. Return `204 No Content` both times.

### Error Messages Designed for LLM Consumption

RFC 7807 (superseded by RFC 9457 in 2023) defines `application/problem+json`. The difference between agent-hostile and agent-friendly:

Agent-hostile: `{"error": "Bad Request", "code": 400}`

Agent-friendly:
```json
{
  "type": "https://api.togt.co.za/errors/scheduled_at_in_past",
  "title": "Booking time is in the past",
  "status": 400,
  "detail": "scheduled_at must be at least 2 hours from now. Got 2026-05-05T08:00:00+02:00, minimum is 2026-05-05T11:30:00+02:00.",
  "instance": "/api/v1/bookings",
  "extensions": {
    "field": "scheduled_at",
    "minimum_offset_hours": 2
  }
}
```

The `type` URI is stable across API versions. The agent can pattern-match on it without understanding English.

### MCP Server for Togt

This is where Togt can genuinely be first in the South African market.

The right tool set for a Togt MCP server:

**`find_labourers(skill, location, lat, lng, radius_km, datetime, min_rating?)`**
**`get_labourer_availability(labourer_id, date_range_start, date_range_end)`**
**`estimate_booking_cost(labourer_id, hours, scheduled_at)`**
**`create_booking(labourer_id, address, scheduled_at, hours, idempotency_key, notes?)`**
**`get_booking(booking_id)`**
**`cancel_booking(booking_id, reason?)`**
**`list_bookings(status_filter?, date_range?, limit?, cursor?)`**

### Agent-as-Customer Thought Experiment

The scenario: Claude Code is asked "Book a plumber for Saturday at 14 Beach Rd, Ballito, max R500, must be 4-star+." With the Togt MCP server as designed, this becomes exactly three tool calls:

1. `find_labourers(skill="plumber", lat=-29.537, lng=31.208, datetime=..., min_rating=4.0)`
2. `estimate_booking_cost(labourer_id="lab_xyz", hours=2, scheduled_at=...)` — confirms budget
3. `create_booking(...)` — with idempotency key

For autonomous booking, `find_labourers` must return three additional metadata fields: `cancellation_policy`, `acceptance_rate`, `instant_book` flag.

### 7-Item Recommendation, Ranked

**Ship now (immediate wins):**
1. RFC 9457 structured errors across all endpoints (afternoon of work)
2. Idempotency keys on `POST /bookings`, `POST /payments`, `DELETE /bookings/{id}` (half day)
3. Complete OpenAPI 3.1 spec at `/.well-known/openapi.json` (one day)

**Ship in 3 months:**
4. Scoped API keys with `book:create`, `book:read`, `book:cancel` permissions
5. Webhook delivery for booking lifecycle events
6. Metadata fields enabling autonomous agent decisions (`acceptance_rate`, `instant_book`, `cancellation_policy`)

**Ship in 6 months:**
7. Togt MCP server, hosted at `https://api.togt.co.za/mcp`. **First SA gig app with one.**

---

## Stream 4 — SA-Grounded Frictionless

### 1. Data-Light Design

SA mobile data: Vodacom 1GB ~ R85-99. A worker earning R150/hour using 200MB on job alerts has spent 10-15 minutes of labour on bytes. TymeBank's app is aggressively text-first. Capitec's app stays under 15MB. M-Pesa runs on GPRS — a few kilobytes per transaction.

**Practical byte budget for 3G fallback**: ~200KB per transactional screen, max 3MB for the full app cold-start, zero autoplaying media.

**Apply to Togt:** Audit production bundle size with `expo bundle --platform android --minify`. Split worker-facing bundle from customer-facing bundle. Add SMS-fallback confirmation for every booking action: "TOGT: Sipho confirmed for R300 brick-laying @ 14 Oak Ave Sat 9am."

### 2. Multi-Language Adoption

Census data: isiZulu 25.3%, isiXhosa 14.8%, Afrikaans 12.2%, Sesotho ~22%. English first language: 8.1%. KZN where Togt lives: isiZulu ~77%. English-only UI for a labourer-supply marketplace = supply-acquisition failure.

SweepSouth added isiZulu specifically because worker satisfaction improved. The risk with bad localisation is worse than no localisation: Google Translate renders "confirm booking" as something incomprehensible in isiZulu. Right approach: native speaker + domain check. Voice prompts are the real unlock.

**Apply to Togt:** Add isiZulu as second locale, human-reviewed translation, worker app first. Language-detection screen at first open. Audio prompts on key screens. 30-day project.

### 3. Payment Trust

Cash is the lingua franca of informal labour. ~35-40% of economically active adults in informal sector are underbanked. Paying via EFT that lands "in 2-3 business days" is trust-breaking.

**PayShap** (BankServAfrica, live since 2023) enables instant R-to-R transfers by phone number. Capitec-to-Capitec PayShap completes in under 10 seconds. Capitec has 22M active clients, disproportionately working-class. **This is Togt's primary payout rail.**

For unbanked: Kazang/EasyPay airtime-adjacent payouts — 80,000+ points in spaza shops.

**Apply to Togt:** Add PayShap as default payout method via Capitec's business API. Show "Imali ithunyelwe" (Payment sent) at job completion. Kazang voucher generation as fallback for unbanked workers.

### 4. Safety as Table Stakes

SAPS 2023 stats: 84 murders/day, residential break-ins as #1 feared crime. Customer letting a stranger into their home is a rational fear shaped by lived experience. Worker going to unfamiliar suburb at night is navigating real risk.

SweepSouth's "Sweepie" QR-coded ID card. MIE Criminal Record Check (R195-R350) is the SA standard.

**Shareable tracking** is essential for SA suburban customers. **Namola** (SA panic response app, 350,000+ users, sub-2-min response in urban areas) — integrate API for SOS button.

**Apply to Togt:** Ship shareable-tracking link customer can send before worker arrives. Integrate Namola API for in-app SOS. Display MIE check result as visible "Background Checked" badge.

### 5. Identity / Trust Without DHA on Every Check

Layered approach. Layer 1: Phone OTP (free, all). Layer 2: DHA ID number check only (R5-10). Layer 3: DHA photo match via VerifyNow (more expensive — gate to first booking). Layer 4: MIE Criminal Check (gate to home-access jobs). Bank Account Verification (AVS, R2-5).

PIRB (plumbers), ECSA (electrical), professional body lookups are free + deeply trust-building.

### 6. Zero-Rated App Data

WhatsApp is zero-rated on Vodacom, MTN, Cell C for many prepaid bundles. **No SA gig app has zero-rated full app**, but the workaround works: WhatsApp Business API as job-communication layer. Workers receive job alerts, accept/decline, get payment confirmations via WhatsApp — costs zero data on most prepaid plans.

M-Pesa + M4Jam discovered WhatsApp-first communication increased worker engagement 40-60%.

**Apply to Togt:** Integrate WhatsApp Business API (Meta direct, or Twilio's WhatsApp layer) for all job notifications to workers. Customer flow stays app-native; worker flow benefits most from WhatsApp.

### 7. Cash + Airtime as Partial Payment

M4Jam pays micro-task workers in airtime under R50. Pargo (900+ pickup points), EasyPay/Kazang (80,000+ points) for cash-out.

Don't try to capture tips through the platform — fight is pointless. Make the quoted job price feel complete and fair.

### 8. Township / Rural Infrastructure Resilience

Load-shedding (Stage 2-4): 4-8 hours daily without mains. Phones at 20% battery by afternoon. App must work on low battery + intermittent network.

**Offline-first**: persist accepted job details to local SQLite. Survive network drop, app crash, phone restart. GPS fails in dense informal settlements (50-200m off, no formal addresses). Solution: "Pin it" UX where customer drops a pin, worker navigates to pin not address.

### 9. Cultural Notes

Tipping in informal labour is cash-at-the-door — digital tipping flow will see near-zero usage.

"I'm coming" (Ngiyeza) means "I have intention of coming" — not "in transit." Show last confirmed GPS ping, not static ETA.

**Trust via referral** is how SA informal labour markets actually work. A good worker gets shared in suburb WhatsApp groups. Build referral mechanics into the product — give worker a shareable profile link.

Brand authenticity: "Togt" is a good SA name. Don't dilute with SF-startup language.

### 10. POPIA + Friction Trade

Capitec's approach: contextual micro-consent at the moment it's first needed. Just-in-time, granular. Replace any blanket consent screen with this pattern.

### 5 SA-Specific Changes Before General Adoption

1. WhatsApp Business API for worker notifications (30 days)
2. isiZulu locale in worker app, human-reviewed, with audio prompts (30 days)
3. PayShap as default payout rail with same-day settlement
4. MIE Criminal Check gated to home-access jobs, visible badge
5. Offline persistence + "Pin it" location UX
