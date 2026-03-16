// Clubo — transition.js
// Nav is NEVER animated. Only .screen fades.

(function(){
    // Find this block in transition.js and replace it:
  var ROUTES = {
    Home:    'clubo-v2-04-home.html',
    Sell:    'clubo-v2-09-sell.html',
    Balance: 'clubo-v2-15-balance.html',
    Tickets: 'clubo-v2-08a-tickets-locked.html',
    Profile: 'clubo-v2-12-profile.html',
  };

  var PUBLIC = {
    'clubo-v2-01-splash.html': 1,
    'clubo-v2-02-signup.html': 1,
    'clubo-v2-03-otp.html':    1,
  };

  // Inject before any paint: lock nav to always-visible, no transitions
  var lockStyle = document.createElement('style');
  lockStyle.textContent =
    '.bottom-nav,.bottom-nav *{' +
    'transition:none!important;animation:none!important;' +
    'opacity:1!important;visibility:visible!important;will-change:auto!important;}';
  document.head.appendChild(lockStyle);

  function file(){
    var p = window.location.pathname.split('/').pop();
    return p || 'clubo-v2-01-splash.html';
  }

  function isLocal(href){
    return typeof href==='string' && href.endsWith('.html') && !href.startsWith('http');
  }

  function navigate(href){
    if(!href || href===file()) return;
    var screen = document.querySelector('.screen');
    if(screen){
      screen.style.cssText += ';transition:opacity .13s ease,transform .13s ease!important;opacity:0!important;transform:translateY(-4px)!important;';
    } else {
      // splash / processing — fade whole phone but nav was already gone
      var phone = document.querySelector('.phone');
      if(phone) phone.style.cssText += ';transition:opacity .13s ease!important;opacity:0!important;';
    }
    setTimeout(function(){ window.location.href = href; }, 130);
  }

  window.cluboNavigate = navigate;

  function init(){
    var f = file();
    // Auth gating handled by ClubAuth.requireAuth() in auth.js on each protected page

    // Wire nav: set active class via JS, remove any leftover active classes from HTML
    var navItems = document.querySelectorAll('.bottom-nav .nav-item');
    navItems.forEach(function(item){
      var lbl = item.querySelector('.nav-lbl');
      var label = lbl ? lbl.textContent.trim() : '';
      var href = ROUTES[label];
      item.classList.remove('active');
      if(href && href===f) item.classList.add('active');
      if(href){
        item.style.cursor='pointer';
        item.addEventListener('click', function(){ navigate(href); });
      }
    });

    // Fade in only .screen — nav is already fully painted
    var screen = document.querySelector('.screen');
    var lh = document.getElementById('listingsHeader');
    var ts = document.getElementById('ticketsScroll');
    var phone = document.querySelector('.phone');

    function fadeIn(el, delay){
      if(!el) return;
      el.style.opacity='0';
      el.style.transform='translateY(6px)';
      el.getBoundingClientRect();
      el.style.transition='opacity .22s cubic-bezier(.16,1,.3,1) '+(delay||0)+'ms,transform .22s cubic-bezier(.16,1,.3,1) '+(delay||0)+'ms';
      el.style.opacity='1';
      el.style.transform='translateY(0)';
    }

    if(screen){
      fadeIn(screen, 0);
    } else if(lh){
      fadeIn(lh, 0);
      if(ts){
        ts.style.opacity='0';
        ts.getBoundingClientRect();
        ts.style.transition='opacity .24s cubic-bezier(.16,1,.3,1) 40ms';
        ts.style.opacity='1';
      }
    } else if(phone){
      fadeIn(phone, 0);
    }
  }

  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Intercept all local <a> clicks
  document.addEventListener('click', function(e){
    var a = e.target.closest('a');
    if(!a) return;
    var href = a.getAttribute('href');
    if(!isLocal(href)) return;
    e.preventDefault();
    navigate(href);
  }, true);

})();
