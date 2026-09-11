/* =========================================================
   Fresh Prints Grooming — Facebook feed renderer
   ---------------------------------------------------------
   Reads data/feed.json (written by the GitHub Action) and:
     1. fills the gallery grid with your latest photos
     2. renders "Latest from Facebook" post cards with captions

   If the feed is empty or missing, the placeholder gallery
   stays put and the posts section stays hidden.
   ========================================================= */
(function () {
  'use strict';

  var CAPTION_LIMIT = 220;   // characters before "Read more"
  var GALLERY_MAX   = 9;     // photos in the gallery grid

  var grid       = document.getElementById('galleryGrid');
  var updatesSec = document.getElementById('updates');
  var updatesRow = document.getElementById('updatesList');
  var fbLink     = document.getElementById('fbPageLink');
  var galleryNote = document.getElementById('galleryNote');

  fetch('data/feed.json', { cache: 'no-cache' })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (feed) {
      if (!feed || !feed.posts || !feed.posts.length) return;   // keep placeholders
      renderGallery(feed);
      renderUpdates(feed);
    })
    .catch(function () { /* offline or not deployed yet — placeholders stay */ });

  /* ---------------------------------------------------
     Gallery
     --------------------------------------------------- */
  function renderGallery(feed) {
    if (!grid) return;

    var shots = [];
    feed.posts.forEach(function (p) {
      p.images.forEach(function (src) {
        if (shots.length < GALLERY_MAX) {
          shots.push({ src: src, alt: altFor(p), url: p.url });
        }
      });
    });

    if (!shots.length) return;

    grid.innerHTML = shots.map(function (s) {
      var img = '<img src="' + esc(s.src) + '" alt="' + esc(s.alt) + '" loading="lazy" decoding="async">';
      return '<figure class="shot">' +
        (s.url
          ? '<a href="' + esc(s.url) + '" target="_blank" rel="noopener noreferrer">' + img + '</a>'
          : img) +
        '</figure>';
    }).join('');

    if (galleryNote) galleryNote.hidden = true;
  }

  /* ---------------------------------------------------
     Post cards
     --------------------------------------------------- */
  function renderUpdates(feed) {
    if (!updatesSec || !updatesRow) return;

    var posts = feed.posts.slice(0, 6);
    if (!posts.length) return;

    updatesRow.innerHTML = posts.map(postCard).join('');
    updatesSec.hidden = false;

    if (fbLink && feed.page && feed.page.url) fbLink.href = feed.page.url;

    // "Read more" toggles
    updatesRow.addEventListener('click', function (e) {
      var btn = e.target.closest('.post-more');
      if (!btn) return;
      var body = btn.previousElementSibling;
      var open = body.classList.toggle('open');
      btn.textContent = open ? 'Show less' : 'Read more';
    });
  }

  function postCard(p) {
    var caption = p.caption || '';
    var isLong  = caption.length > CAPTION_LIMIT;

    var html = '<article class="post">';

    if (p.images.length) {
      html += '<div class="post-media' + (p.images.length > 1 ? ' post-media-multi' : '') + '">' +
        p.images.slice(0, 4).map(function (src, i) {
          return '<img src="' + esc(src) + '" alt="' + esc(altFor(p)) +
                 '" loading="lazy" decoding="async"' + (i > 0 ? ' class="post-thumb"' : '') + '>';
        }).join('') +
        (p.images.length > 4
          ? '<span class="post-more-count">+' + (p.images.length - 4) + '</span>'
          : '') +
      '</div>';
    }

    html += '<div class="post-body">';
    if (p.date) html += '<p class="post-date">' + esc(prettyDate(p.date)) + '</p>';

    if (caption) {
      html += '<div class="post-text' + (isLong ? ' clamped' : '') + '">' + nl2br(esc(caption)) + '</div>';
      if (isLong) html += '<button type="button" class="post-more">Read more</button>';
    }

    if (p.url) {
      html += '<a class="post-link" href="' + esc(p.url) +
              '" target="_blank" rel="noopener noreferrer">See it on Facebook →</a>';
    }

    html += '</div></article>';
    return html;
  }

  /* ---------------------------------------------------
     Helpers
     --------------------------------------------------- */
  function altFor(p) {
    var c = (p.caption || '').replace(/\s+/g, ' ').trim();
    return c ? c.slice(0, 110) : 'Fresh Prints Grooming photo';
  }

  function prettyDate(iso) {
    var d = new Date(iso);
    if (isNaN(d)) return '';
    return d.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
  }

  function nl2br(s) { return s.replace(/\n/g, '<br>'); }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
})();
