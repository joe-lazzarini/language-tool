import type { Account } from "../lib/account";

export function AccountBar({
  configured,
  account,
  ready,
  status,
  error,
  signingIn,
  onSignIn,
  onSignOut,
}: {
  configured: boolean;
  account: Account | null;
  ready: boolean;
  status: string | null;
  error: string | null;
  signingIn: boolean;
  onSignIn: () => void;
  onSignOut: () => void;
}) {
  const name = account?.name || account?.email || "your Google account";
  return (
    <section className="account" aria-label="Account">
      {!configured && (
        <p className="note">
          Cloud sync isn't configured for this build. Words you add stay in this browser.
        </p>
      )}
      {configured && !account && (
        <div className="account-row">
          <p className="hint">
            Sign in with Google to sync words across devices. Until then they stay in this browser.
          </p>
          <button type="button" className="secondary" onClick={onSignIn} disabled={!ready || signingIn}>
            {signingIn ? "Signing in…" : "Sign in with Google"}
          </button>
        </div>
      )}
      {configured && account && (
        <div className="account-row">
          <p className="hint">Signed in as {name}. Your words sync to this account.</p>
          <button type="button" className="ghost" onClick={onSignOut}>
            Sign out
          </button>
        </div>
      )}
      {status && <p className="banner ok">{status}</p>}
      {error && <p className="banner">{error}</p>}
    </section>
  );
}
