/* =========================================================
   Fresh Prints Grooming — site interactions
   ========================================================= */
(function () {
  'use strict';

  /* ---- Year in footer ---- */
  var yearEl = document.getElementById('year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  /* ---- Mobile nav ---- */
  var toggle = document.getElementById('navToggle');
  var navMobile = document.getElementById('navMobile');

  if (toggle && navMobile) {
    toggle.addEventListener('click', function () {
      var open = navMobile.classList.toggle('open');
      toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    });

    navMobile.addEventListener('click', function (e) {
      if (e.target.tagName === 'A') {
        navMobile.classList.remove('open');
        toggle.setAttribute('aria-expanded', 'false');
        toggle.setAttribute('aria-label', 'Open menu');
      }
    });
  }

  /* ---- Header shadow + sticky CTA visibility ---- */
  var header = document.getElementById('siteHeader');
  var stickyCta = document.querySelector('.sticky-cta');
  var bookSection = document.getElementById('book');

  function onScroll() {
    var y = window.scrollY || window.pageYOffset;

    if (header) header.classList.toggle('scrolled', y > 8);

    if (stickyCta) {
      // Show after the hero; hide once the booking form is on screen.
      var pastHero = y > 420;
      var atForm = false;
      if (bookSection) {
        var r = bookSection.getBoundingClientRect();
        atForm = r.top < window.innerHeight * 0.85 && r.bottom > 0;
      }
      stickyCta.classList.toggle('show', pastHero && !atForm);
    }
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
  onScroll();

  /* ---- Close the mobile menu on Escape ---- */
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && navMobile && navMobile.classList.contains('open')) {
      navMobile.classList.remove('open');
      toggle.setAttribute('aria-expanded', 'false');
      toggle.focus();
    }
  });
})();
