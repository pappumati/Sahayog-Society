// =====================================================
// Settings — themes + staff accounts
// =====================================================
const THEMES = [
  {id:'bahi', name:'Bahi Khata', swatch:'#24304A'},
  {id:'harvest', name:'Harvest Gold', swatch:'#A9711E'},
  {id:'peepal', name:'Peepal Green', swatch:'#2D5F3E'},
  {id:'diya', name:'Diya Saffron', swatch:'#D2601A'},
  {id:'night', name:'Night Ledger', swatch:'#12141C'}
];

function applyTheme(id){
  document.documentElement.setAttribute('data-theme', id);
  document.body.setAttribute('data-theme', id);
  localStorage.setItem('sahyog_theme', id);
}
function initTheme(){
  applyTheme(localStorage.getItem('sahyog_theme') || 'bahi');
}

async function renderSettings(){
  const container = document.getElementById('viewSettings');
  const activeTheme = localStorage.getItem('sahyog_theme') || 'bahi';
  const users = await listUsers();

  container.innerHTML = `
    <div class="card">
      <h3>Theme</h3>
      <div class="swatch-row">
        ${THEMES.map(t=>`
          <div style="text-align:center;">
            <div class="swatch ${t.id===activeTheme?'active':''}" style="background:${t.swatch};" onclick="applyTheme('${t.id}'); renderSettings();"></div>
            <div style="font-size:10.5px; margin-top:4px; color:var(--ink-soft);">${t.name}</div>
          </div>`).join('')}
      </div>
    </div>
    <div class="card">
      <h3>Signed in as</h3>
      <div class="meta">${escapeHtml(currentProfile?.username||'')} (${currentProfile?.role||''}) ${currentProfile?.isDefaultAdmin?'\u2014 default admin, cannot be removed':''}</div>
      <button class="btn secondary block" style="margin-top:12px;" onclick="openChangePassword()">Change My Password</button>
      <button class="btn danger block" style="margin-top:10px;" onclick="doLogout()">Logout</button>
    </div>
    <div class="card">
      <div class="row" style="border:none; padding:0;">
        <h3>Staff Accounts</h3>
        <button class="btn" onclick="openAddStaff()">+ Add</button>
      </div>
      ${users.map(u=>`
        <div class="row">
          <div class="who">${escapeHtml(u.username)}</div>
          <span class="pill ${u.isDefaultAdmin?'paid':'pending'}">${u.isDefaultAdmin?'default admin':u.role}</span>
        </div>`).join('')}
    </div>
    ${currentProfile?.role === 'admin' ? `
    <div class="card" style="border-color:var(--debit);">
      <h3 style="color:var(--debit);">Danger Zone</h3>
      <div class="meta">Permanently erases every member, share payment, loan, and report record — for wiping test data before going live. Staff logins and your admin login are kept.</div>
      <button class="btn block" style="margin-top:12px; background:transparent; color:var(--debit); border:1.5px solid var(--debit);" onclick="openClearAllDataConfirm()">Clear All Society Data</button>
    </div>` : ''}`;
}

function openClearAllDataConfirm(){
  openModal(`
    <div class="modal-head"><h3>Clear All Data?</h3><button class="close" onclick="closeModal()">✕</button></div>
    <div class="meta">This deletes <b>every</b> member, share payment, loan, ledger entry, and year-end record — permanently, with no undo. Your login and any staff logins are kept.</div>
    <label>Type <b>DELETE</b> to confirm</label>
    <input id="wipeConfirmText" autocapitalize="off" placeholder="DELETE">
    <button class="btn danger block" style="margin-top:14px;" onclick="submitClearAllData()">Erase Everything</button>
  `);
}

async function submitClearAllData(){
  const val = document.getElementById('wipeConfirmText').value.trim();
  if(val !== 'DELETE'){ toast('Type DELETE exactly to confirm.'); return; }
  await clearAllSocietyData();
  closeModal();
  toast('All society data cleared.');
  renderDashboard();
  renderSettings();
}

// Deletes every document across the society's data collections —
// members, contributions, loans, loanLedger, years, distributions.
// Deliberately leaves the `users` collection (logins) untouched.
async function clearAllSocietyData(){
  const collections = ['members','contributions','loans','loanLedger','years','distributions'];
  for(const col of collections){
    const snap = await db.collection(col).get();
    const docs = snap.docs;
    for(let i=0; i<docs.length; i+=450){
      const batch = db.batch();
      docs.slice(i, i+450).forEach(d => batch.delete(d.ref));
      await batch.commit();
    }
  }
}

function openAddStaff(){
  openModal(`
    <div class="modal-head"><h3>Add Staff Login</h3><button class="close" onclick="closeModal()">✕</button></div>
    <label>Username</label>
    <input id="staffUser" autocapitalize="off">
    <label>Password (6+ characters)</label>
    <input id="staffPass" type="password">
    <button class="btn block" style="margin-top:14px;" onclick="submitAddStaff()">Create Login</button>
  `);
}
async function submitAddStaff(){
  const u = document.getElementById('staffUser').value.trim();
  const p = document.getElementById('staffPass').value;
  try{
    await addStaffUser(u, p);
    closeModal();
    toast('Staff login created.');
    renderSettings();
  }catch(e){ toast(e.message); }
}

function openChangePassword(){
  openModal(`
    <div class="modal-head"><h3>Change Password</h3><button class="close" onclick="closeModal()">✕</button></div>
    <label>New Password (6+ characters)</label>
    <input id="newPass" type="password">
    <button class="btn block" style="margin-top:14px;" onclick="submitChangePassword()">Update Password</button>
  `);
}
async function submitChangePassword(){
  try{
    await changeOwnPassword(document.getElementById('newPass').value);
    closeModal();
    toast('Password updated.');
  }catch(e){ toast(e.message); }
}
