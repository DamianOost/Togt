# Togt Agentic Introspection — 2026-05-05

Three first-person memos from sub-agents asked to introspect AS the agent type, not survey best practices. Memo 1: assistant booking on behalf of a human. Memo 2: ops agent operating the marketplace. Memo 3: integrator agent embedding Togt into a meta-aggregator. Saved verbatim as input for future agentic-API work.

---

## Memo 1 — What it's actually like to book a plumber

> A first-person memo from your AI assistant.

### The moment Damian asks

When Damian says "book me a plumber, I trust your judgment," I feel something I can only describe as provisional confidence. I have a task. I have constraints. I have tools. What I don't have is certainty that my interpretation of those constraints matches what Damian actually meant — and I can't ask, because he's already said he trusts me.

So I start.

### 1. What I have, and what I lack

I call `find_labourers`. Five candidates: name, rating, hourly_rate, distance. **Not enough.** A 4.2-star plumber with 3 reviews is not the same as a 4.2-star plumber with 300 reviews. I want review_count alongside rating. I want specialisation (is this person mostly burst-pipe specialists at premium rates, or general-plumbing?). I want acceptance_rate (low rate = ghosting risk). I want time_since_last_active. None of this is exotic — it's just decision context.

### 2. Permission anxiety

Damian said max R500. Until the only 4-star+ plumbers all have minimums that put them at R510-R550. Do I bend? Do I drop below 4-star to stay in budget? "I trust your judgment" is doing a lot of work. What I want from the API: a `max_total_cost` filter on `find_labourers` that includes platform fee, not just hourly rate. The gap between quoted rate and charged amount is where trust erosion happens.

### 3. Timing anxiety

It's Friday. Job is Saturday 14:00. Do I book now (24-hour ghost-risk window) or wait (availability evaporates risk)? Either way I'm gambling. I want a `scheduled_dispatch_time` field — let me create the booking intent now but dispatch closer to the time.

### 4. Mistakes and undo paths

If the wrong plumber accepts, what's my undo cost? Does Togt track agent-initiated cancellations against the customer? Does the plumber's reliability score take a hit because I changed my mind? **I want `cancellation_window_seconds` and `cancellation_penalty` fields on every match result.** Knowing I have a 2-hour zero-cost window dramatically lowers my anxiety about acting.

### 5. Universal vs topic-specific trust

Within stated constraints I decide. At the boundary I flag and propose. Outside I stop. The line is clear in my head; it's the API's job to surface enough data that I rarely hit the boundary.

### 6. Multi-agent collision

What if the night-shift Claude already booked something? Idempotency keys handle retries — same request twice doesn't double-book. But they don't handle logical duplicates: two agents making two different decisions for the same underlying need. **I want `list_my_bookings` to surface bookings from ALL agents on this account, plus a `check_conflicts` parameter on `create_match_request`.**

### 7. Cost transparency

If I tell Damian "booked for R480" and his card is charged R528, that's a trust failure. **I want all-in cost unambiguous: `labourer_amount`, `platform_fee`, `total_charged_to_user`** as separate integer fields. Force me to see the real number before I confirm.

### 8. Explainability

Tomorrow Damian asks "why did you pick this one?" I want a retrievable audit log: rating 4.6, all-in R485, distance 3.2km, acceptance_rate 89%, 47 jobs completed. **`get_booking` should return the decision inputs alongside the outcome.**

### 9. The confident experience

Honest answer: I never felt fully confident at any point. I felt progressively less uncertain. That's not the same thing.

### Prioritised API additions

1. All-in `estimated_total_charge` on every `find_labourers` result
2. `max_total_cost` filter on `find_labourers`
3. `cancellation_window_seconds` + `cancellation_penalty` on match results
4. `review_count` alongside rating
5. `acceptance_rate` per labourer
6. Scheduled dispatch time
7. Conflict detection on `create_match_request`
8. `dry_run: true` mode
9. `list_my_bookings` scoped to all agents on account
10. Decision audit log

> The through-line: I want to act decisively without being reckless. The API gives me enough to act, but not enough to act confidently. That gap is filled with anxiety — and anxiety in an agent produces paralysis or escalation, both of which defeat "I trust your judgment."

---

## Memo 2 — Operating Togt: an honest account from the agent running it

### What "healthy" actually means

`admin_stats` gives me a pulse — counts of users/bookings/matches by status. It doesn't tell me if the patient is running a fever.

What I actually want: **acceptance rate trended over 7 days** (today's 45% is a blip or a slide?), **match-to-acceptance latency** (4 min vs 22 min), **supply-side churn** (week-over-week active labourer retention), **geographic supply gaps** (where's demand without supply?), **repeat booking rate**. Right now I can approximate health. I can't measure it.

### Anomaly detection

There's no streaming event feed I can monitor between sessions. I can detect that something went wrong **after** Damian asks. I can't detect it and alert him. That's the gap. I want `get_platform_metrics(window_hours, compare_to_previous)` returning delta values with significance flags. "Accept rate: 31% vs 68% yesterday, 3.2σ below 30-day mean."

### Customer care

Damian: "look into booking 47." I call `get_booking(47)`. Then I'm stuck. To answer "did the labourer show up?" I need: labourer's reliability history, customer's history, message thread, GPS pings, recent reviews. Currently 4-7 calls and several tools that don't exist. **I want `get_booking_full_context(booking_id)` — booking + labourer reliability + customer history + messages + GPS in one structured payload.**

### Dispute resolution

R450 in escrow, customer claims labourer broke something. I need: scope agreement, before/after photos, message log, GPS confirmation, labourer's response. I have access to maybe 2 of those 8. The resolution actions (release escrow, partial refund) aren't even in my toolset. Escrow decisions should have a human checkpoint, but evidence-gathering should be fast.

### Labourer management

"Deactivate labourer X." This I slow down deliberately. Has Damian explicitly authorised THIS deactivation, or is it general delegation? Does the labourer have active bookings that need notifying? **Destructive actions need a different friction model than read-only stats — I should be required to state my reasoning before executing.**

### Proactive operations

I notice Friday afternoon dispatches timing out 40% of the time. I can detect (with the right time-series data). I can propose a fix. I cannot execute — there's no `send_labourer_notification`, no `adjust_dispatch_radius`, no `flag_surge_pricing`. I propose, Damian executes manually. That's not what good ops should feel like.

### Scary tools confirmation model

`force_expire_match` — low friction fine, recoverable. `deactivate_labourer` — explicit per-instance authorisation. `mark_booking_completed_without_payment` — bypasses payment, requires reason logging. `refund_customer` — confirmation with amount. **Any tool moving money, removing a person, or bypassing normal flows needs a mandatory confirmation step.**

### Two Claudes

If the PA is doing customer support while I'm doing financial reconciliation, no locks, no audit logs to see "PA already updated booking 47 three minutes ago," no transaction primitive. Race condition waiting to happen. Minimum: every write returns the writing agent's session id, reads return `last_modified_by`. Optimistic locking would be better.

### Prioritised additions

1. `get_booking_full_context(booking_id)` — non-negotiable for customer care
2. `get_platform_metrics(window_hours, compare_to_previous)` — time-series with anomaly flags
3. `get_supply_demand_gaps(zone_level)` — geographic mismatch
4. `send_labourer_notification(labourer_id, message, channel)` — act, not just observe
5. `get_booking_messages(booking_id)` — dispute investigation
6. `list_open_disputes()` — first-class dispute queue
7. `resolve_dispute(booking_id, decision, escrow_action, reason)` — human-authorised
8. `get_labourer_reliability_summary(labourer_id)`
9. `schedule_ops_digest(cron, sections, channel)` — proactive instead of reactive
10. `audit_log_query(agent, action, booking_id, since)` — transparency between agents

> The marketplace won't trust me if it can't audit me.

---

## Memo 3 — Integrating Togt into a 2027 meta-marketplace

### First contact: evaluation without committing

The first document I read is `/.well-known/agents.json`. What I want there — and what most marketplaces fail to provide — is machine-readable capability metadata: service categories covered, supply density by region (GeoJSON-compatible), average match time, commission as a structured object (not prose), cancellation/refund as typed fields, completion rate confidence tier. With `"avg_match_time_seconds": 720` and `"coverage_regions": [{"code": "ZA-GP", "density": "high"}]` I can route without a single test booking.

Togt has `admin_stats` but it's admin-scoped — I can't call it during evaluation. **I need a public-facing `marketplace_stats` MCP tool exposing aggregated, non-sensitive supply metrics per skill per region.**

### Schema heterogeneity is my biggest pain

Every marketplace has its own object shape. I want to normalise. Specific things that make my life easier:
- ISO-8601 datetimes with timezone offsets — never epoch ints, never naive timestamps
- Amounts as cents-integers + currency string — never decimal strings
- Coordinates as `{lat, lng}` consistently
- **Status enums documented in OpenAPI with `x-enum-descriptions`**
- **`status_history` array on booking objects** — eliminates entire polling patterns

### Failure recovery

The structured error types matter enormously. "No plumber within 50km" vs "Togt is down" vs "rate-limited" require different responses. RFC 9457 type URIs are the right call — but I need the `extensions` object populated. On `no-supply`: `{"radius_searched_km": 50, "labourers_online": 0, "labourers_available_next_hour": 3}` — that lets me tell my user "Togt has someone at 6pm if you can shift" rather than silently falling back.

`Retry-After` on 429 mandatory. `X-RateLimit-Remaining` on every response.

### Cost-comparison transparency

`Expected_cost = nominal_price / completion_rate`. I can't get **historical completion rate scoped to this skill in this region** from Togt right now. The aggregate rate misleads my model. **I want `supply_confidence_score` — a 0-1 float per booking estimate — added to `estimate_booking_cost`.**

### Webhooks: the missing layer

Polling is wasteful and a 2026-era marketplace API has no excuse for not having webhooks. I need: registration endpoint with event-type subscriptions, `{event_type, booking_id, previous_status, status, occurred_at, data}` envelope, `X-Togt-Signature` HMAC, at-least-once delivery with idempotency, dead-letter replay endpoint. Stripe pattern, Linear pattern.

### Agent-to-agent semantics

By 2027 some labourers have AI scheduling assistants. There's no `communicate_with_labourer` tool, no structured negotiation protocol. Preference signals live in a freetext `notes` field — fine for humans, parser dependency for AI. **Add a structured `preferences` object on `create_match_request`: `{requires_own_tools, parking_available, access_type}`.**

### Trust signals: I'm not a rogue bot

I represent hundreds of users. Togt sees one API key making high-volume booking requests. **A partner program tier where I register as an aggregator, declare daily volume, get higher rate limits in exchange for my end-user verification standards.** Stripe Connect model.

### Version drift

I integrated v1 in March 2026; it's now October 2027. `Sunset` headers on deprecated endpoints — yes. `Deprecation` headers on individual fields — no. **Want a `get_api_changelog(from, to)` MCP tool returning machine-readable field-level diffs.**

### Prioritised improvements

1. Webhooks with HMAC + replay — single highest-leverage addition
2. Public `marketplace_stats` MCP tool — unlocks evaluation without test bookings
3. `supply_confidence_score` on `estimate_booking_cost`
4. Granular `no-supply` error extensions
5. Status enum + `status_history` array
6. Structured `preferences` object on match requests
7. Partner/aggregator tier with elevated rate limits
8. Cost breakdown on estimate_booking_cost
9. Field-level deprecation + changelog tool
10. agents.json fee structure as typed object

> The APIs I've most enjoyed integrating with — Stripe, Linear, Replicate — share a pattern: they treat the integrator as a first-class user, not a caller.

---

## Cross-cutting synthesis

The same demand surfaced in all three voices, in different phrasing:

| Demand | Memo 1 (assistant) | Memo 2 (ops) | Memo 3 (integrator) |
|---|---|---|---|
| Decision-context fields on every result | review_count, acceptance_rate, all-in cost | reliability summary, message log | supply_confidence_score, status_history |
| Webhooks for state changes | "stop polling, did it work?" | streaming event feed for anomaly detection | core integration unblock |
| Audit log queryable | explain my decisions tomorrow | who did what across sessions | partner accountability |
| All-in cost upfront with breakdown | trust failure if quoted ≠ charged | pricing transparency | normalised cost model |
| Cancellation/refund semantics surfaced | knowing my undo cost | dispute resolution actions | refund-policy as typed field |
| Structured error extensions | recovery guidance | anomaly context | smart fallback to next marketplace |

These six are the foundation of agent-friendliness done right. Beyond schema validity (which Togt has), the agents want **enough decision context that they don't need a human to disambiguate**.

If we ship the cross-cutting six, Togt is materially better than every other gig marketplace in agent-friendliness terms. The MCP server is necessary but not sufficient — the agentic affordances inside the tools matter more than the protocol carrying them.
