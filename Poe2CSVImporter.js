
// ====== PoE Guild Loot Splitter — inventaire + Split currencies (tiers distincts) ======

// ------------------------- i18n (FR/EN) -------------------------
const I18N = {
  fr: {
    "app.title": "PoE Guild Loot Splitter — Répartition des currencies par coffre",
    "ui.language": "Langue :",
    "ui.theme": "Mode sombre",
    "ui.toggleImport": "Afficher la zone d’import",
    "section.import.title": "Import",
    "drop.hint": "Glissez-déposez votre CSV ici, ou cliquez pour choisir un fichier",
    "input.inventoryMode.label": "Afficher l’inventaire au lieu de l'historique du coffre",
    "input.stash": "Coffre :",
    "input.account": "Compte :",
    "input.action": "Action :",
    "input.item": "Item :",
    "select.any": "Tous",
    "section.preview.title.inventory": "Inventaire",
    "section.preview.title.logs": "Historique du coffre",
    "pagination.pageSize": "Lignes / page :",
    "th.date": "Date",
    "th.account": "Compte",
    "th.action": "Action",
    "th.stash": "Coffre",
    "th.qty": "Quantité",
    "th.item": "Item",
    "section.split.title": "Répartition des monétaires",
    "input.playerCount": "Nombre de joueurs :",
    "th.currency": "Monétaire",
    "th.total": "Total",
    "th.perPlayer": "Par joueur",
    "th.remainder": "Reste",
    "text.mode.label": "Format du texte :",
    "text.mode.perPlayer": "Par joueur",
    "text.mode.total": "Total + reste",
    "text.copy": "Copier la liste",
    "msg.noData": "Aucune donnée à afficher.",
    "error.splitInventoryOnly": "La répartition des monétaires n’est disponible qu’en mode Inventaire. Activez « Afficher l’inventaire » pour l’utiliser."
  },
  en: {
    "app.title": "PoE Guild Loot Splitter — Currency split per stash",
    "ui.language": "Language:",
    "ui.theme": "Dark mode",
    "ui.toggleImport": "Show import area",
    "section.import.title": "Import",
    "drop.hint": "Drag & drop your CSV here, or click to pick a file",
    "input.inventoryMode.label": "Show inventory instead of stash logs",
    "input.stash": "Stash:",
    "input.account": "Account:",
    "input.action": "Action:",
    "input.item": "Item:",
    "select.any": "All",
    "section.preview.title.inventory": "Inventory",
    "section.preview.title.logs": "Stash Logs",
    "pagination.pageSize": "Rows / page:",
    "th.date": "Date",
    "th.account": "Account",
    "th.action": "Action",
    "th.stash": "Stash",
    "th.qty": "Quantity",
    "th.item": "Item",
    "section.split.title": "Currency split",
    "input.playerCount": "Players:",
    "th.currency": "Currency (distinct tier)",
    "th.total": "Total",
    "th.perPlayer": "Per player",
    "th.remainder": "Remainder",
    "text.mode.label": "Text format:",
    "text.mode.perPlayer": "Per player",
    "text.mode.total": "Total + remainder",
    "text.copy": "Copy list",
    "msg.noData": "No data to display.",
    "error.splitInventoryOnly": "Currency split is only available in Inventory mode. Enable “Show inventory” to use it."
  }
};

let currentLang = "fr";
function currentLocale() { return currentLang === "fr" ? "fr-FR" : "en-US"; }
function setLanguage(lang) {
  currentLang = (lang === "en") ? "en" : "fr";
  document.documentElement.lang = currentLang;

  // appliquer i18n
  document.querySelectorAll("[data-i18n]").forEach(el => {
    const key = el.getAttribute("data-i18n");
    const t = I18N[currentLang][key];
    if (typeof t === "string") el.textContent = t;
  });
  // placeholder
  const itemInput = document.getElementById("itemFilterInput");
  if (itemInput) itemInput.placeholder = currentLang === "fr" ? "Rechercher un item" : "Search an item";

  // persistance
  localStorage.setItem('lang', currentLang);

  // titre dynamique selon mode
  updatePreviewTitle();

  rerenderAll();
}
function updatePreviewTitle() {
  const inventoryMode = document.getElementById('inventoryMode')?.checked;
  const title = document.getElementById('previewTitle');
  if (!title) return;
  title.textContent = I18N[currentLang][inventoryMode ? "section.preview.title.inventory" : "section.preview.title.logs"];
}

// ------------------------- Thème (sombre/clair) + persistance -------------------------
function setTheme(forceDark) {
  const body = document.body;
  body.classList.remove("theme-dark", "theme-light");
  body.classList.add(forceDark ? "theme-dark" : "theme-light");
  localStorage.setItem('theme', forceDark ? 'dark' : 'light');
}

// ------------------------- États / tri / pagination -------------------------
let rawData = [];
let filteredData = [];
let currentSortKey = null;     // preview table
let currentSortAsc = true;
let currencySortKey = "total"; // currency table
let currencySortAsc = false;
let currentPage = 1;
let pageSize = 25;

// ------------------------- Mappings: actions + currencies FR -------------------------
// Action display translations (affichage uniquement)
function translateAction(s) {
  const x = String(s || '').trim().toLowerCase();
  const fr = {
    add: "Ajout", added: "Ajout", deposit: "Ajout",
    remove: "Retrait", withdrawn: "Retrait", withdraw: "Retrait", take: "Retrait",
    move: "Déplacement", moved: "Déplacement",
    modified: "Modifié", update: "Modifié"
  };
  const en = {
    add: "Add", added: "Add", deposit: "Add",
    remove: "Remove", withdrawn: "Withdraw", withdraw: "Withdraw", take: "Take",
    move: "Move", moved: "Move",
    modified: "Modified", update: "Modified"
  };
  const dict = (currentLang === "fr") ? fr : en;
  for (const k of Object.keys(dict)) {
    if (x.includes(k)) return dict[k];
  }
  return s;
}

// Currency ⇄ FR name (affichage FR + détection côté inventaire)
const CURRENCY_FR_MAP = new Map([
  // nom canonique anglais  -> français
  ["chaos orb", "Orbe du chaos"],           // PoEDB FR [1](https://poedb.tw/fr/Chaos_Orb)
  ["exalted orb", "Orbe exalté"],           // PoEDB FR [2](https://poedb.tw/fr/Exalted_Orb)
  ["regal orb", "Orbe royal"],              // PoEDB FR [3](https://poedb.tw/fr/Regal_Orb)
  ["glassblower's bauble", "Bulle de souffleur de verre"], // PoEDB FR/PoE2DB FR [4](https://poedb.tw/fr/Glassblowers_Bauble)[10](https://poe2db.tw/fr/Glassblowers_Bauble)
  ["jeweller's orb", "Orbe de joaillier"],  // PoEDB FR [5](https://poedb.tw/fr/Jewellers_Orb)
  ["hinekora's lock", "Mèche de cheveux d'Hinekora"],      // PoE2DB FR [6](https://poe2db.tw/fr/Hinekoras_Lock)
  ["orb of alchemy", "Orbe d'alchimie"],    // list PoE2DB currencies [7](https://poe2db.tw/us/Currency)
  ["orb of chance", "Orbe de chance"],      // PoE2DB/PoEDB currency lists [7](https://poe2db.tw/us/Currency)[9](https://poedb.tw/us/Currency)
  ["orb of transmutation", "Orbe de transmutation"],       // idem [7](https://poe2db.tw/us/Currency)[9](https://poedb.tw/us/Currency)
  ["orb of augmentation", "Orbe d’augmentation"],          // idem [7](https://poe2db.tw/us/Currency)[9](https://poedb.tw/us/Currency)
  ["orb of annulment", "Orbe d’annulation"],               // PoEDB FR list [11](https://poedb.tw/fr/Crafty_Currency)
  ["divine orb", "Orbe divin"],            // PoEDB FR list [12](https://poedb.tw/us/Crafty_Currency)
  ["vaal orb", "Orbe vaal"],               // (liste PoE2DB currencies) [7](https://poe2db.tw/us/Currency)
  ["armourer's scrap", "Écaille d’armurier"], // (catégories PoE2DB/PoEDB) [7](https://poe2db.tw/us/Currency)[9](https://poedb.tw/us/Currency)
  ["blacksmith's whetstone", "Pierre à aiguiser de forgeron"], // PoEDB FR [4](https://poedb.tw/fr/Glassblowers_Bauble)
  ["gemcutter's prism", "Prisme de lapidaire"] // PoE2DB FR (exemple) [13](https://www.poe2db.info/fr/items/chaos-orb)
]);
// FR -> EN pour la détection
const CURRENCY_FR_TO_EN = new Map([...CURRENCY_FR_MAP.entries()].map(([en, fr]) => [fr.toLowerCase(), en]));

function displayCurrencyName(nameEn) {
  if (currentLang === "fr") return CURRENCY_FR_MAP.get(nameEn) || titleCase(nameEn);
  return titleCase(nameEn);
}
function toEnglishCurrencyName(nameAny) {
  const n = String(nameAny || '').trim().toLowerCase();
  if (CURRENCY_FR_TO_EN.has(n)) return CURRENCY_FR_TO_EN.get(n);
  return canonicalCurrencyName(n);
}

// ------------------------- Init -------------------------
window.addEventListener('load', () => {
  // Langue (persistée)
  const langSelect = document.getElementById('langSelect');
  const savedLang = localStorage.getItem('lang') || 'fr';
  if (langSelect) {
    langSelect.value = savedLang;
    langSelect.addEventListener('change', e => setLanguage(e.target.value));
  }
  setLanguage(savedLang);

  // Thème (persisté)
  const themeToggle = document.getElementById('themeToggle');
  const savedTheme = localStorage.getItem('theme') || 'light';
  const isDark = (savedTheme === 'dark');
  if (themeToggle) {
    themeToggle.checked = isDark;
    themeToggle.addEventListener('change', () => setTheme(themeToggle.checked));
  }
  setTheme(isDark);

  // Import CSV via input
  const csvFileInput = document.getElementById('csvFileInput');
  if (csvFileInput) {
    csvFileInput.addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
    });
  }

  // Drag & drop
  const dropZone = document.getElementById('dropZone');
  if (dropZone) {
    const prevent = e => { e.preventDefault(); e.stopPropagation(); };
    ['dragenter', 'dragover'].forEach(ev =>
      dropZone.addEventListener(ev, e => { prevent(e); dropZone.classList.add('dragover'); })
    );
    ['dragleave', 'drop'].forEach(ev =>
      dropZone.addEventListener(ev, e => { prevent(e); dropZone.classList.remove('dragover'); })
    );
    dropZone.addEventListener('click', () => csvFileInput?.click());
    dropZone.addEventListener('drop', e => {
      const file = e.dataTransfer?.files?.[0];
      if (file) handleFile(file);
    });
  }

  // Réduire/afficher l'import
  const toggleBtn = document.getElementById('toggleImportBtn');
  const importSection = document.getElementById('importSection');
  if (toggleBtn && importSection) {
    toggleBtn.addEventListener('click', () => {
      importSection.classList.toggle('collapsed');
      toggleBtn.textContent = importSection.classList.contains('collapsed')
        ? (I18N[currentLang]["ui.toggleImport"])
        : (I18N[currentLang]["ui.toggleImport"]);
      // (même libellé, la classe fait le reste)
    });
  }

  // Filtres
  ['stashFilter', 'accountFilter', 'actionFilter'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', applyFilters);
  });
  const itemInput = document.getElementById('itemFilterInput');
  if (itemInput) itemInput.addEventListener('input', applyFilters);

  // Mode inventaire/logs
  const inventoryMode = document.getElementById('inventoryMode');
  if (inventoryMode) {
    inventoryMode.addEventListener('change', () => {
      updatePreviewTitle();
      rerenderAll();
    });
  }

  // Split — nombre de joueurs
  const pc = document.getElementById('playerCount');
  if (pc) {
    pc.addEventListener('input', () => updateCurrencySplit(filteredData.length ? filteredData : rawData));
  }

  // Tri en-têtes (logs/inventaire)
  attachSortHandlers('#previewTable', (key, asc) => {
    currentSortKey = key; currentSortAsc = asc;
    renderPreview();
  });

  // Tri en-têtes (split currencies)
  attachSortHandlers('#currencySplitTable', (key, asc) => {
    currencySortKey = key; currencySortAsc = asc;
    updateCurrencySplit(filteredData.length ? filteredData : rawData);
  });

  // Pagination
  const pageSizeSelect = document.getElementById('pageSizeSelect');
  const prevBtn = document.getElementById('prevPageBtn');
  const nextBtn = document.getElementById('nextPageBtn');

  if (pageSizeSelect) {
    pageSizeSelect.value = String(pageSize);
    pageSizeSelect.addEventListener('change', () => {
      pageSize = Math.max(1, Number(pageSizeSelect.value) || 25);
      currentPage = 1;
      renderPreview();
    });
  }
  if (prevBtn) prevBtn.addEventListener('click', () => { currentPage = Math.max(1, currentPage - 1); renderPreview(); });
  if (nextBtn) nextBtn.addEventListener('click', () => { currentPage = currentPage + 1; renderPreview(); });

  // Copie du texte du split
  const textModeSelect = document.getElementById('textModeSelect');
  if (textModeSelect) textModeSelect.addEventListener('change', () => updateSplitTextPreview());
  const copyBtn = document.getElementById('copySplitBtn');
  if (copyBtn) copyBtn.addEventListener('click', copySplitText);

  // Premier rendu
  rerenderAll();
});

// ------------------------- I/O -------------------------
function handleFile(file) {
  const reader = new FileReader();
  reader.onload = function (e) {
    const text = e.target.result;
    const parsed = parseCSV(text);
    if (parsed) {
      rawData = parsed;
      filteredData = [];
      populateFilterOptions(rawData);
      applyFilters(); // initialise preview + split
      // réduire la section import
      document.getElementById('importSection')?.classList.add('collapsed');
    }
  };
  reader.readAsText(file);
}

function parseCSV(csvContent) {
  const lines = String(csvContent).split(/\r?\n/).filter(line => line.trim().length > 0);
  if (!lines.length) return [];
  lines[0] = lines[0].replace(/^\uFEFF/, ''); // BOM
  const header = lines[0].split(',').map(col => col.trim());
  const requiredColumns = ['Date', 'Id', 'League', 'Account', 'Action', 'Stash', 'Item'];

  for (const col of requiredColumns) {
    if (!header.includes(col)) {
      alert((currentLang === "fr" ? "Colonne requise manquante : " : "Missing required column: ") + col);
      return null;
    }
  }

  const data = [];
  for (let i = 1; i < lines.length; i++) {
    let row = lines[i].split(',');
    if (row.length !== header.length) {
      if (row.length > header.length) {
        const merged = row.slice(0, header.length - 1);
        merged.push(row.slice(header.length - 1).join(','));
        row = merged;
      } else {
        console.warn(`Ligne ignorée : ${lines[i]}`);
        continue;
      }
    }
    const o = {};
    for (let j = 0; j < header.length; j++) {
      const cleanedValue = stripQuotes(row[j]);
      o[header[j]] = cleanedValue;
    }
    // Normaliser Stash & XY
    o.Stash = (o.Stash ?? '').trim();
    o.X = Number(o.X ?? NaN);
    o.Y = Number(o.Y ?? NaN);

    // Date & Id pour tie-break
    const d = new Date(o.Date);
    o._dateObj = isNaN(d) ? null : d;
    o._idNum = Number(o.Id ?? NaN);

    // Parser quantité + nom
    const { name, qty: parsedQty } = extractQuantityAndName(o.Item);
    o.ItemName = name;
    const explicitQty = Number(o.Quantity ?? o.Amount ?? NaN);
    o.Qty = Number.isFinite(explicitQty) ? explicitQty : parsedQty;

    data.push(o);
  }
  return data;
}

function stripQuotes(s) { return (s ?? '').trim().replace(/^"(.*)"$/, '$1'); }

// ------------------------- Quantity & Name parsing -------------------------
function extractQuantityAndName(itemRaw) {
  const s = (itemRaw ?? '').trim();
  let m = s.match(/^\s*([0-9]+)\s*[×x✕]\s*(.+)$/i);
  if (m) return { name: m[2].trim(), qty: Number(m[1]) || 1 };

  m = s.match(/\b[×x✕]\s*([0-9]+)\b/i);
  if (m) {
    const qty = Number(m[1]) || 1;
    const name = s.replace(/\b[×x✕]\s*[0-9]+\b/i, '').trim().replace(/\s{2,}/g, ' ');
    return { name, qty };
  }

  m = s.match(/stack size:\s*([0-9]+)/i);
  if (m) {
    const qty = Number(m[1]) || 1;
    const name = s.replace(/stack size:\s*[0-9]+/i, '').trim().replace(/\s{2,}/g, ' ');
    return { name, qty };
  }

  m = s.match(/(?:\(|\[)\s*([0-9]+)\s*(?:\)|\])$/);
  if (m) {
    const qty = Number(m[1]) || 1;
    const name = s.replace(/(?:\(|\[)\s*[0-9]+\s*(?:\)|\])$/, '').trim();
    return { name, qty };
  }

  return { name: s, qty: 1 };
}

// ------------------------- Currency detection -------------------------
const CURRENCY_BASES = new Set([
  'scroll of wisdom','orb of transmutation','orb of augmentation','orb of alchemy','orb of chance',
  'regal orb','exalted orb','orb of annulment','chaos orb','divine orb','vaal orb',
  "armourer's scrap","blacksmith's whetstone","arcanist's etcher","glassblower's bauble","gemcutter's prism",
  "jeweller's orb","artificer's orb","fracturing orb","mirror of kalandra","hinekora's lock",
  'transmutation shard','chance shard','regal shard',"artificer's shard"
]); // Listes confirmées par PoE2DB/PoEDB. [7](https://poe2db.tw/us/Currency)[9](https://poedb.tw/us/Currency)

function canonicalCurrencyName(name) {
  let n = (name ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
  if (n.includes("jeweller's orb")) {
    if (n.startsWith('greater ')) return "greater jeweller's orb";
    if (n.startsWith('perfect ')) return "perfect jeweller's orb";
    if (n.startsWith('lesser ')) return "lesser jeweller's orb";
    return "jeweller's orb";
  }
  return n;
}
function isCurrency(name) {
  const base = canonicalCurrencyName(name).replace(/^(greater|perfect|lesser)\s+/i, '');
  return CURRENCY_BASES.has(base);
}

// ------------------------- Filtres -------------------------
function populateFilterOptions(data) {
  const stashFilter = document.getElementById('stashFilter');
  const accountFilter = document.getElementById('accountFilter');
  const actionFilter = document.getElementById('actionFilter');

  clearSelectOptions(stashFilter);
  clearSelectOptions(accountFilter);
  clearSelectOptions(actionFilter);

  const stashes  = [...new Set(data.map(d => d.Stash))].filter(Boolean).sort();
  const accounts = [...new Set(data.map(d => d.Account))].filter(Boolean).sort();
  const actions  = [...new Set(data.map(d => d.Action))].filter(Boolean).sort();

  stashes.forEach(stash => appendOption(stashFilter, stash));
  accounts.forEach(acc => appendOption(accountFilter, acc));
  actions.forEach(act => appendOption(actionFilter, act));
}
function appendOption(selectEl, value) {
  const opt = document.createElement('option');
  opt.value = value;
  opt.textContent = value;
  selectEl.appendChild(opt);
}
function clearSelectOptions(selectElement) {
  while (selectElement.options.length > 1) selectElement.remove(1);
}

function applyFilters() {
  const stashVal   = document.getElementById('stashFilter').value;
  const accountVal = document.getElementById('accountFilter').value;
  const actionVal  = document.getElementById('actionFilter').value;
  const itemTerm   = (document.getElementById('itemFilterInput').value || '').trim().toLowerCase();

  filteredData = rawData.filter(item => {
    const inStash   = (stashVal   === '' || item.Stash   === stashVal);
    const inAccount = (accountVal === '' || item.Account === accountVal);
    const inAction  = (actionVal  === '' || item.Action  === actionVal);
    const name      = (item.ItemName ?? item.Item ?? '').toLowerCase();
    const inName    = (itemTerm === '' || name.includes(itemTerm));
    return inStash && inAccount && inAction && inName;
  });

  currentPage = 1;
  renderPreview();
  updateCurrencySplit(filteredData);
}

// ------------------------- Preview + Pagination -------------------------
function buildDisplayRows(data, inventoryMode) {
  if (!inventoryMode) {
    // logs
    return data.map(d => ({
      Date: d.Date,
      Account: d.Account,
      Action: translateAction(d.Action),
      Stash: d.Stash,
      Qty: Number(d.Qty ?? 1),
      ItemName: translateItemName(d.ItemName ?? d.Item)
    }));
  }
  const inv = computeFinalInventoryRows(data).filter(r => r.qty > 0);
  return inv.map(r => ({
    Date: "—",
    Account: "—",
    Action: currentLang === "fr" ? "Inventaire" : "Inventory",
    Stash: r.stash || "—",
    Qty: Number(r.qty),
    ItemName: translateItemName(r.name)
  }));
}

function renderPreview() {
  const dataInput = filteredData.length ? filteredData : rawData;
  const inventoryMode = document.getElementById('inventoryMode').checked;
  let rows = buildDisplayRows(dataInput, inventoryMode);

  // tri
  if (currentSortKey) rows = rows.sort((a, b) => compareValues(a[currentSortKey], b[currentSortKey], currentSortAsc));

  // pagination
  const total = rows.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  currentPage = Math.min(currentPage, totalPages);

  const start = (currentPage - 1) * pageSize;
  const pageRows = rows.slice(start, start + pageSize);

  // render table
  const tbody = document.querySelector('#previewTable tbody');
  tbody.innerHTML = '';
  pageRows.forEach(r => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${formatDate(r.Date)}</td>
      <td>${escapeHtml(r.Account)}</td>
      <td>${escapeHtml(r.Action)}</td>
      <td>${escapeHtml(r.Stash)}</td>
      <td>${Number(r.Qty)}</td>
      <td>${escapeHtml(r.ItemName)}</td>
    `;
    tbody.appendChild(tr);
  });

  // pagination controls
  const prevBtn = document.getElementById('prevPageBtn');
  const nextBtn = document.getElementById('nextPageBtn');
  const info = document.getElementById('pageInfo');
  if (prevBtn) prevBtn.disabled = currentPage <= 1;
  if (nextBtn) nextBtn.disabled = currentPage >= totalPages;
  if (info) info.textContent = `${currentPage} / ${totalPages}`;
}

// ------------------------- inventaire -------------------------
function computeFinalInventoryRows(data) {
  const hasXY = data.some(d => Number.isFinite(d.X) && Number.isFinite(d.Y));
  if (hasXY) {
    const slots = new Map(); // stash@@X@@Y -> dernier event
    for (const d of data) {
      const stash = d.Stash ?? '';
      const X = Number.isFinite(d.X) ? d.X : null;
      const Y = Number.isFinite(d.Y) ? d.Y : null;
      if (X === null || Y === null) continue;
      const key = `${stash}@@${X}@@${Y}`;
      const curr = slots.get(key);
      if (isNewerEvent(d, curr)) slots.set(key, d);
    }
    const accum = new Map(); // name@@stash -> {name, stash, qty}
    for (const [, ev] of slots.entries()) {
      const action = String(ev.Action ?? '').toLowerCase();
      if (action.includes('rem')) continue; // removed => slot vide
      const name  = ev.ItemName ?? ev.Item ?? 'Unknown';
      const stash = ev.Stash ?? '';
      const qty   = Number(ev.Qty ?? 1);
      const key   = `${name}@@${stash}`;
      const prev  = accum.get(key) ?? { name, stash, qty: 0 };
      prev.qty += qty;
      accum.set(key, prev);
    }
    return [...accum.values()];
  }
  // fallback Ajout − Retrait (sans XY)
  const map = new Map(); // key = name@@stash
  for (const d of data) {
    const name  = d.ItemName ?? d.Item ?? 'Unknown';
    const stash = d.Stash ?? '';
    const qty   = Number(d.Qty ?? 1);
    const act   = String(d.Action ?? '').toLowerCase();
    const key   = `${name}@@${stash}`;
    const prev  = map.get(key) ?? { name, stash, qty: 0 };

    if (act.includes('add')) {
      prev.qty += qty;
    } else if (act.includes('rem') || act.includes('withdraw') || act.includes('take')) {
      prev.qty -= qty;
    }
    map.set(key, prev);
  }
  return [...map.values()].map(r => ({ ...r, qty: Math.max(0, Number(r.qty) || 0) }));
}

// ------------------------- Split currencies (Inventaire uniquement) -------------------------
function updateCurrencySplit(dataInput) {
  const inventoryMode = document.getElementById('inventoryMode')?.checked;
  const tbody = document.querySelector('#currencySplitTable tbody');
  const pre  = document.getElementById('splitTextPreview');
  const copyBtn = document.getElementById('copySplitBtn');

  if (!inventoryMode) {
    if (tbody) tbody.innerHTML = '';
    if (pre) {
      pre.textContent = I18N[currentLang]["error.splitInventoryOnly"];
      pre.classList.add('alert');
    }
    if (copyBtn) copyBtn.disabled = true;
    return;
  }
  if (pre) pre.classList.remove('alert');
  if (copyBtn) copyBtn.disabled = false;

  const playerCount = Math.max(1, Number(document.getElementById('playerCount').value) || 1);
  const invRows = computeFinalInventoryRows(dataInput || []);

  const totals = new Map();
  for (const r of invRows) {
    const canAny = toEnglishCurrencyName(r.name); // support FR/EN d’entrée
    const can = canonicalCurrencyName(canAny);
    if (!isCurrency(can)) continue;
    const qty = Number(r.qty) || 0;
    if (qty <= 0) continue;
    totals.set(can, (totals.get(can) ?? 0) + qty);
  }

  tbody.innerHTML = '';

  let rows = [...totals.entries()].map(([itemEnCanon, total]) => {
    const perPlayer = Math.floor(total / playerCount);
    const remainder = total % playerCount;
    return { item: itemEnCanon, total, perPlayer, remainder };
  });

  rows.sort((a, b) => compareValues(a[currencySortKey], b[currencySortKey], currencySortAsc));

  rows.forEach(r => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escapeHtml(displayCurrencyName(r.item))}</td>
      <td>${formatNumber(r.total)}</td>
      <td>${formatNumber(r.perPlayer)}</td>
      <td>${formatNumber(r.remainder)}</td>
    `;
    tbody.appendChild(tr);
  });

  updateSplitTextPreview(rows, playerCount);
}

function updateSplitTextPreview(rowsOpt, playerCountOpt) {
  const playerCount = playerCountOpt ?? Math.max(1, Number(document.getElementById('playerCount').value) || 1);
  const textMode = document.getElementById('textModeSelect')?.value || 'perPlayer';

  // recalcul si non fourni
  let rows = rowsOpt;
  if (!rows) {
    const dataInput = filteredData.length ? filteredData : rawData;
    const invRows = computeFinalInventoryRows(dataInput || []);
    const totals = new Map();
    for (const r of invRows) {
      const canAny = toEnglishCurrencyName(r.name);
      const can = canonicalCurrencyName(canAny);
      if (!isCurrency(can)) continue;
      const qty = Number(r.qty) || 0;
      if (qty <= 0) continue;
      totals.set(can, (totals.get(can) ?? 0) + qty);
    }
    rows = [...totals.entries()].map(([itemEnCanon, total]) => {
      const perPlayer = Math.floor(total / playerCount);
      const remainder = total % playerCount;
      return { item: itemEnCanon, total, perPlayer, remainder };
    }).sort((a, b) => b.total - a.total);
  }

  const lines = rows.map(r => {
    const nameDisp = displayCurrencyName(r.item);
    if (textMode === 'perPlayer') {
      return currentLang === "fr"
        ? `${nameDisp} : ${r.perPlayer} par joueur (reste ${r.remainder})`
        : `${nameDisp}: ${r.perPlayer} per player (remainder ${r.remainder})`;
    } else {
      return currentLang === "fr"
        ? `${nameDisp} : total ${r.total} (${r.perPlayer} chacun, reste ${r.remainder})`
        : `${nameDisp}: total ${r.total} (${r.perPlayer} each, remainder ${r.remainder})`;
    }
  });

  const header = currentLang === "fr"
    ? `Répartition pour ${playerCount} joueur(s):`
    : `Split for ${playerCount} player(s):`;
  const text = [header, ...lines].join('\n');

  const pre = document.getElementById('splitTextPreview');
  if (pre) pre.textContent = text;
}

async function copySplitText() {
  const pre = document.getElementById('splitTextPreview');
  if (!pre) return;
  const text = pre.textContent || '';
  try {
    await navigator.clipboard.writeText(text);
    const btn = document.getElementById('copySplitBtn');
    if (btn) {
      const original = btn.textContent;
      btn.textContent = currentLang === "fr" ? "Copié !" : "Copied!";
      setTimeout(() => { btn.textContent = original; }, 1200);
    }
  } catch (e) {
    alert(currentLang === "fr" ? "Impossible de copier." : "Copy failed.");
  }
}

// ------------------------- Utilitaires -------------------------
function compareValues(a, b, asc) {
  const na = Number(a), nb = Number(b);
  if (isFinite(na) && isFinite(nb)) return asc ? (na - nb) : (nb - na);
  if (String(a) < String(b)) return asc ? -1 : 1;
  if (String(a) > String(b)) return asc ? 1 : -1;
  return 0;
}

function formatDate(isoString) {
  if (isoString === "—") return "—";
  const dateObj = new Date(isoString);
  if (isNaN(dateObj)) return isoString;
  return dateObj.toLocaleString(currentLocale(), {
    year: '2-digit', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
    hour12: (currentLang === "en") // FR -> 24h, EN -> 12h
  });
}

function formatNumber(n) {
  const x = Number(n);
  if (!isFinite(x)) return String(n);
  return x.toLocaleString(currentLocale(), { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function titleCase(s) {
  return String(s || '')
    .split(' ')
    .map(w => w ? (w[0].toUpperCase() + w.slice(1)) : w)
    .join(' ')
    .replace("Jeweller's", "Jeweller's")
    .replace("Hinekora's", "Hinekora's");
}

function translateItemName(s) {
  // Affichage FR uniquement pour certaines currencies connues
  const eng = canonicalCurrencyName(s);
  if (currentLang === "fr" && CURRENCY_FR_MAP.has(eng)) return CURRENCY_FR_MAP.get(eng);
  return s;
}

function escapeHtml(s) {
  return String(s ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function attachSortHandlers(tableSelector, onChange) {
  const table = document.querySelector(tableSelector);
  if (!table) return;
  const ths = table.querySelectorAll('thead th');
  ths.forEach(th => {
    th.setAttribute('aria-sort', th.getAttribute('aria-sort') || 'none');
    const indicator = th.querySelector('.sort-indicator');
    if (!indicator) {
      const span = document.createElement('span');
      span.className = 'sort-indicator';
      th.appendChild(span);
    }
    th.addEventListener('click', () => {
      const key = th.getAttribute('data-sort-key');
      const current = th.getAttribute('aria-sort') || 'none';
      const next = current === 'ascending' ? 'descending' : 'ascending';
      ths.forEach(h => h.setAttribute('aria-sort', 'none'));
      th.setAttribute('aria-sort', next);
      const asc = next === 'ascending';
      onChange(key, asc);
    });
  });
}

function rerenderAll() {
  renderPreview();
  updateCurrencySplit(filteredData.length ? filteredData : rawData);
}

// Tri / date helper pour inventaire
function isNewerEvent(a, b) {
  if (!b) return true;
  if (a?._dateObj && b?._dateObj && a._dateObj.getTime() !== b._dateObj.getTime()) {
    return a._dateObj > b._dateObj;
  }
  if (Number.isFinite(a?._idNum) && Number.isFinite(b?._idNum) && a._idNum !== b._idNum) {
    return a._idNum > b._idNum;
  }
  return false;
}
