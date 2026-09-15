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
    openId: null,                  // appointment shown in the drawer
    view: null,                    // { type: 'appt' | 'client' | 'report', ... }
    fromClient: null,              // client key, when an appointment was opened from a profile
    reports: [],
    reportsReady: false,           // false until groom_reports exists (03-groom-reports.sql)
    formDirty: false
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

    return Promise.all([
      sb.from('appointments')
        .select('*')
        .order('preferred_date', { ascending: true }),
      loadReports()
    ]).then(function (results) {
        var res = results[0];
        btn.classList.remove('spin');
        if (res.error) {
          console.error(res.error);
          toast('Could not load appointments: ' + res.error.message, true);
          return;
        }
        state.appts = res.data || [];
        renderAll();

        // Keep an open drawer current (but never wipe a half-written report).
        if (state.view && state.view.type === 'appt') openDrawer(state.view.id);
        if (state.view && state.view.type === 'client') openClient(state.view.key);
      });
  }

  /* Reports load alongside appointments. If the table has not been
     created yet the rest of the dashboard carries on as normal and the
     report areas show a setup note instead. */
  function loadReports() {
    return sb.from('groom_reports')
      .select('*')
      .order('groom_date', { ascending: false })
      .then(function (res) {
        if (res.error) {
          state.reports = [];
          state.reportsReady = false;
          if (isMissingTable(res.error)) {
            console.warn('groom_reports table not found — run supabase/03-groom-reports.sql');
          } else {
            console.error(res.error);
            toast('Could not load reports: ' + res.error.message, true);
          }
          return;
        }
        state.reports = res.data || [];
        state.reportsReady = true;
      });
  }

  function isMissingTable(err) {
    var m = String((err && err.message) || '');
    return err && (err.code === '42P01' || err.code === 'PGRST205' ||
      (/groom_reports/.test(m) && /does not exist|schema cache/.test(m)));
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
        // The database keeps the report and just unlinks it; mirror that.
        state.reports.forEach(function (r) {
          if (r.appointment_id === id) r.appointment_id = null;
        });
        closeDrawer(true);
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
          reports: 0,
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

    // Reports: count them, and keep a client whose appointments were
    // all deleted but who still has reports on file.
    state.reports.forEach(function (r) {
      var k = reportClientKey(r);
      if (!k) return;
      if (!map[k]) {
        map[k] = {
          key: k, name: r.owner_name, phone: null, email: /@/.test(k) ? k : null,
          dogs: {}, photo: null, count: 0, completed: 0, last: '', next: null,
          spent: 0, reports: 0, since: r.created_at || ''
        };
      }
      var c = map[k];
      c.reports++;
      if (r.pet_name && !c.dogs[r.pet_name]) c.dogs[r.pet_name] = { photo: null, breed: null, size: null };
      if (!c.photo && r.after_photo_url) c.photo = r.after_photo_url;
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
    if (c.reports)   bits.push(c.reports + ' groom report' + (c.reports === 1 ? '' : 's'));

    html += '<div class="client-count">' + esc(bits.join(' · ')) + '</div>' +
      '<button type="button" class="client-view" data-client-open="' + esc(c.key) + '">' +
        'Open profile →</button>' +
    '</div>';

    return html;
  }

  /* Open a client's profile — from the button, or the name/photo row.
     Phone and email links on the card keep working as links. */
  el('clientsList').addEventListener('click', function (e) {
    if (e.target.closest('a')) return;
    var btn = e.target.closest('[data-client-open]');
    var top = e.target.closest('.client-top');
    var card = e.target.closest('.client[data-client]');
    if (btn) openClient(btn.dataset.clientOpen);
    else if (top && card) openClient(card.dataset.client);
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
        reportFlag(a) +
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
    if (!card) return;
    // Opened from inside a client profile? Offer a way back to it.
    var inProfile = state.view && state.view.type === 'client' &&
                    el('drawerBody').contains(card);
    state.fromClient = inProfile ? state.view.key : null;
    openDrawer(card.dataset.id);
  });

  function openDrawer(id) {
    var a = apptById(id);
    if (!a) return;
    state.openId = a.id;
    state.view = { type: 'appt', id: a.id };

    var html = '';

    if (state.fromClient) {
      var from = buildClients()[state.fromClient];
      if (from) {
        html += '<button type="button" class="drawer-back" data-back-client="' + esc(from.key) + '">' +
                '← ' + esc(from.name || 'Client') + '’s profile</button>';
      }
    }

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

    if (a.status === 'completed') html += reportSection(a);

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

    showDrawer(a.pet_name || 'Appointment', 'Appointment details', html);
  }

  function showDrawer(title, label, html) {
    state.formDirty = false;
    el('drawerTitle').textContent = title;
    el('drawer').setAttribute('aria-label', label);
    el('drawerBody').innerHTML = html;
    el('drawerBody').scrollTop = 0;
    el('drawer').hidden = false;
    el('drawerBackdrop').hidden = false;
    document.body.style.overflow = 'hidden';
  }

  // Returns false if the user chose to keep editing.
  function okToLeaveForm() {
    return !(state.view && state.view.type === 'report' && state.formDirty) ||
      confirm('Discard the changes to this report?');
  }

  function closeDrawer(force) {
    if (force !== true && !okToLeaveForm()) return;
    el('drawer').hidden = true;
    el('drawerBackdrop').hidden = true;
    document.body.style.overflow = '';
    state.openId = null;
    state.view = null;
    state.fromClient = null;
    state.formDirty = false;
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
        updateAppt(id, { status: 'completed' }).then(function (ok) {
          if (!ok) return;
          // Go straight to the report while the groom is fresh in mind.
          if (state.reportsReady && !reportFor(id)) {
            openReportForm(id);
            toast('Marked complete — now the post-groom report');
          } else {
            toast('Marked complete');
          }
        });
        break;

      case 'cancel':
        if (confirm('Cancel this appointment? The record stays in your history.')) {
          updateAppt(id, { status: 'cancelled' }, 'Cancelled');
        }
        break;

      case 'delete':
        if (confirm('Permanently delete this appointment? This cannot be undone.' +
            (reportFor(id) ? '\n\nIts post-groom report stays on the client’s profile.' : ''))) {
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
     Client profile
     ===================================================== */
  function openClient(key) {
    var c = buildClients()[key];
    if (!c) { closeDrawer(true); return; }
    state.openId = null;
    state.fromClient = null;
    state.view = { type: 'client', key: key };

    var dogNames = Object.keys(c.dogs);
    var appts = state.appts
      .filter(function (a) { return clientKey(a) === key; })
      .sort(function (a, b) { return (b.preferred_date || '').localeCompare(a.preferred_date || ''); });
    var reps = reportsForClient(key);

    var html = '<div class="cp-head">' +
      avatar(c.photo, dogNames[0] || c.name, 'client-avatar') +
      '<div class="client-head">' +
        '<div class="client-name">' + esc(c.name || 'Unknown') + '</div>' +
        (dogNames.length ? '<div class="client-dogs">' + esc(dogNames.join(', ')) + '</div>' : '') +
      '</div>' +
    '</div>';

    if (c.phone || c.email) {
      html += '<div class="drawer-quick">' +
        (c.phone ? '<a class="btn btn-teal" href="tel:' + esc(digits(c.phone)) + '">Call</a>' +
                   '<a class="btn btn-quiet" href="sms:' + esc(digits(c.phone)) + '">Text</a>' : '') +
        (c.email ? '<a class="btn btn-quiet" href="mailto:' + esc(c.email) + '">Email</a>' : '') +
      '</div>';
    }

    var rows = [
      ['Phone', c.phone ? '<a href="tel:' + esc(digits(c.phone)) + '">' + esc(c.phone) + '</a>' : '—'],
      ['Email', c.email ? '<a href="mailto:' + esc(c.email) + '">' + esc(c.email) + '</a>' : '—'],
      ['Client since', c.since ? new Date(c.since).toLocaleDateString() : '—'],
      ['Bookings', c.count + (c.completed ? ' (' + c.completed + ' completed)' : '')],
      ['Last visit', c.last ? medDate(c.last) : '—'],
      ['Next visit', c.next ? medDate(c.next.preferred_date) : '—'],
      ['Lifetime', c.spent ? '$' + c.spent.toFixed(2).replace(/\.00$/, '') : '—']
    ];
    html += '<dl class="dl">' + rows.map(function (r) {
      return '<div><dt>' + r[0] + '</dt><dd>' + r[1] + '</dd></div>';
    }).join('') + '</dl>';

    if (dogNames.length) {
      html += '<p class="drawer-section-title">Dogs</p><ul class="cp-dogs">' +
        dogNames.map(function (n) {
          var d = c.dogs[n];
          var extra = [d.breed, d.size].filter(Boolean).join(' · ');
          return '<li>' + avatar(d.photo, n, 'appt-thumb') +
            '<span><b>' + esc(n) + '</b>' + (extra ? '<br><span class="muted">' + esc(extra) + '</span>' : '') +
            '</span></li>';
        }).join('') + '</ul>';
    }

    html += '<p class="drawer-section-title">Post-groom reports' +
            (reps.length ? ' <span class="cp-count">' + reps.length + '</span>' : '') + '</p>';
    if (!state.reportsReady) {
      html += setupNotice();
    } else if (reps.length) {
      html += '<div class="gr-list">' + reps.map(function (r) {
        return reportCard(r, { fromProfile: true });
      }).join('') + '</div>';
    } else {
      html += '<p class="gr-none">No reports yet. When you mark one of ' +
              esc(firstName(c.name) || 'their') + '’s appointments complete, you’ll be asked to write one.</p>';
    }

    html += '<p class="drawer-section-title">Appointments</p>' +
      '<div class="cardlist">' + (appts.length
        ? appts.map(apptCard).join('')
        : emptyState('None on file', 'Their appointments were deleted; the reports above were kept.')) +
      '</div>';

    showDrawer(c.name || 'Client', 'Client profile', html);
  }

  /* =====================================================
     Post-groom reports
     ===================================================== */
  var MOODS = [
    { v: 'great', label: 'Great', hint: 'A dream' },
    { v: 'good',  label: 'Good',  hint: 'Minor fuss' },
    { v: 'okay',  label: 'Okay',  hint: 'Took patience' },
    { v: 'tough', label: 'Tough', hint: 'Difficult' }
  ];
  var COATS = ['Good condition', 'Some tangles', 'Matted', 'Severely matted'];
  var BEHAVIORS = ['Calm', 'Happy', 'Nervous', 'Wiggly', 'Vocal', 'Nippy',
                   'Dislikes the dryer', 'Dislikes nail trims', 'Sensitive paws'];
  var HEALTH = ['Skin irritation', 'Dry or flaky skin', 'Hot spots', 'Ear redness or odor',
                'Fleas or ticks', 'Lumps or bumps', 'Overgrown nails', 'Eye discharge',
                'Dental concerns'];
  var WEEKS = [2, 3, 4, 5, 6, 8, 10, 12];
  var PHOTO_MAX_EDGE = 1600;

  function apptById(id) {
    return state.appts.filter(function (x) { return String(x.id) === String(id); })[0];
  }

  function reportFor(apptId) {
    return state.reports.filter(function (r) { return String(r.appointment_id) === String(apptId); })[0];
  }

  // A linked appointment decides the client (so contact changes follow it);
  // an unlinked report falls back to the key stored when it was written.
  function reportClientKey(r) {
    var a = r.appointment_id && apptById(r.appointment_id);
    return a ? clientKey(a) : (r.client_key || '');
  }

  function reportsForClient(key) {
    return state.reports
      .filter(function (r) { return reportClientKey(r) === key; })
      .sort(function (a, b) {
        return (b.groom_date || '').localeCompare(a.groom_date || '') ||
               (b.created_at || '').localeCompare(a.created_at || '');
      });
  }

  function moodOf(v) { return MOODS.filter(function (m) { return m.v === v; })[0]; }

  function setupNotice() {
    return '<div class="gr-setup">Reports need a one-time database update. Run ' +
      '<code>supabase/03-groom-reports.sql</code> in the Supabase SQL Editor, then refresh.</div>';
  }

  function reportFlag(a) {
    if (a.status !== 'completed' || !state.reportsReady) return '';
    return reportFor(a.id)
      ? '<span class="gr-flag gr-flag-done">Report ✓</span>'
      : '<span class="gr-flag gr-flag-todo">Needs report</span>';
  }

  /* ---- In the appointment drawer ---- */
  function reportSection(a) {
    var html = '<p class="drawer-section-title">Post-groom report</p>';
    if (!state.reportsReady) return html + setupNotice();

    var r = reportFor(a.id);
    if (r) return html + reportCard(r, {});

    return html + '<div class="gr-prompt">' +
      '<p>How did ' + esc(a.pet_name || 'the groom') + ' do? Write it up while it’s fresh — ' +
      'it’s saved to ' + esc(firstName(a.owner_name) || 'the client') + '’s profile.</p>' +
      '<button type="button" class="btn btn-primary btn-block" data-rep="new" data-appt="' + esc(a.id) + '">' +
        'Write post-groom report</button>' +
    '</div>';
  }

  /* ---- One report, read-only ---- */
  function reportCard(r, opts) {
    var m = moodOf(r.mood);
    var h = '<article class="gr-card gr-m-' + esc(r.mood || 'none') + '">';

    h += '<header class="gr-card-head">' +
      '<div class="gr-card-title">' + esc(r.pet_name || 'Groom') +
        '<span>' + medDate(r.groom_date) + (r.service ? ' · ' + esc(r.service) : '') + '</span>' +
      '</div>' +
      (m ? '<span class="gr-mood gr-mood-' + esc(m.v) + '">' + esc(m.label) + ' visit</span>' : '') +
    '</header>';

    if (r.summary) h += '<p class="gr-text">' + esc(r.summary) + '</p>';

    var tags = (r.behavior || []).map(function (t) { return '<span class="gr-tag">' + esc(t) + '</span>'; })
      .concat((r.health_flags || []).map(function (t) { return '<span class="gr-tag gr-tag-health">' + esc(t) + '</span>'; }));
    if (tags.length) h += '<div class="gr-tags">' + tags.join('') + '</div>';

    var facts = [];
    if (r.coat_found) facts.push(['Coat on arrival', esc(r.coat_found)]);
    if (r.health_notes) facts.push(['Health notes', esc(r.health_notes)]);
    if (r.recommendations) facts.push(['Recommendations', esc(r.recommendations)]);
    if (r.next_visit_weeks) {
      facts.push(['Next groom', 'In ' + r.next_visit_weeks + ' weeks' +
        (r.groom_date ? ' — around ' + medDate(addDays(r.groom_date, r.next_visit_weeks * 7)) : '')]);
    }
    if (facts.length) {
      h += '<dl class="gr-facts">' + facts.map(function (f) {
        return '<div><dt>' + f[0] + '</dt><dd>' + f[1] + '</dd></div>';
      }).join('') + '</dl>';
    }

    if (r.before_photo_url || r.after_photo_url) {
      h += '<div class="gr-photos">' +
        [['Before', r.before_photo_url], ['After', r.after_photo_url]].map(function (p) {
          return p[1]
            ? '<a href="' + esc(p[1]) + '" target="_blank" rel="noopener noreferrer">' +
                '<img src="' + esc(p[1]) + '" alt="' + p[0] + ' photo of ' + esc(r.pet_name || 'the dog') + '" loading="lazy">' +
                '<span>' + p[0] + '</span></a>'
            : '';
        }).join('') + '</div>';
    }

    var linked = r.appointment_id && apptById(r.appointment_id);
    h += '<footer class="gr-card-foot">';
    if (linked) {
      h += '<button type="button" class="gr-link" data-rep="edit" data-appt="' + esc(linked.id) + '">Edit report</button>';
      if (opts.fromProfile) {
        h += '<button type="button" class="gr-link" data-rep="open-appt" data-appt="' + esc(linked.id) + '">View appointment</button>';
      }
    } else {
      h += '<span class="gr-muted">Appointment deleted — report kept</span>';
    }
    var edited = r.updated_at && r.created_at &&
                 new Date(r.updated_at) - new Date(r.created_at) > 60000;
    h += '<span class="gr-muted gr-stamp">Written ' +
         (r.created_at ? new Date(r.created_at).toLocaleDateString() : '') +
         (edited ? ' · edited ' + new Date(r.updated_at).toLocaleDateString() : '') + '</span>';
    h += '</footer></article>';
    return h;
  }

  /* ---- The form ---- */
  function openReportForm(apptId) {
    var a = apptById(apptId);
    if (!a) return;
    var r = reportFor(apptId) || {};

    state.openId = null;
    state.view = { type: 'report', apptId: a.id };

    function chips(name, type, options, selected) {
      var sel = [].concat(selected || []);
      return '<div class="gr-chips">' + options.map(function (o) {
        var v = typeof o === 'string' ? o : o.v;
        var label = typeof o === 'string' ? o : o.label;
        var hint = typeof o === 'string' ? '' : '<em>' + esc(o.hint) + '</em>';
        return '<label class="gr-chip' + (hint ? ' gr-chip-tall' : '') + '">' +
          '<input type="' + type + '" name="' + name + '" value="' + esc(v) + '"' +
            (sel.indexOf(v) !== -1 ? ' checked' : '') + '>' +
          '<span>' + esc(label) + hint + '</span></label>';
      }).join('') + '</div>';
    }

    function area(name, label, value, placeholder, rows) {
      return '<div class="field"><label for="gr_' + name + '">' + label + ' <span class="opt">optional</span></label>' +
        '<textarea id="gr_' + name + '" name="' + name + '" rows="' + (rows || 3) + '" maxlength="5000" placeholder="' +
        esc(placeholder) + '">' + esc(value || '') + '</textarea></div>';
    }

    function photo(which, url) {
      var label = which === 'before' ? 'Before' : 'After';
      return '<div class="gr-photo-field">' +
        '<span class="gr-photo-label">' + label + '</span>' +
        (url
          ? '<img class="gr-photo-now" src="' + esc(url) + '" alt="Current ' + label.toLowerCase() + ' photo">' +
            '<label class="gr-remove"><input type="checkbox" name="remove_' + which + '"> Remove this photo</label>'
          : '') +
        '<input type="file" name="' + which + '_photo" aria-label="' + label + ' photo" ' +
          'accept="image/jpeg,image/png,image/webp,image/heic">' +
      '</div>';
    }

    var html = '<form class="gr-form" id="grForm" novalidate>' +
      '<p class="gr-form-sub">' + esc(a.owner_name || '') + ' · ' + medDate(a.preferred_date) +
        (a.service ? ' · ' + esc(a.service) : '') + '</p>' +

      '<fieldset class="gr-fs"><legend>How did it go? <span class="req">*</span></legend>' +
        chips('mood', 'radio', MOODS, r.mood) + '</fieldset>' +

      area('summary', 'Summary', r.summary,
           'What you did and how ' + (a.pet_name || 'the dog') + ' handled it', 4) +

      '<fieldset class="gr-fs"><legend>Behavior</legend>' +
        chips('behavior', 'checkbox', BEHAVIORS, r.behavior) + '</fieldset>' +

      '<fieldset class="gr-fs"><legend>Coat on arrival</legend>' +
        chips('coat_found', 'radio', COATS, r.coat_found) + '</fieldset>' +

      '<fieldset class="gr-fs"><legend>Anything to flag?</legend>' +
        chips('health_flags', 'checkbox', HEALTH, r.health_flags) + '</fieldset>' +

      area('health_notes', 'Health notes', r.health_notes, 'Where, how bad, anything the owner should watch') +
      area('recommendations', 'Recommendations', r.recommendations, 'Brushing at home, products, the cut for next time…') +

      '<div class="field"><label for="gr_weeks">Next groom <span class="opt">optional</span></label>' +
        '<select id="gr_weeks" name="next_visit_weeks"><option value="">Not set</option>' +
        WEEKS.map(function (w) {
          return '<option value="' + w + '"' + (Number(r.next_visit_weeks) === w ? ' selected' : '') +
                 '>In ' + w + ' weeks</option>';
        }).join('') + '</select></div>' +

      '<fieldset class="gr-fs"><legend>Photos <span class="opt">optional</span></legend>' +
        '<div class="gr-photo-grid">' + photo('before', r.before_photo_url) + photo('after', r.after_photo_url) + '</div>' +
      '</fieldset>' +

      '<div class="form-status" id="grStatus" role="status" aria-live="polite"></div>' +

      '<div class="gr-actions">' +
        '<button type="submit" class="btn btn-primary btn-block" id="grSave">' +
          '<span class="btn-label">' + (r.id ? 'Save changes' : 'Save report') + '</span>' +
          '<span class="spinner" hidden></span></button>' +
        '<button type="button" class="btn btn-quiet btn-block" data-rep="cancel" data-appt="' + esc(a.id) + '">Cancel</button>' +
        (r.id ? '<button type="button" class="btn btn-danger btn-block" data-rep="delete" data-appt="' + esc(a.id) + '">Delete report</button>' : '') +
      '</div>' +
    '</form>';

    showDrawer((r.id ? 'Edit report · ' : 'Report · ') + (a.pet_name || 'Groom'), 'Post-groom report', html);
  }

  function saveReport(form) {
    var apptId = state.view && state.view.apptId;
    var a = apptById(apptId);
    if (!a) return;
    var existing = reportFor(apptId);
    var status = el('grStatus');
    var btn = el('grSave');

    function busy(on) {
      btn.disabled = on;
      btn.querySelector('.spinner').hidden = !on;
    }
    function fail(msg) {
      status.className = 'form-status err';
      status.textContent = msg;
      busy(false);
    }

    var fd = new FormData(form);
    if (!fd.get('mood')) {
      fail('Pick how the visit went: Great, Good, Okay or Tough.');
      form.querySelector('input[name="mood"]').focus();
      return;
    }

    var payload = {
      appointment_id:   a.id,
      client_key:       clientKey(a),
      owner_name:       a.owner_name || null,
      pet_name:         a.pet_name || null,
      groom_date:       a.preferred_date || null,
      service:          a.service || null,
      mood:             fd.get('mood'),
      coat_found:       fd.get('coat_found') || null,
      behavior:         fd.getAll('behavior'),
      health_flags:     fd.getAll('health_flags'),
      summary:          clean(fd.get('summary')),
      health_notes:     clean(fd.get('health_notes')),
      recommendations:  clean(fd.get('recommendations')),
      next_visit_weeks: fd.get('next_visit_weeks') ? parseInt(fd.get('next_visit_weeks'), 10) : null,
      before_photo_url: existing && !fd.get('remove_before') ? existing.before_photo_url : null,
      after_photo_url:  existing && !fd.get('remove_after')  ? existing.after_photo_url  : null
    };

    status.className = 'form-status';
    status.textContent = '';
    busy(true);

    Promise.all([
      uploadReportPhoto(fd.get('before_photo'), a.id, 'before'),
      uploadReportPhoto(fd.get('after_photo'), a.id, 'after')
    ]).then(function (urls) {
      if (urls[0]) payload.before_photo_url = urls[0];
      if (urls[1]) payload.after_photo_url = urls[1];

      var q = existing
        ? sb.from('groom_reports').update(payload).eq('id', existing.id)
        : sb.from('groom_reports').insert(payload);
      return q.select().single();
    }).then(function (res) {
      if (res.error) throw res.error;
      var saved = res.data;
      state.reports = state.reports.filter(function (x) { return x.id !== saved.id; }).concat([saved]);
      state.formDirty = false;
      renderAll();
      openDrawer(a.id);
      toast(existing ? 'Report updated'
                     : 'Report saved to ' + (firstName(a.owner_name) || 'the client') + '’s profile');
    }).catch(function (err) {
      console.error(err);
      fail('Could not save: ' + ((err && err.message) || 'unknown error') + '. Your answers are still here.');
    });
  }

  function deleteReport(apptId) {
    var r = reportFor(apptId);
    if (!r || !confirm('Delete this post-groom report? This cannot be undone.')) return;
    sb.from('groom_reports').delete().eq('id', r.id).then(function (res) {
      if (res.error) { toast(res.error.message, true); return; }
      state.reports = state.reports.filter(function (x) { return x.id !== r.id; });
      state.formDirty = false;
      renderAll();
      openDrawer(apptId);
      toast('Report deleted');
    });
  }

  /* Report photos go in the dog-photos bucket under reports/<appointment>/.
     Big phone photos are shrunk first; if that fails the original goes up. */
  function uploadReportPhoto(file, apptId, which) {
    if (!file || !file.size) return Promise.resolve(null);
    if (file.size > 10 * 1024 * 1024) {
      return Promise.reject(new Error('The ' + which + ' photo is over 10 MB'));
    }
    return shrinkPhoto(file).then(function (blob) {
      var type = blob.type || 'image/jpeg';
      var ext = type === 'image/png' ? 'png'
              : type === 'image/webp' ? 'webp'
              : type === 'image/heic' ? 'heic' : 'jpg';
      var path = 'reports/' + apptId + '/' + which + '-' + Date.now() + '.' + ext;
      return sb.storage.from('dog-photos')
        .upload(path, blob, { contentType: type, upsert: false })
        .then(function (res) {
          if (res.error) throw res.error;
          return sb.storage.from('dog-photos').getPublicUrl(path).data.publicUrl;
        });
    });
  }

  function shrinkPhoto(file) {
    return new Promise(function (resolve) {
      if (!window.URL || !window.HTMLCanvasElement) return resolve(file);
      var img = new Image();
      var url = URL.createObjectURL(file);
      var done = false;
      function finish(v) { if (!done) { done = true; URL.revokeObjectURL(url); resolve(v); } }
      setTimeout(function () { finish(file); }, 8000);   // never hang on a slow decode
      img.onerror = function () { finish(file); };
      img.onload = function () {
        try {
          var scale = Math.min(1, PHOTO_MAX_EDGE / Math.max(img.width, img.height));
          if (scale === 1 && file.size < 900 * 1024) return finish(file);
          var cv = document.createElement('canvas');
          cv.width = Math.round(img.width * scale);
          cv.height = Math.round(img.height * scale);
          cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
          if (!cv.toBlob) return finish(file);
          cv.toBlob(function (b) { finish(b && b.size < file.size ? b : file); }, 'image/jpeg', 0.85);
        } catch (e) { finish(file); }
      };
      img.src = url;
    });
  }

  /* ---- Drawer wiring for profiles and reports ---- */
  el('drawerBody').addEventListener('click', function (e) {
    var back = e.target.closest('[data-back-client]');
    if (back) { openClient(back.dataset.backClient); return; }

    var b = e.target.closest('[data-rep]');
    if (!b) return;
    var id = b.dataset.appt;
    switch (b.dataset.rep) {
      case 'new':
      case 'edit':
        if (state.view && state.view.type === 'client') state.fromClient = state.view.key;
        openReportForm(id);
        break;
      case 'cancel':
        if (okToLeaveForm()) openDrawer(id);
        break;
      case 'delete':
        deleteReport(id);
        break;
      case 'open-appt':
        state.fromClient = state.view && state.view.key;
        openDrawer(id);
        break;
    }
  });

  el('drawerBody').addEventListener('submit', function (e) {
    if (e.target.id !== 'grForm') return;
    e.preventDefault();
    saveReport(e.target);
  });

  ['input', 'change'].forEach(function (ev) {
    el('drawerBody').addEventListener(ev, function (e) {
      if (e.target.closest && e.target.closest('#grForm')) state.formDirty = true;
    });
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
  function medDate(iso) {
    if (!iso) return '—';
    var p = iso.split('-');
    return new Date(+p[0], +p[1] - 1, +p[2])
      .toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function firstName(s) { return String(s || '').trim().split(/\s+/)[0]; }

  function clean(v) {
    var s = String(v == null ? '' : v).trim();
    return s ? s : null;
  }

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
