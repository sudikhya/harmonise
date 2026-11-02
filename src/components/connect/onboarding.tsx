"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/connect/session";
import { CoachDashboardPreview } from "@/components/connect/coaches";
import { DEMO_LOGIN_ID, DEMO_LOGIN_PASSWORD } from "@/components/connect/demo-credentials";

function Brand() {
  return (
    <div className="cx-brand" aria-label="Harmonise">
      <span className="cx-brand-mark" aria-hidden="true">H</span>
      <span>
        <span className="cx-brand-name">Harmonise<em>.</em></span>
        <span className="cx-tagline" style={{ display: "block" }}>Human growth, shared.</span>
      </span>
    </div>
  );
}

type AuthMode = "login" | "signup";

function AuthPanel() {
  const { dispatch } = useSession();
  const router = useRouter();
  const [mode, setMode] = useState<AuthMode>("login");
  const [name, setName] = useState("");
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [adult, setAdult] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function switchMode(next: AuthMode) {
    setMode(next);
    setError(null);
  }

  function fillDemo() {
    setLoginId(DEMO_LOGIN_ID);
    setPassword(DEMO_LOGIN_PASSWORD);
    setError(null);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (mode === "signup") {
      if (name.trim().length === 0) {
        setError("Choose a display name to continue.");
        return;
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(loginId.trim())) {
        setError("Enter a valid email address.");
        return;
      }
      if (password.length < 8) {
        setError("Choose a password with at least 8 characters.");
        return;
      }
      if (!adult) {
        setError("Please confirm you are 18 or older.");
        return;
      }
    } else if (loginId.trim().length === 0 || password.length === 0) {
      setError("Enter your login ID and password.");
      return;
    }
    setBusy(true);
    setError(null);
    // Static hosting has no API: the demo login works offline instead.
    const offlineDemo =
      mode === "login" && loginId.trim() === DEMO_LOGIN_ID && password === DEMO_LOGIN_PASSWORD;
    function enterOfflineDemo() {
      dispatch({ type: "login", account: { id: 0, name: "Demo Member", email: DEMO_LOGIN_ID } });
      router.push("/connect/member");
    }
    try {
      const response = await fetch(mode === "login" ? "/api/auth/login" : "/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          mode === "login"
            ? { email: loginId.trim(), password }
            : { name: name.trim(), email: loginId.trim(), password },
        ),
      });
      if (response.status === 404) {
        if (offlineDemo) {
          enterOfflineDemo();
        } else if (mode === "signup") {
          setError("Account creation needs a connection. Log in with the demo credentials shown above.");
        } else {
          setError("Harmonise could not be reached. Log in with the demo credentials shown above.");
        }
        return;
      }
      const data = (await response.json().catch(() => null)) as {
        id?: unknown;
        name?: unknown;
        email?: unknown;
      } | null;
      if (
        !response.ok ||
        !data ||
        typeof data.id !== "number" ||
        typeof data.name !== "string" ||
        typeof data.email !== "string"
      ) {
        if (response.status === 409) {
          setError("That login ID already has an account — try logging in instead.");
        } else if (response.status === 401) {
          setError("Those login details do not match an account.");
        } else if (response.status === 429) {
          setError("Too many attempts just now — wait a minute and try again.");
        } else {
          setError("Those details could not be used. Check them and try again.");
        }
        return;
      }
      dispatch({ type: "login", account: { id: data.id, name: data.name, email: data.email } });
      router.push("/connect/member");
    } catch {
      if (offlineDemo) {
        enterOfflineDemo();
      } else if (mode === "signup") {
        setError("Account creation needs a connection. Log in with the demo credentials shown above.");
      } else {
        setError("Harmonise could not be reached. Log in with the demo credentials shown above.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="cx-demo-login">
      <p className="cx-kicker">Your account</p>
      <p>
        Log in or create an account to keep your space across visits. Trying the prototype? The demo
        login works too — its credentials are shown below.
      </p>
      {mode === "login" ? (
        <p className="cx-demo-creds">
          Demo ID <code>{DEMO_LOGIN_ID}</code> · Password <code>{DEMO_LOGIN_PASSWORD}</code>
        </p>
      ) : null}
      <form onSubmit={submit} noValidate aria-label={mode === "login" ? "Log in" : "Create account"}>
        {mode === "signup" ? (
          <div className="cx-field">
            <label className="cx-label" htmlFor="cx-auth-name">Display name</label>
            <input
              id="cx-auth-name"
              className="cx-input"
              type="text"
              autoComplete="nickname"
              maxLength={40}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. Quiet Fern"
            />
          </div>
        ) : null}
        <div className="cx-field">
          <label className="cx-label" htmlFor="cx-auth-id">{mode === "login" ? "Login ID" : "New login ID"}</label>
          <input
            id="cx-auth-id"
            className="cx-input"
            type="email"
            autoComplete="username"
            maxLength={120}
            value={loginId}
            onChange={(event) => setLoginId(event.target.value)}
            placeholder={DEMO_LOGIN_ID}
          />
        </div>
        <div className="cx-field">
          <label className="cx-label" htmlFor="cx-auth-password">{mode === "login" ? "Login password" : "New password"}</label>
          <input
            id="cx-auth-password"
            className="cx-input"
            type="password"
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            maxLength={128}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder={mode === "login" ? "Enter your password" : "At least 8 characters"}
          />
        </div>
        {mode === "signup" ? (
          <label className="cx-check-row">
            <input type="checkbox" checked={adult} onChange={(event) => setAdult(event.target.checked)} />
            <span>I confirm I am 18 or older.</span>
          </label>
        ) : null}
        {error ? <p className="cx-error" role="alert">{error}</p> : null}
        <div className="cx-disclaimer">
          Prototype only: Harmonise is not therapy, diagnosis, legal advice, financial advice, or emergency response.
        </div>
        <div className="cx-cta-row">
          {mode === "login" ? (
            <button type="button" className="cx-btn cx-btn-ghost" onClick={fillDemo}>
              Fill demo credentials
            </button>
          ) : null}
          <button type="submit" className="cx-btn cx-btn-dark cx-btn-block" disabled={busy}>
            {busy ? "Please wait…" : mode === "login" ? "Log in" : "Create account"}
          </button>
        </div>
      </form>
      <div className="cx-demo-row">
        <button
          type="button"
          className="cx-btn cx-btn-ghost"
          onClick={() => switchMode(mode === "login" ? "signup" : "login")}
        >
          {mode === "login" ? "New here? Create an account" : "Have an account? Log in"}
        </button>
      </div>
    </div>
  );
}

function CoachPath() {
  const [email, setEmail] = useState("");
  const [preview, setPreview] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError("Enter a valid coach email to preview the portal.");
      return;
    }
    setError(null);
    setPreview(true);
  }

  return (
    <div>
      <form onSubmit={submit} noValidate aria-label="Support Coach entry">
        <div className="cx-field">
          <label className="cx-label" htmlFor="cx-coach-email">Coach email</label>
          <input
            id="cx-coach-email"
            className="cx-input"
            type="email"
            autoComplete="email"
            maxLength={120}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="coach@example.com"
          />
        </div>
        {error ? <p className="cx-error" role="alert">{error}</p> : null}
        <div className="cx-cta-row">
          <button type="submit" className="cx-btn cx-btn-dark cx-btn-block">Give support</button>
        </div>
      </form>
      {preview ? (
        <div className="cx-coach-preview">
          <CoachDashboardPreview />
        </div>
      ) : null}
    </div>
  );
}

export default function Onboarding() {
  const [path, setPath] = useState<"member" | "coach">("member");

  return (
    <main className="cx-gate">
      <div className="cx-gate-inner">
        <Brand />
        <div className="cx-gate-grid">
          <div className="cx-gate-hero">
            <p className="cx-kicker">A space for unfinished thoughts</p>
            <h1>
              Share something difficult. <em>Get a way forward.</em> Choose connection.
            </h1>
            <p className="cx-lede">
              I share something difficult. Harmonise listens. It gives me a practical way forward. I decide whether
              I want to meet people who have lived something similar.
            </p>
            <ol className="cx-flow">
              <li>
                <span className="cx-flow-num" aria-hidden="true">1</span>
                <div><strong>Listen</strong><span>Explain privately, in your own words. Nothing is posted.</span></div>
              </li>
              <li>
                <span className="cx-flow-num" aria-hidden="true">2</span>
                <div><strong>Advise</strong><span>A live AI reflects what it heard and offers next steps.</span></div>
              </li>
              <li>
                <span className="cx-flow-num" aria-hidden="true">3</span>
                <div><strong>You choose connection</strong><span>Communities appear only after you ask to see them.</span></div>
              </li>
            </ol>
            <div className="cx-privacy-list">
              <p>Private by design</p>
              <ul>
                <li>Your message is sent to a live AI model to generate general guidance.</li>
                <li>Your conversation is not posted to a community.</li>
                <li>This prototype does not store conversations in an app database.</li>
                <li>Community joining is always explicit and consent-based.</li>
                <li>Raw conversation should never automatically become a public profile or community post.</li>
              </ul>
            </div>
          </div>
          <section className="cx-gate-card cx-card-white" aria-label="Enter Harmonise">
            <p className="cx-kicker">Prototype entry</p>
            <h2>Begin, on your terms</h2>
            <div className="cx-path-tabs" role="tablist" aria-label="Entry path">
              <button
                type="button"
                role="tab"
                aria-selected={path === "member"}
                className="cx-path-tab"
                onClick={() => setPath("member")}
              >
                Find support
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={path === "coach"}
                className="cx-path-tab"
                onClick={() => setPath("coach")}
              >
                Give support
              </button>
            </div>
            {path === "member" ? <AuthPanel /> : <CoachPath />}
          </section>
        </div>
      </div>
    </main>
  );
}
