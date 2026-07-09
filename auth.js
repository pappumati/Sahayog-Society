// =====================================================
// Auth: username/password login on top of Firebase Auth
// (username -> internal fake email), default admin seed,
// and staff account management.
// =====================================================
let currentUser = null;   // firebase auth user
let currentProfile = null; // { username, role, isDefaultAdmin }

const DEFAULT_ADMIN = { username: "admin", password: "admin123" };

async function ensureDefaultAdminExists(){
  const snap = await db.collection('users').doc('admin').get();
  if(snap.exists) return;
  // Seed default admin — only runs once, the very first time the
  // app connects to a fresh Firebase project.
  try{
    const cred = await auth.createUserWithEmailAndPassword(
      usernameToEmail(DEFAULT_ADMIN.username), DEFAULT_ADMIN.password);
    await db.collection('users').doc('admin').set({
      username: DEFAULT_ADMIN.username,
      role: 'admin',
      isDefaultAdmin: true,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    await auth.signOut();
  }catch(e){
    // If it already exists in Auth but not Firestore, or any other
    // race — fail quietly, login screen will surface real errors.
    console.warn("Default admin seed:", e.message);
  }
}

function renderLogin(){
  document.getElementById('app').innerHTML = `
    <div class="page" style="padding-top:14vh; max-width:380px;">
      <div style="text-align:center; margin-bottom:26px;">
        <div class="stamp" style="width:60px;height:60px;font-size:22px;border-color:var(--primary);color:var(--primary);margin:0 auto 12px;">SS</div>
        <h1 class="display" style="font-size:24px;">Sahyog Society</h1>
        <div style="color:var(--ink-soft); font-size:13px; margin-top:2px;">Society Ledger &amp; Loan Register</div>
      </div>
      <div class="card">
        <label>Username</label>
        <input id="loginUser" autocapitalize="off" placeholder="admin">
        <label>Password</label>
        <input id="loginPass" type="password" placeholder="••••••••">
        <button class="btn block" style="margin-top:16px;" onclick="doLogin()">Login</button>
        <div id="loginErr" style="color:var(--debit); font-size:12.5px; margin-top:10px;"></div>
      </div>
      <div style="text-align:center; color:var(--ink-soft); font-size:11.5px;">Default: admin / admin123</div>
    </div>`;
}

async function doLogin(){
  const u = document.getElementById('loginUser').value.trim();
  const p = document.getElementById('loginPass').value;
  const errEl = document.getElementById('loginErr');
  errEl.textContent = '';
  if(!u || !p){ errEl.textContent = 'Enter username and password.'; return; }
  try{
    await auth.signInWithEmailAndPassword(usernameToEmail(u), p);
  }catch(e){
    errEl.textContent = 'Invalid username or password.';
  }
}

function doLogout(){
  auth.signOut();
}

async function loadProfile(uid, email){
  // Try to find the matching user profile doc by email-derived username
  const q = await db.collection('users').where('uid','==',uid).limit(1).get();
  if(!q.empty){ return q.docs[0].data(); }
  // fallback: admin doc created at seed time has no uid stored yet — patch it
  if(email === usernameToEmail('admin')){
    await db.collection('users').doc('admin').set({uid}, {merge:true});
    const d = await db.collection('users').doc('admin').get();
    return d.data();
  }
  return { username: email.split('@')[0], role:'staff', isDefaultAdmin:false };
}

auth.onAuthStateChanged(async (user)=>{
  if(user){
    currentUser = user;
    currentProfile = await loadProfile(user.uid, user.email);
    startApp();
  } else {
    currentUser = null; currentProfile = null;
    renderLogin();
  }
});

// ---------- Staff / user management (Settings tab) ----------
async function listUsers(){
  const snap = await db.collection('users').get();
  return snap.docs.map(d=>({id:d.id, ...d.data()}));
}

async function addStaffUser(username, password){
  if(!username || password.length < 6) throw new Error("Password must be 6+ characters.");
  const email = usernameToEmail(username);
  // Creating a user signs the admin OUT and the new user IN on the
  // client SDK, so we spin up a secondary Firebase app instance just
  // for this one call to avoid disturbing the admin's session.
  const secondary = firebase.initializeApp(firebaseConfig, "secondary-" + Date.now());
  try{
    const cred = await secondary.auth().createUserWithEmailAndPassword(email, password);
    await db.collection('users').doc(cred.user.uid).set({
      uid: cred.user.uid, username, role:'staff', isDefaultAdmin:false,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    await secondary.auth().signOut();
  } finally {
    await secondary.delete();
  }
}

async function changeOwnPassword(newPassword){
  if(newPassword.length < 6) throw new Error("Password must be 6+ characters.");
  await currentUser.updatePassword(newPassword);
}
