// =====================================================
// Reports — member-wise collection + month-wise / aggregate
// balance sheet, scoped to a society year (Oct -> Sep).
// =====================================================
async function renderReports(){
  const container = document.getElementById('viewReports');
  const currentYear = societyYearOf(new Date());
  container.innerHTML = `
    <div class="card">
      <h3>Reports</h3>
      <label>Society Year</label>
      <input id="reportYear" value="${currentYear}" placeholder="e.g. 2025-2026">
      <div style="display:flex; gap:8px; margin-top:12px;">
        <button class="btn secondary" style="flex:1;" onclick="showMemberWiseReport()">Member-wise</button>
        <button class="btn secondary" style="flex:1;" onclick="showBalanceSheet()">Balance Sheet</button>
      </div>
    </div>
    <div id="reportOutput"></div>`;
  showMemberWiseReport();
}

async function showMemberWiseReport(){
  const yearId = document.getElementById('reportYear').value.trim();
  const snap = await db.collection('contributions').where('yearId','==',yearId).get();
  const rows = snap.docs.map(d=>d.data());
  const byMember = {};
  for(const r of rows){
    byMember[r.memberId] = byMember[r.memberId] || {name:r.memberName, due:0, paid:0, penalty:0};
    byMember[r.memberId].due += r.amountDue;
    byMember[r.memberId].paid += r.amountPaid || 0;
    byMember[r.memberId].penalty += r.penaltyAmount || 0;
  }
  const list = Object.values(byMember).sort((a,b)=>a.name.localeCompare(b.name));
  const totalDue = list.reduce((s,m)=>s+m.due+m.penalty,0);
  const totalPaid = list.reduce((s,m)=>s+m.paid,0);

  document.getElementById('reportOutput').innerHTML = `
    <div class="grid-2" style="margin-bottom:14px;">
      <div class="stat"><div class="label">Total Due (${yearId})</div><div class="value">${fmtMoney(totalDue)}</div></div>
      <div class="stat"><div class="label">Total Collected</div><div class="value credit">${fmtMoney(totalPaid)}</div></div>
    </div>
    <div class="card ledger">
      ${list.map(m=>`
        <div class="row">
          <div class="who">${escapeHtml(m.name)}</div>
          <div style="text-align:right;">
            <div class="amount">${fmtMoney(m.paid)} <span style="color:var(--ink-soft);font-size:11px;">/ ${fmtMoney(m.due+m.penalty)}</span></div>
            ${m.due+m.penalty-m.paid > 0 ? `<div class="meta" style="color:var(--debit);">Pending ${fmtMoney(m.due+m.penalty-m.paid)}</div>` : ''}
          </div>
        </div>`).join('') || '<div class="meta">No contribution records for this year yet.</div>'}
    </div>`;
}

async function showBalanceSheet(){
  const yearId = document.getElementById('reportYear').value.trim();
  const months = societyYearMonths(yearId);

  const contribSnap = await db.collection('contributions').where('yearId','==',yearId).get();
  const contribs = contribSnap.docs.map(d=>d.data());
  const loanLedgerSnap = await db.collection('loanLedger').where('yearId','==',yearId).get();
  const ledgerRows = loanLedgerSnap.docs.map(d=>d.data());
  const loansSnap = await db.collection('loans').where('yearId','==',yearId).get();
  const loansIssued = loansSnap.docs.map(d=>d.data());

  const perMonth = months.map(mKey=>{
    const contribsThisMonth = contribs.filter(c=>c.month===mKey);
    const collected = contribsThisMonth.reduce((s,c)=>s+(c.amountPaid||0),0);
    const interestAccrued = ledgerRows.filter(l=>l.month===mKey).reduce((s,l)=>s+l.interest,0);
    const newLoans = loansIssued.filter(l=>l.dateIssued && monthKey(l.dateIssued)===mKey)
      .reduce((s,l)=>s+l.principal,0);
    return {mKey, collected, interestAccrued, newLoans};
  });

  const aggCollected = perMonth.reduce((s,m)=>s+m.collected,0);
  const aggInterest = perMonth.reduce((s,m)=>s+m.interestAccrued,0);
  const aggLoans = perMonth.reduce((s,m)=>s+m.newLoans,0);

  document.getElementById('reportOutput').innerHTML = `
    <div class="grid-3" style="margin-bottom:14px;">
      <div class="stat"><div class="label">Shares Collected</div><div class="value credit">${fmtMoney(aggCollected)}</div></div>
      <div class="stat"><div class="label">Interest Income</div><div class="value credit">${fmtMoney(aggInterest)}</div></div>
      <div class="stat"><div class="label">Loans Issued</div><div class="value debit">${fmtMoney(aggLoans)}</div></div>
    </div>
    <div class="card ledger">
      <h3 style="margin-bottom:10px;">Month-wise (${yearId})</h3>
      ${perMonth.map(m=>`
        <div class="row">
          <div class="who">${monthLabel(m.mKey)}</div>
          <div style="text-align:right; font-size:12.5px;">
            <div class="amount">Shares: ${fmtMoney(m.collected)}</div>
            <div class="meta">Interest: ${fmtMoney(m.interestAccrued)} · New loans: ${fmtMoney(m.newLoans)}</div>
          </div>
        </div>`).join('')}
    </div>`;
}
