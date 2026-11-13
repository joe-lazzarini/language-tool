import { firebaseConfigFrom, isFirebaseConfigured, type FirebaseWebConfig } from "./firebaseConfig";
import { parseStoredWord, toFirestoreWord, type CustomWord } from "./customWords";

export type Account = {
  uid: string;
  name: string | null;
  email: string | null;
};

type FirebaseApi = {
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  watchAuth: (onAccount: (account: Account | null) => void) => () => void;
  watchWords: (
    uid: string,
    onWords: (words: CustomWord[]) => void,
    onError: (message: string) => void,
  ) => () => void;
  writeWord: (uid: string, word: CustomWord) => Promise<void>;
  removeWord: (uid: string, wordId: string) => Promise<void>;
};

let apiPromise: Promise<FirebaseApi | null> | null = null;

export { isFirebaseConfigured };

export function authErrorMessage(error: unknown): string {
  const code =
    typeof error === "object" && error && "code" in error ? String((error as { code: unknown }).code) : "";
  if (code === "auth/popup-blocked") {
    return "The browser blocked the Google sign-in popup. Allow popups for this site and try again.";
  }
  if (code === "auth/unauthorized-domain") {
    return "This site is not an authorized domain in Firebase Authentication yet.";
  }
  if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") {
    return "Sign-in was cancelled.";
  }
  return "Google sign-in didn't finish. Try again.";
}

async function createApi(config: FirebaseWebConfig): Promise<FirebaseApi> {
  const [{ initializeApp }, auth, firestore] = await Promise.all([
    import("firebase/app"),
    import("firebase/auth"),
    import("firebase/firestore"),
  ]);
  const app = initializeApp(config);
  const authClient = auth.getAuth(app);
  const db = firestore.getFirestore(app);
  const provider = new auth.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });

  return {
    signIn: async () => {
      await auth.signInWithPopup(authClient, provider);
    },
    signOut: () => auth.signOut(authClient),
    watchAuth: (onAccount) =>
      auth.onAuthStateChanged(authClient, (user) => {
        onAccount(
          user
            ? { uid: user.uid, name: user.displayName, email: user.email }
            : null,
        );
      }),
    watchWords: (uid, onWords, onError) =>
      firestore.onSnapshot(
        firestore.collection(db, "users", uid, "words"),
        (snap) => {
          onWords(
            snap.docs
              .map((item) => parseStoredWord(item.data()))
              .filter((item): item is CustomWord => item !== null),
          );
        },
        () => onError("Couldn't read words from your account. Showing this device's copy."),
      ),
    writeWord: (uid, word) =>
      firestore.setDoc(firestore.doc(db, "users", uid, "words", word.id), toFirestoreWord(word)),
    removeWord: (uid, wordId) => firestore.deleteDoc(firestore.doc(db, "users", uid, "words", wordId)),
  };
}

export function loadFirebase(): Promise<FirebaseApi | null> {
  const config = firebaseConfigFrom(import.meta.env);
  if (!config) return Promise.resolve(null);
  if (!apiPromise) {
    apiPromise = createApi(config).catch((error) => {
      apiPromise = null;
      throw error;
    });
  }
  return apiPromise;
}
