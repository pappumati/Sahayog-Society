// =====================================================
// Firebase configuration
// Replace the values below with YOUR Firebase project's
// config (Firebase Console → Project Settings → General
// → Your apps → SDK setup and configuration).
// =====================================================
const firebaseConfig = {
  apiKey: "AIzaSyB3s83Xo-SnX_HtotRU-IbIW2-CsbryZUc",
  authDomain: "sahyog-society.firebaseapp.com",
  projectId: "sahyog-society",
  storageBucket: "sahyog-society.firebasestorage.app",
  messagingSenderId: "391358475136",
  appId: "1:391358475136:web:4603fb22289bd24b672f65"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// Username-based login maps to a fake internal email so we can
// keep using Firebase Auth's email/password sign-in under the hood.
function usernameToEmail(username){
  return username.trim().toLowerCase().replace(/[^a-z0-9._-]/g,'') + "@sahyog.local";
}
