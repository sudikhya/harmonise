"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useSession, type ConnectTab } from "@/lib/connect/session";
import Adviser from "@/components/connect/adviser";
import Circles from "@/components/connect/circles";
import Journey from "@/components/connect/journey";
import Coaches, { CoachDashboardPreview } from "@/components/connect/coaches";
import UrgentModal from "@/components/connect/urgent-modal";

const TABS: { id: ConnectTab; label: string; heading: string; lede: string }[] = [
  {
    id: "find",
    label: "Find connection",
    heading: "Find connection",
    lede: "Talk privately with the Harmonise Adviser. Guidance first — communities only if you ask.",
  },
  {
    id: "journey",
    label: "My journey",
    heading: "My journey",
    lede: "Your private Point A → Point Z. You confirm every milestone; the AI never scores you.",
  },
  {
    id: "circles",
    label: "My circles",
    heading: "My circles",
    lede: "Only the communities you explicitly joined. Nothing here is automatic.",
  },
  {
    id: "coaches",
    label: "Support Coaches",
    heading: "Support Coaches",
    lede: "People with lived experience. Peer coaching only — never therapy, never automatic.",
  },
];

function initialsFor(name: string): string {
  const letters = name.split(/\s+/).map((part) => part.charAt(0)).join("").slice(0, 2).toUpperCase();
  return letters || "H";
}

export default function MemberShell() {
  const { state, dispatch } = useSession();
  const router = useRouter();
  const active = TABS.find((tab) => tab.id === state.tab) ?? TABS[0];

  useEffect(() => {
    if (state.entered || !state.hydrating) return;
    let live = true;
    fetch("/api/auth/me", { credentials: "same-origin" })
      .then(async (response) => {
        if (!live) return;
        if (response.ok) {
          const data = (await response.json().catch(() => null)) as {
            id?: unknown;
            name?: unknown;
            email?: unknown;
          } | null;
          if (data && typeof data.id === "number" && typeof data.name === "string" && typeof data.email === "string") {
            dispatch({ type: "login", account: { id: data.id, name: data.name, email: data.email } });
            return;
          }
        }
        dispatch({ type: "auth-checked" });
      })
      .catch(() => {
        if (live) dispatch({ type: "auth-checked" });
      });
    return () => {
      live = false;
    };
  }, [state.entered, state.hydrating, dispatch]);

  async function exit() {
    if (state.account) {
      try {
        await fetch("/api/auth/logout", { method: "POST" });
      } catch {
        // Local exit still applies when the server cannot be reached.
      }
    }
    dispatch({ type: "exit" });
    router.push("/connect");
  }

  if (!state.entered && state.hydrating) {
    return (
      <main className="cx-gate">
        <div className="cx-gate-inner">
          <section className="cx-card-white" style={{ maxWidth: "620px", margin: "60px auto" }} aria-label="Loading your space">
            <p className="cx-kicker">Harmonise</p>
            <h1 style={{ fontFamily: "var(--cx-ser)", fontSize: "34px", margin: "6px 0 10px" }}>Waking up your space…</h1>
            <p className="cx-lede">One moment while your session loads.</p>
          </section>
        </div>
      </main>
    );
  }

  if (!state.entered) {
    return (
      <main className="cx-gate">
        <div className="cx-gate-inner">
          <section className="cx-card-white" style={{ maxWidth: "620px", margin: "60px auto" }} aria-label="Entry required">
            <p className="cx-kicker">Harmonise</p>
            <h1 style={{ fontFamily: "var(--cx-ser)", fontSize: "34px", margin: "6px 0 10px" }}>Start at the entrance</h1>
            <p className="cx-lede">Log in or create an account to enter — it takes less than a minute.</p>
            <Link className="cx-btn cx-btn-primary" href="/connect">Go to entrance</Link>
          </section>
        </div>
      </main>
    );
  }

  return (
    <div className="cx-shell">
      <header className="cx-topbar">
        <div className="cx-topbar-inner">
          <Link href="/connect" className="cx-brand" aria-label="Harmonise entrance">
            <span className="cx-brand-mark" aria-hidden="true">H</span>
            <span className="cx-brand-name">Harmonise<em>.</em></span>
          </Link>
          <span className="cx-topbar-spacer" />
          <div className="cx-topbar-actions">
            <button type="button" className="cx-btn cx-btn-urgent" onClick={() => dispatch({ type: "urgent", open: true })}>
              Urgent support
            </button>
            <button type="button" className="cx-btn cx-btn-soft" onClick={exit}>
              {state.account ? "Log out" : "Exit demo"}
            </button>
          </div>
        </div>
      </header>
      <div className="cx-body">
        <aside className="cx-side" aria-label="Profile and navigation">
          <section className="cx-profile cx-card-white" aria-label="Your profile">
            <div className="cx-profile-row">
              <span className="cx-avatar" aria-hidden="true">{initialsFor(state.displayName)}</span>
              <div>
                <strong>{state.displayName}</strong>
                <small>
                  {state.nameMode === "alias" ? "Alias mode" : "Real-name mode"}
                  {state.demo ? " · Demo" : ""}
                </small>
              </div>
            </div>
            <div className="cx-card-meta">
              <span className="cx-tag cx-tag-dark">Prototype</span>
              {state.demo ? <span className="cx-tag"> exploring demo</span> : null}
            </div>
            <div className="cx-points" aria-label={`Helpfulness points: ${state.points}`}>
              <span>Helpfulness points</span>
              <b>{state.points}</b>
            </div>
          </section>
          <nav className="cx-nav cx-card-white" aria-label="Member tabs">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                className="cx-nav-btn"
                aria-current={state.tab === tab.id ? "page" : undefined}
                onClick={() => dispatch({ type: "set-tab", tab: tab.id })}
              >
                <span className="cx-nav-dot" aria-hidden="true" />
                {tab.label}
              </button>
            ))}
          </nav>
          <div className="cx-side-actions cx-card-white">
            <button type="button" className="cx-btn cx-btn-soft cx-btn-block" onClick={() => dispatch({ type: "coach-preview", open: true })}>
              Coach portal preview
            </button>
          </div>
        </aside>
        <main className="cx-main">
          <div className="cx-main-head">
            <p className="cx-kicker">{active.label}</p>
            <h1>{active.heading}</h1>
            <p className="cx-lede">{active.lede}</p>
          </div>
          {state.tab === "find" ? <Adviser /> : null}
          {state.tab === "journey" ? <Journey /> : null}
          {state.tab === "circles" ? <Circles /> : null}
          {state.tab === "coaches" ? <Coaches /> : null}
        </main>
      </div>
      {state.urgentOpen ? <UrgentModal onClose={() => dispatch({ type: "urgent", open: false })} /> : null}
      {state.coachPreviewOpen ? (
        <div className="cx-modal-backdrop" role="presentation" onClick={() => dispatch({ type: "coach-preview", open: false })}>
          <div
            className="cx-modal cx-modal-wide cx-card-white"
            role="dialog"
            aria-modal="true"
            aria-label="Coach portal preview"
            onClick={(event) => event.stopPropagation()}
          >
            <CoachDashboardPreview />
            <div className="cx-modal-actions">
              <button type="button" className="cx-btn cx-btn-primary cx-btn-block" onClick={() => dispatch({ type: "coach-preview", open: false })}>
                Close preview
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
