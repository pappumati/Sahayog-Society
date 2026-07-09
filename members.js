// =====================================================
// Members: registration + share holding
// =====================================================
async function getMembers(activeOnly=false){
  let ref = db.collection('members').orderBy('name');
  const snap = await ref.get();
  let list = snap.docs.map(d=>({id:d.id, ...d.data()}));
  if(activeOnly) list = list.filter(m=>m.active !== false);
  return list;
}

async function getMember(id){
  const d = await db.collection('members').doc(id).get();
  return d.exists ? {id:d.id, ...d.data()} : null;
}

async function saveMember(id, data){
  data.shareValue = SOCIETY.shareValue;
  data.updatedAt = firebase.firestore.FieldValue.serverTimestamp();
  if(id){
    await db.collection('members').doc(id).set(data, {merge:true});
    return id;
  } else {
    data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
    data.active = true;
    const ref = await db.collection('members').add(data);
    return ref.id;
  }
}

async function renderMembers(){
  const members = await getMembers();
  const totalShares = members.reduce((s,m)=> s + (m.sharesCount||0), 0);
  document.getElementById('viewMembers').innerHTML = `
    <div class="card">
      <div class="row" style="border:none; padding:0;">
        <h3>Members (${members.length})</h3>
        <button class="btn" onclick="openMemberForm()">+ Add</button>
      </div>
      <div class="meta">Total shares in society: <b>${totalShares}</b> (${fmtMoney(totalShares*SOCIETY.shareValue)}/month if fully paid)</div>
    </div>
    <div class="card ledger">
      ${members.map(m=>`
        <div class="row" onclick="openMemberDetail('${m.id}')" style="cursor:pointer;">
          <div>
            <div class="who">${escapeHtml(m.name)}</div>
            <div class="meta">${m.sharesCount||0} shares · ${escapeHtml(m.phone||'—')}</div>
          </div>
          <div style="text-align:right;">
            <div class="amount">${fmtMoney((m.sharesCount||0)*SOCIETY.shareValue)}<span style="color:var(--ink-soft);font-size:11px;">/mo</span></div>
            ${m.active===false ? '<span class="pill due">Inactive</span>' : ''}
          </div>
        </div>`).join('') || '<div class="meta">No members yet. Tap + Add to register the first member.</div>'}
    </div>`;
}

function openMemberForm(existing){
  const m = existing || {};
  openModal(`
    <div class="modal-head"><h3>${existing?'Edit Member':'Add Member'}</h3><button class="close" onclick="closeModal()">✕</button></div>
    <label>Full Name</label>
    <input id="mName" value="${escapeHtml(m.name||'')}" placeholder="Member's full name">
    <label>Phone (for WhatsApp reminders)</label>
    <input id="mPhone" value="${escapeHtml(m.phone||'')}" placeholder="10-digit mobile number">
    <label>Number of Shares (₹${SOCIETY.shareValue} each)</label>
    <input id="mShares" type="number" min="1" value="${m.sharesCount||1}">
    <label>Joining Date</label>
    <input id="mJoin" type="date" value="${m.joinDate || new Date().toISOString().slice(0,10)}">
    <label>Address</label>
    <textarea id="mAddress" rows="2">${escapeHtml(m.address||'')}</textarea>
    <button class="btn block" style="margin-top:16px;" onclick="submitMemberForm('${existing?existing.id:''}')">Save Member</button>
  `);
}

async function submitMemberForm(id){
  const name = document.getElementById('mName').value.trim();
  const phone = document.getElementById('mPhone').value.trim();
  const sharesCount = parseInt(document.getElementById('mShares').value || '0');
  const joinDate = document.getElementById('mJoin').value;
  const address = document.getElementById('mAddress').value.trim();
  if(!name || sharesCount < 1){ toast('Enter a name and at least 1 share.'); return; }
  await saveMember(id || null, {name, phone, sharesCount, joinDate, address});
  closeModal();
  toast('Member saved.');
  renderMembers();
  renderDashboard();
}

async function openMemberDetail(id){
  const m = await getMember(id);
  const loans = await getMemberLoans(id);
  const activeLoan = loans.find(l=>l.status==='active');
  openModal(`
    <div class="modal-head"><h3>${escapeHtml(m.name)}</h3><button class="close" onclick="closeModal()">✕</button></div>
    <div class="grid-2">
      <div class="stat"><div class="label">Shares</div><div class="value">${m.sharesCount}</div></div>
      <div class="stat"><div class="label">Monthly Contribution</div><div class="value">${fmtMoney(m.sharesCount*SOCIETY.shareValue)}</div></div>
    </div>
    <div class="section-title">Contact</div>
    <div class="meta">${escapeHtml(m.phone||'No phone on file')} · Joined ${m.joinDate||'—'}</div>
    <div class="section-title">Loan Status</div>
    ${activeLoan
      ? `<div class="meta">Active loan — outstanding <b class="amount">${fmtMoney(activeLoan.currentOutstanding)}</b></div>`
      : `<div class="meta">No active loan.</div>`}
    <div style="display:flex; gap:10px; margin-top:16px;">
      <button class="btn secondary block" onclick='openMemberForm(${JSON.stringify(m)})'>Edit</button>
      <button class="btn ${m.active===false?'':'danger'} block" onclick="toggleMemberActive('${m.id}', ${m.active===false})">${m.active===false?'Reactivate':'Deactivate'}</button>
    </div>
  `);
}

async function toggleMemberActive(id, makeActive){
  await db.collection('members').doc(id).set({active: makeActive}, {merge:true});
  closeModal();
  toast(makeActive ? 'Member reactivated.' : 'Member deactivated.');
  renderMembers();
}
