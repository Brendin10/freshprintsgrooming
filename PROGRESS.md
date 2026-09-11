# Fresh Prints Grooming — progress

Last updated: 11 September 2026

## Done

**Database (Supabase) — complete**

- Project created: `https://iovcbmklvteayjnbfiln.supabase.co`
- `supabase/schema.sql` ran clean — created the `appointments` table, the Row Level
  Security policies, and the `dog-photos` storage bucket
- Admin auth user created, **Enable sign ups turned OFF** so nobody else can register
- Test booking submitted successfully from the local `index.html`

**Site wired to the database**

- `js/config.js` filled in with the Project URL and the publishable key
  (`sb_publishable_...`). Both are safe to publish — the data is protected by RLS,
  not by hiding the key. The `sb_secret_...` key is NOT in this project and must
  never be added to it.
- `index.html` and `admin.html` bumped from supabase-js `2.45.4` to `@2` (latest v2).
  The old version predates Supabase's new-style publishable keys and would have failed.

**Real business details replaced the placeholders**

| Field | Value | Where |
|---|---|---|
| Phone | (574) 780-3551 | footer, `config.js`, JSON-LD |
| Email | freshprintsgrooming@gmail.com | footer, `config.js`, JSON-LD |
| Address | 101 Colorado Street, Walkerton, IN 46574 | footer, JSON-LD |
| Service area | Marshall, Starke and La Porte County, Indiana | JSON-LD |
| Owner | Renee Van Niekerk | already correct site-wide |

JSON-LD structured data validates.

**Admin dashboard — already built, no work needed**

`admin.html` is password-protected and has: Requests, Calendar (month view,
colour-coded by status), All (search + status filters), Clients (auto-built from
bookings), and a stats bar. The detail drawer confirms, completes, sets a quote,
adds private notes, reschedules, cancels and deletes.

**Size-based pricing — built 11 September 2026**

Grooming is now priced purely by the dog's weight. This replaced the old
"from $45 / $75 / $65" package prices — all three packages cost the same, and
only the dog's size moves the number.

| Size | Weight | Price |
|---|---|---|
| Small | 20 lb and under | $40 |
| Medium | 21 – 40 lb | $50 |
| Big | 41 lb and up | $60 |

**All prices live in one place: `FP_CONFIG.SIZES` in `js/config.js`.** Change a
number there and it updates the Services section, the booking form, the live
estimate and the admin dashboard together. Do not hard-code a price anywhere else.

What changed:

- `js/config.js` — added `SIZES`, `FLAT_PRICE_SERVICES`, and the helpers
  `FP_SIZE()`, `FP_PRICE()` and `FP_SIZE_VALUE()`.
- `index.html` — a three-tier pricing block at the top of Services; the service
  cards now read "$40–$60 by size"; two new pricing FAQs.
- `js/booking.js` — the size chips are now *rendered from config* (they used to be
  hard-coded HTML), and a live estimate appears under the appointment fields as
  soon as a size is picked.
- `js/admin.js` — the detail drawer shows a "Standard" price for the dog's size,
  and "Set quote" pre-fills with it, so the usual case is just pressing OK.
- `css/styles.css` — styles for the tiers, the three-up chips and the estimate box.
  Also added `[hidden]{display:none!important}`, which fixes a **pre-existing bug**:
  `.photo-preview{display:flex}` was beating the `hidden` attribute, so an empty
  photo-preview box showed on every page load.

Nail trim only ($15) and Puppy intro session ($35) keep flat prices whatever the
dog weighs — they're in `FLAT_PRICE_SERVICES`.

**No database change was needed.** `pet_size` is still a text column; the stored
value is now e.g. `Medium (21 – 40 lb)`. `FP_SIZE()` still resolves bookings taken
under the old four-tier form (Large and X-Large both map to Big), so the test
booking and any early ones still price correctly in the dashboard.

## Open items

- [ ] **Verify the test booking end to end** — sign in to `admin.html` and confirm the
      test row appears there, not just in the Supabase Table Editor. This is the real
      test of login + authenticated read + RLS.
- [ ] **Confirm the ZIP** — 46574 was inferred for Walkerton, not supplied.
- [ ] **Three fake testimonials** still say "Placeholder Name" in `index.html`
      (~lines 359, 364, 369). Must be replaced or removed before going public.
- [ ] **Delete the test booking** from Supabase once verification is done.
- [ ] **README Step 1 — GitHub.** Not started. Repo not created; this folder is not
      yet under version control.
- [ ] **README Step 4 — GitHub Pages.** Not started.
- [ ] **README Step 5 — point freshprintsgrooming.com at it.** Not started. Note the
      README's warning to delete any old DNS records pointing at Replit.
- [ ] **README Steps 6–8 — Facebook feed.** Optional, site works fine without it.

## Ideas raised but not decided

Possible gaps once Renee actually uses the dashboard: blocking off days she isn't
working, an automatic "your appointment is confirmed" email to the customer, and
recurring appointments for regulars. None of these exist yet.

## Next session — start here

1. Sign in to `admin.html` and confirm the test booking shows up, and that the
   "Standard" price and the pre-filled quote look right on it.
2. Sort the testimonials.
3. Then Steps 1, 4 and 5 in `README.md` to get the site live.
