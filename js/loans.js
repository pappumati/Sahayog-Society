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
    disbursements: [{amount: principal, date: dateIssued}],
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
  const existingDisbursements = (loan.disbursements && loan.disbursements.length)
    ? loan.disbursements.slice()
    : [{amount: loan.principal, date: loan.dateIssued}]; // backfill pre-feature loans

  const diff = Math.round((principal - (loan.principal||0)) * 100) / 100;
  let disbursements;
  if(diff > 0){
    // Amount went UP — that's new money going out, so log it as its
    // own dated disbursement rather than silently stretching the
    // original entry.
    disbursements = [...existingDisbursements, {amount: diff, date: dateIssued}];
  } else if(existingDisbursements.length === 1){
    // Amount went down (or unchanged) and this loan has only ever had
    // one disbursement — safe to just correct that single entry.
    disbursements = [{amount: principal, date: dateIssued}];
  } else {
    // Amount went down on a loan with multiple disbursements already —
    // ambiguous which one to shrink, so leave the history as-is.
    disbursements = existingDisbursements;
  }

  const update = {principal, dateIssued, yearId, disbursements};
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
  const active = (await getActiveLoans()).sort((a,b)=> a.memberName.localeCompare(b.memberName));
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
            <div class="meta">Principal ${fmtMoney(l.principal)} · ${l.disbursements && l.disbursements.length > 1 ? `${l.disbursements.length} disbursements` : `issued ${l.dateIssued}`}</div>
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

  const existingLoans = await getMemberLoans(memberId);
  const activeExisting = existingLoans.find(l=>l.status==='active');

  if(activeExisting){
    openDuplicateLoanConfirm(activeExisting, memberId, memberName, amt, date);
    return;
  }
  await issueLoan(memberId, memberName, amt, date);
  closeModal();
  toast('Loan issued.');
  renderLoans();
  renderDashboard();
}

function openDuplicateLoanConfirm(existingLoan, memberId, memberName, newAmt, date){
  openModal(`
    <div class="modal-head"><h3>Already Has an Active Loan</h3><button class="close" onclick="closeModal()">✕</button></div>
    <div class="meta">${escapeHtml(memberName)} already has an active loan — outstanding <b class="amount">${fmtMoney(existingLoan.outstandingBalance)}</b>.</div>
    <div class="meta" style="margin-top:8px;">Add the new ${fmtMoney(newAmt)} (dated ${date}) to this existing loan, instead of creating a second, separate one?</div>
    <div style="display:flex; flex-direction:column; gap:10px; margin-top:16px;">
      <button class="btn block" onclick="submitAddToExistingLoan('${existingLoan.id}', ${newAmt}, '${date}')">Yes — Add to Existing Loan</button>
      <button class="btn secondary block" onclick='confirmCreateSeparateLoan("${memberId}", ${JSON.stringify(memberName)}, ${newAmt}, "${date}")'>No — Create a Separate Loan Anyway</button>
      <button class="btn secondary block" style="border:none;" onclick="closeModal()">Cancel</button>
    </div>
  `);
}

async function submitAddToExistingLoan(loanId, addAmt, date){
  await addToExistingLoan(loanId, addAmt, date);
  closeModal();
  toast('Amount added to existing loan.');
  renderLoans();
  renderDashboard();
}

async function confirmCreateSeparateLoan(memberId, memberName, amt, date){
  await issueLoan(memberId, memberName, amt, date);
  closeModal();
  toast('Separate loan issued.');
  renderLoans();
  renderDashboard();
}

// Tops up an existing active loan's principal + outstanding balance,
// and records this specific disbursement's own date so the ledger
// shows every date money went out, not just the original issue date.
async function addToExistingLoan(loanId, addAmt, date){
  const loanRef = db.collection('loans').doc(loanId);
  const loan = (await loanRef.get()).data();
  const existingDisbursements = (loan.disbursements && loan.disbursements.length)
    ? loan.disbursements
    : [{amount: loan.principal, date: loan.dateIssued}]; // backfill for loans created before this feature
  await loanRef.set({
    principal: (loan.principal||0) + addAmt,
    outstandingBalance: (loan.outstandingBalance||0) + addAmt,
    disbursements: [...existingDisbursements, {amount: addAmt, date}]
  }, {merge:true});
}

async function openLoanDetail(loanId){
  const loanDoc = await db.collection('loans').doc(loanId).get();
  const loan = {id:loanDoc.id, ...loanDoc.data()};
  const ledger = await getLoanLedger(loanId);
  const disbursements = (loan.disbursements && loan.disbursements.length)
    ? loan.disbursements.slice().sort((a,b)=> a.date.localeCompare(b.date))
    : [{amount: loan.principal, date: loan.dateIssued}];
  openModal(`
    <div class="modal-head"><h3>${escapeHtml(loan.memberName)} — Loan</h3><button class="close" onclick="closeModal()">✕</button></div>
    <div class="grid-2">
      <div class="stat"><div class="label">Principal</div><div class="value">${fmtMoney(loan.principal)}</div></div>
      <div class="stat"><div class="label">Outstanding</div><div class="value debit">${fmtMoney(loan.outstandingBalance)}</div></div>
    </div>
    <div class="meta" style="margin-top:6px;">Status: ${loan.status}</div>
    <div class="section-title">Disbursements (${disbursements.length})</div>
    ${disbursements.map((d,i)=>`
      <div class="row">
        <div class="who">${d.date}</div>
        <div style="display:flex; align-items:center; gap:8px;">
          <div class="amount">${fmtMoney(d.amount)}</div>
          ${disbursements.length > 1 ? `<button class="btn secondary" style="padding:4px 8px;font-size:11px;" onclick="removeDisbursement('${loanId}', ${i})">Remove</button>` : ''}
        </div>
      </div>`).join('')}
    <button class="btn secondary block" style="margin-top:8px;" onclick='openAddFundsForm("${loanId}", ${JSON.stringify(loan.memberName)})'>+ Add Funds (new dated entry)</button>
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
    <button class="btn secondary block" style="margin-top:10px;" onclick='openManageDisbursements(${JSON.stringify({id:loan.id, memberName:loan.memberName})}, ${JSON.stringify(disbursements)})'>Manage Disbursement Dates</button>
  `);
}

// Lets the admin directly view/split/correct the dated disbursement
// entries that make up a loan's total principal — separate from the
// Edit button, which only changes the overall amount/date.
function openManageDisbursements(loan, disbursements){
  const rows = disbursements.map((d,i)=>`
    <div class="row" style="gap:8px;">
      <input type="date" value="${d.date}" data-idx="${i}" class="disb-date" style="flex:1;">
      <input type="number" value="${d.amount}" data-idx="${i}" class="disb-amt" style="flex:1;">
      <button class="btn secondary" style="padding:6px 10px;" onclick="this.closest('.row').remove()">✕</button>
    </div>`).join('');
  openModal(`
    <div class="modal-head"><h3>Disbursement Dates — ${escapeHtml(loan.memberName)}</h3><button class="close" onclick="closeModal()">✕</button></div>
    <div class="meta">Split or correct the dated amounts that make up this loan. The total must add up to the loan's outstanding-safe principal.</div>
    <div id="disbRows" style="margin-top:10px;">${rows}</div>
    <button class="btn secondary block" style="margin-top:10px;" onclick="addDisbRow()">+ Add Date/Amount</button>
    <button class="btn block" style="margin-top:14px;" onclick="submitManageDisbursements('${loan.id}')">Save</button>
  `);
}

function addDisbRow(){
  const container = document.getElementById('disbRows');
  const div = document.createElement('div');
  div.className = 'row';
  div.style.gap = '8px';
  div.innerHTML = `
    <input type="date" class="disb-date" style="flex:1;" value="${new Date().toISOString().slice(0,10)}">
    <input type="number" class="disb-amt" style="flex:1;" value="0">
    <button class="btn secondary" style="padding:6px 10px;" onclick="this.closest('.row').remove()">✕</button>`;
  container.appendChild(div);
}

async function submitManageDisbursements(loanId){
  const dates = [...document.querySelectorAll('.disb-date')].map(el=>el.value);
  const amts = [...document.querySelectorAll('.disb-amt')].map(el=>parseFloat(el.value||'0'));
  const disbursements = dates.map((date,i)=>({date, amount: amts[i]})).filter(d=>d.amount > 0 && d.date);
  if(disbursements.length === 0){ toast('Add at least one date and amount.'); return; }

  const newPrincipal = Math.round(disbursements.reduce((s,d)=>s+d.amount,0) * 100) / 100;
  const earliestDate = disbursements.map(d=>d.date).sort()[0];
  const loanRef = db.collection('loans').doc(loanId);
  const loan = (await loanRef.get()).data();
  const ledger = await getLoanLedger(loanId);

  const update = {
    principal: newPrincipal,
    dateIssued: earliestDate,
    yearId: societyYearOf(earliestDate),
    disbursements
  };
  if(ledger.length === 0){
    update.outstandingBalance = newPrincipal;
  }
  await loanRef.set(update, {merge:true});
  closeModal();
  toast('Disbursement dates updated.');
  renderLoans();
  renderDashboard();
}

function openAddFundsForm(loanId, memberName){
  openModal(`
    <div class="modal-head"><h3>Add Funds — ${escapeHtml(memberName)}</h3><button class="close" onclick="closeModal()">✕</button></div>
    <label>Additional Amount</label>
    <input id="addFundsAmt" type="number" min="1">
    <label>Date</label>
    <input id="addFundsDate" type="date" value="${new Date().toISOString().slice(0,10)}">
    <button class="btn block" style="margin-top:14px;" onclick="submitAddFunds('${loanId}')">Add to This Loan</button>
  `);
}

async function submitAddFunds(loanId){
  const amt = parseFloat(document.getElementById('addFundsAmt').value || '0');
  const date = document.getElementById('addFundsDate').value;
  if(amt <= 0){ toast('Enter a valid amount.'); return; }
  await addToExistingLoan(loanId, amt, date);
  toast('Funds added.');
  openLoanDetail(loanId);
  renderLoans();
  renderDashboard();
}

// Removes one disbursement row (e.g. entered by mistake) and shrinks
// principal/outstanding by that amount. Blocked once interest has
// been processed, since the balance is no longer just the sum of
// disbursements at that point.
async function removeDisbursement(loanId, index){
  const loanRef = db.collection('loans').doc(loanId);
  const loan = (await loanRef.get()).data();
  const ledger = await getLoanLedger(loanId);
  if(ledger.length > 0){
    toast("Can't remove — interest has already been processed on this loan. Use Undo on the ledger entry instead, or Delete the whole loan.");
    return;
  }
  const disbursements = (loan.disbursements && loan.disbursements.length)
    ? loan.disbursements.slice()
    : [{amount: loan.principal, date: loan.dateIssued}];
  const removed = disbursements.splice(index, 1)[0];
  if(disbursements.length === 0){
    // Removing the only disbursement — just delete the whole loan.
    await deleteLoan(loanId);
    closeModal();
    toast('Loan removed.');
    renderLoans();
    renderDashboard();
    return;
  }
  const newPrincipal = disbursements.reduce((s,d)=>s+d.amount, 0);
  await loanRef.set({
    principal: newPrincipal,
    outstandingBalance: newPrincipal,
    dateIssued: disbursements[0].date,
    disbursements
  }, {merge:true});
  toast(`Removed ${fmtMoney(removed.amount)} entry.`);
  openLoanDetail(loanId);
  renderLoans();
  renderDashboard();
}

function openEditLoanForm(loan, ledgerCount){
  openModal(`
    <div class="modal-head"><h3>Edit Loan — ${escapeHtml(loan.memberName)}</h3><button class="close" onclick="closeModal()">✕</button></div>
    <label>Total Loan Amount (Principal)</label>
    <input id="editLoanAmt" type="number" min="1" value="${loan.principal}">
    <div class="meta">If you increase this, the increase is logged as a new disbursement on the date below — not merged into the original date.</div>
    <label>Date (of this change, or original issue date if unchanged)</label>
    <input id="editLoanDate" type="date" value="${loan.dateIssued}">
    ${ledgerCount > 0 ? `<div class="meta" style="margin-top:8px;">This loan already has ${ledgerCount} month(s) of interest applied — increasing the principal here won't retroactively recalculate those months.</div>` : ''}
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
