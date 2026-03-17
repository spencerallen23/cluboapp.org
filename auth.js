// auth.js — shared auth + API helpers for Clubo frontend

(function(global){

  var API = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' ? 'http://localhost:3000' : 'https://clubo-api-production.up.railway.app';
  var TOKEN_KEY = 'clubo_token';
  var PHONE_KEY = 'clubo_phone';

  function getToken()  { return localStorage.getItem(TOKEN_KEY); }
  function getPhone()  { return localStorage.getItem(PHONE_KEY); }
  function setToken(t) { localStorage.setItem(TOKEN_KEY, t); }
  function setPhone(p) { localStorage.setItem(PHONE_KEY, p); }
  function clearAuth() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(PHONE_KEY);
    localStorage.removeItem('clubo_authed');
  }

  // ── Shared fetch helper ───────────────────────────────────────────────────

  async function apiFetch(path, options) {
    options = options || {};
    var token = getToken();
    var headers = Object.assign({ 'Content-Type': 'application/json' }, options.headers || {});
    if (token) headers['Authorization'] = 'Bearer ' + token;
    var res = await fetch(API + path, Object.assign({}, options, { headers: headers }));
    var data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Request failed (' + res.status + ')');
    return data;
  }

  // ── Auth API ──────────────────────────────────────────────────────────────

  async function startAuth(phone, email, googleToken) {
    var body = { phone };
    if (email)       body.email       = email;
    if (googleToken) body.googleToken = googleToken;
    var res = await fetch(API + '/auth/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    var data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to send code');
    return data;
  }

  async function verifyAuth(phone, code, firstName, lastName) {
    var body = { phone, code };
    if (firstName) body.firstName = firstName;
    if (lastName)  body.lastName  = lastName;
    var res = await fetch(API + '/auth/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    var data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Invalid code');
    setToken(data.token);
    return data;
  }

  async function fetchMe() {
    var token = getToken();
    if (!token) return null;
    try {
      var res = await fetch(API + '/me', { headers: { 'Authorization': 'Bearer ' + token } });
      if (res.status === 401) { clearAuth(); return null; }
      if (!res.ok) return { offline: true };
      var data = await res.json();
      return data.ok ? data.user : { offline: true };
    } catch {
      return { offline: true };
    }
  }

  async function getMyStats() {
    var data = await apiFetch('/me/stats');
    return data;
  }

  // ── Listings API ──────────────────────────────────────────────────────────

  async function getListings(event) {
    var path = '/listings';
    if (event) path += '?event=' + encodeURIComponent(event);
    var data = await apiFetch(path);
    return data.listings;
  }

  // Seller's own listings (with attached orders)
  async function getMyListings() {
    var data = await apiFetch('/listings/mine');
    return data.listings;
  }

  async function createListing(title, priceCents, event, eventLabel, quantity) {
    var body = {
      title:    title,
      price:    priceCents,
      event:    event || 'other',
      quantity: quantity || 1,
    };
    if (event === 'other' && eventLabel) body.eventLabel = eventLabel;
    var data = await apiFetch('/listings', { method: 'POST', body: JSON.stringify(body) });
    return data.listing;
  }

  async function cancelListing(listingId) {
    return apiFetch('/listings/' + listingId, { method: 'DELETE' });
  }

  // Two-step upload:
  // 1. getTicketUploadUrl  → { uploadUrl, publicUrl }
  // 2. uploadFileToS3      → PUT directly to S3
  // 3. attachTicketUrl     → tells API the listing now has a ticket
  async function getTicketUploadUrl(listingId, contentType) {
    var data = await apiFetch('/upload/ticket-url', {
      method: 'POST',
      body: JSON.stringify({ listingId: listingId, contentType: contentType || 'image/jpeg' })
    });
    return data; // { uploadUrl, publicUrl, key }
  }

  async function uploadFileToS3(uploadUrl, file) {
    var res = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': file.type },
      body: file,
    });
    if (!res.ok) throw new Error('Upload to storage failed');
  }

  async function attachTicketUrl(listingId, ticketAssetUrl) {
    // Returns { ok, listing, scan } or { scan } on rejection — never throws for scan failures
    var token = getToken();
    var res = await fetch(API + '/listings/' + listingId + '/ticket', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ ticketAssetUrl: ticketAssetUrl })
    });
    var data = await res.json();
    // 422 = scan rejected — return the scan data so caller can handle it
    if (res.status === 422) return { ok: false, scan: data.scan };
    if (!res.ok) throw new Error(data.error || 'Could not attach ticket');
    return data;
  }

  // Evidence upload for disputes — same 2-step S3 pattern
  async function getEvidenceUploadUrl(contentType) {
    var data = await apiFetch('/upload/evidence-url', {
      method: 'POST',
      body: JSON.stringify({ contentType: contentType || 'image/jpeg' })
    });
    return data; // { uploadUrl, publicUrl, key }
  }

  // ── Orders API ────────────────────────────────────────────────────────────

  async function createOrder(listingId) {
    var data = await apiFetch('/orders', {
      method: 'POST',
      body: JSON.stringify({ listingId: listingId })
    });
    return data.order;
  }

  // Buyer: all my tickets
  async function getMyOrders() {
    var data = await apiFetch('/orders/mine');
    return data.orders;
  }

  // Seller: all incoming sales
  async function getSellerOrders() {
    var data = await apiFetch('/orders/seller');
    return data.orders;
  }

  async function getOrder(orderId) {
    var data = await apiFetch('/orders/' + orderId);
    return data.order;
  }

  async function cancelOrder(orderId) {
    var data = await apiFetch('/orders/' + orderId + '/cancel', { method: 'POST' });
    return data.order;
  }

  // Seller: confirm ticket transferred → moves order to DELIVERED
  async function confirmDelivery(orderId) {
    var data = await apiFetch('/orders/' + orderId + '/deliver', { method: 'POST' });
    return data.order;
  }

  async function getTicketStatus(orderId) {
    var data = await apiFetch('/orders/' + orderId + '/ticket/status');
    return data; // { uploaded, locked, unlockTime }
  }

  async function getTicket(orderId) {
    var data = await apiFetch('/orders/' + orderId + '/ticket');
    return data.ticketAssetUrl;
  }

  // Buyer: open a dispute
  async function openDispute(orderId, reason, evidenceUrl) {
    var body = { reason: reason };
    if (evidenceUrl) body.evidenceUrl = evidenceUrl;
    var data = await apiFetch('/orders/' + orderId + '/dispute', {
      method: 'POST',
      body: JSON.stringify(body)
    });
    return data.order;
  }

  // Seller: respond to a dispute
  async function respondToDispute(orderId, response) {
    return apiFetch('/orders/' + orderId + '/dispute/respond', {
      method: 'POST',
      body: JSON.stringify({ response: response })
    });
  }

  // ── Ambassador API ────────────────────────────────────────────────────────

  async function updateProfile(firstName, lastName) {
    var body = {};
    if (firstName !== undefined) body.firstName = firstName;
    if (lastName  !== undefined) body.lastName  = lastName;
    return apiFetch('/me', { method: 'PATCH', body: JSON.stringify(body) });
  }

  async function uploadAvatar(file) {
    var urlData = await apiFetch('/upload/avatar-url', {
      method: 'POST',
      body: JSON.stringify({ contentType: file.type })
    });
    await uploadFileToS3(urlData.uploadUrl, file);
    return apiFetch('/me/avatar', { method: 'POST', body: JSON.stringify({ avatarUrl: urlData.publicUrl }) });
  }

  async function applyAmbassador(name, socials, note) {
    var body = { name: name };
    if (socials) body.socials = socials;
    if (note)    body.note    = note;
    var data = await apiFetch('/ambassador/apply', { method: 'POST', body: JSON.stringify(body) });
    return data.ambassador;
  }

  async function getAmbassadorStatus() {
    try {
      var data = await apiFetch('/ambassador/me');
      return data.ambassador;
    } catch (err) {
      if (err.message.includes('No application found')) return null;
      throw err;
    }
  }

  // ── Formatting helpers ────────────────────────────────────────────────────

  function formatPrice(cents) {
    var euros = cents / 100;
    return '€' + (Number.isInteger(euros) ? euros : euros.toFixed(2));
  }

  var GRADIENTS = [
    'linear-gradient(135deg,#3d2b1f,#6b3a2a)',
    'linear-gradient(135deg,#1e2a3a,#2a3f5a)',
    'linear-gradient(135deg,#1a2e1e,#2a4a30)',
    'linear-gradient(135deg,#2a1e3a,#3d2a55)',
    'linear-gradient(135deg,#2a2a2e,#3a3a42)',
    'linear-gradient(135deg,#2e1a1a,#4a2a2a)',
    'linear-gradient(135deg,#1a2a2e,#2a3f4a)',
    'linear-gradient(135deg,#2e2a1a,#4a3f2a)',
  ];
  var AVATAR_COLORS = [
    'rgba(255,200,160,.75)','rgba(160,200,255,.7)','rgba(160,230,180,.7)',
    'rgba(200,170,255,.7)','rgba(200,200,210,.6)','rgba(255,180,160,.65)',
    'rgba(160,220,230,.65)','rgba(230,210,150,.6)',
  ];
  function avatarFor(str) {
    var hash = 0;
    for (var i = 0; i < str.length; i++) hash = (hash * 31 + str.charCodeAt(i)) & 0xffff;
    var idx = hash % GRADIENTS.length;
    var digits = str.replace(/\D/g,'');
    var initials = digits.length >= 2 ? digits.slice(-2) : str.slice(0,2).toUpperCase();
    return { bg: GRADIENTS[idx], color: AVATAR_COLORS[idx], initials: initials };
  }

  // ── Auth gate ─────────────────────────────────────────────────────────────

  function requireAuth() {
    var token = getToken();
    if (!token) { window.location.replace('clubo-v2-01-splash.html'); return; }
    fetchMe().then(function(user) {
      if (user === null) window.location.replace('clubo-v2-01-splash.html');
    }).catch(function(){});
  }

  function logout() {
    clearAuth();
    window.location.replace('clubo-v2-01-splash.html');
  }

  // ── Expose ────────────────────────────────────────────────────────────────
  global.ClubAuth = {
    // Auth
    startAuth:    startAuth,
    verifyAuth:   verifyAuth,
    fetchMe:      fetchMe,
    getMyStats:   getMyStats,
    requireAuth:  requireAuth,
    logout:       logout,
    getToken:     getToken,
    getPhone:     getPhone,
    setToken:     setToken,
    setPhone:     setPhone,
    clearAuth:    clearAuth,

    // Listings
    getListings:          getListings,
    getMyListings:        getMyListings,
    createListing:        createListing,
    cancelListing:        cancelListing,
    getTicketUploadUrl:   getTicketUploadUrl,
    uploadFileToS3:       uploadFileToS3,
    attachTicketUrl:      attachTicketUrl,
    getEvidenceUploadUrl: getEvidenceUploadUrl,

    // Orders
    createOrder:      createOrder,
    getMyOrders:      getMyOrders,
    getSellerOrders:  getSellerOrders,
    getOrder:         getOrder,
    cancelOrder:      cancelOrder,
    confirmDelivery:  confirmDelivery,
    getTicketStatus:  getTicketStatus,
    getTicket:        getTicket,
    openDispute:      openDispute,
    respondToDispute: respondToDispute,

    deleteListing:   async function(id) { return apiFetch('/listings/' + id, { method: 'DELETE' }); },
    updateProfile:   updateProfile,
    uploadAvatar:    uploadAvatar,

    // Ambassador
    applyAmbassador:     applyAmbassador,
    getAmbassadorStatus: getAmbassadorStatus,

    // Formatting
    formatPrice:  formatPrice,
    avatarFor:    avatarFor,
  };

})(window);
