import { cert, getApps, initializeApp } from "firebase-admin/app";

function parseServiceAccount() {
  const projectId = process.env.FIREBASE_PROJECT_ID?.trim();
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL?.trim();
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.trim();
  const privateKeyBase64 = process.env.FIREBASE_PRIVATE_KEY_BASE64?.trim();

  if (projectId && clientEmail && (privateKey || privateKeyBase64)) {
    const rawKey = privateKeyBase64
      ? Buffer.from(privateKeyBase64, "base64").toString("utf8")
      : privateKey ?? "";
    return {
      projectId,
      clientEmail,
      privateKey: rawKey.replace(/\\n/g, "\n")
    };
  }

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
