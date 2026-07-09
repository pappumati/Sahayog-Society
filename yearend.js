// =====================================================
// Year-End Summary (Oct -> Sep tenure)
// =====================================================
async function computeYearFinancials(yearId){
  const contribSnap = await db.collection('contributions').where('yearId','==',yearId).get();
  const contribs = contribSnap.docs.map(d=>d.data());
  const penaltyIncome = contribs.reduce((s,c)=> s + (c.penaltyApplied ? c.penaltyAmount : 0), 0);

  const ledgerSnap = await db.collection('loanLedger').where('yearId','==',yearId).get();
  const interestIncome = ledgerSnap.docs.reduce((s,d)=> s + d.data().interest, 0);

  const members = await getMembers();
  const totalShares = members.reduce((s,m)=> s + (m.sharesCount||0), 0);

  return {interestIncome, penaltyIncome, totalShares, members};
}

async function renderYearEnd(){
  const container = document.getElementById('viewYearEnd');
  const currentYear = societyYearOf(new Date());
  container.innerHTML = `
    <div class="card">
      <h3>Year-End Summary</h3>
      <label>Society Year (Oct \u2192 Sep)</label>
      <input id="yeYear" value="${currentYear}">
      <label>Other Income (optional)</label>
      <input id="yeOtherIncome" type="number" value="0">
      <label>Expenses (optional)</label>
      <input id="yeExpenses" type="number" value="0">
      <button class="btn block" style="margin-top:12px;" onclick="calcYearEnd()">Calculate</button>
    </div>
    <div id="yeOutput"></div>`;
}

async function calcYearEnd(){
  const yearId = document.getElementById('yeYear').value.trim();
  const otherIncome = parseFloat(document.getElementById('yeOtherIncome').value || '0');
  const expenses = parseFloat(document.getElementById('yeExpenses').value || '0');
  const fin = await computeYearFinancials(yearId);
  const totalProfit = fin.interestIncome + fin.penaltyIncome + otherIncome - expenses;
  const suggestedPerShare = fin.totalShares > 0 ? Math.round((totalProfit/fin.totalShares)*100)/100 : 0;

  document.getElementById('yeOutput').innerHTML = `
    <div class="grid-2" style="margin-bottom:14px;">
      <div class="stat"><div class="label">Total Profit</div><div class="value credit">${fmtMoney(totalProfit)}</div></div>
      <div class="stat"><div class="label">Total Shares</div><div class="value">${fin.totalShares}</div></div>
    </div>
    <div class="card">
      <div class="meta">Interest income ${fmtMoney(fin.interestIncome)} + Penalty income ${fmtMoney(fin.penaltyIncome)} + Other ${fmtMoney(otherIncome)} \u2212 Expenses ${fmtMoney(expenses)}</div>
      <div class="section-title">System-suggested profit / share</div>
      <div class="amount" style="font-size:20px;">${fmtMoney(suggestedPerShare)}</div>
      <label style="margin-top:14px;">Admin-approved amount per share (final)</label>
      <input id="yeApprovedPerShare" type="number" value="${suggestedPerShare}">
      <button class="btn block" style="margin-top:14px;" onclick="generateDistribution('${yearId}', ${totalProfit})">Generate Member Payouts</button>
    </div>
    <div id="yeDistribution"></div>`;
}

async function generateDistribution(yearId, totalProfit){
  const approved = parseFloat(document.getElementById('yeApprovedPerShare').value || '0');
  const members = await getMembers();
  const rows = members.map(m=>({
    memberId: m.id, name: m.name, shares: m.sharesCount||0,
    payout: Math.round((m.sharesCount||0) * approved * 100) / 100
  }));
  const totalPayout = rows.reduce((s,r)=>s+r.payout,0);

  document.getElementById('yeDistribution').innerHTML = `
    <div class="card ledger">
      <h3>Member Payouts \u2014 ${yearId}</h3>
      <div class="meta">Approved rate: ${fmtMoney(approved)}/share \u00b7 Total distributed: ${fmtMoney(totalPayout)}</div>
      <div class="divider"></div>
      ${rows.map(r=>`
        <div class="row">
          <div>
            <div class="who">${escapeHtml(r.name)}</div>
            <div class="meta">${r.shares} shares</div>
          </div>
          <div class="amount credit">${fmtMoney(r.payout)}</div>
        </div>`).join('')}
      <button class="btn block" style="margin-top:14px;" onclick='closeYear("${yearId}", ${JSON.stringify({totalProfit, approved, totalPayout})})'>Close Year &amp; Save Record</button>
    </div>`;

  window._pendingDistributionRows = rows;
}

async function closeYear(yearId, summary){
  const batch = db.batch();
  const yearRef = db.collection('years').doc(yearId);
  batch.set(yearRef, {
    yearId, status:'closed', totalProfit: summary.totalProfit,
    approvedPerShare: summary.approved, totalPayout: summary.totalPayout,
    closedAt: firebase.firestore.FieldValue.serverTimestamp()
  }, {merge:true});
  for(const r of (window._pendingDistributionRows||[])){
    const ref = db.collection('distributions').doc(`${yearId}_${r.memberId}`);
    batch.set(ref, {yearId, memberId:r.memberId, memberName:r.name, shares:r.shares, payout:r.payout});
  }
  await batch.commit();
  toast('Year closed and payout record saved.');
}
