/* =========================================================
   Fresh Prints Grooming — booking calendar
   Draws a month grid from the open slots in Supabase.

   A date is green and clickable when it has at least one open
   time; otherwise it is dimmed, red-tinted and disabled. Picking
   a date reveals that day's actual times.

   The native <input type="date"> can't be coloured or have
   individual days disabled in a way that works across browsers,
   which is why this is hand-built. It writes its result into the
   hidden preferredDate / preferredTime / slotId inputs, so
   booking.js keeps reading the same fields it always has.
   ========================================================= */
(function () {
  'use strict';

  var grid = document.getElementById('calGrid');
  if (!grid) return;

  var cfg       = window.FP_CONFIG || {};
  var monthEl   = document.getElementById('calMonth');
  var prevBtn   = document.getElementById('calPrev');
  var nextBtn   = document.getElementById('calNext');
  var statusEl  = document.getElementById('calStatus');
  var calEl     = document.getElementById('cal');
  var picker    = document.getElementById('slotPicker');
  var slotList  = document.getElementById('slotList');
  var slotsDate = document.getElementById('slotsDate');
  var fallback  = document.getElementById('calFallback');

  var dateInput = document.getElementById('preferredDate');
  var timeInput = document.getElementById('preferredTime');
  var slotInput = document.getElementById('slotId');

  var MONTHS = ['January','February','March','April','May','June',
                'July','August','September','October','November','December'];

  var slotsByDate = {};      // 'YYYY-MM-DD' -> [{ id, time }]
  var selectedDate = null;
  var loaded = false;

  /* ---- Dates, handled as local Y-M-D with no timezone maths ---- */
  function iso(d) {
    return d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0');
  }
  function startOfDay(d) { var x = new Date(d); x.setHours(0,0,0,0); return x; }

  var minDate = startOfDay(new Date());
  minDate.setDate(minDate.getDate() + (cfg.MIN_LEAD_DAYS || 0));
  var maxDate = startOfDay(new Date());
  maxDate.setMonth(maxDate.getMonth() + 6);

  var view = new Date(minDate.getFullYear(), minDate.getMonth(), 1);

  /* ---- Display helpers ---- */
  function prettyTime(hhmm) {
    var parts = String(hhmm).split(':');
    var h = parseInt(parts[0], 10);
    var m = parts[1] || '00';
    var ampm = h >= 12 ? 'PM' : 'AM';
    var h12 = h % 12; if (h12 === 0) h12 = 12;
    return h12 + ':' + m + ' ' + ampm;
  }
  function prettyDate(isoStr) {
    var p = isoStr.split('-');
    var d = new Date(+p[0], +p[1] - 1, +p[2]);
    return d.toLocaleDateString(undefined,
      { weekday: 'long', month: 'long', day: 'numeric' });
  }

  function setStatus(kind, msg) {
    statusEl.className = 'bcal-status ' + (kind || '');
    statusEl.textContent = msg || '';
  }

  /* =====================================================
     Load the open slots
     ===================================================== */
  function load() {
    if (!window.fpClient) { return degrade(); }

    setStatus('', 'Loading available dates…');

    return window.fpClient
      .from('slots')
      .select('id, slot_date, slot_time')
      .eq('status', 'open')
      .gte('slot_date', iso(minDate))
      .lte('slot_date', iso(maxDate))
      .order('slot_date', { ascending: true })
      .order('slot_time', { ascending: true })
      .then(function (res) {
        if (res.error) throw res.error;

        slotsByDate = {};
        (res.data || []).forEach(function (row) {
          if (!slotsByDate[row.slot_date]) slotsByDate[row.slot_date] = [];
          slotsByDate[row.slot_date].push({ id: row.id, time: row.slot_time });
        });

        loaded = true;
        setStatus('', '');
        jumpToFirstMonthWithSlots();
        render();

        if (!Object.keys(slotsByDate).length) {
          setStatus('warn', 'No dates are open for booking at the moment. ' +
            'Send your request anyway using the details below, or call ' +
            (cfg.BUSINESS_PHONE || 'us') + ' and we’ll find you a time.');
          degrade(true);
        }
      })
      .catch(function (err) {
        console.warn('Could not load availability:', err);
        degrade();
      });
  }

  /* If availability can't be read, fall back to a plain date field so
     somebody can still get a request through. Never leave them stuck. */
  function degrade(keepCalendar) {
    if (!keepCalendar) {
      if (calEl) calEl.hidden = true;
      setStatus('warn', 'We can’t show the live calendar right now — ' +
        'tell us the day that suits you and we’ll confirm by phone.');
    }
    if (picker) picker.hidden = true;
    if (!fallback) return;

    fallback.hidden = false;
    var fDate = document.getElementById('fallbackDate');
    var fTime = document.getElementById('fallbackTime');
    if (fDate) {
      fDate.min = iso(minDate);
      fDate.max = iso(maxDate);
      fDate.addEventListener('change', function () { dateInput.value = this.value; });
    }
    if (fTime) {
      fTime.addEventListener('change', function () { timeInput.value = this.value; });
    }
    slotInput.value = '';
  }

  function jumpToFirstMonthWithSlots() {
    var keys = Object.keys(slotsByDate).sort();
    if (!keys.length) return;
    var p = keys[0].split('-');
    view = new Date(+p[0], +p[1] - 1, 1);
  }

  /* =====================================================
     Render the month
     ===================================================== */
  function render() {
    monthEl.textContent = MONTHS[view.getMonth()] + ' ' + view.getFullYear();

    var first   = new Date(view.getFullYear(), view.getMonth(), 1);
    var days    = new Date(view.getFullYear(), view.getMonth() + 1, 0).getDate();
    var leading = first.getDay();
    var html    = '';

    for (var i = 0; i < leading; i++) {
      html += '<span class="bcal-day blank" aria-hidden="true"></span>';
    }

    for (var d = 1; d <= days; d++) {
      var cell   = new Date(view.getFullYear(), view.getMonth(), d);
      var key    = iso(cell);
      var open   = (slotsByDate[key] || []).length;
      var inRange = cell >= minDate && cell <= maxDate;
      var can    = loaded && inRange && open > 0;

      var cls = 'bcal-day' + (can ? ' is-open' : ' is-full') +
                (key === selectedDate ? ' is-selected' : '');

      var label = prettyDate(key) + (can
        ? ' — ' + open + ' time' + (open === 1 ? '' : 's') + ' available'
        : ' — unavailable');

      html += '<button type="button" class="' + cls + '" data-date="' + key + '"' +
              (can ? '' : ' disabled aria-disabled="true"') +
              ' aria-label="' + label + '"' +
              (key === selectedDate ? ' aria-pressed="true"' : '') + '>' +
                '<span class="bcal-num">' + d + '</span>' +
                (can ? '<span class="bcal-count">' + open + '</span>' : '') +
              '</button>';
    }

    grid.innerHTML = html;

    // Don't let them page backwards past this month, or beyond the window.
    prevBtn.disabled = (view.getFullYear() === minDate.getFullYear() &&
                        view.getMonth()    === minDate.getMonth());
    nextBtn.disabled = (view.getFullYear() === maxDate.getFullYear() &&
                        view.getMonth()    === maxDate.getMonth());
  }

  /* =====================================================
     Pick a date, then a time
     ===================================================== */
  function selectDate(key) {
    selectedDate = key;
    dateInput.value = key;
    timeInput.value = '';
    slotInput.value = '';
    if (calEl) calEl.classList.remove('invalid');

    var times = slotsByDate[key] || [];
    slotsDate.textContent = prettyDate(key);

    slotList.innerHTML = times.map(function (s) {
      return '<button type="button" class="slot" data-slot="' + s.id +
             '" data-time="' + s.time + '">' + prettyTime(s.time) + '</button>';
    }).join('');

    picker.hidden = false;
    picker.classList.remove('invalid');
    render();

    if (typeof picker.scrollIntoView === 'function') {
      picker.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }

  function selectSlot(btn) {
    slotInput.value = btn.getAttribute('data-slot');
    timeInput.value = btn.getAttribute('data-time');

    var all = slotList.querySelectorAll('.slot');
    for (var i = 0; i < all.length; i++) all[i].classList.remove('is-selected');
    btn.classList.add('is-selected');
    picker.classList.remove('invalid');
  }

  grid.addEventListener('click', function (e) {
    var btn = e.target.closest && e.target.closest('.bcal-day');
    if (btn && !btn.disabled && btn.getAttribute('data-date')) {
      selectDate(btn.getAttribute('data-date'));
    }
  });

  slotList.addEventListener('click', function (e) {
    var btn = e.target.closest && e.target.closest('.slot');
    if (btn) selectSlot(btn);
  });

  prevBtn.addEventListener('click', function () {
    view = new Date(view.getFullYear(), view.getMonth() - 1, 1);
    render();
  });
  nextBtn.addEventListener('click', function () {
    view = new Date(view.getFullYear(), view.getMonth() + 1, 1);
    render();
  });

  /* booking.js calls this after a successful submit, so the slot
     that was just taken disappears from the calendar. */
  window.FP_CALENDAR = {
    reload: function () {
      selectedDate = null;
      if (picker) picker.hidden = true;
      if (dateInput) dateInput.value = '';
      if (timeInput) timeInput.value = '';
      if (slotInput) slotInput.value = '';
      return load();
    }
  };

  render();
  load();
})();
