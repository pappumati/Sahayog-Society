// =====================================================
// Loans — issued against a member's deposits.
// Each month unpaid: interest = 3% of the CURRENT outstanding
// balance (principal + any previously unpaid/compounded interest).
// If not paid, that new total simply becomes next month's
// opening balance — i.e. compound interest, month over month.
// =====================================================
async function issueLoan(memberId, memberName, principal, dateIssued){
  const yearId = societyYearOf(dateIssued);
  const ref = await db.collection('loans').add({
    memberId, memberName, principal, dateIssued, yearId,
    status: 'active',
    outstandingBalance: principal,
    lastProcessedMonth: null,
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  });
  return ref.id;
}

async function getActiveLoans(){
  const snap = await db.collection('loans').where('status','==','active').get();
  return snap.docs.map(d=>({id:d.id, ...d.data()}));
}

async function getMemberLoans(memberId){
  const snap = await db.collection('loans').where('memberId','==',memberId).get();
  return snap.docs.map(d=>({id:d.id, ...d.data()}));
}

async function getLoanLedger(loanId){
  const snap = await db.collection('loanLedger').where('loanId','==',loanId).get();
  return snap.docs.map(d=>({id:d.id, ...d.data()})).sort((a,b)=> a.month.localeCompare(b.month));
}

// Creates this month's interest entry for one loan, if not already done.
async function processLoanMonth(loanId, mKey){
  const loanRef = db.collection('loans').doc(loanId);
  const loan = (await loanRef.get()).data();
  if(loan.status !== 'active') return null;

  const existing = await db.collection('loanLedger')
    .where('loanId','==',loanId).where('month','==',mKey).limit(1).get();
  if(!existing.empty) return existing.docs[0].id;

  const ledger = await getLoanLedger(loanId);
  const opening = ledger.length ? ledger[ledger.length-1].closingBalance : loan.principal;
  const interest = Math.round(opening * (SOCIETY.monthlyInterestPct/100) * 100) / 100;
  const totalDue = Math.round((opening + interest) * 100) / 100;

  const ref = await db.collection('loanLedger').add({
    loanId, memberId: loan.memberId, memberName: loan.memberName,
    month: mKey, yearId: societyYearOf(mKey + "-05"),
    openingBalance: opening, interest, totalDue,
    paymentMade: 0, closingBalance: totalDue, status: 'carried',
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  });
  await loanRef.set({outstandingBalance: totalDue, lastProcessedMonth: mKey}, {merge:true});
  return ref.id;
}

async function processAllLoansForMonth(mKey){
  const loans = await getActiveLoans();
  for(const l of loans) await processLoanMonth(l.id, mKey);
  return loans.length;
}

async function recordLoanPayment(ledgerId, paymentAmount){
  const ref = db.collection('loanLedger').doc(ledgerId);
  const entry = (await ref.get()).data();
  const closing = Math.round((entry.totalDue - paymentAmount) * 100) / 100;
  const status = closing <= 0 ? 'paid' : 'carried';
  await ref.set({paymentMade: paymentAmount, closingBalance: Math.max(closing,0), status}, {merge:true});

  const loanRef = db.collection('loans').doc(entry.loanId);
  if(closing <= 0){
    await loanRef.set({status:'closed', outstandingBalance:0}, {merge:true});
  } else {
    await loanRef.set({outstandingBalance: closing}, {merge:true});
  }
}

async function deleteLoan(loanId){
  const ledger = await getLoanLedger(loanId);
  const batch = db.batch();
  ledger.forEach(e => batch.delete(db.collection('loanLedger').doc(e.id)));
  batch.delete(db.collection('loans').doc(loanId));
  await batch.commit();
}

async function updateLoanDetails(loanId, principal, dateIssued){
  const loanRef = db.collection('loans').doc(loanId);
  const loan = (await loanRef.get()).data();
  const yearId = societyYearOf(dateIssued);
  const ledger = await getLoanLedger(loanId);
  const update = {principal, dateIssued, yearId};
  // Only safe to also reset the outstanding balance if interest hasn't
  // been processed yet — otherwise the ledger's own running balance
  // (not the original principal) is what's actually owed.
  if(ledger.length === 0){
    update.outstandingBalance = principal;
  }
  await loanRef.set(update, {merge:true});
}

// Undo a recorded loan payment on one ledger entry (e.g. wrong amount
// entered) by resetting that month's payment back to zero.
async function undoLoanPayment(ledgerId){
  const ref = db.collection('loanLedger').doc(ledgerId);
  const entry = (await ref.get()).data();
  await ref.set({paymentMade: 0, closingBalance: entry.totalDue, status:'carried'}, {merge:true});
  await db.collection('loans').doc(entry.loanId).set({status:'active', outstandingBalance: entry.totalDue}, {merge:true});
}

async function renderLoans(){
  const active = await getActiveLoans();
  const totalOutstanding = active.reduce((s,l)=>s+(l.outstandingBalance||0),0);
  const container = document.getElementById('viewLoans');
  container.innerHTML = `
    <div class="card">
      <div class="row" style="border:none; padding:0;">
        <h3>Loans</h3>
        <button class="btn" onclick="openIssueLoanForm()">+ Issue Loan</button>
      </div>
      <div class="meta">Total outstanding across society: <b class="amount">${fmtMoney(totalOutstanding)}</b></div>
    </div>
    <div class="card">
      <label>Apply this month's ${SOCIETY.monthlyInterestPct}% interest to all active loans</label>
      <div style="display:flex; gap:8px;">
        <input id="loanMonth" type="month" value="${monthKey(new Date())}">
        <button class="btn secondary" onclick="runProcessMonth()">Run</button>
      </div>
    </div>
    <div class="card ledger">
      ${active.map(l=>`
        <div class="row" onclick="openLoanDetail('${l.id}')" style="cursor:pointer;">
          <div>
            <div class="who">${escapeHtml(l.memberName)}</div>
            <div class="meta">Principal ${fmtMoney(l.principal)} · issued ${l.dateIssued}</div>
          </div>
          <div class="amount debit">${fmtMoney(l.outstandingBalance)}</div>
        </div>`).join('') || '<div class="meta">No active loans.</div>'}
    </div>`;
}

async function runProcessMonth(){
  const mKey = document.getElementById('loanMonth').value;
  const n = await processAllLoansForMonth(mKey);
  toast(`Interest applied to ${n} loan(s) for ${monthLabel(mKey)}.`);
  renderLoans();
}

async function openIssueLoanForm(){
  const members = await getMembers(true);
  openModal(`
    <div class="modal-head"><h3>Issue Loan</h3><button class="close" onclick="closeModal()">✕</button></div>
    <label>Member</label>
    <select id="loanMember">
      ${members.map(m=>`<option value="${m.id}" data-name="${escapeHtml(m.name)}">${escapeHtml(m.name)} (${m.sharesCount} shares)</option>`).join('')}
    </select>
    <label>Loan Amount</label>
    <input id="loanAmt" type="number" min="1">
    <label>Date Issued</label>
    <input id="loanDate" type="date" value="${new Date().toISOString().slice(0,10)}">
    <button class="btn block" style="margin-top:14px;" onclick="submitIssueLoan()">Issue Loan</button>
  `);
}

async function submitIssueLoan(){
  const sel = document.getElementById('loanMember');
  const memberId = sel.value;
  const memberName = sel.options[sel.selectedIndex].dataset.name;
  const amt = parseFloat(document.getElementById('loanAmt').value || '0');
  const date = document.getElementById('loanDate').value;
  if(amt <= 0){ toast('Enter a valid amount.'); return; }
  await issueLoan(memberId, memberName, amt, date);
  closeModal();
  toast('Loan issued.');
  renderLoans();
  renderDashboard();
}

async function openLoanDetail(loanId){
  const loanDoc = await db.collection('loans').doc(loanId).get();
  const loan = {id:loanDoc.id, ...loanDoc.data()};
  const ledger = await getLoanLedger(loanId);
  openModal(`
    <div class="modal-head"><h3>${escapeHtml(loan.memberName)} — Loan</h3><button class="close" onclick="closeModal()">✕</button></div>
    <div class="grid-2">
      <div class="stat"><div class="label">Principal</div><div class="value">${fmtMoney(loan.principal)}</div></div>
      <div class="stat"><div class="label">Outstanding</div><div class="value debit">${fmtMoney(loan.outstandingBalance)}</div></div>
    </div>
    <div class="meta" style="margin-top:6px;">Issued ${loan.dateIssued} · Status: ${loan.status}</div>
    <div class="section-title">Monthly Ledger</div>
    ${ledger.map(e=>`
      <div class="row">
        <div>
          <div class="who">${monthLabel(e.month)}</div>
          <div class="meta">Opening ${fmtMoney(e.openingBalance)} + ${SOCIETY.monthlyInterestPct}% (${fmtMoney(e.interest)})</div>
        </div>
        <div style="text-align:right;">
          <div class="amount">${fmtMoney(e.closingBalance)}</div>
          ${e.status!=='paid'
            ? `<button class="btn" style="padding:5px 9px;font-size:12px;margin-top:4px;" onclick="promptLoanPayment('${e.id}', ${e.totalDue - e.paymentMade})">Pay</button>`
            : `<span class="pill paid">closed</span> <button class="btn secondary" style="padding:5px 9px;font-size:12px;margin-top:4px;" onclick="undoLoanPayment('${e.id}').then(()=>openLoanDetail('${loanId}'))">Undo</button>`}
        </div>
      </div>`).join('') || '<div class="meta">No monthly entries yet — run interest processing from the Loans tab.</div>'}
    <div style="display:flex; gap:10px; margin-top:16px;">
      <button class="btn secondary block" onclick='openEditLoanForm(${JSON.stringify({id:loan.id, principal:loan.principal, dateIssued:loan.dateIssued, memberName:loan.memberName})}, ${ledger.length})'>Edit</button>
      <button class="btn block" style="background:transparent; color:var(--debit); border:1.5px solid var(--debit);" onclick="openDeleteLoanConfirm('${loan.id}', '${escapeHtml(loan.memberName)}')">Delete Loan</button>
    </div>
  `);
}

function openEditLoanForm(loan, ledgerCount){
  openModal(`
    <div class="modal-head"><h3>Edit Loan — ${escapeHtml(loan.memberName)}</h3><button class="close" onclick="closeModal()">✕</button></div>
    <label>Loan Amount (Principal)</label>
    <input id="editLoanAmt" type="number" min="1" value="${loan.principal}">
    <label>Date Issued</label>
    <input id="editLoanDate" type="date" value="${loan.dateIssued}">
    ${ledgerCount > 0 ? `<div class="meta" style="margin-top:8px;">This loan already has ${ledgerCount} month(s) of interest applied — changing the principal here won't recalculate those. If the numbers are badly wrong, it's cleaner to Delete this loan and issue it again.</div>` : ''}
    <button class="btn block" style="margin-top:14px;" onclick="submitEditLoan('${loan.id}')">Save Changes</button>
  `);
}

async function submitEditLoan(loanId){
  const amt = parseFloat(document.getElementById('editLoanAmt').value || '0');
  const date = document.getElementById('editLoanDate').value;
  if(amt <= 0){ toast('Enter a valid amount.'); return; }
  await updateLoanDetails(loanId, amt, date);
  closeModal();
  toast('Loan updated.');
  renderLoans();
  renderDashboard();
}

function openDeleteLoanConfirm(loanId, memberName){
  openModal(`
    <div class="modal-head"><h3>Delete Loan?</h3><button class="close" onclick="closeModal()">✕</button></div>
    <div class="meta">This permanently removes ${memberName}'s loan and its entire monthly interest ledger. This can't be undone.</div>
    <div style="display:flex; gap:10px; margin-top:16px;">
      <button class="btn secondary block" onclick="openLoanDetail('${loanId}')">Cancel</button>
      <button class="btn danger block" onclick="confirmDeleteLoan('${loanId}')">Yes, Delete</button>
    </div>
  `);
}

async function confirmDeleteLoan(loanId){
  await deleteLoan(loanId);
  closeModal();
  toast('Loan deleted.');
  renderLoans();
  renderDashboard();
}

function promptLoanPayment(ledgerId, suggested){
  openModal(`
    <div class="modal-head"><h3>Record Loan Payment</h3><button class="close" onclick="closeModal()">✕</button></div>
    <label>Amount Paid</label>
    <input id="loanPayAmt" type="number" value="${suggested}">
    <button class="btn block" style="margin-top:14px;" onclick="submitLoanPayment('${ledgerId}')">Confirm</button>
  `);
}
async function submitLoanPayment(ledgerId){
  const amt = parseFloat(document.getElementById('loanPayAmt').value || '0');
  await recordLoanPayment(ledgerId, amt);
  closeModal();
  toast('Loan payment recorded.');
  renderLoans();
  renderDashboard();
}
