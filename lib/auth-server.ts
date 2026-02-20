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

function parseEmail(value: string | null | undefined): string | null {
  const email = value?.toLowerCase().trim() ?? "";
  if (!email || !email.includes("@")) {
    return null;
  }
  return email;
}

export async function getAuthenticatedUser(request: Request): Promise<AuthenticatedUser | null> {
  const emailFromHeader = parseEmail(request.headers.get("x-user-email"));
  if (emailFromHeader) {
    return { uid: emailFromHeader, email: emailFromHeader };
  }

  const bearer = extractBearer(request);
  if (!bearer) {
    return null;
  }

  const directEmail = parseEmail(bearer);
  if (directEmail) {
    return { uid: directEmail, email: directEmail };
  }

  const prefixedEmail = bearer.toLowerCase().startsWith("email:")
    ? parseEmail(bearer.slice(6))
    : null;
  if (prefixedEmail) {
    return { uid: prefixedEmail, email: prefixedEmail };
  }

  return null;
}
