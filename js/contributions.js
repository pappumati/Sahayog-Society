// =====================================================
// Monthly share contributions
// Doc id = `${memberId}_${monthKey}` so it's naturally idempotent.
// =====================================================
async function ensureMonthContributions(mKey){
  const members = await getMembers(true);
  const batch = db.batch();
  let created = 0;
  for(const m of members){
    const id = `${m.id}_${mKey}`;
    const ref = db.collection('contributions').doc(id);
    const existing = await ref.get();
    if(existing.exists) continue;
    batch.set(ref, {
      memberId: m.id,
      memberName: m.name,
      month: mKey,
      yearId: societyYearOf(mKey + "-05"),
      sharesAtTime: m.sharesCount,
      amountDue: m.sharesCount * SOCIETY.shareValue,
      amountPaid: 0,
      status: 'unpaid',
      penaltyApplied: false,
      penaltyAmount: 0,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    created++;
  }
  if(created>0) await batch.commit();
  return created;
}

async function getContributionsForMonth(mKey){
  const snap = await db.collection('contributions').where('month','==',mKey).get();
  return snap.docs.map(d=>({id:d.id, ...d.data()})).sort((a,b)=> a.memberName.localeCompare(b.memberName));
}

async function markContributionPaid(id, amountPaid){
  const ref = db.collection('contributions').doc(id);
  const doc = (await ref.get()).data();
  const total = amountPaid;
  const status = total >= (doc.amountDue + (doc.penaltyAmount||0)) ? 'paid' : 'partial';
  await ref.set({
    amountPaid: total, status, paidDate: new Date().toISOString().slice(0,10)
  }, {merge:true});
}

async function applyContributionPenalty(id){
  const ref = db.collection('contributions').doc(id);
  await ref.set({
    penaltyApplied: true, penaltyAmount: SOCIETY.penaltyAmount
  }, {merge:true});
}

async function waiveContributionPenalty(id){
  const ref = db.collection('contributions').doc(id);
  await ref.set({
    penaltyApplied: false, penaltyAmount: 0
  }, {merge:true});
}

async function renderContributions(){
  const container = document.getElementById('viewShares');
  const now = new Date();
  const defaultMonth = monthKey(now);
  container.innerHTML = `
    <div class="card">
      <h3>Monthly Share Collection</h3>
      <label>Month</label>
      <input id="collectMonth" type="month" value="${defaultMonth}">
      <button class="btn block" style="margin-top:12px;" onclick="loadContributionMonth()">Load / Generate Dues</button>
    </div>
    <div id="contribList"></div>`;
  loadContributionMonth();
}

async function loadContributionMonth(){
  const mKey = document.getElementById('collectMonth').value || monthKey(new Date());
  await ensureMonthContributions(mKey);
  const list = await getContributionsForMonth(mKey);
  const totalDue = list.reduce((s,c)=>s + c.amountDue + (c.penaltyAmount||0), 0);
  const totalPaid = list.reduce((s,c)=>s + (c.amountPaid||0), 0);
  document.getElementById('contribList').innerHTML = `
    <div class="grid-2" style="margin-bottom:14px;">
      <div class="stat"><div class="label">Collected — ${monthLabel(mKey)}</div><div class="value credit">${fmtMoney(totalPaid)}</div></div>
      <div class="stat"><div class="label">Pending</div><div class="value debit">${fmtMoney(Math.max(totalDue-totalPaid,0))}</div></div>
    </div>
    <div class="card ledger">
      ${list.map(c=>`
        <div class="row">
          <div>
            <div class="who">${escapeHtml(c.memberName)}</div>
            <div class="meta">${c.sharesAtTime} shares · Due ${fmtMoney(c.amountDue + (c.penaltyAmount||0))}${c.penaltyApplied?' (incl. ₹'+c.penaltyAmount+' penalty)':''}</div>
          </div>
          <div style="text-align:right;">
            <span class="pill ${c.status==='paid'?'paid':(c.status==='partial'?'pending':'due')}">${c.status}</span>
            <div style="margin-top:6px; display:flex; gap:6px;">
              ${c.status!=='paid'
                ? `<button class="btn" style="padding:6px 10px;font-size:12.5px;" onclick="promptMarkPaid('${c.id}', ${c.amountDue + (c.penaltyAmount||0)})">Mark Paid</button>`
                : `<span class="stamp-badge">PAID</span><button class="btn secondary" style="padding:6px 10px;font-size:12px;" onclick="promptMarkPaid('${c.id}', ${c.amountPaid})">Edit</button>`}
              ${(!c.penaltyApplied && c.status!=='paid') ? `<button class="btn secondary" style="padding:6px 10px;font-size:12.5px;" onclick="applyContributionPenalty('${c.id}').then(loadContributionMonth)">+Penalty</button>` : ''}
              ${(c.penaltyApplied) ? `<button class="btn secondary" style="padding:6px 10px;font-size:12.5px;" onclick="waiveContributionPenalty('${c.id}').then(loadContributionMonth)">Waive Penalty</button>` : ''}
            </div>
          </div>
        </div>`).join('') || '<div class="meta">No active members.</div>'}
    </div>`;
}

function promptMarkPaid(id, suggested){
  openModal(`
    <div class="modal-head"><h3>Record Payment</h3><button class="close" onclick="closeModal()">✕</button></div>
    <label>Amount Received</label>
    <input id="payAmt" type="number" value="${suggested}">
    <button class="btn block" style="margin-top:14px;" onclick="submitPayment('${id}')">Confirm</button>
  `);
}
async function submitPayment(id){
  const amt = parseFloat(document.getElementById('payAmt').value || '0');
  await markContributionPaid(id, amt);
  const c = (await db.collection('contributions').doc(id).get()).data();
  const member = await getMember(c.memberId);
  showPaymentConfirmation(member, c.month, amt, c.sharesAtTime);
  loadContributionMonth();
  renderDashboard();
}

function showPaymentConfirmation(member, mKey, amountPaid, sharesCount){
  const msg = hindiPaymentConfirmationMessage(member?.name || '', amountPaid, sharesCount, mKey);
  const phone = member?.phone || '';
  const wa = phone ? `https://wa.me/91${phone.replace(/\D/g,'').slice(-10)}?text=${encodeURIComponent(msg)}` : null;
  openModal(`
    <div class="modal-head"><h3>Payment Recorded</h3><button class="close" onclick="closeModal()">✕</button></div>
    <div class="card card-alt" style="white-space:pre-line; font-size:14px; line-height:1.6;">${escapeHtml(msg)}</div>
    <div style="display:flex; gap:10px; margin-top:12px;">
      <button class="btn secondary block" onclick="copyReminderText(this)" data-msg="${escapeHtml(msg)}">Copy Text</button>
      ${wa ? `<a class="btn block" style="text-decoration:none; text-align:center;" href="${wa}" target="_blank">Send on WhatsApp</a>` : ''}
    </div>
    ${!phone ? '<div class="meta" style="margin-top:8px;">No phone number on file for this member — add one from Members to enable direct WhatsApp sending.</div>' : ''}
  `);
}
