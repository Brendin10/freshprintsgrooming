/* =========================================================
   Fresh Prints Grooming — shop
   Renders a Shopify collection through the Buy Button SDK.

   Shopify owns the cart, checkout, payment, tax and shipping;
   this page only displays the products and hands the customer
   to Shopify's hosted checkout. Nothing here touches Supabase
   or the booking form.

   The SDK is styled through its options rather than CSS,
   because it renders most of its UI inside iframes that the
   page's stylesheet can't reach.
   ========================================================= */
(function () {
  'use strict';

  var mount = document.getElementById('shopCollection');
  if (!mount) return;

  var cfg = (window.FP_CONFIG || {}).SHOPIFY;
  var section = document.getElementById('shop');
  var status  = document.getElementById('shopStatus');

  if (!cfg || !cfg.DOMAIN || !cfg.STOREFRONT_KEY || !cfg.COLLECTION_ID) {
    if (section) section.hidden = true;
    return;
  }

  var SDK = 'https://sdks.shopifycdn.com/buy-button/latest/buy-button-storefront.min.js';

  /* Brand tokens, mirrored from css/styles.css so the embed
     doesn't look like a bolted-on third party widget. */
  var INK      = '#101B2D';
  var BODY     = '#4A5A70';
  var MAGENTA  = '#F0386B';
  var MAGENTA2 = '#C82655';
  var SANS     = 'Outfit, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';

  var button = {
    'font-family': SANS,
    'font-size': '15px',
    'font-weight': '700',
    'padding-top': '15px',
    'padding-bottom': '15px',
    'border-radius': '999px',
    'background-color': MAGENTA,
    ':hover':  { 'background-color': MAGENTA2 },
    ':focus':  { 'background-color': MAGENTA2 }
  };

  function fail(msg) {
    if (!status) return;
    status.className = 'shop-status warn';
    status.innerHTML = msg;
  }

  function start() {
    var client = window.ShopifyBuy.buildClient({
      domain: cfg.DOMAIN,
      storefrontAccessToken: cfg.STOREFRONT_KEY
    });

    window.ShopifyBuy.UI.onReady(client).then(function (ui) {
      ui.createComponent('collection', {
        id: cfg.COLLECTION_ID,
        node: mount,
        moneyFormat: '${{amount}}',
        options: {
          product: {
            styles: {
              product: {
                '@media (min-width: 601px)': {
                  'max-width': 'calc(33.33% - 20px)',
                  'margin-left': '20px',
                  'margin-bottom': '40px',
                  'width': 'calc(33.33% - 20px)'
                },
                'img': { 'height': 'calc(100% - 15px)', 'position': 'absolute', 'left': '0', 'right': '0', 'top': '0' },
                'imgWrapper': { 'padding-top': 'calc(75% + 15px)', 'position': 'relative', 'height': '0' }
              },
              title:  { 'font-family': SANS, 'font-weight': '700', 'font-size': '17px', 'color': INK },
              price:  { 'font-family': SANS, 'font-size': '16px', 'color': BODY },
              compareAt: { 'font-family': SANS, 'font-size': '14px' },
              button: button
            },
            text: { button: 'Add to cart' },
            buttonDestination: 'cart'
          },
          productSet: {
            styles: { products: { '@media (min-width: 601px)': { 'margin-left': '-20px' } } }
          },
          modalProduct: {
            contents: { img: false, imgWithCarousel: true, button: false, buttonWithQuantity: true },
            styles: {
              product: { '@media (min-width: 601px)': { 'max-width': '100%', 'margin-left': '0px', 'margin-bottom': '0px' } },
              title:  { 'font-family': SANS, 'font-weight': '700', 'color': INK },
              price:  { 'font-family': SANS, 'color': BODY },
              button: button
            },
            text: { button: 'Add to cart' }
          },
          cart: {
            styles: {
              button: button,
              title:  { 'font-family': SANS, 'color': INK },
              footer: { 'background-color': '#ffffff' }
            },
            text: { title: 'Your cart', total: 'Subtotal', button: 'Checkout' },
            popup: false          // same tab; a popup gets blocked on mobile
          },
          toggle: {
            styles: {
              toggle: { 'font-family': SANS, 'background-color': MAGENTA, ':hover': { 'background-color': MAGENTA2 } },
              count:  { 'font-size': '16px' }
            }
          }
        }
      }).then(function () {
        if (status) status.innerHTML = '';
      }).catch(function (err) {
        console.warn('Shopify collection failed to render:', err);
        fail(shopLink('We couldn’t load the shop just now.'));
      });
    });
  }

  function shopLink(lead) {
    return lead + ' You can browse everything at ' +
      '<a href="https://' + cfg.DOMAIN + '" target="_blank" rel="noopener">our store</a> instead.';
  }

  /* The SDK is a third-party script — an ad blocker, a strict network
     or an outage will stop it. Say so rather than leaving a blank gap. */
  function load() {
    if (window.ShopifyBuy && window.ShopifyBuy.UI) return start();

    var script = document.createElement('script');
    script.async = true;
    script.src = SDK;
    script.onload = function () {
      if (window.ShopifyBuy) start();
      else fail(shopLink('We couldn’t load the shop just now.'));
    };
    script.onerror = function () {
      fail(shopLink('We couldn’t load the shop just now.'));
    };
    document.head.appendChild(script);
  }

  load();
})();
