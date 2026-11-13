import { describe, expect, it } from "vitest";
import { firebaseConfigFrom } from "./firebaseConfig";

const complete = {
  VITE_FIREBASE_API_KEY: "key",
  VITE_FIREBASE_AUTH_DOMAIN: "app.firebaseapp.com",
  VITE_FIREBASE_PROJECT_ID: "app",
  VITE_FIREBASE_STORAGE_BUCKET: "app.appspot.com",
  VITE_FIREBASE_MESSAGING_SENDER_ID: "123",
  VITE_FIREBASE_APP_ID: "1:123:web:abc",
};

describe("firebaseConfigFrom", () => {
  it("returns null when the build has no Firebase config", () => {
    expect(firebaseConfigFrom({})).toBeNull();
    expect(firebaseConfigFrom({ ...complete, VITE_FIREBASE_API_KEY: "  " })).toBeNull();
  });

  it("reads the Vite env names", () => {
    expect(firebaseConfigFrom(complete)).toEqual({
      apiKey: "key",
      authDomain: "app.firebaseapp.com",
      projectId: "app",
      storageBucket: "app.appspot.com",
      messagingSenderId: "123",
      appId: "1:123:web:abc",
    });
  });
});
