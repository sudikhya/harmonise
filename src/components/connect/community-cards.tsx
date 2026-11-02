"use client";

import { useEffect, useRef, useState } from "react";
import { getCommunity } from "@/lib/connect/catalog";
import type { NameMode } from "@/lib/connect/session";

export function CommunityCard({
  id,
  reason,
  joined,
  nameMode,
  displayName,
  onJoin,
  onOpen,
}: {
  id: string;
  reason: string | null;
  joined: boolean;
  nameMode: NameMode;
  displayName: string;
  onJoin: (id: string) => void;
  onOpen: () => void;
}) {
  const [preview, setPreview] = useState(false);
  const community = getCommunity(id);
  if (!community) return null;

  return (
    <article className="cx-card cx-card-white" aria-label={community.name}>
      <div className="cx-card-meta">
        <span className="cx-tag cx-tag-dark">Prototype</span>
        <span className="cx-tag cx-tag-green">{community.cadence}</span>
        <span className="cx-tag">{community.memberCount}</span>
      </div>
      <h3>{community.name}</h3>
      <p className="cx-card-desc">{community.description}</p>
      {community.extraNote ? <p className="cx-note">{community.extraNote}</p> : null}
      {reason ? (
        <div className="cx-why">
          <strong>Why it fits</strong>
          {reason}
        </div>
      ) : null}
      <div className="cx-card-actions">
        <button type="button" className="cx-btn cx-btn-soft" onClick={() => setPreview((value) => !value)} aria-expanded={preview}>
          {preview ? "Hide preview" : "Preview"}
        </button>
        {joined ? (
          <button type="button" className="cx-btn cx-btn-primary" onClick={onOpen}>
            Open in My circles
          </button>
        ) : (
          <button type="button" className="cx-btn cx-btn-primary" onClick={() => onJoin(community.id)}>
            {nameMode === "alias" ? `Join as alias “${displayName}”` : `Join as ${displayName}`}
          </button>
        )}
      </div>
      {preview ? (
        <div className="cx-preview-box">
          <p><strong>What members talk about:</strong> {community.topics.join(" · ")}</p>
          <p><strong>Circle agent:</strong> {community.agentName} — prompts, gentle moderation, scheduled feeds.</p>
          <p><strong>First boundary:</strong> {community.boundaries[0]}</p>
          <p>Sample preview. Joining is always explicit and consent-based.</p>
        </div>
      ) : null}
    </article>
  );
}

export function LoginPrompt({ circleName, onLogin, onClose }: { circleName: string; onLogin: () => void; onClose: () => void }) {
  const primaryRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    primaryRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="cx-modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="cx-modal cx-card-white"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cx-login-prompt-title"
        onClick={(event) => event.stopPropagation()}
      >
        <p className="cx-kicker">Joining needs an account</p>
        <h2 id="cx-login-prompt-title">Log in to join {circleName}.</h2>
        <p className="cx-lede">
          Guests can talk with the adviser and discover communities. Joining one needs an account, so the
          circle knows who is in the room.
        </p>
        <div className="cx-modal-actions">
          <button ref={primaryRef} type="button" className="cx-btn cx-btn-primary cx-btn-block" onClick={onLogin}>
            Go to login
          </button>
          <button type="button" className="cx-btn cx-btn-ghost cx-btn-block" onClick={onClose}>
            Not now
          </button>
        </div>
      </div>
    </div>
  );
}

export function EmergingCard({
  id,
  name,
  description,
  watching,
  momentum,
  joined,
  nameMode,
  displayName,
  onJoin,
  onOpen,
}: {
  id: string;
  name: string;
  description: string;
  watching: string;
  momentum: string;
  joined: boolean;
  nameMode: NameMode;
  displayName: string;
  onJoin: (id: string) => void;
  onOpen: () => void;
}) {
  return (
    <article className="cx-card cx-card-white" aria-label={name}>
      <div className="cx-card-meta">
        <span className="cx-tag cx-tag-dark">Coming up</span>
        <span className="cx-tag cx-tag-green">{momentum}</span>
        <span className="cx-tag">{watching}</span>
      </div>
      <h3>{name}</h3>
      <p className="cx-card-desc">{description}</p>
      <p className="cx-note">Emerging from what members are posting. Still forming — conversation opens soon.</p>
      <div className="cx-card-actions">
        {joined ? (
          <button type="button" className="cx-btn cx-btn-primary" onClick={onOpen}>
            Open in My circles
          </button>
        ) : (
          <button type="button" className="cx-btn cx-btn-primary" onClick={() => onJoin(id)}>
            {nameMode === "alias" ? `Join as alias “${displayName}”` : `Join as ${displayName}`}
          </button>
        )}
      </div>
    </article>
  );
}
