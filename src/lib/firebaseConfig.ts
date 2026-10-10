export type FirebaseWebConfig = {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
};

function read(env: Record<string, string | undefined>, key: string): string {
  return (env[key] ?? "").trim();
}

/** Null when the build has no Firebase web config, so the app stays local-only. */
export function firebaseConfigFrom(env: Record<string, string | undefined>): FirebaseWebConfig | null {
  const apiKey = read(env, "VITE_FIREBASE_API_KEY");
  const authDomain = read(env, "VITE_FIREBASE_AUTH_DOMAIN");
  const projectId = read(env, "VITE_FIREBASE_PROJECT_ID");
  const appId = read(env, "VITE_FIREBASE_APP_ID");
  if (!apiKey || !authDomain || !projectId || !appId) return null;
  return {
    apiKey,
    authDomain,
    projectId,
    storageBucket: read(env, "VITE_FIREBASE_STORAGE_BUCKET"),
    messagingSenderId: read(env, "VITE_FIREBASE_MESSAGING_SENDER_ID"),
    appId,
  };
}

export function isFirebaseConfigured(): boolean {
  return firebaseConfigFrom(import.meta.env) !== null;
}
