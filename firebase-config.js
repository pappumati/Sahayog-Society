// =====================================================
// Firebase configuration
// Replace the values below with YOUR Firebase project's
// config (Firebase Console → Project Settings → General
// → Your apps → SDK setup and configuration).
// =====================================================
const firebaseConfig = {
  apiKey: "REPLACE_WITH_YOUR_API_KEY",
  authDomain: "REPLACE_WITH_YOUR_PROJECT.firebaseapp.com",
  projectId: "REPLACE_WITH_YOUR_PROJECT_ID",
  storageBucket: "REPLACE_WITH_YOUR_PROJECT.appspot.com",
  messagingSenderId: "REPLACE_WITH_SENDER_ID",
  appId: "REPLACE_WITH_APP_ID"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// Username-based login maps to a fake internal email so we can
// keep using Firebase Auth's email/password sign-in under the hood.
function usernameToEmail(username){
  return username.trim().toLowerCase().replace(/[^a-z0-9._-]/g,'') + "@sahyog.local";
}
