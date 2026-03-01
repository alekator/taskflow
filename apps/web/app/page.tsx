import Link from "next/link";

type FeaturePanel = {
  eyebrow: string;
  title: string;
  body: string;
  bullets?: string[];
};

const proofPoints = [
  {
    title: "Live execution",
    body: "Tasks, owners, and movement stay visibly aligned while the team is actively shipping.",
  },
  {
    title: "Built for speed",
    body: "A sharper operating surface for lean teams that want momentum without enterprise drag.",
  },
  {
    title: "Trust in motion",
    body: "Audit history and version-aware writes protect important work when velocity goes up.",
  },
];

const heroMetrics = [
  { value: "Live", label: "Realtime task movement" },
  { value: "Owned", label: "Responsibility is visible" },
  { value: "Protected", label: "Critical changes stay traceable" },
];

const boardColumns = [
  {
    title: "Todo",
    tone: "todo",
    cards: [
      { title: "Finalize launch checklist", meta: "Alex - High" },
      { title: "QA payment flow", meta: "Nina - Medium" },
    ],
  },
  {
    title: "In progress",
    tone: "progress",
    cards: [
      { title: "Homepage redesign", meta: "Marta - Live now" },
      { title: "Sprint planning notes", meta: "Jon - Updating" },
    ],
  },
  {
    title: "Done",
    tone: "done",
    cards: [{ title: "Deploy API patch", meta: "Sam - Complete" }],
  },
];

const pulseSignals = [
  { label: "Priority load", value: "08 active", tone: "warm" },
  { label: "Response time", value: "0.6 ms", tone: "cool" },
  { label: "Owners aligned", value: "94%", tone: "cool" },
  { label: "Tasks completed", value: "27 today", tone: "warm" },
  { label: "Realtime sync", value: "Stable", tone: "cool" },
  { label: "Audit coverage", value: "100%", tone: "warm" },
];

const pulseSummary = [
  { label: "Delivery confidence", value: "94%" },
  { label: "Team load", value: "08 active" },
  { label: "Sync state", value: "Stable" },
];

const capabilityRows = [
  {
    label: "For teams that",
    value: "need clarity fast, not another bloated workflow suite",
  },
  {
    label: "Feels like",
    value: "a modern control room for projects, tasks, and shifting priorities",
  },
  {
    label: "Built on",
    value: "typed APIs, realtime updates, audit trails, and conflict-safe writes",
  },
];

const featurePanels: FeaturePanel[] = [
  {
    eyebrow: "Visual control",
    title: "See progress the moment it changes",
    body: "TaskFlow turns scattered updates into one clean, visible flow: projects, assignees, status, and momentum in a single operating surface.",
    bullets: [
      "Boards that make ownership obvious",
      "Task detail views for fast edits",
      "Shared visibility across the whole team",
    ],
  },
  {
    eyebrow: "Operational calm",
    title: "Move fast without losing confidence",
    body: "The experience stays lightweight and fast while the foundation quietly handles auditability, traceability, and safer edits.",
  },
];

export default function Home() {
  const visualPanel = featurePanels[0]!;
  const calmPanel = featurePanels[1]!;
  const visualBullets = visualPanel.bullets ?? [];

  return (
    <main className="landing">
      <header className="topbar">
        <div className="landing-topbar-glow" aria-hidden="true" />
        <div className="landing-brand">
          <p className="brand">TaskFlow</p>
          <span className="topbar-chip">Premium team execution</span>
        </div>
        <nav className="nav">
          <Link href="/auth/login">Sign in</Link>
          <Link href="/auth/register">Register</Link>
          <Link href="/app" className="button button-primary">
            Open app
          </Link>
        </nav>
      </header>

      <section className="hero">
        <div className="hero-orb hero-orb-left" />
        <div className="hero-orb hero-orb-right" />
        <div className="hero-grid">
          <div className="hero-copy">
            <p className="kicker">Execution clarity for teams that ship</p>
            <h1>Turn fast-moving work into visible progress.</h1>
            <p className="lead">
              TaskFlow gives ambitious teams a polished command center for projects,
              tasks, ownership, and live momentum, without the weight of oversized tools.
            </p>
            <div className="hero-actions">
              <Link href="/app" className="button button-primary">
                See TaskFlow live
              </Link>
              <Link href="/auth/register" className="button button-ghost">
                Start free
              </Link>
            </div>
            <div className="hero-metrics" aria-label="TaskFlow value highlights">
              {heroMetrics.map((item) => (
                <div key={item.label} className="hero-metric-card">
                  <strong>{item.value}</strong>
                  <span>{item.label}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="hero-preview" aria-label="TaskFlow workspace preview">
            <div className="preview-shell">
              <div className="preview-head">
                <div>
                  <p className="preview-eyebrow">Workspace pulse</p>
                  <h2>Executive delivery board</h2>
                </div>
                <span className="preview-live">Live</span>
              </div>

              <div className="preview-summary" aria-label="Workspace pulse summary">
                {pulseSummary.map((item) => (
                  <article key={item.label} className="preview-summary-card">
                    <span>{item.label}</span>
                    <strong>{item.value}</strong>
                  </article>
                ))}
              </div>

              <div className="preview-console">
                <div className="preview-console-side" aria-label="Workspace signal metrics">
                  <div className="preview-side-head">
                    <p className="preview-eyebrow">Signal layer</p>
                    <span>Live workspace telemetry</span>
                  </div>
                  <div className="pulse-rail-list">
                    {pulseSignals.map((item) => (
                      <article key={item.label} className="pulse-rail-card pulse-rail-card-dark">
                        <div className="pulse-rail-copy pulse-rail-copy-dark">
                          <span>{item.label}</span>
                          <strong>{item.value}</strong>
                        </div>
                        <i
                          className={`pulse-rail-spark pulse-rail-spark-${item.tone} pulse-rail-spark-dark`}
                        />
                      </article>
                    ))}
                  </div>
                </div>

                <div className="preview-console-main">
                  <div className="preview-stats">
                    <div className="preview-stat preview-stat-glow">
                      <span>3 active streams</span>
                      <strong>12 live signals</strong>
                    </div>
                    <div className="preview-stat">
                      <span>Critical actions</span>
                      <strong>Protected state</strong>
                    </div>
                  </div>

                  <div className="preview-mini-stats" aria-label="Additional workspace metrics">
                    <span>Board density: 5 active cards</span>
                    <span>Coverage: 3 status lanes tracked</span>
                    <span>Conflicts prevented: 0 pending</span>
                  </div>

                  <div className="board-preview">
                    {boardColumns.map((column) => (
                      <section key={column.title} className="board-column">
                        <div className="board-column-head">
                          <span>{column.title}</span>
                          <i
                            className={`board-column-dot board-column-dot-${column.tone}`}
                          />
                        </div>
                        <div className="board-column-cards">
                          {column.cards.map((card) => (
                            <article key={card.title} className="board-card-preview">
                              <strong>{card.title}</strong>
                              <span>{card.meta}</span>
                            </article>
                          ))}
                        </div>
                      </section>
                    ))}
                  </div>
                </div>
              </div>

              <div className="preview-feed">
                <div className="preview-feed-row">
                  <span className="feed-badge">Realtime</span>
                  <p>Marta moved Homepage redesign into execution.</p>
                </div>
                <div className="preview-feed-row">
                  <span className="feed-badge feed-badge-soft">Audit</span>
                  <p>Every important project change stays visible and traceable.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="proof-grid">
        {proofPoints.map((item) => (
          <article key={item.title} className="proof-card">
            <span className="proof-marker" />
            <h2>{item.title}</h2>
            <p>{item.body}</p>
          </article>
        ))}
      </section>

      <section className="story-grid">
        <article className="story-card story-card-dark">
          <div className="story-card-head">
            <p className="story-eyebrow">Why teams switch</p>
            <h2>A front door that makes the product feel serious</h2>
          </div>
          <p className="story-lead">
            Instead of splitting execution across chat threads, notes, and weak
            task lists, TaskFlow gives the team one place to direct momentum,
            assign ownership, and keep decisions in view.
          </p>
          <ul className="story-list">
            {visualBullets.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </article>

        <div className="story-column">
          <article className="story-card">
            <p className="story-eyebrow">{visualPanel.eyebrow}</p>
            <h2>{visualPanel.title}</h2>
            <p>{visualPanel.body}</p>
          </article>

          <article className="story-card">
            <p className="story-eyebrow">{calmPanel.eyebrow}</p>
            <h2>{calmPanel.title}</h2>
            <p>{calmPanel.body}</p>
            <ul className="proof-list proof-list-stack">
              {capabilityRows.map((item) => (
                <li key={item.label}>
                  <span>{item.label}</span>
                  <strong>{item.value}</strong>
                </li>
              ))}
            </ul>
          </article>
        </div>
      </section>

      <section className="landing-band">
        <div>
          <p className="story-eyebrow">Built for motion</p>
          <h2>Open the workspace and make progress feel immediate.</h2>
          <p>
            Refined enough to impress on first use. Practical enough to become
            the place your team returns to every day.
          </p>
        </div>
        <div className="landing-band-actions">
          <Link href="/app" className="button button-primary">
            Enter TaskFlow
          </Link>
          <Link href="/auth/login" className="button button-ghost">
            Sign in
          </Link>
        </div>
      </section>
    </main>
  );
}
