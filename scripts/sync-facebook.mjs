/* =========================================================
   Fresh Prints Grooming — Facebook Page sync
   ---------------------------------------------------------
   Pulls recent posts from your Facebook Page, saves the photos
   into assets/feed/ and writes data/feed.json.

   Runs inside GitHub Actions. The access token comes from a
   GitHub Secret and never reaches the browser.

   No npm dependencies — plain Node 20+.

   Run locally to test:
     FB_PAGE_ID=... FB_PAGE_TOKEN=... node scripts/sync-facebook.mjs
   ========================================================= */

import { writeFile, readdir, unlink, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const API_VERSION = 'v25.0';
const MAX_POSTS    = 24;   // how many posts to keep on the site
const IMAGE_DIR    = 'assets/feed';
const FEED_FILE    = 'data/feed.json';

const PAGE_ID = process.env.FB_PAGE_ID;
const TOKEN   = process.env.FB_PAGE_TOKEN;

/* ---------------------------------------------------------
   If the secrets aren't set yet, write an empty feed and exit
   cleanly. The site falls back to its placeholder gallery.
   --------------------------------------------------------- */
if (!PAGE_ID || !TOKEN) {
  console.log('FB_PAGE_ID / FB_PAGE_TOKEN not set — writing an empty feed.');
  await ensureDir('data');
  await writeFile(FEED_FILE, JSON.stringify({
    updated: new Date().toISOString(),
    configured: false,
    page: null,
    posts: []
  }, null, 2) + '\n');
  process.exit(0);
}

/* =========================================================
   Fetch
   ========================================================= */
const FIELDS = [
  'id',
  'message',
  'created_time',
  'permalink_url',
  'full_picture',
  'attachments{media_type,media,subattachments{media}}'
].join(',');

const url = `https://graph.facebook.com/${API_VERSION}/${PAGE_ID}/posts` +
            `?fields=${encodeURIComponent(FIELDS)}` +
            `&limit=${MAX_POSTS}` +
            `&access_token=${encodeURIComponent(TOKEN)}`;

console.log(`Fetching up to ${MAX_POSTS} posts from page ${PAGE_ID}…`);

const res = await fetch(url);
const payload = await res.json();

if (payload.error) {
  // Never print the token. Graph errors are safe to show.
  console.error('Facebook API error:', JSON.stringify(payload.error, null, 2));
  console.error('\nCommon causes:');
  console.error('  190 → token expired or revoked. Generate a new one (README Step 7).');
  console.error('  200 → missing pages_read_engagement permission.');
  console.error('  100 → wrong Page ID.');
  process.exit(1);
}

const raw = payload.data || [];
console.log(`Received ${raw.length} posts.`);

/* Page name, for the section heading. Non-fatal if it fails. */
let page = null;
try {
  const pRes = await fetch(
    `https://graph.facebook.com/${API_VERSION}/${PAGE_ID}` +
    `?fields=name,link&access_token=${encodeURIComponent(TOKEN)}`
  );
  const pJson = await pRes.json();
  if (!pJson.error) {
    page = { name: pJson.name || null, url: pJson.link || `https://facebook.com/${PAGE_ID}` };
  }
} catch { /* ignore */ }

/* =========================================================
   Collect image URLs per post
   ========================================================= */
function imageUrls(post) {
  const urls = [];
  const push = (u) => { if (u && !urls.includes(u)) urls.push(u); };

  const att = post.attachments?.data?.[0];

  if (att?.subattachments?.data?.length) {
    // Multi-photo post / album
    for (const sub of att.subattachments.data) push(sub.media?.image?.src);
  } else if (att?.media?.image?.src) {
    push(att.media.image.src);
  }

  push(post.full_picture);
  return urls.slice(0, 6); // cap per post
}

/* =========================================================
   Download images
   ========================================================= */
await ensureDir(IMAGE_DIR);
await ensureDir('data');

const EXT_BY_TYPE = {
  'image/jpeg': 'jpg',
  'image/png':  'png',
  'image/webp': 'webp',
  'image/gif':  'gif'
};

async function download(url, baseName) {
  try {
    const r = await fetch(url);
    if (!r.ok) { console.warn(`  skip (HTTP ${r.status}) ${baseName}`); return null; }

    const type = (r.headers.get('content-type') || '').split(';')[0].trim();
    const ext = EXT_BY_TYPE[type] || 'jpg';
    const rel = `${IMAGE_DIR}/${baseName}.${ext}`;

    if (existsSync(rel)) return rel;             // already have it — don't re-download

    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length < 1024) { console.warn(`  skip (too small) ${baseName}`); return null; }

    await writeFile(rel, buf);
    console.log(`  saved ${rel} (${Math.round(buf.length / 1024)} KB)`);
    return rel;
  } catch (err) {
    console.warn(`  skip (${err.message}) ${baseName}`);
    return null;
  }
}

const posts = [];
const keep = new Set();

for (const p of raw) {
  const caption = (p.message || '').trim();
  const urls = imageUrls(p);

  // Nothing to show at all — skip it.
  if (!caption && !urls.length) continue;

  const safeId = String(p.id).replace(/[^A-Za-z0-9_-]/g, '');
  const images = [];

  for (let i = 0; i < urls.length; i++) {
    const rel = await download(urls[i], `${safeId}-${i}`);
    if (rel) { images.push(rel); keep.add(path.basename(rel)); }
  }

  posts.push({
    id: p.id,
    caption,
    date: p.created_time || null,
    url: p.permalink_url || null,
    images
  });
}

/* =========================================================
   Prune images that no longer belong to any current post
   ========================================================= */
try {
  for (const file of await readdir(IMAGE_DIR)) {
    if (file.startsWith('.')) continue;
    if (!keep.has(file)) {
      await unlink(path.join(IMAGE_DIR, file));
      console.log(`  pruned ${file}`);
    }
  }
} catch { /* directory may be empty */ }

/* =========================================================
   Write the feed
   ========================================================= */
await writeFile(FEED_FILE, JSON.stringify({
  updated: new Date().toISOString(),
  configured: true,
  page,
  posts
}, null, 2) + '\n');

const photoCount = posts.reduce((n, p) => n + p.images.length, 0);
console.log(`\nDone. ${posts.length} posts, ${photoCount} photos → ${FEED_FILE}`);

/* --------------------------------------------------------- */
async function ensureDir(dir) {
  if (!existsSync(dir)) await mkdir(dir, { recursive: true });
}
