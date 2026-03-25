/**
 * HCS Payment Widget — Clé en main
 * Intégration : <div id="hcs-pay" data-...></div>
 *               <script src=".../widget.js"></script>
 *
 * Attributs data-* :
 *   data-amount        Montant fixe en XPF
 *   data-product       Nom du produit (montant fixe)
 *   data-products      JSON array [{name,price,description?}]
 *   data-free-amount   "true" → saisie libre
 *   data-min           Montant minimum (free-amount)
 *   data-max           Montant maximum (free-amount)
 *   data-worker        URL Worker (défaut: payzen-hcs.highcoffeeshirt.workers.dev)
 *   data-secret        Secret Worker (défaut: richesse)
 *   data-mode          TEST | PRODUCTION (défaut: TEST)
 *   data-color         Couleur principale (défaut: #6c63ff)
 *   data-label         Texte du bouton (défaut: Payer par carte)
 *   data-shop          Nom de la boutique affiché
 *
 * Events :
 *   hcs:success   → e.detail = { orderId, amount, product }
 *   hcs:error     → e.detail = { message }
 */

(function () {
  'use strict';

  const WORKER_DEFAULT = 'https://payzen-hcs.highcoffeeshirt.workers.dev/payzen-token';
  const SECRET_DEFAULT = 'richesse';

  // ── CSS auto-injecté ────────────────────────────────────────
  const CSS = `
    .hcs-widget * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Segoe UI', system-ui, sans-serif; }
    .hcs-widget { display: inline-block; width: 100%; }

    /* Bouton principal */
    .hcs-btn {
      display: flex; align-items: center; justify-content: center; gap: 10px;
      width: 100%; padding: 14px 24px; border: none; border-radius: 12px;
      font-size: .95rem; font-weight: 800; color: #fff; cursor: pointer;
      letter-spacing: .5px; transition: transform .15s, box-shadow .15s;
    }
    .hcs-btn:hover { transform: translateY(-2px); }
    .hcs-btn:active { transform: translateY(0); }
    .hcs-btn-icon { font-size: 1.1rem; }

    /* Sélecteur produits */
    .hcs-products { display: grid; gap: 10px; margin-bottom: 14px; }
    .hcs-prod {
      padding: 14px 16px; border-radius: 10px; border: 2px solid #e0e0e0;
      background: #fafafa; cursor: pointer; transition: all .2s;
      display: flex; justify-content: space-between; align-items: center;
    }
    .hcs-prod:hover { border-color: var(--hcs-color); }
    .hcs-prod.selected { border-color: var(--hcs-color); background: color-mix(in srgb, var(--hcs-color) 8%, white); }
    .hcs-prod-name { font-size: .88rem; font-weight: 700; color: #1a1a1a; }
    .hcs-prod-desc { font-size: .72rem; color: #666; margin-top: 2px; }
    .hcs-prod-price { font-size: 1rem; font-weight: 900; color: var(--hcs-color); white-space: nowrap; }

    /* Montant libre */
    .hcs-free-label { font-size: .75rem; font-weight: 600; color: #555; margin-bottom: 6px; display: block; }
    .hcs-free-input {
      width: 100%; padding: 11px 14px; border: 2px solid #e0e0e0; border-radius: 10px;
      font-size: 1rem; font-weight: 700; color: #1a1a1a; outline: none;
      transition: border-color .2s; margin-bottom: 12px;
    }
    .hcs-free-input:focus { border-color: var(--hcs-color); }

    /* Overlay */
    .hcs-overlay {
      position: fixed; inset: 0; background: rgba(0,0,0,.6);
      z-index: 99998; display: none; backdrop-filter: blur(4px);
      align-items: flex-end; justify-content: center;
    }
    .hcs-overlay.open { display: flex; }
    @media (min-width: 600px) { .hcs-overlay.open { align-items: center; } }

    /* Modal */
    .hcs-modal {
      background: #1a1a2e; border-radius: 20px 20px 0 0;
      width: 100%; max-width: 500px; max-height: 92vh;
      display: flex; flex-direction: column; overflow: hidden;
      box-shadow: 0 -8px 48px rgba(0,0,0,.6); position: relative; z-index: 99999;
    }
    @media (min-width: 600px) { .hcs-modal { border-radius: 20px; max-height: 88vh; } }

    .hcs-modal-head {
      padding: 16px 20px; border-bottom: 1px solid #2a2a4a;
      display: flex; align-items: center; justify-content: space-between; flex-shrink: 0;
    }
    .hcs-modal-title { font-size: .95rem; font-weight: 800; color: #e8e8f0; }
    .hcs-modal-close {
      background: none; border: none; color: #9090b0; font-size: 1.4rem;
      cursor: pointer; padding: 4px 8px; border-radius: 6px; line-height: 1;
    }
    .hcs-modal-close:hover { color: #e8e8f0; background: #16213e; }

    /* Steps */
    .hcs-steps { display: flex; padding: 12px 20px; border-bottom: 1px solid #2a2a4a; flex-shrink: 0; }
    .hcs-step { flex: 1; text-align: center; position: relative; }
    .hcs-step::after { content:''; position:absolute; top:13px; left:50%; width:100%; height:2px; background:#2a2a4a; z-index:0; }
    .hcs-step:last-child::after { display:none; }
    .hcs-dot {
      width: 26px; height: 26px; border-radius: 50%; border: 2px solid #2a2a4a;
      background: #1e1e3a; display: flex; align-items: center; justify-content: center;
      font-size: .68rem; font-weight: 800; margin: 0 auto 4px; position: relative;
      z-index: 1; transition: all .2s; color: #9090b0;
    }
    .hcs-step.done .hcs-dot { background: #43e97b; border-color: #43e97b; color: #0f0f1a; }
    .hcs-step.done::after { background: #43e97b; }
    .hcs-step.active .hcs-dot { background: var(--hcs-color); border-color: var(--hcs-color); color: white; box-shadow: 0 0 12px color-mix(in srgb, var(--hcs-color) 60%, transparent); }
    .hcs-slabel { font-size: .58rem; color: #9090b0; font-weight: 600; }
    .hcs-step.active .hcs-slabel { color: var(--hcs-color); }
    .hcs-step.done .hcs-slabel { color: #43e97b; }

    .hcs-body { flex: 1; overflow-y: auto; padding: 20px; }
    .hcs-foot { padding: 14px 20px; border-top: 1px solid #2a2a4a; display: flex; gap: 8px; flex-shrink: 0; }

    /* Form elements */
    .hcs-section { font-size: .65rem; font-weight: 700; text-transform: uppercase; letter-spacing: 1.5px; color: #9090b0; margin-bottom: 12px; }
    .hcs-field { margin-bottom: 12px; }
    .hcs-field label { display: block; font-size: .7rem; color: #9090b0; margin-bottom: 4px; }
    .hcs-input {
      width: 100%; padding: 10px 12px; border-radius: 8px; border: 1px solid #2a2a4a;
      background: #1e1e3a; color: #e8e8f0; font-size: .85rem; outline: none;
      font-family: inherit; transition: border-color .2s;
    }
    .hcs-input:focus { border-color: var(--hcs-color); }
    .hcs-input::placeholder { color: #9090b0; }
    .hcs-textarea { resize: vertical; min-height: 70px; }

    /* Delivery */
    .hcs-dlv { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 16px; }
    .hcs-dlv-opt {
      padding: 14px 10px; border-radius: 10px; border: 2px solid #2a2a4a;
      background: #1e1e3a; cursor: pointer; text-align: center; transition: all .2s;
    }
    .hcs-dlv-opt:hover, .hcs-dlv-opt.sel { border-color: var(--hcs-color); background: color-mix(in srgb, var(--hcs-color) 12%, #1e1e3a); }
    .hcs-dlv-icon { font-size: 22px; margin-bottom: 5px; }
    .hcs-dlv-label { font-size: .75rem; font-weight: 700; color: #e8e8f0; }
    .hcs-dlv-sub { font-size: .62rem; color: #9090b0; margin-top: 2px; }

    /* Recap */
    .hcs-recap {
      background: #16213e; border: 1px solid #2a2a4a; border-radius: 10px;
      padding: 14px 16px; margin-bottom: 16px;
    }
    .hcs-recap-row { display: flex; justify-content: space-between; font-size: .78rem; padding: 4px 0; border-bottom: 1px solid rgba(42,42,74,.5); }
    .hcs-recap-row:last-child { border: none; padding-top: 8px; margin-top: 4px; border-top: 1px solid #2a2a4a; }
    .hcs-recap-row span:first-child { color: #9090b0; }
    .hcs-recap-row span:last-child { font-weight: 600; color: #e8e8f0; }
    .hcs-total { font-size: 1.1rem !important; font-weight: 900 !important; color: var(--hcs-color) !important; }

    /* Boutons nav */
    .hcs-btn-next {
      flex: 1; padding: 12px; border: none; border-radius: 8px;
      font-size: .88rem; font-weight: 700; color: white; cursor: pointer; transition: opacity .2s;
    }
    .hcs-btn-next:hover { opacity: .9; }
    .hcs-btn-next:disabled { opacity: .4; cursor: not-allowed; }
    .hcs-btn-prev {
      padding: 12px 16px; background: #1e1e3a; border: 1px solid #2a2a4a;
      color: #9090b0; border-radius: 8px; font-size: .85rem; cursor: pointer; transition: all .2s;
    }
    .hcs-btn-prev:hover { border-color: var(--hcs-color); color: var(--hcs-color); }

    /* Paiement */
    .hcs-pz-loading { text-align: center; color: #9090b0; font-size: .85rem; padding: 24px; }
    .hcs-pz-error {
      background: rgba(255,80,80,.12); border: 1px solid rgba(255,80,80,.3);
      border-radius: 8px; padding: 12px; color: #ff6b6b; font-size: .8rem; margin-top: 10px; display: none;
    }
    .hcs-pz-ok {
      background: rgba(67,233,123,.12); border: 1px solid rgba(67,233,123,.3);
      border-radius: 12px; padding: 28px; text-align: center; color: #43e97b; display: none;
    }
    .hcs-pz-ok h3 { font-size: 1.2rem; margin-bottom: 8px; }
    .hcs-pz-ok p { font-size: .82rem; color: #9090b0; line-height: 1.6; }

    /* Formulaire OSB */
    .kr-embedded { background: #fff !important; border-radius: 14px !important; padding: 16px 14px !important; margin-top: 4px !important; }
    .kr-embedded .kr-field { margin-bottom: 12px !important; }
    .kr-embedded .kr-label { color: #333 !important; font-size: .75rem !important; font-weight: 600 !important; margin-bottom: 4px !important; display: block !important; }
    .kr-embedded .kr-field-element { background: #f8f9fa !important; border: 1.5px solid #dee2e6 !important; border-radius: 8px !important; padding: 10px 12px !important; color: #1a1a1a !important; font-size: .9rem !important; width: 100% !important; }
    .kr-embedded .kr-payment-button { border-radius: 10px !important; font-weight: 800 !important; font-size: .9rem !important; padding: 13px !important; width: 100% !important; border: none !important; color: #fff !important; cursor: pointer !important; margin-top: 4px !important; }

    /* File:// warning */
    .hcs-file-warn {
      background: rgba(246,211,101,.12); border: 2px solid #f6d365; border-radius: 12px;
      padding: 20px; text-align: center; margin-top: 8px;
    }
    .hcs-file-warn-icon { font-size: 1.8rem; margin-bottom: 8px; }
    .hcs-file-warn-title { font-weight: 800; font-size: .9rem; color: #f6d365; margin-bottom: 8px; }
    .hcs-file-warn-msg { font-size: .78rem; color: rgba(255,255,255,.8); line-height: 1.7; }
  `;

  // ── Injection CSS ───────────────────────────────────────────
  function injectCSS() {
    if (document.getElementById('hcs-widget-css')) return;
    const style = document.createElement('style');
    style.id = 'hcs-widget-css';
    style.textContent = CSS;
    document.head.appendChild(style);
  }

  // ── Utilitaires ─────────────────────────────────────────────
  function fmt(n) { return Number(n).toLocaleString('fr-FR') + ' XPF'; }
  function uid() { return 'HCS-' + Date.now() + '-' + Math.random().toString(36).slice(2,6).toUpperCase(); }

  // ── Classe Widget ───────────────────────────────────────────
  class HCSPaymentWidget {
    constructor(container) {
      this.container  = container;
      this.color      = container.dataset.color      || '#6c63ff';
      this.workerUrl  = container.dataset.worker     || WORKER_DEFAULT;
      this.secret     = container.dataset.secret     || SECRET_DEFAULT;
      this.mode       = container.dataset.mode       || 'TEST';
      this.label      = container.dataset.label      || 'Payer par carte';
      this.shop       = container.dataset.shop       || 'HCS Tahiti';
      this.freeAmount = container.dataset.freeAmount === 'true';
      this.minAmount  = parseInt(container.dataset.min)  || 100;
      this.maxAmount  = parseInt(container.dataset.max)  || 999999;

      // Produits
      if (container.dataset.products) {
        this.products = JSON.parse(container.dataset.products);
      } else if (container.dataset.amount) {
        this.products = [{
          name:  container.dataset.product || 'Paiement',
          price: parseInt(container.dataset.amount)
        }];
      } else {
        this.products = [];
      }

      // État
      this.selIdx    = this.products.length === 1 ? 0 : null;
      this.selAmount = this.products.length === 1 ? this.products[0].price : null;
      this.step      = 1;
      this.contact   = {};
      this.delivery  = { type: 'pickup' };
      this.orderId   = uid();

      this._buildUI();
    }

    // ── Construction UI ────────────────────────────────────────
    _buildUI() {
      this.container.classList.add('hcs-widget');
      this.container.style.setProperty('--hcs-color', this.color);

      // Sélecteur produits (si plusieurs)
      if (this.products.length > 1) {
        const grid = document.createElement('div');
        grid.className = 'hcs-products';
        this.products.forEach((p, i) => {
          const el = document.createElement('div');
          el.className = 'hcs-prod';
          el.innerHTML = `
            <div>
              <div class="hcs-prod-name">${p.name}</div>
              ${p.description ? `<div class="hcs-prod-desc">${p.description}</div>` : ''}
            </div>
            <div class="hcs-prod-price">${fmt(p.price)}</div>`;
          el.addEventListener('click', () => {
            grid.querySelectorAll('.hcs-prod').forEach(x => x.classList.remove('selected'));
            el.classList.add('selected');
            this.selIdx    = i;
            this.selAmount = p.price;
            btn.disabled   = false;
          });
          grid.appendChild(el);
        });
        this.container.appendChild(grid);
      }

      // Montant libre
      if (this.freeAmount) {
        const lbl = document.createElement('label');
        lbl.className = 'hcs-free-label';
        lbl.textContent = `Montant (XPF, min ${fmt(this.minAmount)})`;
        const inp = document.createElement('input');
        inp.type = 'number'; inp.className = 'hcs-free-input';
        inp.placeholder = 'ex: 2500'; inp.min = this.minAmount; inp.max = this.maxAmount;
        inp.addEventListener('input', () => {
          const v = parseInt(inp.value) || 0;
          this.selAmount = v >= this.minAmount ? v : null;
          btn.disabled   = !this.selAmount;
        });
        this.container.appendChild(lbl);
        this.container.appendChild(inp);
      }

      // Bouton principal
      const btn = document.createElement('button');
      btn.className = 'hcs-btn';
      btn.style.background = `linear-gradient(135deg, ${this.color}, #ff6584)`;
      btn.style.boxShadow  = `0 6px 20px ${this.color}55`;
      btn.disabled = this.products.length > 1 || this.freeAmount;
      btn.innerHTML = `<span class="hcs-btn-icon">💳</span> ${this.label}`;
      btn.addEventListener('click', () => this._openModal());
      this.container.appendChild(btn);
      this._btn = btn;

      // Modal + overlay
      this._createModal();
    }

    _createModal() {
      // Overlay
      const overlay = document.createElement('div');
      overlay.className = 'hcs-overlay';
      overlay.addEventListener('click', e => { if (e.target === overlay) this._close(); });
      document.addEventListener('keydown', e => { if (e.key === 'Escape') this._close(); });

      // Modal
      const modal = document.createElement('div');
      modal.className = 'hcs-modal';
      modal.style.setProperty('--hcs-color', this.color);

      // Head
      const head = document.createElement('div');
      head.className = 'hcs-modal-head';
      head.innerHTML = `<span class="hcs-modal-title" id="hcs-mtitle-${this._id()}">💳 Commande</span>`;
      const closeBtn = document.createElement('button');
      closeBtn.className = 'hcs-modal-close';
      closeBtn.textContent = '✕';
      closeBtn.addEventListener('click', () => this._close());
      head.appendChild(closeBtn);

      // Steps
      const steps = document.createElement('div');
      steps.className = 'hcs-steps';
      steps.innerHTML = `
        <div class="hcs-step active" id="hcs-s1-${this._id()}"><div class="hcs-dot">1</div><div class="hcs-slabel">Panier</div></div>
        <div class="hcs-step" id="hcs-s2-${this._id()}"><div class="hcs-dot">2</div><div class="hcs-slabel">Contact</div></div>
        <div class="hcs-step" id="hcs-s3-${this._id()}"><div class="hcs-dot">3</div><div class="hcs-slabel">Livraison</div></div>
        <div class="hcs-step" id="hcs-s4-${this._id()}"><div class="hcs-dot">4</div><div class="hcs-slabel">Paiement</div></div>`;

      this._body = document.createElement('div');
      this._body.className = 'hcs-body';

      this._foot = document.createElement('div');
      this._foot.className = 'hcs-foot';

      modal.append(head, steps, this._body, this._foot);
      overlay.appendChild(modal);
      document.body.appendChild(overlay);
      this._overlay = overlay;
      this._modal   = modal;
    }

    _id() {
      if (!this.__uid) this.__uid = Math.random().toString(36).slice(2, 7);
      return this.__uid;
    }

    // ── Modal ──────────────────────────────────────────────────
    _openModal() {
      if (!this.selAmount && !this.freeAmount) return;
      this.step    = 1;
      this.orderId = uid();
      this._overlay.classList.add('open');
      document.body.style.overflow = 'hidden';
      this._renderStep();
    }

    _close() {
      this._overlay.classList.remove('open');
      document.body.style.overflow = '';
    }

    _setStepUI() {
      const titles = { 1:'🛒 Mon panier', 2:'👤 Coordonnées', 3:'📦 Livraison', 4:'💳 Paiement sécurisé' };
      const t = this._modal.querySelector('[id^="hcs-mtitle"]');
      if (t) t.textContent = titles[this.step];
      [1,2,3,4].forEach(i => {
        const el = this._modal.querySelector(`[id^="hcs-s${i}-"]`);
        if (!el) return;
        el.className = 'hcs-step' + (i < this.step ? ' done' : i === this.step ? ' active' : '');
      });
    }

    _renderStep() {
      this._setStepUI();
      if      (this.step === 1) this._step1();
      else if (this.step === 2) this._step2();
      else if (this.step === 3) this._step3();
      else                      this._step4();
    }

    // ── Étape 1 : Panier ──────────────────────────────────────
    _step1() {
      const p     = this.products[this.selIdx] || { name: 'Paiement', price: this.selAmount };
      const price = this.selAmount || p.price;
      this._body.innerHTML = `
        <div style="background:#16213e;border:2px solid ${this.color}44;border-radius:12px;overflow:hidden;margin-bottom:16px">
          <div style="padding:20px 16px">
            <div style="font-size:1rem;font-weight:700;margin-bottom:6px;color:#e8e8f0">${p.name}</div>
            ${p.description ? `<div style="font-size:.78rem;color:#9090b0;margin-bottom:10px">${p.description}</div>` : ''}
            <div style="font-size:1.4rem;font-weight:900;color:${this.color}">${fmt(price)}</div>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:12px;background:#1e1e3a;border:1px solid #2a2a4a;border-radius:10px;padding:12px 16px">
          <span style="font-size:.8rem;color:#9090b0;flex:1">Quantité</span>
          <button onclick="this.closest('.hcs-body').querySelector('#hcs-qty').textContent=Math.max(1,parseInt(this.closest('.hcs-body').querySelector('#hcs-qty').textContent)-1);this.closest('.hcs-body').querySelector('#hcs-sub').textContent=(${price}*parseInt(this.closest('.hcs-body').querySelector('#hcs-qty').textContent)).toLocaleString('fr-FR')+' XPF'" style="width:32px;height:32px;border-radius:6px;border:1px solid #2a2a4a;background:#16213e;color:#e8e8f0;font-size:1rem;cursor:pointer">−</button>
          <span id="hcs-qty" style="font-size:.9rem;font-weight:700;min-width:20px;text-align:center">1</span>
          <button onclick="this.closest('.hcs-body').querySelector('#hcs-qty').textContent=parseInt(this.closest('.hcs-body').querySelector('#hcs-qty').textContent)+1;this.closest('.hcs-body').querySelector('#hcs-sub').textContent=(${price}*parseInt(this.closest('.hcs-body').querySelector('#hcs-qty').textContent)).toLocaleString('fr-FR')+' XPF'" style="width:32px;height:32px;border-radius:6px;border:1px solid #2a2a4a;background:#16213e;color:#e8e8f0;font-size:1rem;cursor:pointer">+</button>
        </div>
        <div style="margin-top:12px;display:flex;justify-content:space-between;font-size:.82rem">
          <span style="color:#9090b0">Sous-total</span>
          <span id="hcs-sub" style="font-weight:800;color:${this.color}">${fmt(price)}</span>
        </div>`;
      this._foot.innerHTML = '';
      const btn = document.createElement('button');
      btn.className = 'hcs-btn-next';
      btn.style.background = `linear-gradient(135deg,${this.color},#ff6584)`;
      btn.textContent = 'Continuer → Coordonnées →';
      btn.addEventListener('click', () => {
        this._qty = parseInt(this._body.querySelector('#hcs-qty').textContent) || 1;
        this._totalAmount = price * this._qty;
        this.step = 2; this._renderStep();
      });
      this._foot.appendChild(btn);
    }

    // ── Étape 2 : Contact ─────────────────────────────────────
    _step2() {
      const s = this.contact;
      this._body.innerHTML = `
        <div class="hcs-section">Vos coordonnées</div>
        <div class="hcs-field"><label>Prénom & Nom *</label>
          <input class="hcs-input" id="hcs-name" placeholder="Jean Dupont" value="${s.name||''}"></div>
        <div class="hcs-field"><label>Email *</label>
          <input class="hcs-input" id="hcs-email" type="email" placeholder="jean@mail.com" value="${s.email||''}"></div>
        <div class="hcs-field"><label>Téléphone</label>
          <input class="hcs-input" id="hcs-phone" type="tel" placeholder="87 00 00 00" value="${s.phone||''}"></div>
        <div class="hcs-field"><label>Note / instructions</label>
          <textarea class="hcs-input hcs-textarea" id="hcs-note" placeholder="Taille, couleur…">${s.note||''}</textarea></div>`;
      this._foot.innerHTML = '';
      const prev = document.createElement('button');
      prev.className = 'hcs-btn-prev'; prev.textContent = '← Retour';
      prev.addEventListener('click', () => { this.step = 1; this._renderStep(); });
      const next = document.createElement('button');
      next.className = 'hcs-btn-next';
      next.style.background = `linear-gradient(135deg,${this.color},#ff6584)`;
      next.textContent = 'Continuer → Livraison →';
      next.addEventListener('click', () => {
        const name  = this._body.querySelector('#hcs-name').value.trim();
        const email = this._body.querySelector('#hcs-email').value.trim();
        if (!name)  { alert('Veuillez saisir votre nom.'); return; }
        if (!email || !email.includes('@')) { alert('Email invalide.'); return; }
        this.contact = {
          name, email,
          phone: this._body.querySelector('#hcs-phone').value.trim(),
          note:  this._body.querySelector('#hcs-note').value.trim()
        };
        this.step = 3; this._renderStep();
      });
      this._foot.append(prev, next);
    }

    // ── Étape 3 : Livraison ───────────────────────────────────
    _step3() {
      const d = this.delivery;
      this._body.innerHTML = `
        <div class="hcs-section">Mode de réception</div>
        <div class="hcs-dlv">
          <div class="hcs-dlv-opt ${d.type==='pickup'?'sel':''}" id="hcs-pickup">
            <div class="hcs-dlv-icon">🏪</div>
            <div class="hcs-dlv-label">Retrait boutique</div>
            <div class="hcs-dlv-sub">${this.shop}</div>
          </div>
          <div class="hcs-dlv-opt ${d.type==='delivery'?'sel':''}" id="hcs-dlv">
            <div class="hcs-dlv-icon">🚚</div>
            <div class="hcs-dlv-label">Livraison</div>
            <div class="hcs-dlv-sub">3–5 jours ouvrés</div>
          </div>
        </div>
        <div id="hcs-pickup-fields" style="${d.type==='pickup'?'':'display:none'}">
          <div class="hcs-field"><label>Date de retrait souhaitée</label>
            <input class="hcs-input" id="hcs-date" type="date" value="${d.pickupDate||''}" min="${new Date().toISOString().slice(0,10)}"></div>
          <div class="hcs-field"><label>Créneau</label>
            <select class="hcs-input" id="hcs-slot">
              <option value="08-12" ${d.slot==='08-12'?'selected':''}>08h00 – 12h00</option>
              <option value="13-17" ${d.slot==='13-17'?'selected':''}>13h00 – 17h00</option>
            </select></div>
        </div>
        <div id="hcs-dlv-fields" style="${d.type==='delivery'?'':'display:none'}">
          <div class="hcs-field"><label>Adresse *</label>
            <input class="hcs-input" id="hcs-addr" placeholder="Rue, quartier, commune" value="${d.address||''}"></div>
          <div class="hcs-field"><label>Île / Commune</label>
            <select class="hcs-input" id="hcs-island">
              <option ${d.island==='tahiti'?'selected':''} value="tahiti">Tahiti</option>
              <option ${d.island==='moorea'?'selected':''} value="moorea">Moorea</option>
              <option ${d.island==='autre'?'selected':''} value="autre">Autre île</option>
            </select></div>
        </div>`;

      this._body.querySelector('#hcs-pickup').addEventListener('click', () => {
        this._body.querySelector('#hcs-pickup').classList.add('sel');
        this._body.querySelector('#hcs-dlv').classList.remove('sel');
        this._body.querySelector('#hcs-pickup-fields').style.display = '';
        this._body.querySelector('#hcs-dlv-fields').style.display = 'none';
      });
      this._body.querySelector('#hcs-dlv').addEventListener('click', () => {
        this._body.querySelector('#hcs-dlv').classList.add('sel');
        this._body.querySelector('#hcs-pickup').classList.remove('sel');
        this._body.querySelector('#hcs-pickup-fields').style.display = 'none';
        this._body.querySelector('#hcs-dlv-fields').style.display = '';
      });

      this._foot.innerHTML = '';
      const prev = document.createElement('button');
      prev.className = 'hcs-btn-prev'; prev.textContent = '← Retour';
      prev.addEventListener('click', () => { this.step = 2; this._renderStep(); });
      const next = document.createElement('button');
      next.className = 'hcs-btn-next';
      next.style.background = `linear-gradient(135deg,${this.color},#ff6584)`;
      next.textContent = 'Continuer → Paiement →';
      next.addEventListener('click', () => {
        const isPick = this._body.querySelector('#hcs-pickup').classList.contains('sel');
        if (!isPick) {
          const addr = this._body.querySelector('#hcs-addr').value.trim();
          if (!addr) { alert('Saisissez votre adresse.'); return; }
          this.delivery = { type:'delivery', address:addr, island:this._body.querySelector('#hcs-island').value };
        } else {
          this.delivery = { type:'pickup', pickupDate:this._body.querySelector('#hcs-date').value, slot:this._body.querySelector('#hcs-slot').value };
        }
        this.step = 4; this._renderStep();
      });
      this._foot.append(prev, next);
    }

    // ── Étape 4 : Paiement ────────────────────────────────────
    async _step4() {
      const total = this._totalAmount || this.selAmount;
      const p     = this.products[this.selIdx] || { name:'Paiement' };
      const c     = this.contact;
      const d     = this.delivery;

      this._body.innerHTML = `
        <div class="hcs-recap">
          <div class="hcs-recap-row"><span>Produit</span><span>${p.name}</span></div>
          <div class="hcs-recap-row"><span>Quantité</span><span>${this._qty||1}</span></div>
          <div class="hcs-recap-row"><span>Client</span><span>${c.name}</span></div>
          <div class="hcs-recap-row"><span>Email</span><span>${c.email}</span></div>
          <div class="hcs-recap-row"><span>Livraison</span><span>${d.type==='pickup'?'🏪 Retrait':'🚚 Domicile'}</span></div>
          ${d.pickupDate?`<div class="hcs-recap-row"><span>Date retrait</span><span>${d.pickupDate}</span></div>`:''}
          ${d.address?`<div class="hcs-recap-row"><span>Adresse</span><span>${d.address}</span></div>`:''}
          <div class="hcs-recap-row"><span style="font-weight:700">Total</span><span class="hcs-total">${fmt(total)}</span></div>
        </div>
        ${location.protocol==='file:' ? `
        <div class="hcs-file-warn">
          <div class="hcs-file-warn-icon">⚠️</div>
          <div class="hcs-file-warn-title">Fichier local détecté</div>
          <div class="hcs-file-warn-msg">Le paiement OSB requiert une URL <strong>https://</strong> ou <strong>http://</strong>.</div>
        </div>` : `
        <div id="hcs-pz-loading" class="hcs-pz-loading">🔒 Connexion sécurisée à OSB Polynésie…</div>
        <div class="kr-embedded" id="hcs-pz-form" style="display:none"></div>
        <div class="hcs-pz-error" id="hcs-pz-error"></div>
        <div class="hcs-pz-ok" id="hcs-pz-ok">
          <h3>✅ Paiement accepté !</h3>
          <p>Merci <strong>${c.name}</strong>.<br>Commande <strong>${this.orderId}</strong> confirmée.<br>Confirmation envoyée à <strong>${c.email}</strong>.</p>
        </div>`}`;

      this._foot.innerHTML = '';
      const prev = document.createElement('button');
      prev.id = 'hcs-pz-back'; prev.className = 'hcs-btn-prev'; prev.textContent = '← Retour';
      prev.addEventListener('click', () => { this.step = 3; this._renderStep(); });
      this._foot.appendChild(prev);

      if (location.protocol === 'file:') return;

      // Charger SDK OSB CSS
      ['https://static.osb.pf/static/js/krypton-client/V4.0/stable/classic-reset.min.css',
       'https://static.osb.pf/static/js/krypton-client/V4.0/stable/classic.min.css']
      .forEach((href, i) => {
        if (!document.getElementById('hcs-kr-css-' + i)) {
          const l = document.createElement('link');
          l.id = 'hcs-kr-css-' + i; l.rel = 'stylesheet'; l.href = href;
          document.head.appendChild(l);
        }
      });

      // Supprimer ancien SDK
      const oldSdk = document.getElementById('hcs-kr-sdk');
      if (oldSdk) oldSdk.remove();

      try {
        const res = await fetch(this.workerUrl, {
          method: 'POST',
          headers: { 'Content-Type':'application/json', 'X-Worker-Secret': this.secret },
          body: JSON.stringify({ amount: total, currency:'XPF', orderId: this.orderId, mode: this.mode, customerEmail: c.email })
        });
        if (!res.ok) { const e = await res.json(); throw new Error(e.error || 'Erreur serveur'); }
        const { formToken, publicKey } = await res.json();

        await new Promise((resolve, reject) => {
          const s = document.createElement('script');
          s.id = 'hcs-kr-sdk';
          s.src = 'https://static.osb.pf/static/js/krypton-client/V4.0/stable/kr-payment-form.min.js';
          s.setAttribute('kr-public-key', publicKey);
          s.setAttribute('kr-language', 'fr-FR');
          s.onload  = () => KR.setFormToken(formToken).then(resolve);
          s.onerror = () => reject(new Error('SDK OSB indisponible'));
          document.head.appendChild(s);
        });

        const loadEl = this._body.querySelector('#hcs-pz-loading');
        const formEl = this._body.querySelector('#hcs-pz-form');
        if (loadEl) loadEl.style.display = 'none';
        if (formEl) formEl.style.display = 'block';

        // Style bouton paiement
        const style = document.createElement('style');
        style.textContent = `.kr-embedded .kr-payment-button { background: linear-gradient(135deg,${this.color},#ff6584) !important; }`;
        document.head.appendChild(style);

        const onSuccess = () => {
          const formEl2 = this._body.querySelector('#hcs-pz-form');
          const okEl    = this._body.querySelector('#hcs-pz-ok');
          const backEl  = this._body.querySelector('#hcs-pz-back');
          if (formEl2) formEl2.style.display = 'none';
          if (okEl)    okEl.style.display    = 'block';
          if (backEl)  backEl.style.display  = 'none';
          // Sauvegarder commande
          fetch(this.workerUrl.replace('/payzen-token', '/order/save'), {
            method: 'POST',
            headers: { 'Content-Type':'application/json', 'X-Worker-Secret': this.secret },
            body: JSON.stringify({
              orderId: this.orderId, status:'paid', amount: total, currency:'XPF',
              campaignName: this.shop, product: p.name,
              client: { name: c.name, email: c.email, phone: c.phone||'' },
              delivery: { type: d.type, address: d.address||'', pickupDate: d.pickupDate||'', deliveryDelay:3 },
              note: c.note||''
            })
          }).catch(() => {});
          // Émettre l'event
          this.container.dispatchEvent(new CustomEvent('hcs:success', {
            bubbles: true,
            detail: { orderId: this.orderId, amount: total, product: p.name }
          }));
        };

        KR.onSubmit(d => {
          if (['PAID','RUNNING','AUTHORISED'].includes(d?.clientAnswer?.orderStatus)) onSuccess();
          return false;
        });

        // Fallback MutationObserver
        const krForm = document.querySelector('.kr-embedded');
        if (krForm) {
          let done = false;
          new MutationObserver(() => {
            if (done) return;
            if (document.querySelector('.kr-payment-success') || krForm.classList.contains('kr-payment-success')) {
              done = true; onSuccess();
            }
          }).observe(document.body, { subtree:true, childList:true, attributes:true, attributeFilter:['class'] });
        }

      } catch(e) {
        const loadEl = this._body.querySelector('#hcs-pz-loading');
        const errEl  = this._body.querySelector('#hcs-pz-error');
        if (loadEl) loadEl.style.display = 'none';
        if (errEl)  { errEl.style.display = 'block'; errEl.textContent = '❌ ' + e.message; }
        this.container.dispatchEvent(new CustomEvent('hcs:error', {
          bubbles: true, detail: { message: e.message }
        }));
      }
    }
  }

  // ── Auto-init ───────────────────────────────────────────────
  function init() {
    injectCSS();
    document.querySelectorAll('[id^="hcs-pay"], .hcs-payment-widget').forEach(el => {
      if (!el.dataset.hcsInit) {
        el.dataset.hcsInit = '1';
        new HCSPaymentWidget(el);
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
