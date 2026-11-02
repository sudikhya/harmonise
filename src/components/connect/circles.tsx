"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { COMMUNITIES, SAMPLE_FEEDS, SCHEDULED_CARDS, type CommunityId, type FeedPost } from "@/lib/connect/catalog";
import { useSession } from "@/lib/connect/session";
import { EmergingCard, LoginPrompt } from "@/components/connect/community-cards";

type ServerPost = { id: number; author: string; text: string; createdAt: string };
type Emerging = { id: string; name: string; description: string; watching: string; momentum: string };

function timeAgo(iso: string): string {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return "Just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(iso).toLocaleDateString();
}

function isServerPost(value: unknown): value is ServerPost {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.id === "number" &&
    typeof record.author === "string" &&
    typeof record.text === "string" &&
    typeof record.createdAt === "string"
  );
}

function isEmerging(value: unknown): value is Emerging {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.id === "string" &&
    typeof record.name === "string" &&
    typeof record.description === "string" &&
    typeof record.watching === "string" &&
    typeof record.momentum === "string"
  );
}

function CircleFeed({ circleId, onPosted }: { circleId: CommunityId; onPosted: () => void }) {
  const { state, dispatch } = useSession();
  const [helpfulCounts, setHelpfulCounts] = useState<Record<string, number>>({});
  const [flagged, setFlagged] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [serverPosts, setServerPosts] = useState<ServerPost[]>([]);

  useEffect(() => {
    let live = true;
    fetch(`/api/circles/${circleId}/posts`, { credentials: "same-origin" })
      .then(async (response) => {
        if (!live || !response.ok) return;
        const data = (await response.json().catch(() => null)) as { posts?: unknown } | null;
        if (live && data && Array.isArray(data.posts)) {
          setServerPosts(data.posts.filter(isServerPost));
        }
      })
      .catch(() => {
        // Feeds work fully offline/static too; server posts are an addition.
      });
    return () => {
      live = false;
    };
  }, [circleId]);

  const mine = state.contributions.filter((item) => item.circleId === circleId);
  const samples: FeedPost[] = SAMPLE_FEEDS[circleId];

  function markHelpful(post: FeedPost) {
    setHelpfulCounts((current) => ({ ...current, [post.id]: (current[post.id] ?? post.helpful) + 1 }));
    dispatch({ type: "points", amount: 1 });
  }

  function report(post: FeedPost) {
    setFlagged((current) => (current.includes(post.id) ? current : [...current, post.id]));
  }

  async function post(event: FormEvent) {
    event.preventDefault();
    const text = draft.trim();
    if (text.length === 0) return;
    const contribution = { id: `${circleId}-${Date.now()}`, circleId, text: text.slice(0, 500), time: "Just now" };
    dispatch({ type: "contribute", contribution });
    setDraft("");
    try {
      const shared = await fetch(`/api/circles/${circleId}/posts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: contribution.text }),
      });
      if (shared.ok) onPosted();
    } catch {
      // Local post already recorded; the server share is best-effort.
    }
  }

  return (
    <div>
      <div className="cx-feed">
        {mine.map((item) => (
          <article key={item.id} className="cx-post" aria-label="Your post">
            <span className="cx-post-meta">{state.displayName} · {item.time} · prototype post</span>
            <p>{item.text}</p>
          </article>
        ))}
        {serverPosts.map((post) => (
          <article key={`server-${post.id}`} className="cx-post" aria-label={`Post by ${post.author}`}>
            <span className="cx-post-meta">{post.author} · {timeAgo(post.createdAt)}</span>
            <p>{post.text}</p>
          </article>
        ))}
        {samples.map((post) => (
          <article key={post.id} className="cx-post" aria-label={`Post by ${post.author}`}>
            <span className="cx-post-meta">{post.author} · {post.time}</span>
            <p>{post.text}</p>
            <div className="cx-post-actions">
              <button type="button" className="cx-mini-btn" onClick={() => markHelpful(post)} aria-label={`Mark post by ${post.author} as helpful`}>
                Helpful ({helpfulCounts[post.id] ?? post.helpful})
              </button>
              {flagged.includes(post.id) ? (
                <span className="cx-note">Flagged for human review. Thank you.</span>
              ) : (
                <button type="button" className="cx-mini-btn" onClick={() => report(post)}>
                  Report
                </button>
              )}
              <button type="button" className="cx-mini-btn" onClick={() => dispatch({ type: "urgent", open: true })}>
                Urgent support
              </button>
            </div>
          </article>
        ))}
      </div>
      <form className="cx-circle-composer" onSubmit={post} aria-label={`Post in ${COMMUNITIES[circleId].name}`}>
        <label className="cx-label" htmlFor={`cx-composer-${circleId}`}>Share with this circle (prototype)</label>
        <textarea
          id={`cx-composer-${circleId}`}
          className="cx-textarea"
          value={draft}
          maxLength={500}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="What feels safe to share today?"
        />
        <div>
          <button type="submit" className="cx-btn cx-btn-primary" disabled={draft.trim().length === 0}>
            Post to circle · +5 points
          </button>
        </div>
        <p className="cx-note">Posts are shared with this circle and help Harmonise suggest new communities.</p>
      </form>
    </div>
  );
}

export default function Circles() {
  const { state, dispatch } = useSession();
  const router = useRouter();
  const [emerging, setEmerging] = useState<Emerging[]>([]);
  const [loginPrompt, setLoginPrompt] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    async function load() {
      try {
        const response = await fetch("/api/discovery", { credentials: "same-origin" });
        if (!live || !response.ok) return;
        const data = (await response.json().catch(() => null)) as { emerging?: unknown } | null;
        if (live && data && Array.isArray(data.emerging)) {
          setEmerging(data.emerging.filter(isEmerging));
        }
      } catch {
        // Static/offline: the shelf simply stays hidden.
      }
    }
    void load();
    const timer = window.setInterval(load, 8000);
    return () => {
      live = false;
      window.clearInterval(timer);
    };
  }, []);

  function refreshEmerging() {
    fetch("/api/discovery", { credentials: "same-origin" })
      .then(async (response) => {
        if (!response.ok) return;
        const data = (await response.json().catch(() => null)) as { emerging?: unknown } | null;
        if (data && Array.isArray(data.emerging)) {
          setEmerging(data.emerging.filter(isEmerging));
        }
      })
      .catch(() => {});
  }

  function joinEmerging(id: string) {
    if (!state.account) {
      setLoginPrompt(id);
      return;
    }
    dispatch({ type: "join", id });
  }

  const promptTarget = loginPrompt ? emerging.find((item) => item.id === loginPrompt) ?? null : null;

  return (
    <div>
      {emerging.length > 0 ? (
        <section className="cx-card-white" aria-label="Coming up" style={{ marginBottom: "18px" }}>
          <p className="cx-kicker">Coming up</p>
          <h2>New communities forming</h2>
          <p className="cx-card-desc">Emerging from what members are posting. Verified before they appear here.</p>
          <div className="cx-cards">
            {emerging.map((item) => (
              <EmergingCard
                key={item.id}
                id={item.id}
                name={item.name}
                description={item.description}
                watching={item.watching}
                momentum={item.momentum}
                joined={state.joined.includes(item.id)}
                nameMode={state.nameMode}
                displayName={state.displayName}
                onJoin={joinEmerging}
                onOpen={() => dispatch({ type: "set-tab", tab: "circles" })}
              />
            ))}
          </div>
        </section>
      ) : null}
      {state.joined.length === 0 ? (
        <section className="cx-empty-circles cx-card-white" aria-label="No circles yet">
          <p className="cx-kicker">My circles</p>
          <h2>You haven&rsquo;t joined any circles yet</h2>
          <p className="cx-lede" style={{ margin: "0 auto 16px" }}>
            Circles only appear here after you explicitly join one. Talk with the adviser first — matching stays
            hidden until you ask to see it.
          </p>
          <button type="button" className="cx-btn cx-btn-primary" onClick={() => dispatch({ type: "set-tab", tab: "find" })}>
            Talk with the adviser
          </button>
        </section>
      ) : (
        <div className="cx-circle-grid">
          {state.joined.map((id) => {
            const community = COMMUNITIES[id as CommunityId];
            if (community) {
              return (
                <section key={community.id} className="cx-card-white" aria-label={community.name}>
                  <div className="cx-circle-head">
                    <div>
                      <div className="cx-card-meta">
                        <span className="cx-tag cx-tag-dark">Prototype circle</span>
                        <span className="cx-tag cx-tag-green">{community.cadence}</span>
                        <span className="cx-tag">{community.memberCount}</span>
                      </div>
                      <h2>{community.name}</h2>
                      <p className="cx-card-desc">{community.description}</p>
                      <span className="cx-agent"><i aria-hidden="true">H</i>{community.agentName}</span>
                    </div>
                  </div>
                  <div className="cx-disclaimer">
                    The circle agent helps with conversation prompts, gentle moderation, scheduled feeds, flagging
                    concerning content for human review, and keeping conversations useful. AI moderation cannot guarantee
                    safety or replace human moderators — flagged posts go to human review.
                  </div>
                  {SCHEDULED_CARDS[community.id].map((card) => (
                    <div key={card.id} className="cx-scheduled">
                      <strong>{card.title} · scheduled feed</strong>
                      <p>{card.text}</p>
                    </div>
                  ))}
                  <h3 className="cx-section-title">Conversation feed</h3>
                  <CircleFeed circleId={community.id} onPosted={refreshEmerging} />
                  <h3 className="cx-section-title">Community boundaries</h3>
                  <ul className="cx-boundaries">
                    {community.boundaries.map((boundary) => (
                      <li key={boundary}>{boundary}</li>
                    ))}
                  </ul>
                  {community.extraNote ? <p className="cx-note">{community.extraNote}</p> : null}
                </section>
              );
            }
            const proposal = emerging.find((item) => item.id === id);
            if (!proposal) return null;
            return (
              <section key={proposal.id} className="cx-card-white" aria-label={proposal.name}>
                <div className="cx-card-meta">
                  <span className="cx-tag cx-tag-dark">Coming up</span>
                  <span className="cx-tag cx-tag-green">{proposal.momentum}</span>
                  <span className="cx-tag">{proposal.watching}</span>
                </div>
                <h2>{proposal.name}</h2>
                <p className="cx-card-desc">{proposal.description}</p>
                <p className="cx-note">You joined while this community is still forming. Conversation opens soon.</p>
              </section>
            );
          })}
        </div>
      )}
      {promptTarget ? (
        <LoginPrompt
          circleName={promptTarget.name}
          onLogin={() => {
            setLoginPrompt(null);
            router.push("/connect");
          }}
          onClose={() => setLoginPrompt(null)}
        />
      ) : null}
    </div>
  );
}
