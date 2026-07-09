// =====================================================
// App shell / router
// =====================================================
const TABS = [
  {id:'dashboard', label:'Home', icon:'\uD83C\uDFE0'},
  {id:'members', label:'Members', icon:'\uD83D\uDC65'},
  {id:'shares', label:'Shares', icon:'\uD83D\uDCB0'},
  {id:'loans', label:'Loans', icon:'\uD83D\uDCB3'},
  {id:'reminders', label:'Remind', icon:'\uD83D\uDD14'},
  {id:'reports', label:'Reports', icon:'\uD83D\uDCCA'},
  {id:'yearend', label:'Year-End', icon:'\uD83D\uDCC5'},
  {id:'settings', label:'Settings', icon:'\u2699\uFE0F'}
];

function startApp(){
  document.getElementById('app').innerHTML = `
    <div class="topbar">
      <div class="stamp">SS</div>
      <div class="titles">
        <div class="display" style="font-size:16.5px;">Sahyog Society</div>
        <small>${escapeHtml(currentProfile?.username || '')}</small>
      </div>
    </div>

    <div id="viewDashboard" class="page"></div>
    <div id="viewMembers" class="page hidden"></div>
    <div id="viewShares" class="page hidden"></div>
    <div id="viewLoans" class="page hidden"></div>
    <div id="viewReminders" class="page hidden"></div>
    <div id="viewReports" class="page hidden"></div>
    <div id="viewYearEnd" class="page hidden"></div>
    <div id="viewSettings" class="page hidden"></div>

    <div class="bottomnav">
      ${TABS.map(t=>`
        <button class="navbtn ${t.id==='dashboard'?'active':''}" id="nav-${t.id}" onclick="switchTab('${t.id}')">
          <span style="font-size:17px;">${t.icon}</span>${t.label}
        </button>`).join('')}
    </div>

    <div class="modal-backdrop" id="modalBackdrop" onclick="if(event.target===this) closeModal()">
      <div class="modal"><div id="modalBody"></div></div>
    </div>
    <div id="toast"></div>
  `;
  renderDashboard();
}

const VIEW_ID = {
  dashboard:'viewDashboard', members:'viewMembers', shares:'viewShares',
  loans:'viewLoans', reminders:'viewReminders', reports:'viewReports',
  yearend:'viewYearEnd', settings:'viewSettings'
};
const RENDER_FN = {
  dashboard: renderDashboard, members: renderMembers, shares: renderContributions,
  loans: renderLoans, reminders: renderReminders, reports: renderReports,
  yearend: renderYearEnd, settings: renderSettings
};

function switchTab(tabId){
  TABS.forEach(t=>{
    document.getElementById(VIEW_ID[t.id]).classList.toggle('hidden', t.id!==tabId);
    document.getElementById('nav-'+t.id).classList.toggle('active', t.id===tabId);
  });
  RENDER_FN[tabId]();
}

// ---------- boot ----------
document.addEventListener('DOMContentLoaded', ()=>{
  initTheme();
  ensureDefaultAdminExists();
});

// PWA service worker
if('serviceWorker' in navigator){
  window.addEventListener('load', ()=>{
    navigator.serviceWorker.register('./service-worker.js').catch(()=>{});
  });
}
