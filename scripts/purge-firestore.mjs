import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

function requireEnv(name) {
  const value = String(process.env[name] || "").trim();
  return value.length ? value : null;
}

function parseServiceAccountFromEnv() {
  const projectId = requireEnv("FIREBASE_PROJECT_ID");
  const clientEmail = requireEnv("FIREBASE_CLIENT_EMAIL");
  const privateKey = requireEnv("FIREBASE_PRIVATE_KEY");
  const privateKeyBase64 = requireEnv("FIREBASE_PRIVATE_KEY_BASE64");

  if (projectId && clientEmail && (privateKey || privateKeyBase64)) {
    const rawKey = privateKeyBase64
      ? Buffer.from(privateKeyBase64, "base64").toString("utf8")
      : privateKey;
    return {
      projectId,
      clientEmail,
      privateKey: String(rawKey || "").replace(/\\n/g, "\n")
    };
  }

  const rawJson = requireEnv("FIREBASE_SERVICE_ACCOUNT_JSON");
  if (!rawJson) return null;

  const parsed = JSON.parse(rawJson);
  if (!parsed?.project_id || !parsed?.client_email || !parsed?.private_key) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON missing required fields");
  }

  return {
    projectId: parsed.project_id,
    clientEmail: parsed.client_email,
    privateKey: String(parsed.private_key).replace(/\\n/g, "\n")
  };
}

function initAdmin() {
  if (getApps().length) return getApps()[0];
  const creds = parseServiceAccountFromEnv();
  if (!creds) {
    throw new Error(
      "Missing Firebase admin credentials. Set FIREBASE_SERVICE_ACCOUNT_JSON or FIREBASE_PROJECT_ID/FIREBASE_CLIENT_EMAIL/FIREBASE_PRIVATE_KEY."
    );
  }
  return initializeApp({ credential: cert(creds) });
}

async function listAllDocs(colRef) {
  const docs = [];
  const snap = await colRef.get();
  for (const doc of snap.docs) docs.push(doc.ref);
  return docs;
}

async function deleteDocRecursive(docRef) {
  const subcols = await docRef.listCollections();
  for (const col of subcols) {
    const docs = await listAllDocs(col);
    for (const ref of docs) {
      await deleteDocRecursive(ref);
    }
  }
  await docRef.delete();
}

async function deleteCollection(db, name) {
  const col = db.collection(name);
  const docs = await listAllDocs(col);
  for (const ref of docs) {
    await deleteDocRecursive(ref);
  }
  return docs.length;
}

async function disableOpenRouterKeysBestEffort(db) {
  const provisioningKey = requireEnv("OPENROUTER_PROVISIONING_KEY");
  if (!provisioningKey) return { attempted: 0, disabled: 0, skipped: "OPENROUTER_PROVISIONING_KEY not set" };

  const snap = await db.collection("openrouterKeys").get();
  let attempted = 0;
  let disabled = 0;
  for (const doc of snap.docs) {
    const data = doc.data() || {};
    const hash = String(data.keyHash || "").trim();
    if (!hash) continue;
    attempted += 1;
    try {
      const res = await fetch(`https://openrouter.ai/api/v1/keys/${encodeURIComponent(hash)}`, {
        method: "PATCH",
        headers: {
          Authorization: "Bearer " + provisioningKey,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ disabled: true })
      });
      if (res.ok) disabled += 1;
    } catch {
      // ignore
    }
  }
  return { attempted, disabled };
}

async function main() {
  const confirm = requireEnv("PURGE_CONFIRM");
  if (confirm !== "YES") {
    console.error('Refusing to run. Set PURGE_CONFIRM=YES to confirm destructive purge.');
    process.exit(2);
  }

  initAdmin();
  const db = getFirestore();

  const collections = [
    "users",
    "deployments",
    "usage",
    "checkoutSessions",
    "processedPayPalOrders",
    "processedRazorpayPayments",
    "processedGumroadSales",
    "processedDodoEvents",
    "openrouterKeys",
    "xConnections",
    "xUserConnections",
    "xOAuthStates",
    "config"
  ];

  console.log(JSON.stringify({ ok: true, action: "purge_firestore", collections }, null, 2));

  const openrouterResult = await disableOpenRouterKeysBestEffort(db);
  console.log(JSON.stringify({ openrouter_disable: openrouterResult }, null, 2));

  const deleted = {};
  for (const name of collections) {
    const count = await deleteCollection(db, name);
    deleted[name] = count;
    console.log(JSON.stringify({ deleted: name, count }, null, 2));
  }

  console.log(JSON.stringify({ ok: true, deleted }, null, 2));
}

main().catch((err) => {
  console.error(String(err?.stack || err?.message || err));
  process.exit(1);
});
