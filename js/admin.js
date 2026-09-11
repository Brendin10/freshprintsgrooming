/* =========================================================
   Fresh Prints Grooming — admin dashboard
   Auth + appointment management against Supabase.
   ========================================================= */
(function () {
  'use strict';

  var sb = window.fpClient;

  var el = function (id) { return document.getElementById(id); };
  var STATUSES = ['pending', 'confirmed', 'completed', 'cancelled'];

  var state = {
    appts: [],
    calMonth: new Date(),          // first render uses current month
    selectedDay: null,             // 'YYYY-MM-DD'
    filterStatus: 'all',
    search: '',
    clientSearch: '',
    openId: null
  };

  /* =====================================================
     Boot
     ===================================================== */
  if (!window.FP_READY || !sb) {
    el('notConfigured').hidden = false;
    return;
  }

  sb.auth.getSession().then(function (res) {
    if (res.data && res.data.session) showDash();
    else el('loginGate').hidden = false;
  });

  /* =====================================================
     Auth
     ===================================================== */
  var loginForm = el('loginForm');
  var loginBtn = el('loginBtn');

  loginForm.addEventListener('submit', function (e) {
    e.preventDefault();
    var status = el('loginStatus');
    var spin = loginBtn.querySelector('.spinner');
    var label = loginBtn.querySelector('.btn-label');

    status.className = 'form-status';
    status.textContent = '';
    loginBtn.disabled = true;
    spin.hidden = false;
    label.textContent = 'Signing in…';

    sb.auth.signInWithPassword({
      email: el('loginEmail').value.trim(),
      password: el('loginPassword').value
    }).then(function (res) {
      loginBtn.disabled = false;
      spin.hidden = true;
      label.textContent = 'Sign in';

      if (res.error) {
        status.className = 'form-status err';
        status.textContent = res.error.message || 'Sign in failed. Check your email and password.';
        return;
      }
      el('loginGate').hidden = true;
      showDash();
    });
  });

  el('logoutBtn').addEventListener('click', function () {
    sb.auth.signOut().then(function () { location.reload(); });
  });

  function showDash() {
    el('dash').hidden = false;
    loadAppointments();
  }

  /* =====================================================
     Data
     ===================================================== */
  function loadAppointments() {
    var btn = el('refreshBtn');
    btn.classList.add('spin');

    return sb.from('appointments')
      .select('*')
      .order('preferred_date', { ascending: true })
      .then(function (res) {
        btn.classList.remove('spin');
        if (res.error) {
          console.error(res.error);
          toast('Could not load appointments: ' + res.error.message, true);
          return;
        }
        state.appts = res.data || [];
        renderAll();
      });
  }

  el('refreshBtn').addEventListener('click', function () {
    loadAppointments().then(function () { toast('Up to date'); });
  });

  function updateAppt(id, patch, successMsg) {
    return sb.from('appointments').update(patch).eq('id', id)
      .then(function (res) {
        if (res.error) {
          console.error(res.error);
          toast(res.error.message, true);
          return false;
        }
        // Patch locally so the UI updates instantly.
        state.appts = state.appts.map(function (a) {
          return a.id === id ? Object.assign({}, a, patch) : a;
        });
        renderAll();
        if (state.openId === id) openDrawer(id);
        if (successMsg) toast(successMsg);
        return true;
      });
  }

  function deleteAppt(id) {
    return sb.from('appointments').delete().eq('id', id)
      .then(function (res) {
        if (res.error) { toast(res.error.message, true); return; }
        state.appts = state.appts.filter(function (a) { return a.id !== id; });
        closeDrawer();
        renderAll();
        toast('Appointment deleted');
      });
  }

  /* =====================================================
     Rendering
     ===================================================== */
  function renderAll() {
    renderStats();
    renderRequests();
    renderCalendar();
    renderDayDetail();
    renderList();
    renderClients();
  }

  /* ---- Stats ---- */
  function renderStats() {
    var today = isoToday();
    var weekEnd = addDays(today, 7);

    var pending = state.appts.filter(function (a) { return a.status === 'pending'; });
    var todays = state.appts.filter(function (a) {
      return a.preferred_date === today && a.status !== 'cancelled';
    });
    var week = state.appts.filter(function (a) {
      return a.preferred_date >= today && a.preferred_date < weekEnd && a.status !== 'cancelled';
    });
    var clients = {};
    state.appts.forEach(function (a) { clients[clientKey(a)] = 1; });

    el('statPending').textContent = pending.length;
    el('statToday').textContent = todays.length;
    el('statWeek').textContent = week.length;
    el('statClients').textContent = Object.keys(clients).length;

    var pill = el('pendingPill');
    pill.textContent = pending.length;
    pill.hidden = pending.length === 0;
  }

  /* ---- Requests tab ---- */
  function renderRequests() {
    var pending = state.appts
      .filter(function (a) { return a.status === 'pending'; })
      .sort(function (a, b) { return (a.preferred_date || '').localeCompare(b.preferred_date || ''); });

    el('requestsList').innerHTML = pending.length
      ? pending.map(apptCard).join('')
      : emptyState('All caught up', 'No pending requests right now.');
  }

  /* ---- Calendar ---- */
  function renderCalendar() {
    var d = state.calMonth;
    var year = d.getFullYear(), month = d.getMonth();

    el('calTitle').textContent =
      d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

    var first = new Date(year, month, 1);
    var daysInMonth = new Date(year, month + 1, 0).getDate();
    var leading = first.getDay();

    // Bucket appointments by date for this month
    var byDate = {};
    state.appts.forEach(function (a) {
      if (!a.preferred_date) return;
      (byDate[a.preferred_date] = byDate[a.preferred_date] || []).push(a);
    });

    var today = isoToday();
    var html = '';

    for (var i = 0; i < leading; i++) html += '<div class="cal-cell blank"></div>';

    for (var day = 1; day <= daysInMonth; day++) {
      var iso = year + '-' + pad(month + 1) + '-' + pad(day);
      var list = byDate[iso] || [];

      // One dot per status present that day (max 4)
      var dots = STATUSES.filter(function (s) {
        return list.some(function (a) { return a.status === s; });
      }).map(function (s) { return '<i class="d-' + s + '"></i>'; }).join('');

      var cls = 'cal-cell';
      if (iso === today) cls += ' today';
      if (iso === state.selectedDay) cls += ' selected';
      if (iso < today) cls += ' past';

      html += '<button class="' + cls + '" data-day="' + iso + '">' +
                '<span>' + day + '</span>' +
                '<span class="cal-dots">' + dots + '</span>' +
              '</button>';
    }

    el('calGrid').innerHTML = html;
  }

  el('prevMonth').addEventListener('click', function () {
    state.calMonth = new Date(state.calMonth.getFullYear(), state.calMonth.getMonth() - 1, 1);
    renderCalendar();
  });
  el('nextMonth').addEventListener('click', function () {
    state.calMonth = new Date(state.calMonth.getFullYear(), state.calMonth.getMonth() + 1, 1);
    renderCalendar();
  });

  el('calGrid').addEventListener('click', function (e) {
    var cell = e.target.closest('[data-day]');
    if (!cell) return;
    state.selectedDay = cell.dataset.day;
    renderCalendar();
    renderDayDetail();
    scrollTo(el('dayDetail'));
  });

  function renderDayDetail() {
    if (!state.selectedDay) {
      el('dayTitle').textContent = 'Select a day';
      el('dayList').innerHTML = '';
      return;
    }
    el('dayTitle').textContent = prettyDate(state.selectedDay);

    var list = state.appts
      .filter(function (a) { return a.preferred_date === state.selectedDay; })
      .sort(byTime);

    el('dayList').innerHTML = list.length
      ? list.map(apptCard).join('')
      : emptyState('Nothing booked', 'This day is free.');
  }

  /* ---- All appointments ---- */
  function renderList() {
    var q = state.search.toLowerCase().trim();

    var list = state.appts.filter(function (a) {
      if (state.filterStatus !== 'all' && a.status !== state.filterStatus) return false;
      if (!q) return true;
      return [a.owner_name, a.pet_name, a.breed, a.phone, a.email, a.service]
        .join(' ').toLowerCase().indexOf(q) !== -1;
    }).sort(function (a, b) {
      return (b.preferred_date || '').localeCompare(a.preferred_date || '');
    });

    el('allList').innerHTML = list.length
      ? list.map(apptCard).join('')
      : emptyState('No matches', 'Try a different search or filter.');
  }

  el('searchInput').addEventListener('input', function (e) {
    state.search = e.target.value;
    renderList();
  });

  el('statusFilter').addEventListener('click', function (e) {
    var chip = e.target.closest('.fchip');
    if (!chip) return;
    Array.prototype.forEach.call(this.children, function (c) { c.classList.remove('active'); });
    chip.classList.add('active');
    state.filterStatus = chip.dataset.status;
    renderList();
  });

  /* ---- Clients ----
     Built automatically from bookings: every new appointment either
     creates a client record or folds into the existing one, matched
     on email (falling back to phone). --------------------------- */
  function buildClients() {
    var today = isoToday();
    var map = {};

    state.appts.forEach(function (a) {
      var k = clientKey(a);

      if (!map[k]) {
        map[k] = {
          key: k,
          name: a.owner_name,
          phone: a.phone,
          email: a.email,
          dogs: {},            // name -> { photo, breed, size }
          photo: null,
          count: 0,
          completed: 0,
          last: '',            // most recent past visit
          next: null,          // soonest upcoming appointment
          spent: 0,
          since: a.created_at || ''
        };
      }

      var c = map[k];

      // Newer bookings win for contact details — people change numbers.
      if (a.created_at && a.created_at > (c.since || '')) {
        c.name = a.owner_name || c.name;
        c.phone = a.phone || c.phone;
      }
      if (a.created_at && a.created_at < (c.since || '9999')) c.since = a.created_at;

      if (a.pet_name) {
        var dog = c.dogs[a.pet_name] || (c.dogs[a.pet_name] = { photo: null, breed: null, size: null });
        if (a.photo_url) dog.photo = a.photo_url;
        if (a.breed) dog.breed = a.breed;
        if (a.pet_size) dog.size = a.pet_size;
      }
      if (a.photo_url && !c.photo) c.photo = a.photo_url;

      c.count++;
      if (a.status === 'completed') {
        c.completed++;
        if (a.quoted_price) c.spent += Number(a.quoted_price) || 0;
      }

      var d = a.preferred_date || '';
      if (a.status !== 'cancelled') {
        if (d && d < today && d > c.last) c.last = d;
        if (d && d >= today && (!c.next || d < c.next.preferred_date)) c.next = a;
      }
    });

    return map;
  }

  function renderClients() {
    var map = buildClients();
    var q = state.clientSearch.toLowerCase().trim();

    var clients = Object.keys(map).map(function (k) { return map[k]; })
      .filter(function (c) {
        if (!q) return true;
        return [c.name, c.phone, c.email, Object.keys(c.dogs).join(' ')]
          .join(' ').toLowerCase().indexOf(q) !== -1;
      })
      .sort(function (a, b) {
        // Clients with something booked float to the top.
        if (!!a.next !== !!b.next) return a.next ? -1 : 1;
        return (a.name || '').localeCompare(b.name || '');
      });

    el('clientCount').textContent = clients.length
      ? clients.length + (clients.length === 1 ? ' client' : ' clients')
      : '';

    el('clientsList').innerHTML = clients.length
      ? clients.map(clientCard).join('')
      : emptyState('No clients yet', 'A client record is created automatically with the first booking.');
  }

  function clientCard(c) {
    var dogNames = Object.keys(c.dogs);

    var dogLine = dogNames.map(function (n) {
      var d = c.dogs[n];
      return esc(n) + (d.breed ? ' <span class="muted">(' + esc(d.breed) + ')</span>' : '');
    }).join(', ');

    var html = '<div class="client" data-client="' + esc(c.key) + '">' +
      '<div class="client-top">' +
        avatar(c.photo, dogNames[0] || c.name, 'client-avatar') +
        '<div class="client-head">' +
          '<div class="client-name">' + esc(c.name || 'Unknown') + '</div>' +
          (dogLine ? '<div class="client-dogs">' + dogLine + '</div>' : '') +
        '</div>' +
      '</div>';

    if (c.next) {
      html += '<div class="client-next">' +
        '<span class="badge b-' + esc(c.next.status) + '">' + esc(c.next.status) + '</span>' +
        '<span>' + prettyDate(c.next.preferred_date, true) + ' · ' +
          esc(c.next.service || '') + '</span>' +
      '</div>';
    }

    html += '<div class="client-contact">' +
      (c.phone ? '<a href="tel:' + esc(digits(c.phone)) + '">' + esc(c.phone) + '</a>' : '') +
      (c.phone ? '<a href="sms:' + esc(digits(c.phone)) + '">Text</a>' : '') +
      (c.email ? '<a href="mailto:' + esc(c.email) + '">' + esc(c.email) + '</a>' : '') +
    '</div>';

    var bits = [c.count + ' booking' + (c.count === 1 ? '' : 's')];
    if (c.completed) bits.push(c.completed + ' completed');
    if (c.last)      bits.push('last visit ' + prettyDate(c.last, true));
    if (c.spent)     bits.push('$' + c.spent.toFixed(2).replace(/\.00$/, '') + ' lifetime');

    html += '<div class="client-count">' + esc(bits.join(' · ')) + '</div>' +
      '<button type="button" class="client-view" data-view="' + esc(c.email || c.phone || c.name) + '">' +
        'View all appointments →</button>' +
    '</div>';

    return html;
  }

  /* Jump to the All tab, pre-filtered to this client */
  el('clientsList').addEventListener('click', function (e) {
    var btn = e.target.closest('[data-view]');
    if (!btn) return;

    state.search = btn.dataset.view;
    state.filterStatus = 'all';
    el('searchInput').value = state.search;
    Array.prototype.forEach.call(el('statusFilter').children, function (c) {
      c.classList.toggle('active', c.dataset.status === 'all');
    });
    renderList();
    document.querySelector('.tab[data-tab="list"]').click();
    scrollTo(el('panel-list'));
  });

  el('clientSearch').addEventListener('input', function (e) {
    state.clientSearch = e.target.value;
    renderClients();
  });

  /* ---- Card markup ---- */
  function avatar(photoUrl, name, cls) {
    return photoUrl
      ? '<img class="' + cls + '" src="' + esc(photoUrl) + '" alt="" loading="lazy" decoding="async">'
      : '<span class="' + cls + ' ' + cls + '-ph">' + esc(initial(name)) + '</span>';
  }

  function apptCard(a) {
    return '<button class="appt s-' + esc(a.status) + '" data-id="' + esc(a.id) + '">' +
      '<div class="appt-top">' +
        avatar(a.photo_url, a.pet_name, 'appt-thumb') +
        '<div class="appt-main">' +
          '<div class="appt-pet">' + esc(a.pet_name || 'Unnamed') +
            (a.breed ? ' <span class="appt-owner">· ' + esc(a.breed) + '</span>' : '') + '</div>' +
          '<div class="appt-owner">' + esc(a.owner_name || '') + '</div>' +
        '</div>' +
        '<span class="badge b-' + esc(a.status) + '">' + esc(a.status) + '</span>' +
      '</div>' +
      '<div class="appt-meta">' +
        '<span><b>' + prettyDate(a.preferred_date, true) + '</b></span>' +
        '<span>' + esc(a.preferred_time || '') + '</span>' +
        '<span>' + esc(a.service || '') + '</span>' +
      '</div>' +
    '</button>';
  }

  function emptyState(title, sub) {
    return '<div class="empty"><strong>' + esc(title) + '</strong>' + esc(sub) + '</div>';
  }

  /* =====================================================
     Tabs
     ===================================================== */
  document.querySelector('.tabs').addEventListener('click', function (e) {
    var tab = e.target.closest('.tab');
    if (!tab) return;
    document.querySelectorAll('.tab').forEach(function (t) {
      var on = t === tab;
      t.classList.toggle('active', on);
      t.setAttribute('aria-selected', String(on));
    });
    document.querySelectorAll('.panel').forEach(function (p) {
      p.classList.toggle('active', p.id === 'panel-' + tab.dataset.tab);
    });
  });

  /* =====================================================
     Drawer
     ===================================================== */
  document.addEventListener('click', function (e) {
    var card = e.target.closest('.appt[data-id]');
    if (card) openDrawer(card.dataset.id);
  });

  function openDrawer(id) {
    var a = state.appts.filter(function (x) { return String(x.id) === String(id); })[0];
    if (!a) return;
    state.openId = a.id;

    el('drawerTitle').textContent = a.pet_name || 'Appointment';

    var html = '';

    if (a.photo_url) {
      html += '<a class="drawer-photo" href="' + esc(a.photo_url) +
              '" target="_blank" rel="noopener noreferrer" title="Open full size">' +
                '<img src="' + esc(a.photo_url) + '" alt="Photo of ' + esc(a.pet_name || 'the dog') + '">' +
              '</a>';
    }

    var rows = [
      ['Status', '<span class="badge b-' + esc(a.status) + '">' + esc(a.status) + '</span>'],
      ['Date', prettyDate(a.preferred_date)],
      ['Time', esc(a.preferred_time || '—')],
      ['Service', esc(a.service || '—')],
      ['Owner', esc(a.owner_name || '—')],
      ['Phone', a.phone ? '<a href="tel:' + esc(digits(a.phone)) + '">' + esc(a.phone) + '</a>' : '—'],
      ['Email', a.email ? '<a href="mailto:' + esc(a.email) + '">' + esc(a.email) + '</a>' : '—'],
      ['Dog', esc(a.pet_name || '—')],
      ['Breed', esc(a.breed || '—')],
      ['Size', esc(a.pet_size || '—')],
      ['Coat', esc(a.coat_condition || '—')],
      ['Standard', (function () {
        var p = window.FP_PRICE(a.pet_size, a.service);
        return p == null ? '—' : '$' + p;
      })()],
      ['Quoted', a.quoted_price != null ? '$' + esc(a.quoted_price) : '—'],
      ['Requested', a.created_at ? new Date(a.created_at).toLocaleDateString() : '—']
    ];

    html += '<dl class="dl">' + rows.map(function (r) {
      return '<div><dt>' + r[0] + '</dt><dd>' + r[1] + '</dd></div>';
    }).join('') + '</dl>';

    if (a.notes) {
      html += '<p class="drawer-section-title">Owner notes</p>' +
              '<div class="drawer-notes">' + esc(a.notes) + '</div>';
    }
    if (a.admin_notes) {
      html += '<p class="drawer-section-title">Your notes</p>' +
              '<div class="drawer-notes">' + esc(a.admin_notes) + '</div>';
    }

    html += '<p class="drawer-section-title">Contact</p>' +
      '<div class="drawer-quick">' +
        (a.phone ? '<a class="btn btn-teal" href="tel:' + esc(digits(a.phone)) + '">Call</a>' +
                   '<a class="btn btn-quiet" href="sms:' + esc(digits(a.phone)) + '">Text</a>' : '') +
        (a.email ? '<a class="btn btn-quiet" href="mailto:' + esc(a.email) + '">Email</a>' : '') +
      '</div>';

    html += '<p class="drawer-section-title">Update</p><div class="drawer-actions">';
    if (a.status !== 'confirmed') html += '<button class="btn btn-teal btn-block" data-act="confirm">Confirm</button>';
    if (a.status !== 'completed') html += '<button class="btn btn-quiet btn-block" data-act="complete">Mark complete</button>';
    html += '<button class="btn btn-quiet btn-block" data-act="price">Set quote</button>';
    html += '<button class="btn btn-quiet btn-block" data-act="note">Add note</button>';
    html += '<button class="btn btn-quiet btn-block" data-act="reschedule">Change date</button>';
    if (a.status !== 'cancelled') html += '<button class="btn btn-danger btn-block" data-act="cancel">Cancel</button>';
    html += '<button class="btn btn-danger btn-block" data-act="delete">Delete</button>';
    html += '</div>';

    el('drawerBody').innerHTML = html;
    el('drawer').hidden = false;
    el('drawerBackdrop').hidden = false;
    document.body.style.overflow = 'hidden';
  }

  function closeDrawer() {
    el('drawer').hidden = true;
    el('drawerBackdrop').hidden = true;
    document.body.style.overflow = '';
    state.openId = null;
  }

  el('drawerClose').addEventListener('click', closeDrawer);
  el('drawerBackdrop').addEventListener('click', closeDrawer);
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !el('drawer').hidden) closeDrawer();
  });

  /* ---- Drawer actions ---- */
  el('drawerBody').addEventListener('click', function (e) {
    var btn = e.target.closest('[data-act]');
    if (!btn || !state.openId) return;

    var id = state.openId;
    var a = state.appts.filter(function (x) { return x.id === id; })[0] || {};

    switch (btn.dataset.act) {
      case 'confirm':
        updateAppt(id, { status: 'confirmed' }, 'Confirmed');
        break;

      case 'complete':
        updateAppt(id, { status: 'completed' }, 'Marked complete');
        break;

      case 'cancel':
        if (confirm('Cancel this appointment? The record stays in your history.')) {
          updateAppt(id, { status: 'cancelled' }, 'Cancelled');
        }
        break;

      case 'delete':
        if (confirm('Permanently delete this appointment? This cannot be undone.')) {
          deleteAppt(id);
        }
        break;

      case 'price': {
        // Default to the standard price for this dog's size, so the usual
        // case is just pressing OK.
        var suggested = window.FP_PRICE(a.pet_size, a.service);
        var prefill = a.quoted_price != null ? a.quoted_price
                    : (suggested != null ? suggested : '');
        var p = prompt(
          'Quoted price (numbers only):' +
          (suggested != null ? '\n\nStandard for this size: $' + suggested : ''),
          prefill);
        if (p === null) break;
        var n = parseFloat(String(p).replace(/[^0-9.]/g, ''));
        updateAppt(id, { quoted_price: isNaN(n) ? null : n }, 'Quote saved');
        break;
      }

      case 'note': {
        var note = prompt('Your notes on this appointment:', a.admin_notes || '');
        if (note === null) break;
        updateAppt(id, { admin_notes: note.trim() || null }, 'Note saved');
        break;
      }

      case 'reschedule': {
        var d = prompt('New date (YYYY-MM-DD):', a.preferred_date || '');
        if (d === null) break;
        if (!/^\d{4}-\d{2}-\d{2}$/.test(d.trim())) { toast('Use the format YYYY-MM-DD', true); break; }
        var t = prompt('Time (leave as-is to keep):', a.preferred_time || '');
        var patch = { preferred_date: d.trim() };
        if (t !== null) patch.preferred_time = t.trim();
        updateAppt(id, patch, 'Rescheduled');
        break;
      }
    }
  });

  /* =====================================================
     Helpers
     ===================================================== */
  var toastTimer;
  function toast(msg, isErr) {
    var t = el('toast');
    t.textContent = msg;
    t.className = 'toast' + (isErr ? ' err' : '');
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, 3200);
  }

  function scrollTo(node) {
    if (node && typeof node.scrollIntoView === 'function') {
      node.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }

  function pad(n) { return String(n).padStart(2, '0'); }

  function isoToday() {
    var d = new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  function addDays(iso, n) {
    var p = iso.split('-');
    var d = new Date(+p[0], +p[1] - 1, +p[2] + n);
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  // Parse as local time so dates never shift by a day.
  function prettyDate(iso, short) {
    if (!iso) return '—';
    var p = iso.split('-');
    var d = new Date(+p[0], +p[1] - 1, +p[2]);
    return d.toLocaleDateString(undefined, short
      ? { month: 'short', day: 'numeric' }
      : { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  }

  function byTime(a, b) {
    return String(a.preferred_time || '').localeCompare(String(b.preferred_time || ''));
  }

  function clientKey(a) {
    return (a.email || a.phone || a.owner_name || 'unknown').toLowerCase().trim();
  }

  function initial(name) {
    var s = String(name || '').trim();
    return s ? s.charAt(0).toUpperCase() : '?';
  }

  function digits(s) { return String(s || '').replace(/\D/g, ''); }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
})();
