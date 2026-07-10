// =====================================================
// Shared constants & helpers
// =====================================================
const SOCIETY = {
  name: "Sahyog Society",
  shareValue: 200,       // ₹ per share
  monthlyInterestPct: 3, // % compound, on unpaid loan balance
  penaltyAmount: 50,     // ₹ flat penalty for late share payment
  contributionDueDay: 6, // share payment due by 6th
  reminderDay: 3,        // admin gets reminded on the 3rd
  yearStartMonth: 10      // October (1=Jan ... 10=Oct)
};

const HINDI_MONTHS = {
  1:"जनवरी",2:"फरवरी",3:"मार्च",4:"अप्रैल",5:"मई",6:"जून",
  7:"जुलाई",8:"अगस्त",9:"सितंबर",10:"अक्टूबर",11:"नवंबर",12:"दिसंबर"
};

const EN_MONTHS = ["","January","February","March","April","May","June",
  "July","August","September","October","November","December"];

function fmtMoney(n){
  const v = Math.round((n || 0) * 100) / 100;
  return "₹" + v.toLocaleString("en-IN", {maximumFractionDigits:2});
}

function monthKey(date){
  const d = date instanceof Date ? date : new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
}

function monthLabel(key){
  const [y,m] = key.split('-').map(Number);
  return `${EN_MONTHS[m]} ${y}`;
}

// Given any date, return the Sahyog "society year" it falls in,
// e.g. Nov 2025 -> "2025-2026" (Oct 2025 to Sep 2026)
function societyYearOf(date){
  const d = date instanceof Date ? date : new Date(date);
  const y = d.getFullYear(), m = d.getMonth()+1;
  if(m >= SOCIETY.yearStartMonth){
    return `${y}-${y+1}`;
  }
  return `${y-1}-${y}`;
}

function societyYearBounds(yearId){
  const [y1] = yearId.split('-').map(Number);
  const start = new Date(y1, SOCIETY.yearStartMonth-1, 1);
  const end = new Date(y1+1, SOCIETY.yearStartMonth-2, 28); // last day of Sep next year (safe-ish)
  return {start, end};
}

// All 12 month-keys of a society year, Oct -> Sep
function societyYearMonths(yearId){
  const [y1] = yearId.split('-').map(Number);
  const months = [];
  for(let i=0;i<12;i++){
    const m = SOCIETY.yearStartMonth + i;
    const yy = m > 12 ? y1+1 : y1;
    const mm = m > 12 ? m-12 : m;
    months.push(`${yy}-${String(mm).padStart(2,'0')}`);
  }
  return months;
}

function nextMonthKey(key){
  const [y,m] = key.split('-').map(Number);
  const d = new Date(y, m, 1); // rolls to next month
  return monthKey(d);
}

// Hindi reminder message template
function hindiReminderMessage(memberName, monthKeyStr){
  const [y,m] = monthKeyStr.split('-').map(Number);
  const monthName = HINDI_MONTHS[m];
  return `प्रिय ${memberName},\nआपको ${monthName} माह का शेयर राशि दिनांक ${SOCIETY.contributionDueDay} तारीख तक जमा करनी थी, परंतु आपने अभी तक जमा नहीं की है। कृपया ${monthName} माह के अंत तक अवश्य जमा करें, अन्यथा ₹${SOCIETY.penaltyAmount} विलंब शुल्क (पेनल्टी) लगाया जाएगा।\n— Sahyog Society`;
}

// Hindi payment-confirmation message template
function hindiPaymentConfirmationMessage(memberName, amountPaid, sharesCount, monthKeyStr){
  const [y,m] = monthKeyStr.split('-').map(Number);
  const monthName = HINDI_MONTHS[m];
  return `प्रिय ${memberName},\nआपके ${sharesCount} शेयर हेतु ${monthName} माह का ₹${amountPaid} भुगतान सफलतापूर्वक प्राप्त हो गया है। धन्यवाद।\n— Sahyog Society`;
}

// ---------- tiny UI helpers ----------
function toast(msg, ms=2400){
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(()=> el.classList.remove('show'), ms);
}

function openModal(html){
  const backdrop = document.getElementById('modalBackdrop');
  const body = document.getElementById('modalBody');
  body.innerHTML = html;
  backdrop.classList.add('show');
}
function closeModal(){
  document.getElementById('modalBackdrop').classList.remove('show');
}
function escapeHtml(s){
  return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
