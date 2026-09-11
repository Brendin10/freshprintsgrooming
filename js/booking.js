/* =========================================================
   Fresh Prints Grooming — booking form
   Submits an appointment request into Supabase.
   Falls back to an email link if Supabase isn't configured yet.
   ========================================================= */
(function () {
  'use strict';

  var form = document.getElementById('bookingForm');
  if (!form) return;

  var statusEl  = document.getElementById('formStatus');
  var submitBtn = document.getElementById('submitBtn');
  var btnLabel  = submitBtn.querySelector('.btn-label');
  var spinner   = submitBtn.querySelector('.spinner');
  var cfg       = window.FP_CONFIG;

  /* ---- Restrict the date picker to valid days ---- */
  var dateInput = document.getElementById('preferredDate');
  if (dateInput) {
    var min = new Date();
    min.setDate(min.getDate() + (cfg.MIN_LEAD_DAYS || 0));
    var max = new Date();
    max.setMonth(max.getMonth() + 6);
    dateInput.min = toISODate(min);
    dateInput.max = toISODate(max);
  }

  function toISODate(d) {
    return d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0');
  }

  /* =====================================================
     Dog size: the three price tiers
     Rendered from FP_CONFIG.SIZES so the prices shown here
     can never drift out of step with the Services section.
     ===================================================== */
  var sizeChips   = document.getElementById('sizeChips');
  var serviceSel  = document.getElementById('service');
  var estimateBox = document.getElementById('estimate');
  var estimateAmt = document.getElementById('estimateAmount');
  var estimateLbl = document.getElementById('estimateLabel');
  var estimateNote= document.getElementById('estimateNote');

  if (sizeChips && cfg.SIZES) {
    sizeChips.innerHTML = cfg.SIZES.map(function (size, i) {
      var value = window.FP_SIZE_VALUE(size);
      return '<label class="chip">' +
               '<input type="radio" name="petSize" value="' + escapeHtml(value) + '"' +
                 (i === 0 ? ' required' : '') + '>' +
               '<span>' +
                 escapeHtml(size.label) +
                 '<em>' + escapeHtml(size.range) + '</em>' +
                 '<b class="chip-price">$' + size.price + '</b>' +
               '</span>' +
             '</label>';
    }).join('');
  }

  /* Keep the estimate in step with the size and service chosen. */
  function updateEstimate() {
    if (!estimateBox) return;

    var checked = form.querySelector('input[name="petSize"]:checked');
    if (!checked) { estimateBox.hidden = true; return; }

    var service = serviceSel ? serviceSel.value : '';
    var price   = window.FP_PRICE(checked.value, service);

    if (price == null) { estimateBox.hidden = true; return; }

    var flat = cfg.FLAT_PRICE_SERVICES[service] != null;
    var size = window.FP_SIZE(checked.value);

    estimateLbl.textContent = flat
      ? service
      : (size ? size.label + ' dog' : 'Your dog');

    estimateAmt.textContent = '$' + price;

    estimateNote.textContent = flat
      ? 'A flat price, whatever your dog weighs. Renee confirms it before she starts.'
      : 'Covers the groom itself. Add-ons, heavy matting and dogs that need extra time ' +
        'can add to it — Renee will tell you before she starts.';

    estimateBox.hidden = false;
  }

  if (sizeChips)  sizeChips.addEventListener('change', updateEstimate);
  if (serviceSel) serviceSel.addEventListener('change', updateEstimate);

  /* =====================================================
     Dog photo: pick → preview → downscale → upload
     ===================================================== */
  var MAX_UPLOAD_BYTES = 10 * 1024 * 1024;   // reject anything over 10 MB
  var MAX_EDGE         = 1400;               // downscale longest side to this
  var JPEG_QUALITY     = 0.85;

  var photoInput   = document.getElementById('petPhoto');
  var dropzone     = document.getElementById('dropzone');
  var preview      = document.getElementById('photoPreview');
  var previewImg   = document.getElementById('photoPreviewImg');
  var photoName    = document.getElementById('photoName');
  var photoRemove  = document.getElementById('photoRemove');

  var chosenFile = null;
  var previewUrl = null;

  if (photoInput) {
    photoInput.addEventListener('change', function () {
      handleFile(this.files && this.files[0]);
    });

    photoRemove.addEventListener('click', function () {
      clearPhoto();
    });

    // Drag and drop, for desktop
    ['dragenter', 'dragover'].forEach(function (evt) {
      dropzone.addEventListener(evt, function (e) {
        e.preventDefault(); dropzone.classList.add('dragover');
      });
    });
    ['dragleave', 'drop'].forEach(function (evt) {
      dropzone.addEventListener(evt, function (e) {
        e.preventDefault(); dropzone.classList.remove('dragover');
      });
    });
    dropzone.addEventListener('drop', function (e) {
      var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) handleFile(f);
    });
  }

  function handleFile(file) {
    if (!file) return;

    if (!/^image\//.test(file.type)) {
      setStatus('err', 'That file isn\'t an image. Please pick a JPG or PNG photo.');
      clearPhoto();
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setStatus('err', 'That photo is larger than 10 MB. Try a smaller one.');
      clearPhoto();
      return;
    }

    chosenFile = file;

    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = URL.createObjectURL(file);
    previewImg.src = previewUrl;
    photoName.textContent = file.name || 'photo';
    preview.hidden = false;
    dropzone.hidden = true;
    setStatus('', '');
  }

  function clearPhoto() {
    chosenFile = null;
    if (previewUrl) { URL.revokeObjectURL(previewUrl); previewUrl = null; }
    if (photoInput) photoInput.value = '';
    if (preview) preview.hidden = true;
    if (dropzone) dropzone.hidden = false;
  }

  var DECODE_TIMEOUT = 8000;    // give up shrinking after this
  var UPLOAD_TIMEOUT = 60000;   // give up uploading after this

  /* Resolve a promise with a fallback value if it takes too long.
     Without this, an image the browser can't decode (a HEIC from an
     iPhone, a corrupt file) would leave the form stuck on "Uploading…". */
  function withTimeout(promise, ms, fallback) {
    return new Promise(function (resolve) {
      var done = false;
      var timer = setTimeout(function () {
        if (!done) { done = true; console.warn('Timed out after ' + ms + 'ms'); resolve(fallback); }
      }, ms);

      promise.then(function (v) {
        if (!done) { done = true; clearTimeout(timer); resolve(v); }
      }, function (err) {
        if (!done) { done = true; clearTimeout(timer); console.warn(err); resolve(fallback); }
      });
    });
  }

  /* Shrink big phone photos in the browser before uploading.
     Falls back to the original file if anything goes wrong. */
  function downscale(file) {
    var attempt = new Promise(function (resolve) {
      if (!window.HTMLCanvasElement || !window.URL || !window.Image) return resolve(file);

      var img = new Image();
      var url = URL.createObjectURL(file);
      var settled = false;

      function finish(result) {
        if (settled) return;
        settled = true;
        URL.revokeObjectURL(url);
        resolve(result);
      }

      img.onload = function () {
        try {
          var scale = Math.min(1, MAX_EDGE / Math.max(img.width, img.height));
          if (scale === 1 && file.size < 900 * 1024) return finish(file);  // small enough already

          var canvas = document.createElement('canvas');
          canvas.width  = Math.round(img.width * scale);
          canvas.height = Math.round(img.height * scale);
          canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);

          if (!canvas.toBlob) return finish(file);

          canvas.toBlob(function (blob) {
            // Only keep the shrunk version if it actually saved bytes.
            finish(blob && blob.size < file.size ? blob : file);
          }, 'image/jpeg', JPEG_QUALITY);
        } catch (e) {
          finish(file);
        }
      };

      img.onerror = function () { finish(file); };
      img.src = url;
    });

    // If decoding stalls, upload the original rather than hanging.
    return withTimeout(attempt, DECODE_TIMEOUT, file);
  }

  /* Upload to Supabase Storage. Resolves to a public URL, or null. */
  function uploadPhoto() {
    if (!chosenFile || !window.fpClient || !window.fpClient.storage) {
      return Promise.resolve(null);
    }

    var job = downscale(chosenFile).then(function (blob) {
      var ext  = (blob.type === 'image/png') ? 'png' : 'jpg';
      // Random name — the owner's original filename never reaches the server.
      var name = Date.now() + '-' + Math.random().toString(36).slice(2, 9) + '.' + ext;

      return window.fpClient.storage
        .from('dog-photos')
        .upload(name, blob, { contentType: blob.type || 'image/jpeg', upsert: false })
        .then(function (res) {
          if (res.error) { console.warn('Photo upload failed:', res.error); return null; }
          var pub = window.fpClient.storage.from('dog-photos').getPublicUrl(name);
          return (pub && pub.data && pub.data.publicUrl) || null;
        });
    });

    // A photo must never be the reason a booking fails to go through.
    return withTimeout(job, UPLOAD_TIMEOUT, null);
  }

  /* ---- Status messaging ---- */
  function setStatus(kind, html) {
    statusEl.className = 'form-status ' + (kind || '');
    statusEl.innerHTML = html || '';
    if (html && typeof statusEl.scrollIntoView === 'function') {
      statusEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  function setLoading(on, label) {
    submitBtn.disabled = on;
    spinner.hidden = !on;
    btnLabel.textContent = on ? (label || 'Sending…') : 'Request appointment';
  }

  /* ---- Clear the invalid state as the user fixes things ---- */
  form.addEventListener('input', function (e) {
    if (e.target.classList) e.target.classList.remove('invalid');
  });
  form.addEventListener('change', function (e) {
    if (e.target.name === 'petSize') {
      var chips = form.querySelector('.chips');
      if (chips) chips.classList.remove('invalid');
    }
  });

  /* ---- Validation ---- */
  function validate() {
    var problems = [];
    var firstBad = null;

    ['ownerName', 'phone', 'email', 'petName', 'service', 'preferredDate', 'preferredTime']
      .forEach(function (id) {
        var el = document.getElementById(id);
        if (!el) return;
        var ok = el.value.trim() !== '';
        if (ok && id === 'email') ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(el.value.trim());
        if (ok && id === 'phone') ok = el.value.replace(/\D/g, '').length >= 7;
        el.classList.toggle('invalid', !ok);
        if (!ok) {
          problems.push(id);
          if (!firstBad) firstBad = el;
        }
      });

    var size = form.querySelector('input[name="petSize"]:checked');
    var chips = form.querySelector('.chips');
    if (!size) {
      problems.push('petSize');
      if (chips) chips.classList.add('invalid');
      if (!firstBad) firstBad = chips;
    }

    if (firstBad && firstBad.focus) firstBad.focus({ preventScroll: true });
    if (firstBad && typeof firstBad.scrollIntoView === 'function') {
      firstBad.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    return problems.length === 0;
  }

  /* ---- Gather values ---- */
  function collect() {
    var size = form.querySelector('input[name="petSize"]:checked');
    return {
      owner_name:     document.getElementById('ownerName').value.trim(),
      phone:          document.getElementById('phone').value.trim(),
      email:          document.getElementById('email').value.trim().toLowerCase(),
      pet_name:       document.getElementById('petName').value.trim(),
      breed:          document.getElementById('breed').value.trim() || null,
      pet_size:       size ? size.value : null,
      coat_condition: document.getElementById('coat').value || null,
      photo_url:      null,   // filled in after the upload, if there is one
      service:        document.getElementById('service').value,
      preferred_date: document.getElementById('preferredDate').value,
      preferred_time: document.getElementById('preferredTime').value,
      notes:          document.getElementById('notes').value.trim() || null,
      status:         'pending'
    };
  }

  /* ---- Email fallback (used before Supabase is configured) ---- */
  function mailtoLink(d) {
    var body = [
      'New appointment request',
      '',
      'Owner: ' + d.owner_name,
      'Phone: ' + d.phone,
      'Email: ' + d.email,
      '',
      'Dog: ' + d.pet_name + (d.breed ? ' (' + d.breed + ')' : ''),
      'Size: ' + d.pet_size,
      'Coat: ' + (d.coat_condition || '—'),
      '',
      'Service: ' + d.service,
      'Price for this size: ' + (function () {
        var p = window.FP_PRICE(d.pet_size, d.service);
        return p == null ? '—' : '$' + p;
      })(),
      'Preferred: ' + d.preferred_date + ', ' + d.preferred_time,
      '',
      'Notes: ' + (d.notes || '—')
    ].join('\n');

    return 'mailto:' + cfg.BUSINESS_EMAIL +
      '?subject=' + encodeURIComponent('Appointment request — ' + d.pet_name) +
      '&body=' + encodeURIComponent(body);
  }

  /* ---- Submit ---- */
  form.addEventListener('submit', function (e) {
    e.preventDefault();

    // Honeypot: bots fill hidden fields, humans don't.
    if (document.getElementById('company').value !== '') return;

    setStatus('', '');
    if (!validate()) {
      setStatus('err', 'Please fill in the highlighted fields so we can get back to you.');
      return;
    }

    var data = collect();

    if (!window.fpClient) {
      setStatus('warn',
        '<strong>Online booking isn\'t connected yet.</strong><br>' +
        'Send your request directly instead: ' +
        '<a href="' + mailtoLink(data) + '">email it to us</a> or call ' +
        '<a href="tel:' + cfg.BUSINESS_PHONE.replace(/\D/g, '') + '">' + cfg.BUSINESS_PHONE + '</a>.');
      return;
    }

    setLoading(true, chosenFile ? 'Uploading photo…' : 'Sending…');

    uploadPhoto()
      .then(function (photoUrl) {
        data.photo_url = photoUrl;
        setLoading(true, 'Sending…');
        return window.fpClient.from('appointments').insert([data]);
      })
      .then(function (res) {
        setLoading(false);
        if (res.error) {
          console.error('Supabase insert failed:', res.error);
          setStatus('err',
            'Something went wrong on our end. Please call ' +
            '<a href="tel:' + cfg.BUSINESS_PHONE.replace(/\D/g, '') + '">' + cfg.BUSINESS_PHONE +
            '</a> or <a href="' + mailtoLink(data) + '">email us</a> and we\'ll sort it out.');
          return;
        }

        var hadPhoto = !!chosenFile;
        var photoFailed = hadPhoto && !data.photo_url;

        form.reset();
        clearPhoto();
        if (estimateBox) estimateBox.hidden = true;

        var quoted = window.FP_PRICE(data.pet_size, data.service);

        setStatus('ok',
          '<strong>Request received.</strong><br>' +
          'Thanks, ' + escapeHtml(data.owner_name.split(' ')[0]) + '. We\'ll confirm ' +
          escapeHtml(data.pet_name) + '\'s appointment shortly' +
          (quoted != null ? ' at <strong>$' + quoted + '</strong>' : '') +
          '. Keep an eye on your email and phone.' +
          (photoFailed
            ? '<br><br><em>Your photo didn\'t upload, but the booking went through fine — ' +
              'you can text it over instead.</em>'
            : ''));
      })
      .catch(function (err) {
        setLoading(false);
        console.error(err);
        setStatus('err',
          'We couldn\'t reach the booking system. Please ' +
          '<a href="' + mailtoLink(data) + '">email your request</a> instead.');
      });
  });

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
})();
