# Togt App — Gig Economy Market Research Report
*Compiled: March 2026 | Researcher: George (AI)*

---

## Executive Summary

The on-demand labour market in South Africa is a high-growth, high-stakes opportunity. SweepSouth has 1.2M+ registered workers. Youth unemployment sits at 60.9% (World Bank 2024). Africa's informal sector represents 85% of the labour force. The market is ready — but trust, payment access, and worker dignity are the three make-or-break axes. Togt can win by doing what incumbents won't: genuinely protecting both sides.

---

## Top 10 Features to Implement (Ranked by Impact)

### #1 — Verified Worker Profiles with Trustworthy Badges
**Impact: Critical**

Every top-rated platform (Uber, SweepSouth, TaskRabbit) leads with verification. Users won't book strangers without it. In South Africa, fear of crime makes this non-negotiable for customers.

- **ID verification** via SASSA/Home Affairs API or a partner like Smile Identity (SA-native, works with SA IDs)
- **Criminal background check** integration — partner with MIE (Managed Integrity Evaluation), SA's largest background screener
- **Skills verification** — simple practical test or portfolio upload (photos of past work)
- Visible "Togt Verified ✓" badge on profiles
- Photo ID must match selfie (liveness check)

> **SweepSouth's model:** 5-day mandatory training + entrance test. Replicate this onboarding rigour.

---

### #2 — Transparent, Instant Payout System
**Impact: Critical**

Workers choose platforms based on when and how they get paid. Cash-in-hand is still king in townships. Platforms that delay payment or have opaque fee structures lose workers fast.

- **Instant payout after job completion** — not weekly, not monthly
- Support for workers **without bank accounts**: integrate with Kazang/EasyPay ecosystem (100,000+ cash-out points nationally)
- **PayShap** for instant bank-to-bank transfers (phone number as ShapID — no bank details needed, R3,000 cap)
- **Capitec Pay** integration — most common bank among lower-income workers (USSD: *120*3279#)
- In-app **wallet** so workers can accumulate and cash out at spaza/Kazang agent
- Clear fee display: show "Togt takes X%, you earn Y" before they accept a job

---

### #3 — Simple 3-Step Booking Flow (Customer Side)
**Impact: High**

The biggest drop-off in service marketplaces is booking friction. Research shows 50%+ abandon complex booking flows. Keep it ruthlessly simple.

**The 3-step rule:**
1. What do you need + when?
2. Choose a worker (or auto-match)
3. Confirm + pay

- No registration required for first booking (progressive onboarding)
- Price shown upfront — no "get a quote" friction where possible
- Auto-match option for commodity tasks (cleaning, gardening) where customer doesn't care who
- Choose-your-worker option for specialty tasks (plumber, electrician)
- Availability calendar sync for scheduled bookings

> **Key insight from Sharetribe research:** The more back-and-forth required before booking, the higher the abandonment. Package services at fixed rates where possible.

---

### #4 — Real-Time Job Tracking & Notifications
**Impact: High**

Uber proved that the live map changed consumer expectations forever. Customers want to know the worker is on the way. Workers want to know a job is confirmed.

- Live GPS tracking when worker is en route
- Push notifications at key milestones: "Job accepted", "Worker on the way", "Worker arrived", "Job complete"
- WhatsApp notification fallback (many SA users prefer WhatsApp over app push)
- Job timer visible to both sides
- **Overtime alert:** automatic notification if job duration is exceeding booking — prompts customer to extend + pay, not freeload

---

### #5 — Dual-Sided Review & Rating System
**Impact: High**

Trust is built incrementally through reviews. Both platforms that succeed (Airbnb, Uber, TaskRabbit) use bidirectional rating. The key is preventing abuse.

- Customer rates worker **and** worker rates customer
- Customer star ratings are visible to workers before accepting a job (protects workers from problem clients)
- **Anti-retaliation protection**: ratings only revealed simultaneously after both parties submit (like Airbnb)
- Ability to add specific feedback tags (e.g., "arrived late", "excellent work", "asked for overtime")
- Workers with <3.5 stars get a support call, not instant deactivation
- **Appeal process** for disputed deactivations — SweepSouth's failure here has become a PR crisis

---

### #6 — In-App Messaging with Scope-of-Work Clarity
**Impact: High**

A major source of disputes (and the SweepSouth nightmare) is scope creep — customers adding work beyond what was booked. Build guardrails into the communication flow.

- In-app chat (no phone numbers shared until after first job — safety)
- **Pre-job checklist**: customer and worker confirm scope before work starts
- Any additional tasks requested mid-job trigger an in-app change order with extra payment
- Dispute resolution via support ticket with chat log as evidence
- No external communication required for basic coordination

---

### #7 — Flexible Scheduling (On-Demand + Pre-Booked)
**Impact: High**

Different job types need different booking models. Don't force all work into one flow.

- **On-demand**: available within 1-2 hours (cleaning, gardening, delivery)
- **Scheduled**: book up to 30 days ahead (electricians, plumbers, painters)
- **Recurring bookings**: weekly/fortnightly cleaner (SweepSouth's best-performing feature)
- Worker sets their own availability calendar
- Standby/surge mode: workers can flip "available now" and get sent nearby jobs

---

### #8 — Multilingual Support (SA-First)
**Impact: High for SA specifically**

Low digital literacy + English-only interfaces = massive drop-off among the worker base Togt is targeting. This is a genuine competitive differentiator.

- **Worker app in Zulu, Xhosa, Sotho + English** (these four cover ~75% of SA's population)
- Voice-based onboarding option (read instructions aloud via TTS)
- Simple icon-based UI that works even with low literacy
- USSD fallback for workers on feature phones (*120*TOGT# style)
- SMS confirmations in preferred language

---

### #9 — Safety Features for Both Sides
**Impact: High**

SA-specific: customers fear inviting strangers into their homes. Workers fear going to unfamiliar areas. Both fears are legitimate.

**Customer-side:**
- Background-checked + ID-verified workers
- Worker photo must match profile photo
- Share job ETA with a friend/family member (like Uber share ride)
- Panic button (in-app, sends location to emergency contact + Togt support)

**Worker-side:**
- Customer ratings visible before accepting
- Known high-risk areas flagged
- Emergency SOS button
- Insurance coverage (like TaskRabbit's Happiness Pledge — cover up to a defined amount for injury/damage)
- Togt commits to paying worker if customer disputes and evidence supports worker

---

### #10 — Worker Earnings Dashboard & Income Transparency
**Impact: Medium-High**

Workers who can see their earnings trajectory stay on the platform. Those who feel financially blind churn.

- Weekly earnings summary
- Earnings breakdown: gross, Togt fee, net
- Total jobs, hours worked, rating trend
- Goal-setting tool ("R2,000 this week — you're 60% there")
- Tax certificate at year-end (critical for formal compliance)
- Comparison to minimum wage (show workers they're earning fairly)

---

## SA-Specific Considerations

### The Digital Divide is Real
- 35% of SA adults have no internet access
- Rural areas have near-zero smartphone penetration
- **Design for Android first** (iOS is a secondary market in SA's informal economy)
- Optimise for **low-bandwidth / data-light** operation — consider a "lite" app under 5MB
- Data costs remain a barrier: consider zero-rating the Togt app with MTN/Vodacom/Cell C (precedent: WhatsApp is zero-rated on some plans)

### Language
- English-only apps lose a huge portion of the potential worker market
- Afrikaans, Zulu, Xhosa, Sotho should be first-tier languages (not afterthoughts)
- Simple, plain language in all communications — legalese kills trust

### Safety Culture
- 57 murders per 100,000 people in SA — safety is not a feature, it's a foundation
- Customers: verified photo ID match, real-time tracking, share-my-trip
- Workers: customer pre-screening, job location risk rating, emergency contacts

### Social Trust Networks
- SA workers trust via community referral more than algorithmic stars
- Consider a **referral bonus programme**: workers who refer other workers get a bonus
- Community WhatsApp groups are how gig workers currently organise — Togt should tap this, not fight it

### Unemployment Context
- With 60.9% youth unemployment, supply (workers) is not the problem
- The challenge is building **demand** (customers willing to use a formal platform)
- Price competitiveness with informal cash arrangements matters

### Load Shedding
- Offline mode essential — workers often have no connectivity during jobs
- Job details must be downloadable/cached before leaving home
- Offline job completion + sync when reconnected

---

## Trust & Safety Must-Haves

### Worker Verification Stack
| Verification Type | Provider | Cost Indication |
|---|---|---|
| SA ID check | Home Affairs API / Smile Identity | ~R15/check |
| Criminal record | MIE / LexisNexis | ~R80-150/check |
| Address verification | GreenID / AFrica's Talking | ~R20/check |
| Selfie liveness check | Smile Identity / Onfido | ~R10/check |
| Skills assessment | In-house test | Once-off build |

**Total onboarding cost per worker: ~R150-200** — recoverable in the first job commission.

### Customer Trust Signals
1. "X background checks passed" displayed on every worker profile
2. Number of completed jobs visible
3. Average rating with review count
4. Response time (e.g., "Typically responds within 10 minutes")
5. Member since [date]
6. Any specialised certifications shown

### Dispute Resolution
- Clear SLA: disputes responded to within 24 hours
- Chat log from in-app messaging as evidence
- Pre-job scope-of-work confirmation prevents most disputes
- Worker compensation fund: Togt absorbs cost of fraudulent customer disputes (up to X amount per incident)
- Arbitration escalation path for larger disputes

### Insurance
- Partner with a micro-insurance provider (OUTsurance, Naked, or Genasys platform)
- Public liability cover for workers while on jobs
- Customer property damage cover

---

## Payment Stack Recommendation for SA

### Recommended Architecture

```
Customer Payment → Togt Escrow Wallet
                         ↓
           Job completion confirmed by both sides
                         ↓
    Worker Payout (within 1 hour of job completion)
         ↓               ↓               ↓
   Bank transfer     In-app wallet    Cash agent
   (PayShap/EFT)    (accumulate)    (Kazang/EasyPay)
```

### Payment Methods to Support

**Customer side (paying for jobs):**
- Credit/debit card via **Peach Payments** (best SA developer experience, supports 3D Secure)
- **Capitec Pay** (via Payfast by Network) — huge reach in lower-income market
- **PayShap** — instant, phone-number-based
- EFT / Ozow instant EFT
- Cash payment with in-app confirmation (for initial market penetration — phase this out)

**Worker side (receiving earnings):**
- **PayShap** — instant to any SA bank via phone number, no bank details needed
- Direct EFT to bank account (Capitec, FNB, Absa, Standard Bank, Nedbank)
- **In-app Togt Wallet** — accumulate earnings, cash out at Kazang/EasyPay agent network
- USSD-triggered payout for feature phone users

### Why Not M-Pesa?
M-Pesa has minimal SA penetration (dominant in Kenya/Tanzania, not SA). Vodacom tried and it didn't gain traction. Don't build around it for SA.

### Pricing Transparency
Workers must see exactly what Togt takes. Recommended fee structure to communicate clearly:
- Platform fee: 15% (competitive with Uber's 25%+, better than TaskRabbit's 33% marketplace fee)
- No hidden charges
- Optional worker tip — 100% goes to worker

---

## Monetisation Model Options

### Option 1: Commission-Based (Recommended for Launch)
- Togt takes **15% of every transaction**
- Currently the industry standard (Uber ~25%, SweepSouth ~15-20%, TaskRabbit ~15%)
- Simple, predictable, aligns incentives — Togt only earns when workers earn
- **Risk:** pressure from workers if % feels too high

### Option 2: Customer Subscription (Add-on, Phase 2)
- Monthly "Togt Pass" for frequent users (R99/month)
- Subscribers get: priority matching, locked-in rates, cancellation protection
- Proven model: Amazon Prime, Instacart+
- **Gig economy data:** subscription segment is the fastest-growing revenue model (Precedence Research 2024)

### Option 3: Worker Subscription Tier (Phase 2)
- Free tier: basic listing, 15% commission
- Pro tier (R149/month): featured placement, lower commission (10%), analytics dashboard
- Works well for workers who do high volumes (regular cleaners, plumbers, electricians)
- Reduces worker churn by creating platform stickiness

### Option 4: Premium Client Services (Phase 3)
- Verified "Togt Elite" workers at a premium price point
- Business accounts: companies booking cleaning/maintenance services
- API access for property managers, Airbnb hosts, estate agents

### Option 5: Value-Added Services
- **Micro-insurance** upsell for workers (margin on insurance partner)
- **Tools/equipment rental** brokerage (e.g., pressure washer, ladder — rent from a worker who owns it)
- **Training and upskilling**: paid courses (plumbing basics, first aid) — keeps workers on platform

### Recommended Revenue Mix
| Phase | Primary Revenue | Secondary Revenue |
|---|---|---|
| Launch (0-12 months) | 15% commission | Tips |
| Growth (12-24 months) | Commission + Customer subscription | Worker pro tier |
| Scale (24+ months) | Mixed + Business accounts | Insurance, training |

---

## What App Store Reviews Tell Us

### TaskRabbit — Common Complaints
- **Customer support disappears** when things go wrong ("sandbags you with bureaucracy")
- **High fees for workers** — 33% marketplace fee seen as exploitative
- Scam clients slipping through verification
- Job cancellations without fair compensation
- Workers punished in search rankings for turning down jobs (creates compliance over consent culture)

### SweepSouth — Common Complaints (Worker Side)
- **Scope creep/unpaid overtime** — clients request extra work, workers fear rating retaliation if they refuse
- **Opaque deactivation** — workers blocked without adequate explanation or right of reply
- **Grievance channels** feel inaccessible ("who do we report to?")
- Low hourly rates (R25/hr was called out as insufficient even by their own CEO)
- Workers dependent on the platform with no alternatives — power imbalance

### SweepSouth — Customer Side Positives
- Easy-to-use booking interface
- Vetted, trusted cleaners
- Profile browsing with reviews
- Ability to rebook favourite cleaners

### Uber — Common Complaints (SA Context)
- Safety concerns (crime incidents during trips)
- Surge pricing complaints
- Driver cancellations once they see location
- Support slow/unresponsive

---

## What Makes Labourers Choose One Platform Over Another

Based on research across SA gig economy studies (Fairwork, LRS, Brookings):

1. **Reliable, fast payment** — #1 factor. Delayed or opaque pay is the top reason workers leave.
2. **Steady flow of jobs** — workers need consistent work, not feast-or-famine
3. **Fair treatment and respect** — SweepSouth's "dignity of work" positioning works because it's real to workers
4. **Flexibility** — choose your own hours, decline unsuitable jobs without penalty
5. **Safety** — especially for women working in strangers' homes
6. **Low fees** — workers do the maths and move to the platform that leaves more in their pocket
7. **Word of mouth / community** — trust travels through WhatsApp groups and taxi queues

---

## Competitive Landscape Summary

| Platform | Market | Worker Score (Fairwork) | Key Strength | Key Weakness |
|---|---|---|---|---|
| SweepSouth | SA (domestic) | 7/10 | Worker dignity positioning, vetted workers | Scope creep, deactivation opacity |
| Uber | SA (rides) | 2/10 | Brand trust, GPS tracking, scale | Poor worker conditions, high commission |
| TaskRabbit | Global | N/A | Background checks, service breadth | High fees, poor dispute support |
| Bark.com | Global/UK | N/A | Lead-gen model (low risk) | Not a true marketplace, quality varies |
| Handy | US | N/A | Simple booking, insurance | US-centric, not SA-relevant |
| WumDrop | SA (delivery) | N/A | Cape Town courier pioneer | Niche, limited scale |
| Bolt | SA (rides) | 1/10 | Cheaper than Uber | Rock-bottom worker score |
| MrD | SA (food) | 6/10 | Food delivery leader | Food-only, not labour |

**Togt's opportunity:** Be the SweepSouth for all informal labour categories, but fix their worker-side problems. The bar is genuinely not high.

---

## Recommended Feature Roadmap — Implementation Order

### Phase 1: MVP (0-3 months)
- [ ] Worker ID + criminal background check at onboarding
- [ ] Simple 3-step booking flow (what, who, confirm + pay)
- [ ] In-app wallet + PayShap payout
- [ ] Dual-sided rating system (simultaneous reveal)
- [ ] In-app messaging with pre-job scope confirmation
- [ ] Push + WhatsApp job notifications
- [ ] Zulu/Xhosa/Sotho/English language toggle
- [ ] Android-first mobile app (lite, <10MB)

### Phase 2: Growth (3-9 months)
- [ ] Real-time GPS tracking
- [ ] Recurring/scheduled bookings
- [ ] Overtime change-order flow (kills scope creep)
- [ ] Worker availability calendar
- [ ] Customer subscription plan (Togt Pass)
- [ ] Kazang/EasyPay cash-out integration
- [ ] Worker earnings dashboard
- [ ] Customer "share trip" safety feature

### Phase 3: Scale (9-18 months)
- [ ] Micro-insurance integration
- [ ] Business/enterprise accounts
- [ ] Worker pro tier subscription
- [ ] Skills training marketplace
- [ ] Surge/demand-matching pricing
- [ ] USSD fallback interface
- [ ] API for property managers / Airbnb hosts

---

*Research sources: Fairwork SA reports, Brookings Institute (Africa Gig Economy, July 2025), Rest of World (SweepSouth investigation, May 2024), Sharetribe Academy (Booking Flow design), SiteJabber/Trustpilot reviews (TaskRabbit), Precedence Research (Gig Economy Tech Platforms market), Netcash/PayShap/Capitec Pay documentation, Kazang/Lesaka Technologies press releases, LRS (Location-Based Platform Work in SA, 2023).*
