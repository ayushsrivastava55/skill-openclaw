import { getAuth } from "firebase-admin/auth";
import { initFirebaseAdmin } from "@/lib/firebase-admin";

export type AuthenticatedUser = {
  uid: string;
  email: string;
};

function extractBearer(request: Request) {
  const auth = request.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) {
    return null;
  }
  return auth.slice(7).trim();
}

export async function getAuthenticatedUser(request: Request): Promise<AuthenticatedUser | null> {
  const token = extractBearer(request);
  if (!token) {
    return null;
  }

  try {
    initFirebaseAdmin();
    const decoded = await getAuth().verifyIdToken(token);
    const email = decoded.email?.toLowerCase().trim();
    if (!email) {
      return null;
    }
    return {
      uid: decoded.uid,
      email
    };
  } catch {
    return null;
  }
}
