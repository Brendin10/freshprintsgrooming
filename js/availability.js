/* =========================================================
   Fresh Prints Grooming — admin availability
   Create and remove the bookable time slots that drive the
   calendar on the public booking form.

   Reads and writes public.slots, which only signed-in staff
   can change (see supabase/02-availability.sql).
   ========================================================= */
(function () {
  'use strict';

  var grid = document.getElementById('avGrid');
  if (!grid) return;

  function el(id) { return document.getElementById(id); }

  var sb = window.fpClient;
  var MONTHS = ['January','February','March','April','May','June',
                'July','August','September','October','November','December'];

  var slots = {};                 // 'YYYY-MM-DD' -> [{id, time, status}]
  var view  = new Date();
  var selected = null;
  view.setDate(1);

  /* ---- helpers ---- */
  function iso(d) {
    return d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0');
  }
  function todayISO() { return iso(new Date()); }

  function pretty(hhmm) {
    var b = String(hhmm).split(':');
    var h = parseInt(b[0], 10);
    var ampm = h >= 12 ? 'PM' : 'AM';
    var h12 = h % 12; if (h12 === 0) h12 = 12;
    return h12 + ':' + (b[1] || '00') + ' ' + ampm;
  }
  function prettyDate(key) {
    var p = key.split('-');
    return new Date(+p[0], +p[1] - 1, +p[2])
      .toLocaleDateString(undefined, { weekday:'long', month:'long', day:'numeric' });
  }
  /* '9:00' and '09:00' both land as '09:00'; anything else is rejected. */
  function normalise(raw) {
    var m = String(raw).trim().match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return null;
    var h = parseInt(m[1], 10), mi = parseInt(m[2], 10);
    if (h > 23 || mi > 59) return null;
    return String(h).padStart(2, '0') + ':' + m[2];
  }
  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c];
    });
  }
  function say(msg, kind) {
    var box = el('avBulkStatus');
    box.className = 'av-status ' + (kind || '');
    box.textContent = msg || '';
  }

  /* ---- load a window either side of the month on screen ---- */
  function load() {
    if (!sb) return Promise.resolve();

    var from = new Date(view.getFullYear(), view.getMonth() - 1, 1);
    var to   = new Date(view.getFullYear(), view.getMonth() + 2, 0);

    return sb.from('slots')
      .select('id, slot_date, slot_time, status')
      .gte('slot_date', iso(from))
      .lte('slot_date', iso(to))
      .order('slot_time', { ascending: true })
      .then(function (res) {
        if (res.error) { console.error(res.error); say('Could not load availability.', 'err'); return; }
        slots = {};
        (res.data || []).forEach(function (r) {
          (slots[r.slot_date] = slots[r.slot_date] || [])
            .push({ id: r.id, time: r.slot_time, status: r.status });
        });
        render();
      });
  }

  /* ---- month grid ---- */
  function render() {
    el('avTitle').textContent = MONTHS[view.getMonth()] + ' ' + view.getFullYear();

    var days    = new Date(view.getFullYear(), view.getMonth() + 1, 0).getDate();
    var leading = new Date(view.getFullYear(), view.getMonth(), 1).getDay();
    var today   = todayISO();
    var html    = '';

    for (var i = 0; i < leading; i++) html += '<div class="cal-cell blank"></div>';

    for (var d = 1; d <= days; d++) {
      var key  = iso(new Date(view.getFullYear(), view.getMonth(), d));
      var list = slots[key] || [];
      var open = list.filter(function (s) { return s.status === 'open'; }).length;
      var bkd  = list.length - open;

      var cls = 'cal-cell av-cell';
      if (key === today)    cls += ' today';
      if (key === selected) cls += ' selected';
      if (key < today)      cls += ' past';

      var dots = '';
      if (open) dots += '<i class="lg lg-open"></i>';
      if (bkd)  dots += '<i class="lg lg-booked"></i>';

      html += '<div class="' + cls + '" data-date="' + key + '" role="button" tabindex="0">' +
                '<span class="cal-num">' + d + '</span>' +
                '<span class="cal-dots">' + dots + '</span>' +
                (open ? '<span class="av-n">' + open + '</span>' : '') +
              '</div>';
    }

    grid.innerHTML = html;
    if (selected) renderDay(selected);
  }

  /* ---- one day's times ---- */
  function renderDay(key) {
    el('avEmpty').hidden = true;
    el('avEditor').hidden = false;
    el('avDayTitle').textContent = prettyDate(key);

    var list = (slots[key] || []).slice().sort(function (a, b) {
      return a.time < b.time ? -1 : 1;
    });

    if (!list.length) {
      el('avList').innerHTML = '<p class="av-hint">No times on this date yet.</p>';
      return;
    }

    el('avList').innerHTML = list.map(function (s) {
      var booked = s.status === 'booked';
      return '<div class="av-slot' + (booked ? ' is-booked' : '') + '">' +
               '<span class="av-slot-time">' + esc(pretty(s.time)) + '</span>' +
               (booked
                 ? '<span class="av-slot-tag">Booked</span>'
                 : '<button type="button" class="av-remove" data-remove="' + esc(s.id) +
                   '" aria-label="Remove ' + esc(pretty(s.time)) + '">Remove</button>') +
             '</div>';
    }).join('');
  }

  /* ---- actions ---- */
  function addTimes(dateKey, times) {
    var existing = (slots[dateKey] || []).map(function (s) { return s.time; });
    var rows = times
      .filter(function (t) { return existing.indexOf(t) === -1; })
      .map(function (t) { return { slot_date: dateKey, slot_time: t }; });

    if (!rows.length) return Promise.resolve(0);

    return sb.from('slots').insert(rows).then(function (res) {
      // 23505 = unique violation: the time already existed. Not an error here.
      if (res.error && res.error.code !== '23505') throw res.error;
      return rows.length;
    });
  }

  el('avAdd').addEventListener('click', function () {
    if (!selected) return;
    var t = normalise(el('avTime').value);
    if (!t) { say('Enter a time like 9:00 or 14:30.', 'err'); return; }

    addTimes(selected, [t])
      .then(function (n) {
        el('avTime').value = '';
        say(n ? 'Added ' + pretty(t) + '.' : 'That time is already on this date.', n ? 'ok' : '');
        return load();
      })
      .catch(function (e) { console.error(e); say('Could not add that time.', 'err'); });
  });

  el('avList').addEventListener('click', function (e) {
    var btn = e.target.closest && e.target.closest('[data-remove]');
    if (!btn) return;

    sb.from('slots').delete().eq('id', btn.getAttribute('data-remove'))
      .then(function (res) {
        if (res.error) throw res.error;
        say('Time removed.', 'ok');
        return load();
      })
      .catch(function (er) { console.error(er); say('Could not remove that time.', 'err'); });
  });

  grid.addEventListener('click', function (e) {
    var cell = e.target.closest && e.target.closest('[data-date]');
    if (!cell) return;
    selected = cell.getAttribute('data-date');
    render();
  });
  grid.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    var cell = e.target.closest && e.target.closest('[data-date]');
    if (!cell) return;
    e.preventDefault();
    selected = cell.getAttribute('data-date');
    render();
  });

  el('avPrev').addEventListener('click', function () {
    view = new Date(view.getFullYear(), view.getMonth() - 1, 1); load();
  });
  el('avNext').addEventListener('click', function () {
    view = new Date(view.getFullYear(), view.getMonth() + 1, 1); load();
  });

  /* ---- weekly pattern ---- */
  el('avBulkAdd').addEventListener('click', function () {
    var days = [].slice.call(el('avDays').querySelectorAll('input:checked'))
                 .map(function (c) { return parseInt(c.value, 10); });
    if (!days.length) { say('Pick at least one day of the week.', 'err'); return; }

    var raw = el('avBulkTimes').value.split(',');
    var times = [], bad = [];
    raw.forEach(function (r) {
      if (!r.trim()) return;
      var t = normalise(r);
      if (t) { if (times.indexOf(t) === -1) times.push(t); } else { bad.push(r.trim()); }
    });

    if (bad.length)   { say('Not a time: ' + bad.join(', ') + '. Use 24-hour like 9:00 or 14:30.', 'err'); return; }
    if (!times.length){ say('Enter at least one time.', 'err'); return; }

    var weeks = parseInt(el('avWeeks').value, 10) || 4;
    var start = new Date(); start.setHours(0,0,0,0);
    var end   = new Date(start); end.setDate(end.getDate() + weeks * 7);

    var targets = [];
    for (var d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      if (days.indexOf(d.getDay()) !== -1) targets.push(iso(d));
    }
    if (!targets.length) { say('Those days don\'t fall in that period.', 'err'); return; }

    say('Adding ' + (targets.length * times.length) + ' times…');

    // Let the database reject duplicates rather than reading everything first.
    var rows = [];
    targets.forEach(function (key) {
      times.forEach(function (t) { rows.push({ slot_date: key, slot_time: t }); });
    });

    sb.from('slots').upsert(rows, { onConflict: 'slot_date,slot_time', ignoreDuplicates: true })
      .then(function (res) {
        if (res.error) throw res.error;
        say('Added times on ' + targets.length + ' dates. Existing times were left alone.', 'ok');
        return load();
      })
      .catch(function (e) {
        console.error(e);
        say('Could not add those times. ' + (e.message || ''), 'err');
      });
  });

  load();
})();
