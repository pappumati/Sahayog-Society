// =====================================================
// Reports
// Every kind of record (members, share collections, penalties,
// loans, each disbursement date, interest ledger, year-end
// payouts) as an on-screen table AND an Excel export.
// The Excel library (SheetJS) is only downloaded the first time
// an export button is tapped, so the app itself stays fast.
// =====================================================

const REPORTS = [
  {id:'balance-sheet',       sheet:'Balance Sheet',       scope:'year',  title:'Balance Sheet (Month-wise + Total)',  build: buildBalanceSheetReport},
  {id:'collection-register', sheet:'Collection Register', scope:'year',  title:'Collection Register (Member × Month)', build: buildCollectionRegisterReport},
  {id:'month-collection',    sheet:'Month Collection',    scope:'month', title:'Monthly Share Collection',            build: buildMonthCollectionReport},
  {id:'member-wise',         sheet:'Member-wise',         scope:'year',  title:'Member-wise Collection',              build: buildMemberWiseReport},
  {id:'penalties',           sheet:'Penalties',           scope:'year',  title:'Penalties',                           build: buildPenaltiesReport},
  {id:'members',             sheet:'Members',             scope:'none',  title:'Members Register',                    build: buildMembersReport},
  {id:'loan-register',       sheet:'Loan Register',       scope:'none',  title:'Loan Register',                       build: buildLoanRegisterReport},
  {id:'loan-disbursements',  sheet:'Loan Disbursements',  scope:'year',  title:'Loan Disbursements (each date)',      build: buildLoanDisbursementsReport},
  {id:'loan-ledger',         sheet:'Loan Ledger',         scope:'year',  title:'Loan Interest & Repayment Ledger',    build: buildLoanLedgerReport},
  {id:'year-end',            sheet:'Year-End Payouts',    scope:'year',  title:'Year-End Payouts',                    build: buildYearEndReport}
];

// ---------- small helpers ----------
const rnd = v => Math.round((Number(v) || 0) * 100) / 100;
function sumOf(list, fn){ return rnd(list.reduce((s,x)=> s + (Number(fn(x)) || 0), 0)); }
const byName = (a,b)=> String(a.memberName || '').localeCompare(String(b.memberName || ''));

function todayISO(){
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function fmtDMY(iso){
  if(!iso) return '';
  const [y,m,d] = String(iso).slice(0,10).split('-').map(Number);
  if(!y || !m || !d) return String(iso);
  return `${String(d).padStart(2,'0')}-${EN_MONTHS[m].slice(0,3)}-${y}`;
}
function shortMonth(key){
  const [y,m] = key.split('-').map(Number);
  return `${EN_MONTHS[m].slice(0,3)}-${String(y).slice(2)}`;
}
// Every dated amount that makes up a loan (older loans have just one).
function loanDisbursements(l){
  const list = (l.disbursements && l.disbursements.length)
    ? l.disbursements
    : [{amount: l.principal, date: l.dateIssued}];
  return [...list].sort((a,b)=> String(a.date||'').localeCompare(String(b.date||'')));
}
function societyYearOptions(){
  const y = parseInt(societyYearOf(new Date()).split('-')[0]);
  return [0,1,2].map(i => `${y-i}-${y-i+1}`);
}

// ---------- data fetching (with an optional short-lived cache so the
// full-year workbook doesn't re-read the same collection repeatedly) ----------
let _fetchCache = null;
async function rptFetchAll(col){
  const key = 'all:' + col;
  if(_fetchCache && _fetchCache[key]) return _fetchCache[key];
  const snap = await db.collection(col).get();
  const data = snap.docs.map(d=>({id:d.id, ...d.data()}));
  if(_fetchCache) _fetchCache[key] = data;
  return data;
}
async function rptFetchByYear(col, yearId){
  const key = col + ':' + yearId;
  if(_fetchCache && _fetchCache[key]) return _fetchCache[key];
  const snap = await db.collection(col).where('yearId','==',yearId).get();
  const data = snap.docs.map(d=>({id:d.id, ...d.data()}));
  if(_fetchCache) _fetchCache[key] = data;
  return data;
}

// =====================================================
// Report builders — each returns {headers, rows, totals, note}
// =====================================================
async function buildMembersReport(){
  const members = await getMembers();
  const rows = members.map((m,i)=>[
    i+1, m.name, m.phone || '', m.sharesCount || 0,
    rnd((m.sharesCount||0) * SOCIETY.shareValue),
    fmtDMY(m.joinDate), m.active === false ? 'Inactive' : 'Active', m.address || ''
  ]);
  const totals = ['', 'TOTAL', '', sumOf(members,m=>m.sharesCount),
    sumOf(members,m=>(m.sharesCount||0)*SOCIETY.shareValue), '', '', ''];
  return {
    headers:['#','Member Name','Phone','Shares','Monthly Contribution (₹)','Joined','Status','Address'],
    rows, totals
  };
}

async function buildMonthCollectionReport(mKey){
  const list = await getContributionsForMonth(mKey);
  const rows = list.map((c,i)=>{
    const penalty = rnd(c.penaltyAmount || 0);
    const total = rnd(c.amountDue + penalty);
    const paid = rnd(c.amountPaid || 0);
    return [i+1, c.memberName, c.sharesAtTime, rnd(c.amountDue), penalty, total, paid,
            rnd(Math.max(total - paid, 0)), c.status, fmtDMY(c.paidDate)];
  });
  const totals = ['', 'TOTAL', sumOf(rows,r=>r[2]), sumOf(rows,r=>r[3]), sumOf(rows,r=>r[4]),
    sumOf(rows,r=>r[5]), sumOf(rows,r=>r[6]), sumOf(rows,r=>r[7]), '', ''];
  return {
    headers:['#','Member','Shares','Share Due (₹)','Penalty (₹)','Total Due (₹)','Paid (₹)','Balance (₹)','Status','Paid On'],
    rows, totals,
    note: list.length ? '' : 'No records for this month yet — open the Shares tab and load this month once to generate the dues.'
  };
}

async function buildMemberWiseReport(yearId){
  const contribs = await rptFetchByYear('contributions', yearId);
  const by = {};
  contribs.forEach(c=>{
    const b = by[c.memberId] = by[c.memberId] || {name:c.memberName, shares:0, months:0, due:0, penalty:0, paid:0};
    b.shares = Math.max(b.shares, c.sharesAtTime || 0);
    b.months += 1;
    b.due += c.amountDue || 0;
    b.penalty += c.penaltyAmount || 0;
    b.paid += c.amountPaid || 0;
  });
  const list = Object.values(by).sort((a,b)=> a.name.localeCompare(b.name));
  const rows = list.map((m,i)=>[
    i+1, m.name, m.shares, m.months, rnd(m.due), rnd(m.penalty), rnd(m.due + m.penalty),
    rnd(m.paid), rnd(Math.max(m.due + m.penalty - m.paid, 0))
  ]);
  const totals = ['', 'TOTAL', '', '', sumOf(rows,r=>r[4]), sumOf(rows,r=>r[5]),
    sumOf(rows,r=>r[6]), sumOf(rows,r=>r[7]), sumOf(rows,r=>r[8])];
  return {
    headers:['#','Member','Shares','Months Billed','Share Due (₹)','Penalty (₹)','Total Due (₹)','Paid (₹)','Pending (₹)'],
    rows, totals
  };
}

async function buildCollectionRegisterReport(yearId){
  const months = societyYearMonths(yearId);
  const contribs = await rptFetchByYear('contributions', yearId);
  const by = {};
  contribs.forEach(c=>{
    const b = by[c.memberId] = by[c.memberId] || {name:c.memberName, paid:{}};
    b.paid[c.month] = (b.paid[c.month] || 0) + (c.amountPaid || 0);
  });
  const list = Object.values(by).sort((a,b)=> a.name.localeCompare(b.name));
  const rows = list.map((m,i)=>{
    const cells = months.map(mk => (mk in m.paid) ? rnd(m.paid[mk]) : '');
    return [i+1, m.name, ...cells, rnd(Object.values(m.paid).reduce((s,v)=>s+v,0))];
  });
  const totals = ['', 'TOTAL',
    ...months.map((mk,idx)=> sumOf(rows, r=> r[2+idx])),
    sumOf(rows, r=> r[2+months.length])];
  return {
    headers:['#','Member', ...months.map(shortMonth), 'Total Paid (₹)'],
    rows, totals,
    note: 'Amount received from each member per month. Blank = member was not billed that month; 0 = billed but unpaid.'
  };
}

async function buildPenaltiesReport(yearId){
  const contribs = (await rptFetchByYear('contributions', yearId))
    .filter(c => c.penaltyApplied && (c.penaltyAmount || 0) > 0)
    .sort((a,b)=> byName(a,b) || String(a.month).localeCompare(String(b.month)));
  const rows = contribs.map((c,i)=>[
    i+1, c.memberName, monthLabel(c.month), rnd(c.penaltyAmount), c.status, fmtDMY(c.paidDate)
  ]);
  const totals = ['', 'TOTAL', '', sumOf(rows,r=>r[3]), '', ''];
  return {
    headers:['#','Member','Month','Penalty (₹)','Share Payment Status','Paid On'],
    rows, totals,
    note: contribs.length ? '' : 'No penalties were applied in this year.'
  };
}

async function buildLoanRegisterReport(){
  const loans = [...(await rptFetchAll('loans'))].sort((a,b)=>
    byName(a,b) || String(a.dateIssued||'').localeCompare(String(b.dateIssued||'')));
  const rows = loans.map((l,i)=>{
    const d = loanDisbursements(l);
    return [
      i+1, l.memberName, l.status === 'closed' ? 'Closed' : 'Active',
      rnd(l.principal), rnd(l.outstandingBalance),
      fmtDMY(d[0].date), d.length,
      d.map(x=> `${fmtDMY(x.date)}: ${rnd(x.amount)}`).join(' | ')
    ];
  });
  const totals = ['', 'TOTAL', '', sumOf(rows,r=>r[3]), sumOf(rows,r=>r[4]), '', sumOf(rows,r=>r[6]), ''];
  return {
    headers:['#','Member','Status','Principal (₹)','Outstanding (₹)','First Disbursed','Disbursements','Disbursement Details (date: ₹)'],
    rows, totals
  };
}

async function buildLoanDisbursementsReport(yearId){
  const months = societyYearMonths(yearId);
  const loans = await rptFetchAll('loans');
  const events = [];
  loans.forEach(l => loanDisbursements(l).forEach(d=>{
    if(months.includes(String(d.date||'').slice(0,7))){
      events.push({name:l.memberName, date:d.date, amount:d.amount, status:l.status});
    }
  }));
  events.sort((a,b)=> String(a.date).localeCompare(String(b.date)) || String(a.name).localeCompare(String(b.name)));
  const rows = events.map((e,i)=>[
    i+1, fmtDMY(e.date), e.name, rnd(e.amount), e.status === 'closed' ? 'Closed' : 'Active'
  ]);
  const totals = ['', 'TOTAL', '', sumOf(rows,r=>r[3]), ''];
  return {
    headers:['#','Date','Member','Amount (₹)','Loan Status'],
    rows, totals,
    note: events.length ? '' : 'No loans were disbursed in this year.'
  };
}

async function buildLoanLedgerReport(yearId){
  const ledger = [...(await rptFetchByYear('loanLedger', yearId))]
    .sort((a,b)=> byName(a,b) || String(a.month).localeCompare(String(b.month)));
  const rows = ledger.map((e,i)=>[
    i+1, e.memberName, monthLabel(e.month), rnd(e.openingBalance), rnd(e.interest),
    rnd(e.totalDue), rnd(e.paymentMade), rnd(e.closingBalance),
    e.status === 'paid' ? 'Paid' : 'Carried forward'
  ]);
  const totals = ['', 'TOTAL', '', '', sumOf(rows,r=>r[4]), '', sumOf(rows,r=>r[6]), '', ''];
  return {
    headers:['#','Member','Month','Opening (₹)',`Interest ${SOCIETY.monthlyInterestPct}% (₹)`,'Total Due (₹)','Paid (₹)','Closing (₹)','Status'],
    rows, totals,
    note: ledger.length ? '' : 'No monthly interest has been applied in this year yet (Loans tab → Run).'
  };
}

async function buildBalanceSheetReport(yearId){
  const months = societyYearMonths(yearId);
  const contribs = await rptFetchByYear('contributions', yearId);
  const ledger = await rptFetchByYear('loanLedger', yearId);
  const loans = await rptFetchAll('loans');
  const disb = [];
  loans.forEach(l => loanDisbursements(l).forEach(d => disb.push(d)));

  const rows = months.map(mk=>{
    const c = contribs.filter(x=>x.month === mk);
    const l = ledger.filter(x=>x.month === mk);
    const newLoans = disb.filter(d => String(d.date||'').slice(0,7) === mk);
    return [
      monthLabel(mk),
      sumOf(c,x=>x.amountPaid), sumOf(c,x=>x.penaltyAmount),
      sumOf(l,x=>x.interest), sumOf(l,x=>x.paymentMade),
      sumOf(newLoans,d=>d.amount)
    ];
  });
  const totals = ['TOTAL', ...[1,2,3,4,5].map(i=> sumOf(rows, r=>r[i]))];
  return {
    headers:['Month','Share Collection (₹)','Penalty Charged (₹)','Loan Interest Accrued (₹)','Loan Repayments Received (₹)','New Loans Disbursed (₹)'],
    rows, totals,
    note: 'Share collection includes any penalty that was paid. Loan repayments include the interest portion.'
  };
}

async function buildYearEndReport(yearId){
  const yearDoc = await db.collection('years').doc(yearId).get();
  const dist = [...(await rptFetchByYear('distributions', yearId))].sort(byName);
  const rows = dist.map((d,i)=>[i+1, d.memberName, d.shares, rnd(d.payout)]);
  const totals = ['', 'TOTAL', sumOf(rows,r=>r[2]), sumOf(rows,r=>r[3])];
  let note = '';
  if(yearDoc.exists){
    const y = yearDoc.data();
    note = `Year closed · Total profit ${fmtMoney(y.totalProfit)} · Approved ${fmtMoney(y.approvedPerShare)} per share · Total distributed ${fmtMoney(y.totalPayout)}`;
  } else if(!dist.length){
    note = 'This year has not been closed yet. Use Year-End tab → Generate Member Payouts → Close Year & Save Record.';
  }
  return {
    headers:['#','Member','Shares','Payout (₹)'],
    rows, totals, note
  };
}

// =====================================================
// UI
// =====================================================
let _lastReport = null; // {def, param, label, data}

async function renderReports(){
  const container = document.getElementById('viewReports');
  container.innerHTML = `
    <div class="card">
      <h3>Reports</h3>
      <label>Report</label>
      <select id="reportType" onchange="onReportTypeChange()">
        ${REPORTS.map(r=>`<option value="${r.id}">${escapeHtml(r.title)}</option>`).join('')}
      </select>
      <div id="reportParam"></div>
      <div style="display:flex; gap:8px; margin-top:12px;">
        <button class="btn" style="flex:1;" onclick="runReport()">View</button>
        <button class="btn secondary" style="flex:1;" onclick="exportCurrentReport()">Export to Excel</button>
      </div>
      <button class="btn secondary block" style="margin-top:8px;" onclick="openFullWorkbookModal()">Download Full Year Workbook (all reports)</button>
    </div>
    <div id="reportOutput"><div class="meta" style="padding:0 4px;">Choose a report and tap View.</div></div>`;
  onReportTypeChange();
}

function selectedReportDef(){
  return REPORTS.find(r => r.id === document.getElementById('reportType').value);
}

function onReportTypeChange(){
  const def = selectedReportDef();
  const box = document.getElementById('reportParam');
  if(def.scope === 'year'){
    box.innerHTML = `<label>Society Year (Oct → Sep)</label>
      <select id="reportYear">${societyYearOptions().map(y=>`<option>${y}</option>`).join('')}</select>`;
  } else if(def.scope === 'month'){
    box.innerHTML = `<label>Month</label><input id="reportMonth" type="month" value="${monthKey(new Date())}">`;
  } else {
    box.innerHTML = '';
  }
  document.getElementById('reportOutput').innerHTML =
    '<div class="meta" style="padding:0 4px;">Tap View to load this report.</div>';
}

function currentReportParam(def){
  if(def.scope === 'year')  return document.getElementById('reportYear').value;
  if(def.scope === 'month') return document.getElementById('reportMonth').value;
  return null;
}

function paramLabel(def, param){
  if(def.scope === 'year')  return `Society Year ${param}`;
  if(def.scope === 'month') return monthLabel(param);
  return `As of ${fmtDMY(todayISO())}`;
}

async function runReport(){
  const def = selectedReportDef();
  const param = currentReportParam(def);
  if(def.scope === 'month' && !param){ toast('Pick a month first.'); return; }
  const out = document.getElementById('reportOutput');
  out.innerHTML = '<div class="card"><div class="meta">Loading…</div></div>';
  try{
    const data = await def.build(param);
    _lastReport = {def, param, label: paramLabel(def, param), data};
    out.innerHTML = renderReportTable(_lastReport);
  }catch(e){
    console.error(e);
    out.innerHTML = `<div class="card"><div class="meta" style="color:var(--debit);">Could not load this report: ${escapeHtml(e.message)}</div></div>`;
  }
}

function fmtCell(v){
  if(typeof v === 'number') return v.toLocaleString('en-IN', {maximumFractionDigits:2});
  return escapeHtml(v ?? '');
}

function renderReportTable(r){
  const {headers, rows, totals, note} = r.data;
  const thStyle = 'text-align:left; padding:8px 10px; white-space:nowrap; border-bottom:2px solid var(--rule); font-size:11px; text-transform:uppercase; letter-spacing:.03em; color:var(--ink-soft);';
  const td = (c, bold)=>{
    const isNum = typeof c === 'number';
    return `<td style="padding:8px 10px; white-space:nowrap; border-bottom:1px solid var(--rule); ${isNum ? 'text-align:right; font-family:var(--font-mono);' : ''} ${bold ? 'font-weight:700;' : ''}">${fmtCell(c)}</td>`;
  };
  const head = headers.map(h=>`<th style="${thStyle}">${escapeHtml(h)}</th>`).join('');
  const body = rows.map(row=>`<tr>${row.map(c=>td(c,false)).join('')}</tr>`).join('');
  const foot = totals ? `<tr style="background:var(--card-alt);">${totals.map(c=>td(c,true)).join('')}</tr>` : '';
  return `
    <div class="card">
      <div class="who">${escapeHtml(r.def.title)}</div>
      <div class="meta">${escapeHtml(r.label)} · ${rows.length} row(s)</div>
      ${note ? `<div class="meta" style="margin-top:8px;">${escapeHtml(note)}</div>` : ''}
      <div style="overflow-x:auto; margin-top:10px;">
        <table style="border-collapse:collapse; width:100%; font-size:13px;">
          <thead><tr>${head}</tr></thead>
          <tbody>${body}${foot}</tbody>
        </table>
      </div>
    </div>`;
}

// =====================================================
// Excel export (SheetJS, loaded on demand)
// =====================================================
function loadXLSX(){
  if(window.XLSX) return Promise.resolve();
  return new Promise((resolve, reject)=>{
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
    s.onload = ()=> resolve();
    s.onerror = ()=> reject(new Error('Could not load the Excel library — check your internet connection.'));
    document.head.appendChild(s);
  });
}

function buildSheet(def, label, data){
  const aoa = [
    [`${SOCIETY.name} — ${def.title}`],
    [`${label} · Generated ${fmtDMY(todayISO())}`],
    [],
    data.headers,
    ...data.rows
  ];
  if(data.totals) aoa.push(data.totals);
  if(data.note){ aoa.push([]); aoa.push([data.note]); }
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const body = [data.headers, ...data.rows, ...(data.totals ? [data.totals] : [])];
  ws['!cols'] = data.headers.map((h,i)=>{
    const max = body.reduce((m,r)=> Math.max(m, String(r[i] ?? '').length), 0);
    return {wch: Math.min(Math.max(max + 2, 8), 50)};
  });
  return ws;
}

async function exportCurrentReport(){
  const def = selectedReportDef();
  const param = currentReportParam(def);
  if(def.scope === 'month' && !param){ toast('Pick a month first.'); return; }
  try{
    await loadXLSX();
    let r = (_lastReport && _lastReport.def.id === def.id && _lastReport.param === param) ? _lastReport : null;
    if(!r){
      const data = await def.build(param);
      r = {def, param, label: paramLabel(def, param), data};
    }
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, buildSheet(r.def, r.label, r.data), def.sheet);
    XLSX.writeFile(wb, `Sahyog_${def.id}_${param || todayISO()}.xlsx`);
    toast('Excel file downloaded.');
  }catch(e){
    toast(e.message || 'Export failed.');
  }
}

function openFullWorkbookModal(){
  openModal(`
    <div class="modal-head"><h3>Full Year Workbook</h3><button class="close" onclick="closeModal()">✕</button></div>
    <div class="meta">One Excel file with a separate sheet for every report: members, collections, penalties, loans, each disbursement date, interest ledger, balance sheet and year-end payouts.</div>
    <label>Society Year</label>
    <select id="wbYear">${societyYearOptions().map(y=>`<option>${y}</option>`).join('')}</select>
    <button class="btn block" style="margin-top:14px;" onclick="exportAllReports()">Download Workbook</button>
  `);
}

async function exportAllReports(){
  const yearId = document.getElementById('wbYear').value;
  toast('Preparing workbook…', 10000);
  _fetchCache = {};
  try{
    await loadXLSX();
    const wb = XLSX.utils.book_new();
    for(const def of REPORTS){
      if(def.scope === 'month') continue; // the Collection Register already covers every month
      const param = def.scope === 'year' ? yearId : null;
      const data = await def.build(param);
      XLSX.utils.book_append_sheet(wb, buildSheet(def, paramLabel(def, param), data), def.sheet);
    }
    XLSX.writeFile(wb, `Sahyog_Full-Report_${yearId}.xlsx`);
    closeModal();
    toast('Workbook downloaded.');
  }catch(e){
    toast(e.message || 'Export failed.');
  }finally{
    _fetchCache = null;
  }
}
