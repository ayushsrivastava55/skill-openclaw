"use client";

import { initializeApp, getApps } from "firebase/app";
import { browserLocalPersistence, getAuth, GoogleAuthProvider, onAuthStateChanged, setPersistence } from "firebase/auth";
import { getAnalytics, isSupported } from "firebase/analytics";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID
};

function getFirebaseApp() {
  return getApps()[0] ?? initializeApp(firebaseConfig);
}

export function getFirebaseAuth() {
  if (!firebaseConfig.apiKey || !firebaseConfig.authDomain) {
    return null;
  }
  const app = getFirebaseApp();
  const auth = getAuth(app);
  // Ensure auth is persisted across refresh/navigation.
  // (Default is local persistence, but we make it explicit to avoid edge cases.)
  void setPersistence(auth, browserLocalPersistence).catch(() => {});
  return auth;
}

let analyticsInitAttempted = false;

export async function initFirebaseAnalytics() {
  if (analyticsInitAttempted || typeof window === "undefined") {
    return;
  }
  analyticsInitAttempted = true;

  if (!firebaseConfig.apiKey || !firebaseConfig.measurementId) {
    return;
  }

  if (!(await isSupported())) {
    return;
  }

  const app = getFirebaseApp();
  getAnalytics(app);
}

export const googleProvider = new GoogleAuthProvider();
googleProvider.addScope("profile");

export async function getFirebaseIdToken(timeoutMs = 6000) {
  const auth = getFirebaseAuth();
  if (!auth) {
    return null;
  }
  if (auth.currentUser) {
    return auth.currentUser.getIdToken();
  }

  return new Promise<string | null>((resolve) => {
    const timer = setTimeout(() => {
      unsubscribe();
      resolve(null);
    }, timeoutMs);

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      clearTimeout(timer);
      unsubscribe();
      if (!user) {
        resolve(null);
        return;
      }
      try {
        const token = await user.getIdToken();
        resolve(token);
      } catch {
        resolve(null);
      }
    });
  });
}
