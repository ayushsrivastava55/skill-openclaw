import { cert, getApps, initializeApp } from "firebase-admin/app";

function parseServiceAccount() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) {
    return null;
  }
  const parsed = JSON.parse(raw) as {
    project_id: string;
    client_email: string;
    private_key: string;
  };
  return {
    projectId: parsed.project_id,
    clientEmail: parsed.client_email,
    privateKey: parsed.private_key.replace(/\\n/g, "\n")
  };
}

export function initFirebaseAdmin() {
  if (getApps().length > 0) {
    return getApps()[0];
  }

  const creds = parseServiceAccount();
  if (!creds) {
    return initializeApp();
  }

  return initializeApp({
    credential: cert(creds)
  });
}
