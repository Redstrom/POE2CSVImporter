
// ====== PoE Guild Loot Splitter | Inventaire final par coffre (X/Y) + Répartition des currencies (tiers distincts) ======

let rawData = [];
let filteredData = [];
let currentSortColumn = null;
let currentSortAsc = true;

window.addEventListener('load', () => {
  const csvFileInput = document.getElementById('csvFileInput');

  // ➜ IMPORT AUTO : on charge dès qu’un fichier est choisi
  csvFileInput.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  });

  // Filtres
  ['stashFilter', 'accountFilter', 'actionFilter'].forEach(id => {
    document.getElementById(id).addEventListener('change', applyFilters);
  });
  document.getElementById('itemFilterInput').addEventListener('input', applyFilters);

  // Mode inventaire / logs
  document.getElementById('inventoryMode').addEventListener('change', () => {
    populatePreviewTable(filteredData.length ? filteredData : rawData);
    updateCurrencySplit(filteredData.length ? filteredData : rawData);
  });

  // Répartition (nombre de joueurs)
  document.getElementById('playerCount').addEventListener('input', () => {
    updateCurrencySplit(filteredData.length ? filteredData : rawData);
  });
  document.getElementById('recomputeSplitBtn').addEventListener('click', () => {
    updateCurrencySplit(filteredData.length ? filteredData : rawData);
  });

  // Export
  document.getElementById('downloadCsvBtn').addEventListener('click', downloadCSV);

  // Tri par clic
  attachTableHeaderListeners();
});

// ===== I/O =====
function handleFile(file) {
  const reader = new FileReader();
  reader.onload = function (e) {
    const text = e.target.result;
    const parsed = parseCSV(text);
    if (parsed) {
      rawData = parsed;
      filteredData = [];
      populateFilterOptions(rawData);
      applyFilters(); // initialise preview + répartition
    }
  };
  reader.readAsText(file);
}

function parseCSV(csvContent) {
  const lines = csvContent.split(/\r?\n/).filter(line => line.trim().length > 0);
  if (!lines.length) return [];

  lines[0] = lines[0].replace(/^\uFEFF/, ''); // BOM
  const header = lines[0].split(',').map(col => col.trim());

  const requiredColumns = ['Date', 'Id', 'League', 'Account', 'Action', 'Stash', 'Item'];
  for (const col of requiredColumns) {
    if (!header.includes(col)) {
      alert(`Colonne requise manquante : ${col}`);
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

    // Normaliser Stash (trim)
    o.Stash = (o.Stash ?? '').trim();

    // X/Y (numériques si présents)
    o.X = Number(o.X ?? NaN);
    o.Y = Number(o.Y ?? NaN);

    // Date & Id pour tie-break du "dernier event"
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

// ===== Quantity & Name parsing =====
function extractQuantityAndName(itemRaw) {
  const s = (itemRaw ?? '').trim();

  // "NN ×|x|✕ Item"
  let m = s.match(/^\s*([0-9]+)\s*[×x✕]\s*(.+)$/i);
  if (m) return { name: m[2].trim(), qty: Number(m[1]) || 1 };

  // Suffixe: "Item xNN" ou "Item ✕NN"
  m = s.match(/\b[x✕]\s*([0-9]+)\b/i);
  if (m) {
    const qty = Number(m[1]) || 1;
    const name = s.replace(/\b[x✕]\s*[0-9]+\b/i, '').trim().replace(/\s{2,}/g, ' ');
    return { name, qty };
  }

  // "Stack Size: NN"
  m = s.match(/stack size:\s*([0-9]+)/i);
  if (m) {
    const qty = Number(m[1]) || 1;
    const name = s.replace(/stack size:\s*[0-9]+/i, '').trim().replace(/\s{2,}/g, ' ');
    return { name, qty };
  }

  // "(NN)" ou "[NN]" en fin
  m = s.match(/(?:\(|\[)\s*([0-9]+)\s*(?:\)|\])$/);
  if (m) {
    const qty = Number(m[1]) || 1;
    const name = s.replace(/(?:\(|\[)\s*[0-9]+\s*(?:\)|\])$/, '').trim();
    return { name, qty };
  }

  return { name: s, qty: 1 };
}

// ===== Détection des currencies (POE2DB) — tiers DISTINCTS =====
const CURRENCY_BASES = new Set([
  'scroll of wisdom','orb of transmutation','orb of augmentation','orb of alchemy','orb of chance',
  'regal orb','exalted orb','orb of annulment','chaos orb','divine orb','vaal orb',
  "armourer's scrap","blacksmith's whetstone","arcanist's etcher","glassblower's bauble","gemcutter's prism",
  "jeweller's orb","artificer's orb","fracturing orb","mirror of kalandra","hinekora's lock",
  'transmutation shard','chance shard','regal shard',"artificer's shard"
]);
// Réfs utiles : POE2DB “Currency” et “Currency Exchange”.
// https://poe2db.tw/us/Currency  |  https://poe2db.tw/us/Currency_Exchange

function canonicalCurrencyName(name) {
  let n = (name ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
  if (n.includes("jeweller's orb")) {
    if (n.startsWith('greater ')) return "greater jeweller's orb";
    if (n.startsWith('perfect ')) return "perfect jeweller's orb";
    if (n.startsWith('lesser '))  return "lesser jeweller's orb";
    return "jeweller's orb";
  }
  return n;
}
function isCurrency(name) {
  const n = canonicalCurrencyName(name);
  const base = n.replace(/^(greater|perfect|lesser)\s+/i, '');
  return CURRENCY_BASES.has(base);
}

// ===== Tri / date helper =====
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

// ===== Filtres =====
function populateFilterOptions(data) {
  const stashFilter = document.getElementById('stashFilter');
  const accountFilter = document.getElementById('accountFilter');
  const actionFilter = document.getElementById('actionFilter');

  clearSelectOptions(stashFilter);
  clearSelectOptions(accountFilter);
  clearSelectOptions(actionFilter);

  const stashes = [...new Set(data.map(d => d.Stash))].filter(Boolean).sort();
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
    const inStash   = (stashVal === ''   || item.Stash === stashVal);
    const inAccount = (accountVal === '' || item.Account === accountVal);
    const inAction  = (actionVal === ''  || item.Action === actionVal);
    const name      = (item.ItemName ?? item.Item ?? '').toLowerCase();
    const inName    = (itemTerm === '' || name.includes(itemTerm));
    return inStash && inAccount && inAction && inName;
  });

  populatePreviewTable(filteredData);
  updateCurrencySplit(filteredData);
}

// ===== Prévisualisation (Logs ou Inventaire) =====
function populatePreviewTable(dataInput) {
  let data = dataInput;
  if (currentSortColumn) data = sortDataByColumn(data, currentSortColumn, currentSortAsc);

  const tbody = document.querySelector('#previewTable tbody');
  tbody.innerHTML = '';

  const inventoryMode = document.getElementById('inventoryMode').checked;

  if (!inventoryMode) {
    // Mode LOGS
    data.forEach(row => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${formatDate(row.Date)}</td>
        <td>${row.Account}</td>
        <td>${row.Action}</td>
        <td>${row.Stash}</td>
        <td>${Number(row.Qty ?? 1)}</td>
        <td>${row.ItemName ?? row.Item}</td>
      `;
      tbody.appendChild(tr);
    });
    return;
  }

  // INVENTAIRE (état final) : snapshot par case (X,Y), en prenant le dernier event
  const rows = computeFinalInventoryRows(data)
    .filter(r => r.qty > 0)
    .sort((a, b) => b.qty - a.qty);

  rows.forEach(r => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="small">—</td>
      <td class="small">—</td>
      <td class="small">Inventaire (final)</td>
      <td>${r.stash || '—'}</td>
      <td>${Number(r.qty)}</td>
      <td>${r.name}</td>
    `;
    tbody.appendChild(tr);
  });
}

// ===== Inventaire final par coffre (snapshot X/Y + fallback) =====
function computeFinalInventoryRows(data) {
  const hasXY = data.some(d => Number.isFinite(d.X) && Number.isFinite(d.Y));
  if (hasXY) {
    const slots = new Map(); // key = stash@@X@@Y -> dernier event
    for (const d of data) {
      const stash = d.Stash ?? '';
      const X = Number.isFinite(d.X) ? d.X : null;
      const Y = Number.isFinite(d.Y) ? d.Y : null;
      if (X === null || Y === null) continue;
      const key = `${stash}@@${X}@@${Y}`;
      const curr = slots.get(key);
      if (isNewerEvent(d, curr)) slots.set(key, d);
    }

    const accum = new Map(); // key = name@@stash -> {name, stash, qty}
    for (const [, ev] of slots.entries()) {
      const action = String(ev.Action ?? '').toLowerCase();
      if (action.includes('rem')) continue; // removed => slot vide

      const name  = ev.ItemName ?? ev.Item ?? 'Unknown';
      const stash = ev.Stash ?? '';
      const qty   = Number(ev.Qty ?? 1);

      const key = `${name}@@${stash}`;
      const prev = accum.get(key) ?? { name, stash, qty: 0 };
      prev.qty += qty;
      accum.set(key, prev);
    }
    return [...accum.values()];
  }

  // Fallback si pas de X/Y : Ajout − Retrait (et clamp à 0)
  const map = new Map(); // key = name@@stash
  for (const d of data) {
    const name  = d.ItemName ?? d.Item ?? 'Unknown';
    const stash = d.Stash ?? '';
    const qty   = Number(d.Qty ?? 1);
    const act   = String(d.Action ?? '').toLowerCase();

    if (act.includes('add')) {
      const key = `${name}@@${stash}`;
      const prev = map.get(key) ?? { name, stash, qty: 0 };
      prev.qty += qty; map.set(key, prev);
    } else if (act.includes('rem') || act.includes('withdraw') || act.includes('take')) {
      const key = `${name}@@${stash}`;
      const prev = map.get(key) ?? { name, stash, qty: 0 };
      prev.qty -= qty; map.set(key, prev);
    } else if (act.includes('mod')) {
      // sans X/Y on ne peut pas quantifier un "modified"
      continue;
    }
  }
  return [...map.values()].map(r => ({ ...r, qty: Math.max(0, Number(r.qty) || 0) }));
}

// ===== Répartition des currencies (tiers distincts, division entière + reste) =====
function updateCurrencySplit(dataInput) {
  const playerCount = Math.max(1, Number(document.getElementById('playerCount').value) || 1);

  const invRows = computeFinalInventoryRows(dataInput);

  const totals = new Map();
  for (const r of invRows) {
    const can = canonicalCurrencyName(r.name);
    if (!isCurrency(can)) continue;
    const qty = Number(r.qty) || 0;
    if (qty <= 0) continue;
    totals.set(can, (totals.get(can) ?? 0) + qty);
  }

  const tbody = document.querySelector('#currencySplitTable tbody');
  tbody.innerHTML = '';
  const rows = [...totals.entries()].sort((a, b) => b[1] - a[1]);
  rows.forEach(([item, total]) => {
    const perPlayer = Math.floor(total / playerCount);
    const remainder = total % playerCount;
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escapeHtml(titleCase(item))}</td>
      <td>${formatNumber(total)}</td>
      <td>${formatNumber(perPlayer)}</td>
      <td>${formatNumber(remainder)}</td>
    `;
    tbody.appendChild(tr);
  });
}

// ===== Utilitaires =====
function formatDate(isoString) {
  const dateObj = new Date(isoString);
  if (isNaN(dateObj)) return isoString;
  const monthStr = String(dateObj.getMonth() + 1).padStart(2, '0');
  const dayStr = String(dateObj.getDate()).padStart(2, '0');
  const yearStr = String(dateObj.getFullYear()).slice(-2);
  let hours = dateObj.getHours();
  const minutesStr = String(dateObj.getMinutes()).padStart(2, '0');
  const amPm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12 || 12;
  return `${monthStr}/${dayStr}/${yearStr} ${hours}:${minutesStr} ${amPm}`;
}

function downloadCSV() {
  const dataToExport = filteredData && filteredData.length ? filteredData : rawData;
  if (!dataToExport.length) {
    alert('Aucune donnée à exporter.');
    return;
  }
  const header = Object.keys(dataToExport[0]);
  const csvRows = [header.join(',')];
  for (const row of dataToExport) {
    const values = header.map(key => {
      const v = row[key] ?? '';
      const s = String(v).replace(/"/g, '""');
      return `"${s}"`;
    });
    csvRows.push(values.join(','));
  }
  const csvString = csvRows.join('\n');
  const blob = new Blob([csvString], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', 'exported_data.csv');
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function attachTableHeaderListeners() {
  const headers = document.querySelectorAll('#previewTable thead th');
  const columns = ['Date', 'Account', 'Action', 'Stash', 'Quantité', 'Item'];
  headers.forEach((th, idx) => {
    th.addEventListener('click', () => {
      const column = columns[idx];
      if (currentSortColumn === column) currentSortAsc = !currentSortAsc;
      else { currentSortColumn = column; currentSortAsc = true; }
      populatePreviewTable(filteredData.length ? filteredData : rawData);
    });
  });
}

function sortDataByColumn(data, column, asc) {
  const colMap = { 'Quantité': 'Qty', 'Item': 'ItemName', 'Date': 'Date', 'Account': 'Account', 'Action': 'Action', 'Stash': 'Stash' };
  const key = colMap[column] ?? column;
  return [...data].sort((a, b) => {
    const av = a[key] ?? '';
    const bv = b[key] ?? '';
    const na = Number(av), nb = Number(bv);
    if (isFinite(na) && isFinite(nb)) return asc ? (na - nb) : (nb - na);
    if (av < bv) return asc ? -1 : 1;
    if (av > bv) return asc ? 1 : -1;
    return 0;
  });
}

function escapeHtml(s) {
  return String(s ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function formatNumber(n) {
  const x = Number(n);
  if (!isFinite(x)) return String(n);
  return x.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function titleCase(s) {
  return String(s || '')
    .split(' ')
    .map(w => w ? (w[0].toUpperCase() + w.slice(1)) : w)
    .join(' ')
    .replace("Jeweller's", "Jeweller's")
    .replace("Hinekora's", "Hinekora's");
}
