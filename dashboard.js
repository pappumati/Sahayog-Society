// =====================================================
// Dashboard
// =====================================================
async function renderDashboard(){
  const container = document.getElementById('viewDashboard');
  const mKey = monthKey(new Date());
  const members = await getMembers(true);
  const totalShares = members.reduce((s,m)=>s+(m.sharesCount||0),0);

  await ensureMonthContributions(mKey);
  const contribs = await getContributionsForMonth(mKey);
  const collected = contribs.reduce((s,c)=>s+(c.amountPaid||0),0);
  const dueTotal = contribs.reduce((s,c)=>s+c.amountDue+(c.penaltyAmount||0),0);
  const unpaidCount = contribs.filter(c=>c.status!=='paid').length;

  const activeLoans = await getActiveLoans();
  const totalOutstanding = activeLoans.reduce((s,l)=>s+(l.outstandingBalance||0),0);

  const today = new Date().getDate();
  const currentYear = societyYearOf(new Date());

  container.innerHTML = `
    <div class="card">
      <h3>${monthLabel(mKey)}</h3>
      <div class="grid-2">
        <div class="stat"><div class="label">Collected</div><div class="value credit">${fmtMoney(collected)}</div></div>
        <div class="stat"><div class="label">Pending</div><div class="value debit">${fmtMoney(Math.max(dueTotal-collected,0))}</div></div>
      </div>
    </div>
    <div class="grid-2">
      <div class="stat"><div class="label">Active Members</div><div class="value">${members.length}</div></div>
      <div class="stat"><div class="label">Total Shares</div><div class="value">${totalShares}</div></div>
    </div>
    <div class="grid-2">
      <div class="stat"><div class="label">Loans Outstanding</div><div class="value debit">${fmtMoney(totalOutstanding)}</div></div>
      <div class="stat"><div class="label">Unpaid This Month</div><div class="value">${unpaidCount}</div></div>
    </div>
    ${today >= SOCIETY.reminderDay && unpaidCount > 0 ? `
      <div class="card card-alt">
        <div class="row" style="border:none; padding:0;">
          <div>
            <div class="who">Reminder day</div>
            <div class="meta">${unpaidCount} member(s) haven't paid yet.</div>
          </div>
          <button class="btn" onclick="switchTab('reminders')">Open</button>
        </div>
      </div>` : ''}
    <div class="card">
      <div class="section-title">Society Year</div>
      <div class="meta">Current tenure: <b>${currentYear}</b> (Oct \u2192 Sep)</div>
    </div>`;
}
