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

**Git + GitHub — started 11 September 2026**

This folder is now a real git repository.

- `git init` on branch `main`, `.gitignore` added (OS junk, editor files,
  `node_modules`, any `.env`). `.gitkeep` files keep `assets/feed/` and
  `assets/gallery/` in git while they're empty — the Facebook sync workflow
  writes into `assets/feed/`.
- One commit, `20a7f06`, 27 files, working tree clean.
- Remote `origin` set to `https://github.com/Brendin10/freshprintsgrooming.git`
  (repo created, Public).
- Checked before committing: **no secrets in the repo.** The only key present is
  the Supabase *publishable* key in `js/config.js`, which is safe to publish.

**Still to do: the push.** It could not be done from the Claude session — that
session's GitHub access is limited to pre-configured repositories, so it cannot
reach this repo. Run this on the Windows machine, in this folder:

```
git push -u origin main
```

Git will open a browser to sign in to GitHub the first time. After that,
README Step 4 (GitHub Pages) and Step 5 (point the domain) can go ahead.

**GitHub Pages + Facebook sync — 11 September 2026**

- Pushed to `https://github.com/Brendin10/freshprintsgrooming` (Public).
- `CNAME` renamed to `CNAME.disabled` so Pages serves at
  `https://brendin10.github.io/freshprintsgrooming/` instead of claiming a
  custom domain that does not point at GitHub yet. Every asset path in the
  site is relative, so it runs unchanged from a subfolder.
  **`RESTORE-CUSTOM-DOMAIN.md`** has the DNS records and the steps to switch
  the domain over later.
- The **Facebook sync workflow is paused**. Its `schedule:` block is commented
  out in `.github/workflows/sync-facebook.yml`; `workflow_dispatch` is still
  there, so it can be run by hand from the Actions tab. It failed on every run
  without the `FB_PAGE_ID` / `FB_PAGE_TOKEN` secrets and emailed about it each
  time. The site is unaffected — with no posts in `data/feed.json`, `js/feed.js`
  leaves the "Fresh off the page" section hidden.

**Services section simplified — 11 September 2026**

The price was being stated three times over (the size tiers, a "$40–$60 by
size" line on every package card, and a full add-ons price list), which read
as three different pricing schemes instead of one.

- The **add-ons block was removed** from `index.html`. Its CSS is still in
  `css/styles.css` under a comment explaining why, so the section can be
  dropped back in unchanged when Renee wants it — the markup is in git history.
- The per-card price line is gone. The cards now describe **what's included**;
  the size tiers above them are the only place a groom price appears.
- Pricing and packages are now **one section** under "Services & pricing",
  reading price first, then what that price gets you.
- Copy that referred to add-ons was reworded in the FAQ, the booking form's
  estimate note and `js/booking.js`.

Note: "Nail trim only" ($15) and "Puppy intro session" ($35) are still in the
booking form's service dropdown and still priced from `FLAT_PRICE_SERVICES` in
`js/config.js`, so the live estimate quotes them correctly — they just aren't
advertised on the page any more.

**Section order swapped — 11 September 2026**

Page order is now: hero -> **About Renee** -> How it works -> **Services &
pricing** -> Gallery -> Updates -> Reviews -> Book -> FAQ. Both sections
carried `class="section"`, so swapping them left the background striping
untouched. The desktop and mobile navs were reordered to match the page.

**This makes the placeholder copy urgent.** About is now the first thing a
visitor reads after the hero, and it still contains unfilled brackets:

| Line | Placeholder |
|---|---|
| ~164 | `[I've been grooming dogs for X years]` |
| ~171 | `[Dog 1]` and `[Dog 2]` — the two dogs in the photo |
| ~197 | `[Your city]` |

Plus the three fake testimonials at ~371, ~376 and ~381 still say
"Placeholder Name". None of this can go public as-is.

**Cut down to two services — 11 September 2026**

The menu is now exactly:

| Service | Price |
|---|---|
| The Full Fresh | by size — $40 / $50 / $60 |
| Jazz's Pawdicure | flat $15, any size |

Bath & Brush and the De-Shed Treatment were removed. (A "Bel-Air Blowout" was
considered and dropped before it was built.)

Because the two services price differently, the old "size tiers, then a row of
packages" layout no longer worked — it implied every service cost $40-$60. The
section now gives each service its own panel and states its price once, inside
it: The Full Fresh carries the three size tiers, Jazz's Pawdicure shows a flat
$15. The Full Fresh's bullet list absorbed the old Bath & Brush contents, which
it used to reference by name.

- `js/config.js` — `FLAT_PRICE_SERVICES` is now just `{ "Jazz's Pawdicure": 15 }`.
  Nail trim only ($15) and Puppy intro session ($35) were removed along with
  their dropdown options.
- Booking dropdown is now The Full Fresh, Jazz's Pawdicure, "Not sure".
- FAQ pricing and duration answers rewritten; the duration answer had been
  quoting Bath & Brush timings.

**Jazz's Pawdicure's bullet list is invented** — nail trim shaped and smoothed,
paw pad trim, paw balm finish, quick paw rinse. Renee should confirm what's
actually included and at $15 whether the balm belongs in it (it was a $10
add-on on the old menu).

Also removed: the `[I've been grooming dogs for X years]` placeholder in the
About section, at the owner's request. The sentence now opens "I'm the hands
behind Fresh Prints. I opened this shop because...".

## Open items

- [ ] **Verify the test booking end to end** — sign in to `admin.html` and confirm the
      test row appears there, not just in the Supabase Table Editor. This is the real
      test of login + authenticated read + RLS.
- [ ] **Confirm the ZIP** — 46574 was inferred for Walkerton, not supplied.
      (Walkerton itself is now confirmed as the town, from the About copy.)
- [x] **Placeholder copy in the About section** — filled in 11 Sept 2026:
      the dogs are **Luna** and **Pips**, the town is **Walkerton**. The photo's
      alt text names them now too.
- [ ] **Confirm what's in Jazz's Pawdicure** — the bullets on the card were
      written as a plausible guess, not supplied.
- [ ] **Three fake testimonials** still say "Placeholder Name" in `index.html`
      (~lines 371, 376, 381). Must be replaced or removed before going public.
- [ ] **Delete the test booking** from Supabase once verification is done.
- [x] **README Step 1 — GitHub.** Repo created and the folder is under version
      control with one clean commit. Only `git push -u origin main` is left —
      see the Git section above.
- [ ] **README Step 4 — GitHub Pages.** Not started.
- [ ] **README Step 5 — point freshprintsgrooming.com at it.** Not started. Note the
      README's warning to delete any old DNS records pointing at Replit.
- [ ] **README Steps 6–8 — Facebook feed.** Optional, site works fine without it.
      The workflow is paused until then — uncomment the `schedule:` lines in
      `.github/workflows/sync-facebook.yml` once the two secrets are added.

## Ideas raised but not decided

Possible gaps once Renee actually uses the dashboard: blocking off days she isn't
working, an automatic "your appointment is confirmed" email to the customer, and
recurring appointments for regulars. None of these exist yet.

## Next session — start here

1. Sign in to `admin.html` and confirm the test booking shows up, and that the
   "Standard" price and the pre-filled quote look right on it.
2. Sort the testimonials.
3. Then Steps 1, 4 and 5 in `README.md` to get the site live.
