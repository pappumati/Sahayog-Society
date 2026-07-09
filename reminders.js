// =====================================================
// Reminders — surfaces unpaid members for the current
// month with a ready-to-send Hindi WhatsApp message.
// =====================================================
async function renderReminders(){
  const container = document.getElementById('viewReminders');
  const mKey = monthKey(new Date());
  const today = new Date().getDate();
  container.innerHTML = `
    <div class="card">
      <h3>Reminders — ${monthLabel(mKey)}</h3>
      <div class="meta">
        Share due by the ${SOCIETY.contributionDueDay}th of the month. Today is the ${today}${today===3?" — reminder day!":""}.
      </div>
    </div>
    <div id="reminderList"></div>`;
  await loadReminders(mKey);
}

async function loadReminders(mKey){
  await ensureMonthContributions(mKey);
  const list = (await getContributionsForMonth(mKey)).filter(c=>c.status!=='paid');
  const members = await getMembers(true);
  const byId = Object.fromEntries(members.map(m=>[m.id,m]));

  document.getElementById('reminderList').innerHTML = `
    <div class="card ledger">
      ${list.map(c=>{
        const phone = byId[c.memberId]?.phone || '';
        const msg = hindiReminderMessage(c.memberName, mKey);
        const wa = phone ? `https://wa.me/91${phone.replace(/\D/g,'').slice(-10)}?text=${encodeURIComponent(msg)}` : null;
        return `
        <div class="row">
          <div>
            <div class="who">${escapeHtml(c.memberName)}</div>
            <div class="meta">Due ${fmtMoney(c.amountDue)} · ${phone || 'no phone on file'}</div>
          </div>
          <div style="display:flex; gap:6px;">
            <button class="btn secondary" style="padding:6px 10px;font-size:12px;" onclick="showReminderText('${c.id}')">View</button>
            ${wa ? `<a class="btn" style="padding:6px 10px;font-size:12px; text-decoration:none;" href="${wa}" target="_blank">WhatsApp</a>` : ''}
          </div>
        </div>`;
      }).join('') || '<div class="meta">Everyone has paid this month 🎉</div>'}
    </div>`;
}

function showReminderText(contribId){
  db.collection('contributions').doc(contribId).get().then(d=>{
    const c = d.data();
    const msg = hindiReminderMessage(c.memberName, c.month);
    openModal(`
      <div class="modal-head"><h3>Reminder Message</h3><button class="close" onclick="closeModal()">✕</button></div>
      <div class="card card-alt" style="white-space:pre-line; font-size:14px; line-height:1.6;">${escapeHtml(msg)}</div>
      <button class="btn block" style="margin-top:12px;" onclick="copyReminderText(this)" data-msg="${escapeHtml(msg)}">Copy Text</button>
    `);
  });
}
function copyReminderText(btn){
  navigator.clipboard.writeText(btn.dataset.msg).then(()=> toast('Copied to clipboard.'));
}
