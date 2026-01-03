
// =============================
// Données & état global
// =============================
let rawData = [];
let filteredData = [];

let currentSortColumn = null;
let currentSortAsc = true;

let timelineChart, barChart, pieChart, heatmapChart;

window.addEventListener('load', () => {
  // Bouton import CSV
  const uploadBtn = document.getElementById('uploadBtn');
  const csvFileInput = document.getElementById('csvFileInput');
  uploadBtn.addEventListener('click', () => {
    const file = csvFileInput.files[0];
    if (file) {
      handleFile(file);
    } else {
      alert('Please select a CSV file first.');
    }
  });

  // Filtres
  const stashFilter = document.getElementById('stashFilter');
  const accountFilter = document.getElementById('accountFilter');
  const actionFilter = document.getElementById('actionFilter');

  stashFilter.addEventListener('change', () => {
    applyFilters();
    // Sync vers Farm splitting
    document.getElementById('splitStashSel').value = stashFilter.value;
    recomputeSplit();
  });
  accountFilter.addEventListener('change', applyFilters);
  actionFilter.addEventListener('change', applyFilters);

  // Export CSV / PNG
  document.getElementById('downloadCsvBtn').addEventListener('click', downloadCSV);
  document.getElementById('downloadPngBtn').addEventListener('click', downloadPNG);

  // Tri tableau
  attachTableHeaderListeners();

  // i18n & tabs
  const langSelect = document.getElementById('langSelect');
  langSelect.value = CURRENT_LANG;
  langSelect.addEventListener('change', () => {
    CURRENT_LANG = langSelect.value;
    localStorage.setItem('lang', CURRENT_LANG);
    applyI18N();
  });

  document.querySelectorAll('.tabBtn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      document.querySelectorAll('.tabPage').forEach(p => p.style.display = 'none');
      document.getElementById(tab).style.display = 'block';
    });
  });

  applyI18N();

  // Farm splitting
  document.getElementById('btnRecompute').addEventListener('click', recomputeSplit);
  document.getElementById('btnExportAlloc').addEventListener('click', exportAllocationCsv);
  document.getElementById('guildCsvInput').addEventListener('change', importGuildCsvFile);

  // Guild helpers
  document.getElementById('btnExtractGuildId').addEventListener('click', () => {
    const url = document.getElementById('guildUrlInput').value.trim();
    const id = extractGuildIdFromUrl(url);
    if (!id) { alert('Guild ID not found in URL'); return; }
    document.getElementById('guildIdInput').value = id;
  });
  document.getElementById('btnOpenGuildCSV').addEventListener('click', () => {
    const id = document.getElementById('guildIdInput').value.trim();
    if (!id) { alert('Enter your Guild ID'); return; }
    const u = `https://www.pathofexile.com/guild/profile/${id}/stash-history`;
    window.open(u, '_blank');
  });

  // Génère le bookmarklet
  buildBookmarklet();

  // Réception du CSV via window.name (depuis le bookmarklet)
  receiveBookmarkletCsv();
});

// =============================
// Bookmarklet (récolte CSV côté PoE)
// =============================
function buildBookmarklet(){
  // ⚠️ Remplace par l’URL de ton site (GitHub Pages) :
  const TARGET = 'https://redstrom.github.io/POE2CSVImporter/'; //

  const code =
"(function(){function g(){var a=document.querySelectorAll('a,button');for(var i=0;i<a.length;i++){var el=a[i];var t=(el.textContent||'');if(/csv|download/i.test(t)&&el.href)return el.href;}try{var u=new URL(location.href);if(!/stash-history/.test(u.pathname)){alert('Open your Guild → Stash History first.');return null;}u.searchParams.set('format','csv');return u.toString();}catch(e){return null;}}var href=g();if(!href){alert('CSV link not found on this page.');return;}fetch(href,{credentials:'include'}).then(function(r){if(!r.ok)throw new Error('HTTP '+r.status);return r.text();}).then(function(csv){window.name=csv;location.href='" + TARGET + "#from=poe';}).catch(function(err){alert('CSV fetch failed: '+err);});})();";

  const a = document.getElementById('bookmarkletLink');
  a.setAttribute('href', 'javascript:' + code);
}

// Réception du CSV déposé dans window.name par le bookmarklet
function receiveBookmarkletCsv(){
  try {
    const hash = (location.hash || '').toLowerCase();
    if (hash.includes('from=poe') && window.name && window.name.length > 0) {
      const text = window.name;
      window.name = ''; // purge
      const parsed = parseCSV(text);
      if (!parsed || !parsed.length) { alert('CSV reçu vide.'); return; }
      rawData = parsed;
      filteredData = [];
      populatePreviewTable(rawData);
      populateFilterOptions(rawData);
      updateAllCharts(rawData);
      syncSplitStashSelect();
      // Ouvre l’onglet Farm splitting
      document.querySelectorAll('.tabPage').forEach(p => p.style.display='none');
      document.getElementById('tabSplit').style.display='block';
      recomputeSplit();
    }
  } catch(e) {
    console.warn('Receive bookmarklet CSV error:', e);
  }
}

// Import manuel du CSV de guilde (si l’utilisateur l’a téléchargé)
async function importGuildCsvFile(e){
  const file = e.target.files[0];
  if (!file) return;
  const text = await file.text();
  const parsed = parseCSV(text);
  if (!parsed){ alert('CSV invalid'); return; }
  rawData = parsed;
  filteredData = [];
  populatePreviewTable(rawData);
  populateFilterOptions(rawData);
  updateAllCharts(rawData);
  syncSplitStashSelect();
}

// =============================
// i18n (Fr/En)
// =============================
const I18N = {
  en: {
    appTitle: "PoE Guild Chest Analyzer",
    language: "Language",
    upload: "Upload CSV File",
    filters: "Filters",
    stash: "Stash",
    account: "Account",
    action: "Action",
    preview: "Preview",
    viz: "Data Visualizations",
    splitTitle: "Farm splitting",
    splitDesc: "Shows how to split what remains in the selected stash at the time of CSV export.",
    splitStash: "Stash",
    splitMode: "Mode",
    splitEqual: "Equal split",
    splitWeighted: "Weighted by contributions",
    recompute: "Recompute",
    exportAlloc: "Export allocation (.csv)",
    remainder: "Remainder (by currency)",
    allocation: "Allocation per player",
    thDate: "Date", thAccount: "Account", thAction: "Action", thStash: "Stash", thItem: "Item",
    guildUrl: "Guild URL",
    guildId: "Guild ID",
    openGuildCsv: "Open Stash History (CSV)",
    importGuildCsv: "Import guild CSV"
  },
  fr: {
    appTitle: "Analyseur de Coffre de Guilde PoE",
    language: "Langue",
    upload: "Importer un fichier CSV",
    filters: "Filtres",
    stash: "Coffre (Stash)",
    account: "Compte",
    action: "Action",
    preview: "Aperçu",
    viz: "Visualisations",
    splitTitle: "Farm splitting",
    splitDesc: "Affiche la répartition de ce qu’il reste dans le stash sélectionné à la date d’extraction du CSV.",
    splitStash: "Stash",
    splitMode: "Mode",
    splitEqual: "Part égale",
    splitWeighted: "Pondérée par contributions",
    recompute: "Recalculer",
    exportAlloc: "Exporter l’allocation (.csv)",
    remainder: "Reste (par currency)",
    allocation: "Allocation par joueur",
    thDate: "Date", thAccount: "Compte", thAction: "Action", thStash: "Stash", thItem: "Item",
    guildUrl: "URL de la guilde",
    guildId: "ID de la guilde",
    openGuildCsv: "Ouvrir Stash History (CSV)",
    importGuildCsv: "Importer CSV de guilde"
  }
};
let CURRENT_LANG = localStorage.getItem('lang') || 'en';
function t(key){ return (I18N[CURRENT_LANG]||I18N.en)[key] || key; }
function applyI18N(){
  document.getElementById('appTitle').textContent = t('appTitle');
  document.getElementById('lblLanguage').textContent = t('language');
  document.getElementById('lblUpload').textContent = t('upload');
  document.getElementById('lblFilters').textContent = t('filters');
  document.getElementById('lblStash').textContent = t('stash');
  document.getElementById('lblAccount').textContent = t('account');
  document.getElementById('lblAction').textContent = t('action');
  document.getElementById('lblPreview').textContent = t('preview');
  document.getElementById('thDate').textContent = t('thDate');
  document.getElementById('thAccount').textContent = t('thAccount');
  document.getElementById('thAction').textContent = t('thAction');
  document.getElementById('thStash').textContent = t('thStash');
  document.getElementById('thItem').textContent = t('thItem');
  document.getElementById('lblViz').textContent = t('viz');
  document.getElementById('lblSplitTitle').textContent = t('splitTitle');
  document.getElementById('lblSplitDesc').textContent = t('splitDesc');
  document.getElementById('lblSplitStash').textContent = t('splitStash');
  document.getElementById('lblSplitMode').textContent = t('splitMode');
  document.querySelector('#splitModeSel option[value="equal"]').textContent = t('splitEqual');
  document.querySelector('#splitModeSel option[value="weighted"]').textContent = t('splitWeighted');
  document.getElementById('btnRecompute').textContent = t('recompute');
  document.getElementById('btnExportAlloc').textContent = t('exportAlloc');
  document.getElementById('lblRemainder').textContent = t('remainder');
  document.getElementById('lblAllocation').textContent = t('allocation');
  document.getElementById('lblGuildUrl').textContent = t('guildUrl');
  document.getElementById('lblGuildId').textContent = t('guildId');
  document.getElementById('btnOpenGuildCSV').textContent = t('openGuildCsv');
  document.getElementById('lblGuildCsv').textContent = t('importGuildCsv');
}

// =============================
// Lecture CSV & tableau
// =============================
function handleFile(file){
  const reader = new FileReader();
  reader.onload = function (e) {
    const text = e.target.result;
    const parsed = parseCSV(text);
    if (parsed) {
      rawData = parsed;
      filteredData = [];
      populatePreviewTable(rawData);
      populateFilterOptions(rawData);
      updateAllCharts(rawData);
      syncSplitStashSelect();
    }
  };
  reader.readAsText(file);
}

// Parseur CSV simple (assume séparateur virgule, lignes CR/LF)
function parseCSV(csvContent){
  const lines = csvContent.split(/\r?\n/).filter(l => l.trim().length>0);
  // BOM
  lines[0] = lines[0].replace(/^\uFEFF/, '');
  const header = lines[0].split(',').map(col => col.trim());
  const required = ['Date', 'Id', 'League', 'Account', 'Action', 'Stash', 'Item'];
  for (const col of required){
    if (!header.includes(col)){
      // Certains CSV de guilde ont l’entête légèrement différent : on essaie de continuer
      console.warn('Missing column:', col);
    }
  }
  const data = [];
  for (let i=1; i<lines.length; i++){
    const row = splitCSVLine(lines[i]);
    if (row.length !== header.length){
      // tenter un fallback naïf
      console.warn('Skipping malformed row:', lines[i]);
      continue;
    }
    const obj = {};
    for (let j=0; j<header.length; j++){
      obj[header[j]] = stripOuterQuotes(row[j]);
    }
    data.push(obj);
  }
  return data;
}

// Split CSV line handling simple quotes
function splitCSVLine(line){
  const out = [];
  let cur = '';
  let inQuotes = false;
  for (let i=0;i<line.length;i++){
    const ch = line[i];
    if (ch === '"'){
      // toggle or escaped
      if (inQuotes && line[i+1] === '"'){ cur += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes){
      out.push(cur); cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}
function stripOuterQuotes(v){
  return String(v).replace(/^"(.*)"$/,'$1');
}

function populatePreviewTable(data){
  if (currentSortColumn){
    data = sortDataByColumn(data, currentSortColumn, currentSortAsc);
  }
  const tbody = document.querySelector('#previewTable tbody');
  tbody.innerHTML = '';
  data.forEach(row => {
    const formattedDate = formatDate(row.Date);
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${formattedDate}</td>
      <td>${row.Account}</td>
      <td>${row.Action}</td>
      <td>${row.Stash}</td>
      <td>${row.Item}</td>
    `;
    tbody.appendChild(tr);
  });
}

function formatDate(isoString){
  const s = String(isoString).replace(/^\uFEFF/,'');
  const d = new Date(s);
  if (isNaN(d)) return isoString;
  let month = d.getMonth()+1, day = d.getDate(), year = d.getFullYear();
  let hours = d.getHours(), minutes = d.getMinutes();
  const amPm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12 || 12;
  const mm = String(month).padStart(2,'0');
  const dd = String(day).padStart(2,'0');
  const yy = String(year).slice(-2);
  const hh = String(hours);
  const mi = String(minutes).padStart(2,'0');
  return `${mm}/${dd}/${yy} ${hh}:${mi} ${amPm}`;
}

function populateFilterOptions(data){
  const stashFilter = document.getElementById('stashFilter');
  const accountFilter = document.getElementById('accountFilter');
  const actionFilter = document.getElementById('actionFilter');
  clearSelectOptions(stashFilter);
  clearSelectOptions(accountFilter);
  clearSelectOptions(actionFilter);

  const stashes = [...new Set(data.map(d => d.Stash))].filter(Boolean);
  const accounts = [...new Set(data.map(d => d.Account))].filter(Boolean);
  const actions  = [...new Set(data.map(d => d.Action))].filter(Boolean);

  stashes.forEach(st => stashFilter.appendChild(newOption(st)));
  accounts.forEach(a => accountFilter.appendChild(newOption(a)));
  actions.forEach(a => actionFilter.appendChild(newOption(a)));
}
function newOption(v){ const o=document.createElement('option'); o.value=v; o.textContent=v; return o; }
function clearSelectOptions(sel){ while(sel.options.length>1){ sel.remove(1); } }

function applyFilters(){
  const stashVal = document.getElementById('stashFilter').value;
  const accountVal = document.getElementById('accountFilter').value;
  const actionVal = document.getElementById('actionFilter').value;
  filteredData = rawData.filter(item => (
    (stashVal==='' || item.Stash === stashVal) &&
    (accountVal==='' || item.Account === accountVal) &&
    (actionVal==='' || item.Action === actionVal)
  ));
  populatePreviewTable(filteredData);
  updateAllCharts(filteredData);
}

function attachTableHeaderListeners(){
  const headers = document.querySelectorAll('#previewTable thead th');
  const columns = ['Date','Account','Action','Stash','Item'];
  headers.forEach((th, idx) => {
    th.addEventListener('click', () => {
      const column = columns[idx];
      if (currentSortColumn === column) currentSortAsc = !currentSortAsc;
      else { currentSortColumn = column; currentSortAsc = true; }
      populatePreviewTable(filteredData.length ? filteredData : rawData);
    });
  });
}
function sortDataByColumn(data, column, asc){
  return [...data].sort((a,b) => {
    if (a[column] < b[column]) return asc ? -1 : 1;
    if (a[column] > b[column]) return asc ? 1 : -1;
    return 0;
  });
}

// =============================
// Visualisations (Chart.js)
// =============================
function updateAllCharts(data){
  if (timelineChart) timelineChart.destroy();
  if (barChart)      barChart.destroy();
  if (pieChart)      pieChart.destroy();
  if (heatmapChart)  heatmapChart.destroy();
  createTimelineChart(data);
  createBarChart(data);
  createPieChart(data);
  createHeatmapChart(data);
}
function createTimelineChart(data){
  const ctx = document.getElementById('timelineChart').getContext('2d');
  const grouped = {};
  data.forEach(d => {
    const dateKey = d.Date;
    if(!grouped[dateKey]) grouped[dateKey] = {};
    if(!grouped[dateKey][d.League]) grouped[dateKey][d.League] = 0;
    grouped[dateKey][d.League]++;
  });
  const labels = Object.keys(grouped).sort();
  const leagueSet = [...new Set(data.map(d => d.League))];
  const datasets = leagueSet.map(league => ({
    label: league, data: labels.map(date => grouped[date][league] || 0),
    backgroundColor: randomColor(), stack: 'TimelineStack'
  }));
  timelineChart = new Chart(ctx, {
    type:'bar',
    data:{ labels, datasets },
    options:{
      responsive:true,
      scales:{ x:{ stacked:true }, y:{ stacked:true, beginAtZero:true } },
      plugins:{ tooltip:{ callbacks:{ label:(c)=>`${c.dataset.label||''}: ${c.parsed.y}` } } }
    }
  });
}
function createBarChart(data){
  const ctx = document.getElementById('barChart').getContext('2d');
  const actionCount = {};
  data.forEach(d => {
    const a = d.Action;
    actionCount[a] = (actionCount[a] || 0) + 1;
  });
  const labels = Object.keys(actionCount);
  const values = Object.values(actionCount);
  barChart = new Chart(ctx, {
    type:'bar',
    data:{ labels, datasets:[{ label:'Action Frequency', data:values, backgroundColor: labels.map(()=>randomColor()) }] },
    options:{ indexAxis:'y', scales:{ x:{ beginAtZero:true } },
      plugins:{ tooltip:{ callbacks:{ label:(c)=>`${c.dataset.label}: ${c.parsed.x}` } } } }
  });
}
function createPieChart(data){
  const ctx = document.getElementById('pieChart').getContext('2d');
  const accountCount = {};
  data.forEach(d => {
    const a = d.Account;
    accountCount[a] = (accountCount[a] || 0) + 1;
  });
  const labels = Object.keys(accountCount);
  const values = Object.values(accountCount);
  pieChart = new Chart(ctx, {
    type:'pie',
    data:{ labels, datasets:[{ label:'Account Distribution', data:values, backgroundColor: labels.map(()=>randomColor()) }] },
    options:{ plugins:{ tooltip:{ callbacks:{ label:(c)=>`${c.label||''}: ${c.parsed}` } } } }
  });
}
function createHeatmapChart(data){
  const ctx = document.getElementById('heatmapChart').getContext('2d');
  const daily = {};
  data.forEach(d => {
    let datePart = String(d.Date).split(' ')[0];
    let timePart = (String(d.Date).split(' ')[1] || '00:00').split(':')[0];
    let hour = parseInt(timePart,10) || 0;
    if (!daily[datePart]) daily[datePart] = Array(24).fill(0);
    daily[datePart][hour]++;
  });
  const dates = Object.keys(daily).sort();
  const datasets = [];
  for (let h=0; h<24; h++){
    datasets.push({ label:`Hour ${h}`, data: dates.map(date => daily[date][h] || 0),
      backgroundColor: randomColor(), stack:'HeatmapStack' });
  }
  heatmapChart = new Chart(ctx, {
    type:'bar',
    data:{ labels:dates, datasets },
    options:{ scales:{ x:{ stacked:true }, y:{ stacked:true, beginAtZero:true } },
      plugins:{ tooltip:{ callbacks:{ label:(c)=>`Hour ${c.datasetIndex}: ${c.parsed.y}` } } } }
  });
}
function randomColor(){
  const r = Math.floor(Math.random()*200);
  const g = Math.floor(Math.random()*200);
  const b = Math.floor(Math.random()*200);
  return `rgba(${r},${g},${b},0.6)`;
}

function downloadCSV(){
  const dataToExport = filteredData && filteredData.length ? filteredData : rawData;
  if (!dataToExport.length){ alert('No data to export.'); return; }
  const header = Object.keys(dataToExport[0]);
  const csvRows = [header.join(',')];
  for (const row of dataToExport){
    const vals = header.map(k => safeCSV(row[k]));
    csvRows.push(vals.join(','));
  }
  const csv = csvRows.join('\n');
  triggerDownload(csv, 'exported_data.csv', 'text/csv');
}
function safeCSV(v){
  const s = String(v??'');
  if (s.includes(',') || s.includes('"') || s.includes('\n')) return `"${s.replace(/"/g,'""')}"`;
  return s;
}
function downloadPNG(){
  if (!timelineChart){ alert('No chart available to download.'); return; }
  const url = timelineChart.toBase64Image('image/png', 1);
  triggerDownload(url, 'chart.png', null, true);
}
function triggerDownload(content, filename, mime, isDataUrl=false){
  const a = document.createElement('a');
  if (isDataUrl){
    a.href = content;
  } else {
    const blob = new Blob([content], {type:mime||'application/octet-stream'});
    a.href = URL.createObjectURL(blob);
  }
  a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  if (!isDataUrl) URL.revokeObjectURL(a.href);
}

// =============================
// Farm splitting (reste & allocation)
// =============================

// Liste des currencies (à étendre selon besoins)
const CURRENCY_TERMS = [
  'Chaos Orb','Exalted Orb','Divine Orb','Vaal Orb','Orb of Chance','Orb of Alchemy',
  "Gemcutter's Prism",'Regal Orb',"Jeweller's Orb","Armourer's Scrap","Blacksmith's Whetstone",
  "Glassblower's Bauble","Artificer's Orb",'Orb of Annulment',
  // PoE2 variants (exemples)
  'Greater Chaos Orb','Greater Regal Orb','Greater Exalted Orb',"Greater Jeweller's Orb",
  'Greater Orb of Augmentation','Greater Orb of Transmutation',
  'Perfect Chaos Orb',"Perfect Jeweller's Orb",'Perfect Regal Orb','Perfect Exalted Orb',
  'Perfect Orb of Augmentation','Perfect Orb of Transmutation',
];
const qtyRe = /^(\d+)\×\s*/; // "10× ..."
const curRe = new RegExp('(' + CURRENCY_TERMS.map(s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')');

function detectCurrency(itemText){
  if (!itemText) return null;
  const mQty = String(itemText).match(qtyRe);
  const qty = mQty ? Number(mQty[1]) : 1;
  const mCur = String(itemText).match(curRe);
  if (!mCur) return null;
  return { currency: mCur[1], qty };
}

// Reste = sum(added) - sum(removed) par currency, dans un stash (ignore "modified")
function computeChestRemainder(rows, stashName){
  const sessionRows = rows.filter(r => String(r.Stash) === String(stashName));
  const totals = {};
  for (const r of sessionRows){
    const cur = detectCurrency(r.Item);
    if (!cur) continue;
    const sign = (r.Action === 'added') ? +1 : (r.Action === 'removed') ? -1 : 0;
    if (!sign) continue;
    totals[cur.currency] = (totals[cur.currency] || 0) + sign * cur.qty;
  }
  Object.keys(totals).forEach(k => { if (!totals[k] || totals[k] < 0) delete totals[k]; });
  return totals;
}

// Contributeurs = comptes avec au moins un "added"
function getContributors(rows, stashName){
  const sessionRows = rows.filter(r => String(r.Stash) === String(stashName));
  const set = new Set();
  const counts = {};
  for (const r of sessionRows){
    if (r.Action === 'added'){
      set.add(r.Account);
      counts[r.Account] = (counts[r.Account] || 0) + 1; // pondération par #lignes ajoutées
    }
  }
  return { contributors: Array.from(set), contribCounts: counts };
}

function computeDistribution(rows, stashName, mode, remainder){
  const { contributors, contribCounts } = getContributors(rows, stashName);
  const depCount = contributors.length || 1;
  const sumContrib = Object.values(contribCounts).reduce((a,b)=>a+b,0) || 1;
  const weights = Object.fromEntries(contributors.map(acc => [acc, (contribCounts[acc]||0)/sumContrib]));

  const currencies = Object.keys(remainder);
  const head = ['Account', ...currencies.map(c => `${c} (${mode})`)];
  const body = contributors.map(acc => {
    const row = { Account: acc };
    currencies.forEach(c => {
      const tot = remainder[c] || 0;
      row[`${c} (${mode})`] = (mode === 'equal') ? (tot/depCount) : (tot * (weights[acc]||0));
    });
    return row;
  });
  return { head, body, contributors, contribCounts };
}

// UI Farm splitting
function syncSplitStashSelect(){
  const splitSel = document.getElementById('splitStashSel');
  splitSel.innerHTML = '';
  const stashes = [...new Set((rawData||[]).map(d=>d.Stash))].filter(Boolean);
  stashes.forEach(st => splitSel.appendChild(newOption(st)));
}

function recomputeSplit(){
  const stashName = document.getElementById('splitStashSel').value || document.getElementById('stashFilter').value;
  if (!stashName) { alert('Sélectionne un stash'); return; }
  const mode = document.getElementById('splitModeSel').value;

  const rows = (filteredData && filteredData.length) ? filteredData : rawData;
  const remainder = computeChestRemainder(rows, stashName);
  renderRemainderTable(remainder);
  const dist = computeDistribution(rows, stashName, mode, remainder);
  renderAllocationTable(dist);
}

function renderRemainderTable(remainder){
  const head = document.getElementById('remainderHead');
  const body = document.getElementById('remainderBody');
  head.innerHTML = '';
  body.innerHTML = '';

  const currencies = Object.keys(remainder);
  head.innerHTML = `<th>Currency</th><th>Qty</th>`;
  if (currencies.length === 0){
    body.innerHTML = `<tr><td colspan="2" style="text-align:center;">—</td></tr>`;
    return;
  }
  currencies.forEach(c => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${c}</td><td>${remainder[c]}</td>`;
    body.appendChild(tr);
  });
}

function renderAllocationTable(dist){
  const head = document.getElementById('allocationHead');
  const body = document.getElementById('allocationBody');
  head.innerHTML = '';
  body.innerHTML = '';

  dist.head.forEach(h => {
    const th = document.createElement('th'); th.textContent = h; head.appendChild(th);
  });
  dist.body.forEach(row => {
    const tr = document.createElement('tr');
    const cells = Object.keys(row).map(k => row[k]);
    cells.forEach(v => {
      const td = document.createElement('td');
      td.textContent = (typeof v === 'number') ? (Number.isInteger(v)? v : v.toFixed(2)) : v;
      tr.appendChild(td);
    });
    body.appendChild(tr);
  });
}

function exportAllocationCsv(){
  const head = Array.from(document.querySelectorAll('#allocationHead th')).map(th=>th.textContent);
  const rows = Array.from(document.querySelectorAll('#allocationBody tr')).map(tr=>{
    return Array.from(tr.children).map(td=>td.textContent);
  });
  if (!rows.length){ alert('No allocation to export.'); return; }
  const csv = [head, ...rows].map(r => r.join(',')).join('\n');
  triggerDownload(csv, 'allocation.csv', 'text/csv');
}

// =============================
// Helpers de guilde (ID, URL)
// =============================
function extractGuildIdFromUrl(url){
  const m = String(url).match(/\/guild\/profile\/(\d+)/);
  return m ? m[1] : null;
}
