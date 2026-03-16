// ── My active listings ────────────────────────────────────────────────────────
var API = 'http://' + window.location.hostname + ':3000';

async function loadMyListings() {
  try {
    var listings = await ClubAuth.getMyListings();
    var active   = (listings || []).filter(function(l){ return l.status === 'active'; });
    var wrap      = document.getElementById('myListingsWrap');
    var container = document.getElementById('myListings');
    if (!active.length) { wrap.style.display = 'none'; return; }
    wrap.style.display = 'block';
    container.innerHTML = '';
    active.forEach(function(l) {
      var card = document.createElement('div');
      card.className = 'my-listing-card';
      var priceEur = (l.price / 100).toFixed(0);
      card.innerHTML =
        '<div class="ml-top">' +
          '<div>' +
            '<div class="ml-title">' + (l.eventLabel || l.event) + '</div>' +
            '<div class="ml-event">' + l.id.slice(-6).toUpperCase() + ' · Active</div>' +
          '</div>' +
        '</div>' +
        '<div class="ml-price-row">' +
          '<span style="font-size:14px;color:rgba(255,255,255,.35);">EUR </span>' +
          '<input class="ml-price-input" type="number" value="' + priceEur + '" min="1" max="100" step="1" id="price-' + l.id + '">' +
          '<button class="ml-save" id="save-' + l.id + '">Save</button>' +
          '<button class="ml-remove" id="remove-' + l.id + '">Remove</button>' +
        '</div>' +
        '<div id="ml-err-' + l.id + '" style="display:none;font-size:11px;color:rgba(239,68,68,.8);margin-top:6px;"></div>';
      container.appendChild(card);

      document.getElementById('save-' + l.id).addEventListener('click', async function(){
        var inp   = document.getElementById('price-' + l.id);
        var errEl = document.getElementById('ml-err-' + l.id);
        errEl.style.display = 'none';
        var cents = Math.round(parseFloat(inp.value) * 100);
        if (!cents || cents < 100) { errEl.textContent = 'Min price EUR 1'; errEl.style.display='block'; return; }
        try {
          var token = ClubAuth.getToken();
          var res = await fetch(API + '/listings/' + l.id + '/price', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
            body: JSON.stringify({ price: cents })
          });
          var data = await res.json();
          if (!res.ok) throw new Error(data.error || 'Failed');
          var btn = document.getElementById('save-' + l.id);
          btn.textContent = 'Saved!';
          setTimeout(function(){ btn.textContent = 'Save'; }, 1500);
        } catch(err) {
          errEl.textContent = err.message;
          errEl.style.display = 'block';
        }
      });

      document.getElementById('remove-' + l.id).addEventListener('click', async function(){
        if (!confirm('Remove this listing?')) return;
        try {
          await ClubAuth.cancelListing(l.id);
          loadMyListings();
        } catch(err) { alert(err.message); }
      });
    });
  } catch(e) { /* fail silently */ }
}

window.addEventListener('DOMContentLoaded', loadMyListings);
