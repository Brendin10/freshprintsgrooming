/* =========================================================
   Fresh Prints Grooming — configuration
   ---------------------------------------------------------
   Fill in the two values below after creating your Supabase
   project (see README.md, Step 2).

   These keys are SAFE to commit publicly. The publishable key
   is a public client key — your data is protected by the Row
   Level Security policies in supabase/schema.sql, not by hiding
   it. Never put the sb_secret_... key in this file.
   ========================================================= */

window.FP_CONFIG = {

  // --- Supabase (required for booking + admin) -----------
  // Supabase dashboard → Project Settings → API
  SUPABASE_URL: 'https://iovcbmklvteayjnbfiln.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_Jr2Snq4vUwvKsZi3KAstmA_TVaznESp',

  // --- Business details (used in fallbacks + messages) ---
  BUSINESS_NAME: 'Fresh Prints Grooming',
  BUSINESS_EMAIL: 'freshprintsgrooming@gmail.com',
  BUSINESS_PHONE: '(574) 780-3551',

  // Earliest bookable date, in days from today (0 = today)
  MIN_LEAD_DAYS: 1,

  /* --- Pricing by dog size -------------------------------
     This is the ONE place grooming prices live. Change a
     number here and it updates the Services section, the
     booking form chips, the live estimate and the admin
     dashboard's suggested quote — all of them, everywhere.

       id     short key stored with the booking
       label  what the customer sees
       range  weight range, shown under the label
       price  price in whole dollars
  -------------------------------------------------------- */
  SIZES: [
    { id: 'small',  label: 'Small',  range: '20 lb and under', min: 0,  max: 20,  price: 40 },
    { id: 'medium', label: 'Medium', range: '21 \u2013 40 lb',     min: 21, max: 40,  price: 50 },
    { id: 'big',    label: 'Big',    range: '41 lb and up',    min: 41, max: null, price: 60 }
  ],

  /* Services with their own fixed price, whatever the dog's
     size. Anything not listed here is priced by size above.
     Keys must match the <option> text in the booking form. */
  FLAT_PRICE_SERVICES: {
    'Nail trim only':      15,
    'Puppy intro session': 35
  }
};

/* =========================================================
   Pricing helpers — used by booking.js and admin.js
   ========================================================= */

/* Look a size up by the value stored on a booking.
   Accepts the id ('medium'), the label ('Medium') or the full
   stored string ('Medium (21 - 40 lb)'), so old bookings taken
   before this pricing existed still resolve sensibly. */
window.FP_SIZE = function (value) {
  if (!value) return null;
  var v = String(value).toLowerCase();
  var sizes = window.FP_CONFIG.SIZES;

  for (var i = 0; i < sizes.length; i++) {
    if (v === sizes[i].id || v.indexOf(sizes[i].label.toLowerCase()) === 0) return sizes[i];
  }
  // Legacy sizes from the old four-tier form.
  if (v.indexOf('x-large') === 0 || v.indexOf('large') === 0) return sizes[2];
  return null;
};

/* The price for a booking: the flat service price if the
   service has one, otherwise the dog's size price.
   Returns null when we can't work it out. */
window.FP_PRICE = function (sizeValue, service) {
  var flat = window.FP_CONFIG.FLAT_PRICE_SERVICES[service];
  if (flat != null) return flat;

  var size = window.FP_SIZE(sizeValue);
  return size ? size.price : null;
};

/* The stored form of a size, e.g. 'Medium (21 - 40 lb)'. */
window.FP_SIZE_VALUE = function (size) {
  return size.label + ' (' + size.range + ')';
};

/* Helper: is Supabase actually set up yet? */
window.FP_READY = (function () {
  var c = window.FP_CONFIG;
  return !!(c.SUPABASE_URL &&
            c.SUPABASE_ANON_KEY &&
            c.SUPABASE_URL.indexOf('YOUR_') === -1 &&
            c.SUPABASE_ANON_KEY.indexOf('YOUR_') === -1);
})();

/* Shared client (created once, reused by booking.js and admin.js) */
window.fpClient = (function () {
  if (!window.FP_READY || typeof window.supabase === 'undefined') return null;
  return window.supabase.createClient(
    window.FP_CONFIG.SUPABASE_URL,
    window.FP_CONFIG.SUPABASE_ANON_KEY
  );
})();
