import { firebaseConfigFrom } from "../lib/firebaseConfig";
import { parseAccuracyDoc, type AccuracyStore } from "./storage";
import type { AccuracyDoc } from "./stats";

type FirestoreModule = typeof import("firebase/firestore");

async function context(): Promise<{ db: import("firebase/firestore").Firestore; firestore: FirestoreModule } | null> {
  const config = firebaseConfigFrom(import.meta.env);
  if (!config) return null;
  const [{ getApp, getApps, initializeApp }, firestore] = await Promise.all([
    import("firebase/app"),
    import("firebase/firestore"),
  ]);
  const app = getApps().length > 0 ? getApp() : initializeApp(config);
  return { db: firestore.getFirestore(app), firestore };
}

export async function loadRemoteAccuracy(uid: string): Promise<AccuracyStore> {
  const ctx = await context();
  if (!ctx) return {};
  const snap = await ctx.firestore.getDocs(ctx.firestore.collection(ctx.db, "users", uid, "accuracy"));
  const store: AccuracyStore = {};
  for (const item of snap.docs) {
    const doc = parseAccuracyDoc(item.id, item.data());
    if (doc) store[item.id] = doc;
  }
  return store;
}

export async function persistRemoteAccuracy(uid: string, dir: string, doc: AccuracyDoc): Promise<void> {
  const ctx = await context();
  if (!ctx) return;
  const ref = ctx.firestore.doc(ctx.db, "users", uid, "accuracy", dir);
  if (Object.keys(doc.words).length === 0) {
    await ctx.firestore.deleteDoc(ref);
    return;
  }
  await ctx.firestore.setDoc(ref, doc);
}
