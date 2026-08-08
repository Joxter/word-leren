// Sign-in wall. Nothing in the app renders without a user, because nothing in
// the app can be read or written without one — see `instant.perms.ts`.
//
// Auth is magic-code only: Instant mails a six-digit code and swaps it for a
// long-lived session, so there is no password to store, leak or reset.

import { useState } from "react";
import { css } from "@linaria/core";
import { db } from "../db";
import { setSessionUser } from "../lib/session";

const screen = css`
  max-width: 380px;
  margin: 0 auto;
  padding: 5rem 1.5rem;
`;

const title = css`
  margin: 0 0 0.5rem;
  font-size: 1.5rem;
  font-weight: 600;
`;

const sub = css`
  margin: 0 0 1.5rem;
  color: #666;
  font-size: 0.875rem;
  line-height: 1.5;
`;

const form = css`
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
`;

const input = css`
  width: 100%;
  box-sizing: border-box;
  padding: 0.625rem 0.75rem;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 1rem;
  font-family: inherit;

  &:focus {
    outline: none;
    border-color: #1a1a1a;
  }
`;

const codeInput = css`
  letter-spacing: 0.3em;
  text-align: center;
  font-variant-numeric: tabular-nums;
`;

const submit = css`
  background: #1a1a1a;
  color: #fff;
  border: none;
  padding: 0.625rem 1rem;
  border-radius: 6px;
  font-size: 0.875rem;
  cursor: pointer;

  &:hover:not(:disabled) {
    background: #333;
  }

  &:disabled {
    opacity: 0.5;
    cursor: default;
  }
`;

const linkBtn = css`
  background: none;
  border: none;
  padding: 0;
  color: #666;
  font-size: 0.8125rem;
  cursor: pointer;
  text-decoration: underline;
  align-self: flex-start;

  &:hover {
    color: #111;
  }
`;

const errorText = css`
  color: #c00;
  font-size: 0.8125rem;
  margin: 0;
`;

const centered = css`
  padding: 5rem 1.5rem;
  text-align: center;
  color: #999;
  font-size: 0.875rem;
`;

function messageOf(err: unknown): string {
  if (err && typeof err === "object") {
    const body = (err as { body?: { message?: string } }).body;
    if (body?.message) return body.message;
    const message = (err as { message?: string }).message;
    if (message) return message;
  }
  return "Something went wrong. Try again.";
}

function SignIn() {
  // The email is kept after it is sent: the code step needs it back to verify,
  // and returning to the first step should not make you retype it.
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sendCode(e: React.FormEvent) {
    e.preventDefault();
    const address = email.trim();
    if (!address) return;
    setBusy(true);
    setError(null);
    try {
      await db.auth.sendMagicCode({ email: address });
      setEmail(address);
      setSent(true);
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  }

  async function verifyCode(e: React.FormEvent) {
    e.preventDefault();
    const digits = code.trim();
    if (!digits) return;
    setBusy(true);
    setError(null);
    try {
      // On success `useAuth` flips and this whole screen unmounts, so there is
      // nothing to do here afterwards.
      await db.auth.signInWithMagicCode({ email, code: digits });
    } catch (err) {
      setError(messageOf(err));
      setCode("");
      setBusy(false);
    }
  }

  if (!sent) {
    return (
      <div className={screen}>
        <h1 className={title}>Word leren</h1>
        <p className={sub}>
          Sign in with your email. We'll send you a one-time code — no password
          to remember.
        </p>
        <form className={form} onSubmit={sendCode}>
          <input
            className={input}
            type="email"
            autoComplete="email"
            autoFocus
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          {error && <p className={errorText}>{error}</p>}
          <button className={submit} type="submit" disabled={busy}>
            {busy ? "Sending…" : "Send code"}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className={screen}>
      <h1 className={title}>Check your email</h1>
      <p className={sub}>
        We sent a code to <strong>{email}</strong>.
      </p>
      <form className={form} onSubmit={verifyCode}>
        <input
          className={`${input} ${codeInput}`}
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          autoFocus
          placeholder="123456"
          value={code}
          onChange={(e) => setCode(e.target.value)}
        />
        {error && <p className={errorText}>{error}</p>}
        <button className={submit} type="submit" disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
        <button
          className={linkBtn}
          type="button"
          onClick={() => {
            setSent(false);
            setCode("");
            setError(null);
          }}
        >
          Use a different email
        </button>
      </form>
    </div>
  );
}

/**
 * Renders `children` only for a signed-in user, and publishes that user to
 * `lib/session` on the way — during render, so the mutation helpers have an
 * owner id before any handler in the tree can fire.
 */
export default function AuthGate({ children }: { children: React.ReactNode }) {
  const { isLoading, user, error } = db.useAuth();

  setSessionUser(user?.id ?? null);

  if (isLoading) return <div className={centered}>Loading…</div>;
  if (error) return <div className={centered}>{error.message}</div>;
  if (!user) return <SignIn />;

  return <>{children}</>;
}
