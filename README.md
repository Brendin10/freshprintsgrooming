# Fresh Prints Grooming — website

A static site (HTML/CSS/JS, no build step) with online booking and a password-protected admin dashboard. Hosts free on GitHub Pages; appointment data lives in Supabase.

```
index.html                        Public site
admin.html                        Staff dashboard — login, calendar, requests, clients
css/styles.css                    Site styles
css/admin.css                     Dashboard styles
js/config.js                      ← the only file you need to edit
js/main.js                        Nav, sticky CTA
js/booking.js                     Booking form → Supabase
js/admin.js                       Dashboard logic
js/feed.js                        Renders the Facebook feed
supabase/schema.sql               Database table + security rules
scripts/sync-facebook.mjs         Pulls posts + photos from Facebook
.github/workflows/sync-facebook.yml  Runs the sync every 6 hours
data/feed.json                    Auto-generated — don't edit by hand
assets/feed/                      Auto-downloaded Facebook photos
assets/                           Favicon
```

Setup runs in three parts. **Steps 1–5 get the site live.** Steps 6–8 connect Facebook, and can wait.

---

## Step 1 — Put the code on GitHub

1. Go to [github.com/new](https://github.com/new). Name the repo **freshprintsgrooming**. Set it to **Public**. Create it.
2. On the new repo page, click **uploading an existing file**.
3. Drag in everything from this folder — including the `css`, `js`, `assets` and `supabase` folders. Click **Commit changes**.

---

## Step 2 — Set up the database

1. Go to [supabase.com](https://supabase.com) and sign up (free).
2. **New project.** Name it `fresh-prints`. Pick a region near you. Save the database password somewhere safe.
3. Wait ~2 minutes for it to build.
4. Left sidebar → **SQL Editor** → **New query**. Open `supabase/schema.sql`, copy the whole file, paste it in, click **Run**. You should see "Success".

   This creates the appointments table, the security rules, and the `dog-photos` storage bucket in one go. Safe to re-run any time.
5. Left sidebar → **Authentication** → **Users** → **Add user** → **Create new user**.
   - Your email + a strong password
   - Tick **Auto Confirm User**
   - This is your admin login.
6. **Authentication** → **Sign In / Providers** → Email → turn **Enable sign ups** OFF. Now nobody else can create an account.
7. Left sidebar → **Project Settings** → **API keys**. Copy two things:
   - **Project URL** (looks like `https://abcdefgh.supabase.co`)
   - **anon / public** key (a long string)

---

## Step 3 — Connect the site to the database

In your GitHub repo, open `js/config.js`, click the pencil to edit, and replace:

```js
SUPABASE_URL: 'YOUR_SUPABASE_URL_HERE',
SUPABASE_ANON_KEY: 'YOUR_SUPABASE_ANON_KEY_HERE',
```

with the two values you just copied. While you're in there, update `BUSINESS_EMAIL` and `BUSINESS_PHONE` too. Commit the change.

> **Is it safe to publish the anon key?** Yes. It's designed to be public — it's in every Supabase-powered website's source code. Your data is protected by the Row Level Security rules in `schema.sql`, which let the public *submit* a booking but never *read* one. Only your signed-in admin account can see appointments.
>
> Never put the **service_role** key in this project. That one is a master key and must stay secret.

---

## Step 4 — Turn on GitHub Pages

1. Repo → **Settings** → **Pages**.
2. Source: **Deploy from a branch**. Branch: **main**, folder: **/ (root)**. Save.
3. Wait 1–2 minutes. Your site is live at `https://YOURNAME.github.io/freshprintsgrooming/`.

Test it: submit a booking on the live site, then open `/admin.html`, sign in, and confirm the request shows up.

---

## Step 5 — Point freshprintsgrooming.com at it

**In GitHub:** Settings → Pages → **Custom domain** → enter `freshprintsgrooming.com` → Save. This creates a `CNAME` file in your repo.

**At your domain registrar** (wherever you bought the domain), open the DNS settings and add:

| Type  | Name  | Value                    |
|-------|-------|--------------------------|
| A     | @     | 185.199.108.153          |
| A     | @     | 185.199.109.153          |
| A     | @     | 185.199.110.153          |
| A     | @     | 185.199.111.153          |
| CNAME | www   | `YOURNAME.github.io`     |

Delete any old A or CNAME records pointing at Replit first.

DNS can take anywhere from 10 minutes to 24 hours. Once GitHub shows a green check on the domain, tick **Enforce HTTPS**.

---

# Connecting Facebook

Once this is set up, everything you post to your Facebook Page shows up on the site automatically — photos fill the gallery, and posts appear in the "Fresh off the page" section with their captions.

**How it works:** a scheduled job on GitHub calls Facebook every 6 hours, downloads any new photos into the repo, and writes `data/feed.json`. Your site reads that file. The access token lives in GitHub Secrets and never appears in your website's code, so nobody can steal it from your page source.

This part is fiddly — Meta's dashboard is not friendly. Set aside 30 minutes. The site works fine without it, so there's no rush.

## Step 6 — Create a Meta app

1. Go to [developers.facebook.com](https://developers.facebook.com) and log in with the Facebook account that manages your Page.
2. Click your profile (top right) → **My Apps** → **Create App**.
3. App name: `Fresh Prints Site`. Contact email: yours. Continue.
4. Use case: pick **Other** → **Business**. Create the app.
5. On the app dashboard, note the app is in **Development** mode. **Leave it there.** Because you're the app's admin and it's your own Page, you don't need Meta's App Review. Switching it Live would require a review you don't need.

## Step 7 — Get your Page ID and access token

1. Go to the [Graph API Explorer](https://developers.facebook.com/tools/explorer/).
2. Top right: set **Meta App** to `Fresh Prints Site`.
3. **User or Page** dropdown → **Get Page Access Token**. Pick your Fresh Prints Page and grant access.
4. Click **Add a Permission** and tick these three:
   - `pages_show_list`
   - `pages_read_engagement`
   - `pages_read_user_content`
5. Click **Generate Access Token**. Copy the token that appears — this one is short-lived, we're about to trade it in.
6. **Get your Page ID:** in the Explorer's query box type `me?fields=id,name` and click **Submit**. The `id` in the response is your Page ID. Copy it.
7. **Make the token permanent:** open the [Access Token Debugger](https://developers.facebook.com/tools/debug/accesstoken/), paste your token, click **Debug**, then click **Extend Access Token** at the bottom. Copy the new long-lived token.

   Page tokens generated this way don't expire on a timer — but they do break if you change your Facebook password, revoke the app, or lose admin rights to the Page. If the feed ever stops updating, redo this step.

> Treat this token like a password. Don't paste it into a file, an email, or a chat. It goes in exactly one place: the GitHub Secret below.

## Step 8 — Add the secrets to GitHub

1. Your repo → **Settings** → **Secrets and variables** → **Actions**.
2. **New repository secret**, twice:

   | Name | Value |
   |------|-------|
   | `FB_PAGE_ID` | the Page ID from Step 7 |
   | `FB_PAGE_TOKEN` | the long-lived token from Step 7 |

3. Go to the **Actions** tab → **Sync Facebook feed** → **Run workflow**. It takes about a minute.
4. When it finishes green, check your site. Photos should be in the gallery and posts in the "Fresh off the page" section.

From here it runs itself every 6 hours. To pull a new post in immediately, hit **Run workflow** again.

### Facebook troubleshooting

Open the failed run in the **Actions** tab and read the log — the script prints the actual Facebook error.

| What you see | What it means |
|---|---|
| Error code `190` | Token expired or revoked. Redo Step 7. |
| Error code `200` | Missing permission. Redo Step 7 and make sure all three permissions are ticked. |
| Error code `100` | Wrong Page ID. It should be a long number, not your page's name. |
| Green run, no photos | Your posts may be photo-less or the Page is age/country restricted. |
| "not set — writing an empty feed" | The secrets aren't saved. Check the names are spelled exactly as above. |

### Notes

- **Only public Page posts** come through. Stories, reels-only content and private posts don't.
- **Delete a post on Facebook** and it disappears from the site at the next sync, photo and all.
- **Photos live in your repo**, so the site keeps working even if Facebook is down. The script keeps the newest 24 posts and deletes photos from older ones automatically.
- **Captions are escaped** before rendering, so nothing in a caption can break your page.
- **To stop syncing**, delete `.github/workflows/sync-facebook.yml`. To pause it, disable the workflow in the Actions tab.
- GitHub disables scheduled workflows in repos with no activity for 60 days. Since each sync commits, normal posting keeps it awake — but if you go quiet for two months, re-enable it in the Actions tab.

---

## Making it yours

**Photos.** Once Facebook sync is on, the gallery fills itself — nothing to do. To use your own photos instead, drop images into `assets/gallery/` and in `index.html` replace:

```html
<figure class="shot"><div class="shot-ph" data-label="Before &amp; after"></div></figure>
```

with:

```html
<figure class="shot"><img src="assets/gallery/dog1.jpg" alt="Before and after groom" loading="lazy"></figure>
```

Resize photos to about 1000px wide before uploading so the site stays fast.

**Text and prices.** All in `index.html` — search for the text you want to change.

**Still to fill in** (search `index.html` for the square brackets):

| Placeholder | Where |
|---|---|
| `[I've been grooming dogs for X years]` | About section |
| `[Dog 1]` and `[Dog 2]` | About section — your two doodles' names |
| `[Your city]` | About section, closing line |
| `(000) 000-0000` | Footer, and `BUSINESS_PHONE` in `js/config.js` |
| `hello@freshprintsgrooming.com` | Footer, and `BUSINESS_EMAIL` in `js/config.js` |
| `123 Placeholder Ave` | Footer address |
| Hours | Footer |
| `Placeholder Name` ×3 | Reviews section |

The About copy is a draft written in your voice — rewrite it however you like, it's just a starting point.

**Colors.** Top of `css/styles.css`, in the `:root` block. Change `--teal`, `--magenta`, `--yellow` and everything follows.

**Services.** Each service is a `<article class="card">` in `index.html`. Copy one to add another. Keep the options in the booking form's `<select id="service">` in sync.

---

## Using the dashboard

Open `freshprintsgrooming.com/admin.html` and sign in (bookmark it, or add it to your phone's home screen).

- **Requests** — new bookings waiting on you. Tap one to confirm, quote, or decline.
- **Calendar** — month view, colored dots per day. Tap a day to see what's booked.
- **All** — every appointment, searchable and filterable by status.
- **Clients** — see below.

Tapping any appointment opens a panel with the dog's photo, full details, call/text/email buttons, and actions: Confirm, Mark complete, Set quote, Add note, Change date, Cancel, Delete.

### Client records

You don't create these — they build themselves. Every booking either **starts a new client record** or **folds into an existing one**, matched on email address (falling back to phone number).

Each client card shows:

- The dog's photo as the avatar, or their initial if no photo was uploaded
- Every dog belonging to that owner, with breeds — so two dogs on one account stay together
- Their next upcoming appointment, with status
- Tap-to-call, tap-to-text and tap-to-email
- Booking count, completed visits, last visit date, and lifetime spend (from the quotes you've entered)
- **View all appointments** — jumps to the All tab filtered to just that client

If someone books with a new phone number, the newest one wins on the card. Clients with something on the books sort to the top.

### Dog photos

The booking form asks for an optional photo of the dog. It's worth having — it tells you the coat and size before they walk in.

Photos are resized in the customer's browser before uploading (down to 1400px), so a 5 MB phone photo becomes a few hundred KB. That keeps it fast on mobile data and keeps your storage usage low. Files over 10 MB are rejected, and non-images are refused.

**A photo never blocks a booking.** If the upload fails or stalls, the appointment still saves and the customer is told to text the photo instead.

Photos are stored in a public Supabase bucket, which means anyone with the exact URL can view that photo. The URLs are random and aren't listed anywhere public, but don't treat this as private storage. For dog pictures this is the right trade-off; if you'd rather lock it down, say so and it can be switched to signed URLs.

---

## Notes and limits

- **No automatic emails.** Nothing notifies you when a booking comes in — check the dashboard. If you want email alerts later, a Supabase Database Webhook pointed at a free service like Resend or Zapier will do it.
- **No double-booking prevention.** The form takes a date and a time window; you decide the real slot when you confirm.
- **Free tier limits.** Supabase free projects pause after ~1 week with zero activity. Real bookings count as activity, so this is only a concern before you launch — open the dashboard occasionally.
- **Back up your data.** Supabase → Table Editor → `appointments` → Export to CSV. Worth doing monthly.

---

## Troubleshooting

**"Online booking isn't connected yet"** — `js/config.js` still has placeholder values, or the commit hasn't deployed. Wait a minute and hard-refresh.

**Booking fails with a policy error** — the SQL didn't run fully. Re-run `supabase/schema.sql`.

**Can't sign in to admin** — the user wasn't confirmed. Supabase → Authentication → Users; the user needs a confirmed email. Delete and recreate with **Auto Confirm User** ticked.

**Dashboard loads but shows nothing** — you're signed in but RLS is blocking reads. Confirm the "staff can read appointments" policy exists under Authentication → Policies.

**Changes don't show up** — GitHub Pages caches. Hard-refresh (Ctrl+Shift+R / Cmd+Shift+R) or check the Actions tab for a still-running deploy.
