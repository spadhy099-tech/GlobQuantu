import { useEffect, useMemo, useState } from "react";
import { ClerkProvider, Show, SignIn, SignUp, useAuth, useClerk } from "@clerk/react";
import { publishableKeyFromHost } from "@clerk/react/internal";
import { shadcn } from "@clerk/themes";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { useGetDashboard, getGetDashboardQueryKey } from "@workspace/api-client-react";
import type { Dashboard, FundingRequest } from "@workspace/api-client-react";
import { ErrorBoundary } from "@/components/error-boundary";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import {
  Activity,
  ArrowRight,
  ArrowDownRight,
  ArrowUpRight,
  Bell,
  BookOpen,
  BriefcaseBusiness,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Eye,
  FileCheck2,
  Filter,
  Info,
  LockKeyhole,
  Landmark,
  LayoutDashboard,
  Menu,
  MoreHorizontal,
  Search,
  Settings2,
  ShieldCheck,
  Scale,
  SlidersHorizontal,
  Target,
  WalletCards,
  X,
} from "lucide-react";
import { Link, Route, Switch, useLocation, Router as WouterRouter } from "wouter";

const queryClient = new QueryClient();
const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;
const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

type Timeframe = "1M" | "3M" | "YTD" | "1Y" | "All";
const navItems = [
  { label: "Overview", icon: LayoutDashboard },
  { label: "Portfolio", icon: BriefcaseBusiness },
  { label: "Watchlist", icon: Eye },
  { label: "Notes", icon: BookOpen },
];

const palette = ["#65cfa3", "#87b8de", "#e8be67", "#bd9ade", "#e98b7e"];

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || "/"
    : path;
}

async function apiMutation<T>(path: string, init: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    credentials: "include",
    headers: { "content-type": "application/json", ...(init.headers ?? {}) },
  });
  const body = (await response.json().catch(() => null)) as
    | { error?: string }
    | T
    | null;
  if (!response.ok) {
    throw new Error(
      typeof body === "object" && body && "error" in body && body.error
        ? body.error
        : "The request could not be completed",
    );
  }
  return body as T;
}

function formatMoney(value: number | undefined, currency = "usd") {
  if (value === undefined || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
    maximumFractionDigits: 2,
  }).format(value);
}

function formatDate(value: string | Date | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

function Landing() {
  return (
    <div className="GlobQuantu-shell min-h-[100dvh] overflow-hidden">
      <PublicHeader />
      <main>
        <section className="public-hero mx-auto max-w-7xl px-5 pb-20 pt-16 sm:px-8 sm:pt-24 lg:px-12 lg:pb-28">
          <div className="grid items-end gap-12 lg:grid-cols-[1.1fr_.9fr]">
            <div className="reveal">
              <p className="eyebrow text-positive">Private wealth workspace</p>
              <h1 className="mt-5 max-w-4xl text-5xl font-semibold leading-[.98] tracking-[-.075em] sm:text-7xl lg:text-[6.8rem]">
                Clarity for the wealth you already hold.
              </h1>
              <p className="mt-7 max-w-xl text-base leading-8 text-muted-foreground sm:text-lg">
                GlobQuantu is a calm, account-backed workspace for seeing your portfolio, preparing your account, and keeping a precise record of activity.
              </p>
              <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                <Link href="/sign-up" data-testid="link-create-account" className="primary-button inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-5 py-3 text-sm font-bold text-primary-foreground">
                  Create a private account <ArrowRight size={16} />
                </Link>
                <Link href="/investing" data-testid="link-explore-investing" className="soft-button inline-flex items-center justify-center gap-2 rounded-lg border border-border px-5 py-3 text-sm font-semibold text-muted-foreground">
                  How GlobQuantu works
                </Link>
              </div>
              <p className="mt-5 max-w-xl text-xs leading-6 text-muted-foreground">
                Creating an account does not accept money. Funding is unavailable while our business model, licensing, and compliance review are underway.
              </p>
            </div>
            <div className="hero-blueprint panel tiny-grid relative overflow-hidden rounded-3xl p-5 sm:p-7 reveal-2" aria-label="GlobQuantu account workspace preview">
              <div className="absolute right-6 top-6 flex items-center gap-2 rounded-full border border-[hsl(var(--primary)/.22)] bg-[hsl(var(--primary)/.07)] px-3 py-1.5 text-[.62rem] font-semibold text-positive"><span className="pulse h-1.5 w-1.5 rounded-full bg-primary" />Account-backed view</div>
              <div className="mt-12 border-b border-border pb-5">
                <p className="label">Workspace signal</p>
                <div className="mt-3 flex items-end justify-between gap-4">
                  <span className="metric-number mono text-4xl font-bold sm:text-5xl">Private by design</span>
                  <ShieldCheck className="mb-1 text-positive" size={22} />
                </div>
              </div>
              <div className="mt-5 grid grid-cols-2 gap-3">
                <div className="panel-soft rounded-xl p-4"><p className="label">Records</p><p className="mt-2 text-sm font-semibold">Server verified</p></div>
                <div className="panel-soft rounded-xl p-4"><p className="label">Funding</p><p className="mt-2 text-sm font-semibold text-warm">Not available</p></div>
              </div>
              <div className="mt-3 flex items-center justify-between border-t border-border pt-4 text-[.68rem] text-muted-foreground"><span className="mono">GlobQuantu / 01</span><span>No simulated values</span></div>
            </div>
          </div>
        </section>
        <section className="border-y border-border bg-[hsl(220_43%_10%/.56)]">
          <div className="mx-auto grid max-w-7xl gap-px bg-border sm:grid-cols-3">
            {[
              ["01", "See clearly", "A single private view of holdings, activity, and account readiness."],
              ["02", "Stay grounded", "No forecasts, performance theater, or pressure to take action."],
              ["03", "Move carefully", "Funding stays closed until the right business and compliance work is complete."],
            ].map(([number, title, copy]) => (
              <div key={number} className="bg-[hsl(220_43%_10%)] px-5 py-8 sm:px-8 lg:px-12">
                <p className="mono text-[.65rem] text-positive">{number}</p>
                <h2 className="mt-5 text-lg font-semibold">{title}</h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{copy}</p>
              </div>
            ))}
          </div>
        </section>
        <section className="mx-auto max-w-7xl px-5 py-20 sm:px-8 lg:px-12 lg:py-28">
          <div className="grid gap-10 lg:grid-cols-[.72fr_1.28fr]">
            <div><p className="eyebrow text-muted-foreground">A deliberate beginning</p><h2 className="mt-4 text-3xl font-semibold tracking-[-.05em] sm:text-5xl">Useful before it is funded.</h2></div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="panel rounded-2xl p-6"><LockKeyhole className="text-positive" size={20} /><h3 className="mt-7 text-lg font-semibold">Private account layer</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">Clerk authentication and a server-backed dashboard keep your workspace tied to your account.</p></div>
              <div className="panel rounded-2xl p-6"><FileCheck2 className="text-warm" size={20} /><h3 className="mt-7 text-lg font-semibold">Readiness first</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">Identity and account checks are presented as a process, not a promise of access or service.</p></div>
              <div className="panel rounded-2xl p-6 sm:col-span-2"><Scale className="text-[hsl(188_48%_70%)]" size={20} /><h3 className="mt-7 text-lg font-semibold">Information, not advice</h3><p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground"GlobQuantu is not a trading app, broker, adviser, or offer to invest. Explore our approach to investing information, risk, and security before creating an account.</p></div>
            </div>
          </div>
        </section>
        <section className="mx-auto max-w-7xl px-5 pb-20 sm:px-8 lg:px-12 lg:pb-28">
          <div className="panel rounded-3xl p-7 sm:p-10 lg:flex lg:items-center lg:justify-between lg:gap-12">
            <div><p className="eyebrow text-positive">Start with context</p><h2 className="mt-3 text-2xl font-semibold tracking-[-.04em] sm:text-3xl">Know the boundaries before you enter the workspace.</h2><p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">Read the public information pages, then create an account when you are ready. No money is accepted through registration.</p></div>
            <Link href="/security" data-testid="link-security" className="soft-button mt-6 inline-flex shrink-0 items-center gap-2 rounded-lg border border-border px-4 py-3 text-sm font-semibold text-foreground lg:mt-0">Review security <ArrowRight size={15} /></Link>
          </div>
        </section>
      </main>
      <PublicFooter />
    </div>
  );
}

function PublicHeader() {
  const [mobileOpen, setMobileOpen] = useState(false);
  return (
    <header className="public-header sticky top-0 z-20 border-b border-border/80 bg-[hsl(221_48%_8%/.86)] px-5 backdrop-blur-xl sm:px-8 lg:px-12">
      <div className="mx-auto flex h-[72px] max-w-7xl items-center justify-between">
        <Link href="/" data-testid="link-GlobQuantu-home" className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground"><Landmark size={18} strokeWidth={2.4} /></span>
          <span><span className="block text-[1.05rem] font-bold tracking-[-.04em]">GlobQuantu</span><span className="mono hidden text-[.54rem] uppercase tracking-[.17em] text-muted-foreground sm:block">private wealth workspace</span></span>
        </Link>
        <nav className="hidden items-center gap-7 md:flex" aria-label="Public navigation">
          <Link href="/investing" data-testid="link-nav-investing" className="public-nav-link">Investing information</Link>
          <Link href="/risk" data-testid="link-nav-risk" className="public-nav-link">Risk</Link>
          <Link href="/security" data-testid="link-nav-security" className="public-nav-link">Security</Link>
        </nav>
        <div className="hidden items-center gap-2 md:flex">
          <Link href="/sign-in" data-testid="link-nav-sign-in" className="rounded-lg px-3 py-2 text-xs font-semibold text-muted-foreground hover:text-foreground">Log in</Link>
          <Link href="/sign-up" data-testid="link-nav-sign-up" className="rounded-lg bg-primary px-3.5 py-2 text-xs font-bold text-primary-foreground">Create account</Link>
        </div>
        <button type="button" data-testid="button-open-public-menu" aria-label="Open navigation menu" aria-expanded={mobileOpen} onClick={() => setMobileOpen((value) => !value)} className="rounded-lg border border-border p-2 text-muted-foreground md:hidden"><Menu size={18} /></button>
      </div>
      {mobileOpen && <nav className="border-t border-border py-4 md:hidden" aria-label="Mobile public navigation"><div className="flex flex-col gap-1"><Link href="/investing" onClick={() => setMobileOpen(false)} data-testid="link-mobile-investing" className="rounded-lg px-3 py-3 text-sm text-muted-foreground hover:bg-secondary hover:text-foreground">Investing information</Link><Link href="/risk" onClick={() => setMobileOpen(false)} data-testid="link-mobile-risk" className="rounded-lg px-3 py-3 text-sm text-muted-foreground hover:bg-secondary hover:text-foreground">Risk</Link><Link href="/security" onClick={() => setMobileOpen(false)} data-testid="link-mobile-security" className="rounded-lg px-3 py-3 text-sm text-muted-foreground hover:bg-secondary hover:text-foreground">Security</Link><div className="mt-2 flex gap-2 border-t border-border pt-3"><Link href="/sign-in" className="flex-1 rounded-lg border border-border px-3 py-2.5 text-center text-xs font-semibold text-muted-foreground">Log in</Link><Link href="/sign-up" className="flex-1 rounded-lg bg-primary px-3 py-2.5 text-center text-xs font-bold text-primary-foreground">Create account</Link></div></div></nav>}
    </header>
  );
}

function PublicFooter() {
  return <footer className="border-t border-border px-5 py-8 sm:px-8 lg:px-12"><div className="mx-auto flex max-w-7xl flex-col gap-4 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between"><span className="mono">GlobQuantu / INFORMATIONAL FOUNDATION</span><span>Not a trading app or an offer to invest. Funding is not available.</span></div></footer>;
}

type PublicPageKind = "investing" | "risk" | "security";

function PublicInfoPage({ kind }: { kind: PublicPageKind }) {
  const content = {
    investing: {
      eyebrow: "Investing information",
      title: "A clearer place to understand your investment context.",
      intro: "GlobQuantu is designed to organize account information and help you read what is recorded. It does not provide investment advice, execute trades, or make an offer to invest.",
      icon: BookOpen,
      sections: [
        ["What you can expect", "A private workspace for portfolio records, account readiness, and activity when those records exist. The dashboard shows stored data; it does not manufacture a performance story."],
        ["What you will not find", "There are no recommendations, forecasts, return targets, model portfolios, or prompts to buy and sell. Any investment decision remains yours and should be considered with an appropriately qualified professional."],
        ["Why we are building this", "Financial context is easier to respect when it is visible, sourced, and bounded. GlobQuantu starts with records and communication rather than transactions."],
      ],
    },
    risk: {
      eyebrow: "Risk and limitations",
      title: "A quiet interface cannot make risk disappear.",
      intro: "Investments can lose value. Historical information, if shown in a future version of the workspace, would not predict future results. GlobQuantu does not promise outcomes or suitability.",
      icon: Scale,
      sections: [
        ["Risk belongs in the decision", "Market, liquidity, credit, operational, tax, currency, and other risks can affect an investment. The right level of risk depends on a person’s circumstances, objectives, and capacity for loss."],
        ["No suitability determination", "Creating a GlobQuantu account does not mean that any investment, strategy, or service is suitable for you. We do not use registration to make an investment recommendation."],
        ["Read the record carefully", "Account balances and activity are only meaningful when they are sourced from the underlying records. Ask questions when information is incomplete or unclear."],
      ],
    },
    security: {
      eyebrow: "Security and privacy",
      title: "Security is a system of careful boundaries.",
      intro: "GlobQuantu uses Clerk for authentication and an authenticated, database-backed workspace for account information. We are building the controls and review processes required for a responsible financial product.",
      icon: LockKeyhole,
      sections: [
        ["Account access", "Registration and sign-in are handled through Clerk. Your workspace is only available to an authenticated account, and dashboard information is requested with session credentials."],
        ["Data discipline", "The dashboard is intended to display server-backed records, not estimates or demo values. We keep the interface explicit about what is present, what is missing, and what is unavailable."],
        ["Funding is closed", "No money is accepted through account creation. Funding and withdrawals are unavailable until GlobQuantu completes business model, licensing, and compliance review. This is a product boundary, not a payment delay."],
      ],
    },
  }[kind];
  const Icon = content.icon;
  return <div className="GlobQuantu-shell min-h-[100dvh]"><PublicHeader /><main className="mx-auto max-w-7xl px-5 pb-20 pt-16 sm:px-8 sm:pt-24 lg:px-12 lg:pb-28"><div className="grid gap-12 lg:grid-cols-[.8fr_1.2fr]"><div className="reveal"><div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-[hsl(var(--primary)/.25)] bg-[hsl(var(--primary)/.08)] text-positive"><Icon size={22} /></div><p className="eyebrow mt-8 text-positive">{content.eyebrow}</p><h1 className="mt-4 max-w-3xl text-4xl font-semibold leading-[1.02] tracking-[-.065em] sm:text-6xl">{content.title}</h1><p className="mt-6 max-w-xl text-base leading-8 text-muted-foreground">{content.intro}</p><div className="mt-8 flex flex-wrap gap-3"><Link href="/sign-up" data-testid={`link-${kind}-create-account`} className="primary-button inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-3 text-sm font-bold text-primary-foreground">Create account <ArrowRight size={15} /></Link><Link href="/" data-testid={`link-${kind}-home`} className="soft-button inline-flex items-center rounded-lg border border-border px-4 py-3 text-sm font-semibold text-muted-foreground">Back to overview</Link></div></div><div className="space-y-4 reveal-2">{content.sections.map(([title, copy], index) => <article key={title} className="panel rounded-2xl p-6 sm:p-8"><div className="flex gap-5"><span className="mono pt-1 text-[.65rem] text-positive">0{index + 1}</span><div><h2 className="text-lg font-semibold">{title}</h2><p className="mt-3 max-w-2xl text-sm leading-7 text-muted-foreground">{copy}</p></div></div></article>)}<div className="rounded-2xl border border-[hsl(var(--accent)/.2)] bg-[hsl(var(--accent)/.05)] p-5 text-sm leading-6 text-[hsl(43_70%_76%)]"><Info className="mb-3 text-accent" size={17} /><strong className="font-semibold">Important boundary.</strong> Account creation does not accept money. Funding is unavailable until our business model, licensing, and compliance review are complete.</div></div></div></main><PublicFooter /></div>;
}

function PortfolioChart({ dashboard, timeframe }: { dashboard: Dashboard; timeframe: Timeframe }) {
  const points = useMemo(() => {
    const completed = [...dashboard.transactions]
      .filter((transaction) => transaction.status === "completed")
      .reverse();
    let balance = 0;
    const values = completed.map((transaction) => {
      balance += transaction.type === "withdrawal" ? -transaction.amount : transaction.amount;
      return balance;
    });
    if (!values.length) return [];
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = Math.max(max - min, 1);
    return values.map((value, index) => {
      const x = completed.length === 1 ? 720 : (index / (completed.length - 1)) * 720;
      const y = 112 - ((value - min) / range) * 88;
      return `${x},${y}`;
    });
  }, [dashboard.transactions]);

  return (
    <div className="panel tiny-grid reveal-2 overflow-hidden rounded-2xl p-5 sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-5">
        <div>
          <p className="label">Cash balance history</p>
          <div className="mt-2 flex items-end gap-3">
            <span className="metric-number mono text-3xl font-bold sm:text-[2.7rem]">
              {formatMoney(dashboard.cashBalance, dashboard.portfolio.baseCurrency)}
            </span>
            <span className="mb-1.5 flex items-center gap-1 text-sm font-bold text-muted-foreground">
              <Activity size={15} />
              database ledger
            </span>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Completed deposits and withdrawals only
          </p>
        </div>
        <div className="flex rounded-lg border border-border bg-[hsl(219_30%_12%/.68)] p-1">
          {(["1M", "3M", "YTD", "1Y", "All"] as Timeframe[]).map((period) => (
            <span
              key={period}
              className={`rounded-md px-2.5 py-1.5 text-[.67rem] font-bold ${
                timeframe === period ? "bg-[hsl(var(--primary)/.16)] text-positive" : "text-muted-foreground"
              }`}
            >
              {period}
            </span>
          ))}
        </div>
      </div>
      <div className="mt-6 h-[190px] w-full sm:h-[214px]">
        {points.length > 0 ? (
          <svg viewBox="0 0 720 126" preserveAspectRatio="none" className="h-full w-full overflow-visible" role="img" aria-label={`Cash balance history for ${timeframe}`}>
            <defs>
              <linearGradient id="chartFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#65cfa3" stopOpacity=".2" />
                <stop offset="100%" stopColor="#65cfa3" stopOpacity="0" />
              </linearGradient>
            </defs>
            {[24, 54, 84, 114].map((y) => (
              <line key={y} x1="0" x2="720" y1={y} y2={y} stroke="hsl(218 30% 22% / .55)" strokeDasharray="3 6" />
            ))}
            <polygon points={`0,118 ${points.join(" ")} 720,118`} fill="url(#chartFill)" />
            <polyline className="chart-line" points={points.join(" ")} fill="none" stroke="#65cfa3" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : (
          <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-border text-center">
            <div>
              <p className="text-sm font-semibold">No completed funding activity</p>
              <p className="mt-1 text-xs text-muted-foreground">Your verified ledger history will appear here.</p>
            </div>
          </div>
        )}
      </div>
      <div className="mt-1 flex justify-between mono text-[.59rem] text-muted-foreground">
        <span>Account opening</span>
        <span>Now</span>
      </div>
    </div>
  );
}

function AllocationCard({ dashboard }: { dashboard: Dashboard }) {
  const allocation = useMemo(() => {
    const byType = new Map<string, number>();
    for (const holding of dashboard.holdings) {
      const value = holding.marketValue ?? holding.quantity * holding.currentPrice;
      byType.set(holding.assetType, (byType.get(holding.assetType) ?? 0) + value);
    }
    const total = [...byType.values()].reduce((sum, value) => sum + value, 0);
    return [...byType.entries()]
      .map(([label, value], index) => ({
        label,
        value,
        percentage: total ? (value / total) * 100 : 0,
        color: palette[index % palette.length],
      }))
      .sort((a, b) => b.value - a.value);
  }, [dashboard.holdings]);
  const gradient = allocation.length
    ? `conic-gradient(${allocation
        .reduce<{ text: string; stop: number }[]>((stops, item) => {
          const prior = stops[stops.length - 1]?.stop ?? 0;
          stops.push({ text: `${item.color} ${prior}%`, stop: prior + item.percentage });
          return stops;
        }, [])
        .map((stop) => stop.text)
        .join(", ")})`
    : "conic-gradient(hsl(218 30% 22%) 0 100%)";

  return (
    <div className="panel reveal-3 rounded-2xl p-5 sm:p-7">
      <div className="flex items-start justify-between">
        <div>
          <p className="label">Asset allocation</p>
          <p className="mt-1 text-xs text-muted-foreground">Calculated from stored holdings.</p>
        </div>
        <MoreHorizontal size={18} className="text-muted-foreground" />
      </div>
      <div className="mt-6 flex items-center gap-6">
        <div className="relative h-[142px] w-[142px] shrink-0 rounded-full" style={{ background: gradient }}>
          <div className="absolute inset-[15px] flex flex-col items-center justify-center rounded-full border border-border bg-card">
            <span className="mono text-lg font-bold">{allocation.length ? "100%" : "—"}</span>
            <span className="text-[.6rem] text-muted-foreground">{allocation.length ? "allocated" : "no holdings"}</span>
          </div>
        </div>
        <div className="min-w-0 space-y-3">
          {allocation.length ? (
            allocation.map((item) => (
              <div className="flex items-center justify-between gap-5 text-xs" key={item.label}>
                <span className="flex items-center gap-2 text-muted-foreground">
                  <span className="h-2 w-2 rounded-full" style={{ background: item.color }} />
                  {item.label}
                </span>
                <span className="mono font-bold">{item.percentage.toFixed(1)}%</span>
              </div>
            ))
          ) : (
            <p className="max-w-[150px] text-xs leading-relaxed text-muted-foreground">
              Holdings will appear after they are recorded in your portfolio.
            </p>
          )}
        </div>
      </div>
      <div className="mt-6 flex items-center gap-2 border-t border-border pt-4 text-[.68rem] text-muted-foreground">
        <SlidersHorizontal size={13} className="text-positive" />
        {allocation.length ? "Allocation reflects current stored prices" : "No allocation target is configured"}
      </div>
    </div>
  );
}

function HoldingsTable({ dashboard, query, onQuery, onFeedback }: { dashboard: Dashboard; query: string; onQuery: (query: string) => void; onFeedback: (message: string) => void }) {
  const [showFilters, setShowFilters] = useState(false);
  const visibleHoldings = dashboard.holdings.filter((holding) => `${holding.symbol} ${holding.name}`.toLowerCase().includes(query.toLowerCase()));
  return (
    <div className="panel reveal-3 overflow-hidden rounded-2xl">
      <div className="flex flex-col gap-4 border-b border-border p-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold tracking-[-.02em]">Holdings</h2>
            <span className="rounded-full bg-secondary px-2 py-0.5 text-[.6rem] font-bold text-muted-foreground">{dashboard.holdings.length}</span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">Only assets recorded in your portfolio are shown.</p>
        </div>
        <div className="flex items-center gap-2">
          <label className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" size={14} />
            <input type="search" value={query} onChange={(event) => onQuery(event.target.value)} placeholder="Search holdings" className="search-field h-8 w-[150px] rounded-md border border-border bg-[hsl(219_30%_12%/.62)] pl-8 pr-2 text-xs outline-none transition-colors focus:border-primary sm:w-[180px]" />
          </label>
          <button type="button" onClick={() => setShowFilters((value) => !value)} className={`soft-button rounded-md border p-2 ${showFilters ? "border-primary bg-[hsl(var(--primary)/.1)] text-positive" : "border-border text-muted-foreground"}`} aria-label="Filter holdings">
            <Filter size={14} />
          </button>
        </div>
      </div>
      {showFilters && <div className="flex items-center gap-2 border-b border-border bg-[hsl(219_30%_13%/.58)] px-5 py-2.5 text-[.68rem] text-muted-foreground sm:px-6"><span>View:</span><button type="button" onClick={() => onFeedback("Holdings are filtered from server-backed portfolio records.")} className="rounded-full border border-primary/40 bg-primary/10 px-2.5 py-1 font-semibold text-positive">All assets</button></div>}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[620px] text-left">
          <thead><tr className="border-b border-border text-[.63rem] uppercase tracking-[.13em] text-muted-foreground"><th className="px-5 py-3 font-semibold sm:px-6">Holding</th><th className="px-3 py-3 font-semibold">Quantity</th><th className="px-3 py-3 font-semibold">Market value</th><th className="px-3 py-3 font-semibold">Price</th><th className="px-4 py-3" /></tr></thead>
          <tbody>
            {visibleHoldings.map((holding, index) => (
              <tr key={holding.id} className="table-row border-b border-border/70 text-xs last:border-0">
                <td className="px-5 py-3.5 sm:px-6"><div className="flex items-center gap-3"><span className="flex h-8 w-8 items-center justify-center rounded-lg text-[.64rem] font-bold" style={{ color: palette[index % palette.length], background: `${palette[index % palette.length]}1c` }}>{holding.symbol.slice(0, 2)}</span><span><strong className="block text-sm font-semibold">{holding.symbol}</strong><span className="text-[.66rem] text-muted-foreground">{holding.name}</span></span></div></td>
                <td className="mono px-3 text-muted-foreground">{holding.quantity.toLocaleString()}</td>
                <td className="mono px-3 font-bold">{formatMoney(holding.marketValue, dashboard.portfolio.baseCurrency)}</td>
                <td className="mono px-3 text-muted-foreground">{formatMoney(holding.currentPrice, dashboard.portfolio.baseCurrency)}</td>
                <td className="px-4 text-muted-foreground"><ChevronRight size={14} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        {!visibleHoldings.length && <div className="px-6 py-12 text-center"><p className="text-sm font-semibold">{query ? `No holdings match “${query}”.` : "No holdings recorded yet."}</p><p className="mt-1 text-xs text-muted-foreground">{query ? "Clear the search to view all holdings." : "Your portfolio will appear here after assets are recorded."}</p></div>}
      </div>
    </div>
  );
}

function DashboardPage() {
  const { isSignedIn } = useAuthState();
  const queryClient = useQueryClient();
  const [activeNav, setActiveNav] = useState("Overview");
  const [timeframe] = useState<Timeframe>("1Y");
  const [query, setQuery] = useState("");
  const [mobileNav, setMobileNav] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [toast, setToast] = useState("");
  const dashboardQuery = useGetDashboard({ query: { enabled: Boolean(isSignedIn), queryKey: getGetDashboardQueryKey() }, request: { credentials: "include" } });
  const dashboard = dashboardQuery.data;

  const notify = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 3200);
  };

  if (dashboardQuery.isLoading || !dashboard) {
    return <div className="vaultora-shell flex min-h-[100dvh] items-center justify-center text-sm text-muted-foreground">Loading your secure workspace…</div>;
  }
  if (dashboardQuery.isError) {
    return <div className="vaultora-shell flex min-h-[100dvh] items-center justify-center p-6 text-center"><div><p className="text-lg font-semibold">We could not load your account.</p><p className="mt-2 text-sm text-muted-foreground">Refresh the page and try again.</p><button type="button" onClick={() => queryClient.invalidateQueries({ queryKey: getGetDashboardQueryKey() })} className="primary-button mt-5 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground">Retry</button></div></div>;
  }

  const unreadCount = dashboard.notifications.filter((notification) => !notification.readAt).length;
  const greeting = dashboard.user.firstName ? `Good morning, ${dashboard.user.firstName}.` : "Good morning.";
  const currency = dashboard.portfolio.baseCurrency;

  return (
    <div className="vaultora-shell text-foreground">
      <aside className={`sidebar-glass fixed inset-y-0 left-0 z-30 flex w-[248px] flex-col px-4 py-5 transition-transform duration-300 lg:translate-x-0 ${mobileNav ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="mb-9 flex items-center justify-between px-3">
          <button type="button" onClick={() => { setActiveNav("Overview"); setMobileNav(false); }} className="flex items-center gap-3 text-left">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] shadow-[0_8px_20px_hsl(151_49%_58%_/.18)]"><Landmark size={18} strokeWidth={2.4} /></span>
            <span><span className="block text-[1.05rem] font-bold tracking-[-0.04em]">vaultora</span><span className="mono block text-[.57rem] uppercase tracking-[.17em] text-muted-foreground">private wealth cockpit</span></span>
          </button>
          <button type="button" aria-label="Close navigation" onClick={() => setMobileNav(false)} className="rounded-lg p-2 text-muted-foreground hover:bg-secondary lg:hidden"><X size={16} /></button>
        </div>
        <div className="mb-3 px-3 text-[.62rem] font-bold uppercase tracking-[.18em] text-muted-foreground">Workspace</div>
        <nav className="space-y-1">
          {navItems.map(({ label, icon: Icon }) => <button type="button" key={label} onClick={() => { setActiveNav(label); setMobileNav(false); notify(`${label} view selected`); }} className="nav-item relative flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-muted-foreground" data-active={activeNav === label}><Icon size={17} strokeWidth={1.8} />{label}</button>)}
        </nav>
        <div className="my-7 h-px bg-border" />
        <div className="mb-3 px-3 text-[.62rem] font-bold uppercase tracking-[.18em] text-muted-foreground">System</div>
        <nav className="space-y-1">
          <button type="button" onClick={() => notify(`KYC status: ${dashboard.kyc?.status ?? "not_started"}`)} className="nav-item flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-muted-foreground"><Settings2 size={17} strokeWidth={1.8} />Account readiness</button>
          <button type="button" onClick={() => notify("Support requests are recorded securely from your account.")} className="nav-item flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-muted-foreground"><CircleHelp size={17} strokeWidth={1.8} />Help center</button>
        </nav>
        <div className="mt-auto rounded-xl border border-[hsl(var(--primary)/.2)] bg-[hsl(var(--primary)/.06)] p-3.5">
          <div className="mb-2 flex items-center gap-2 text-[.7rem] font-semibold text-positive"><ShieldCheck size={14} />Secure account</div>
          <p className="text-[.69rem] leading-relaxed text-muted-foreground">Balances update only from verified database records and confirmed funding events.</p>
        </div>
      </aside>
      {mobileNav && <button type="button" aria-label="Close menu overlay" onClick={() => setMobileNav(false)} className="fixed inset-0 z-20 bg-[hsl(221_48%_5%_/.66)] lg:hidden" />}
      <main className="min-h-[100dvh] lg:pl-[248px]">
        <header className="flex h-[76px] items-center justify-between border-b border-border px-5 sm:px-8 lg:px-10">
          <div className="flex items-center gap-3"><button type="button" aria-label="Open navigation" onClick={() => setMobileNav(true)} className="rounded-lg border border-border p-2 text-muted-foreground hover:bg-secondary lg:hidden"><Menu size={18} /></button><div><p className="eyebrow text-positive">{activeNav} / private view</p><p className="mt-1 hidden text-xs text-muted-foreground sm:block">{new Intl.DateTimeFormat("en-US", { dateStyle: "full" }).format(new Date())}<span className="mx-1.5 text-border">/</span> Account connected</p></div></div>
          <div className="relative flex items-center gap-2.5">
            <span className="hidden items-center gap-2 rounded-full border border-[hsl(var(--primary)/.22)] bg-[hsl(var(--primary)/.06)] px-3 py-1.5 text-[.66rem] font-semibold text-positive sm:flex"><span className="pulse h-1.5 w-1.5 rounded-full bg-primary" />Live account</span>
            <button type="button" aria-label="Notifications" onClick={() => setShowNotifications((value) => !value)} className="relative rounded-lg border border-border p-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"><Bell size={17} strokeWidth={1.8} />{unreadCount > 0 && <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-accent" />}</button>
            <ProfileMenu user={dashboard.user} />
            {showNotifications && <div className="panel absolute right-0 top-12 z-10 w-[300px] rounded-xl p-4 reveal"><div className="mb-3 flex items-center justify-between"><p className="text-sm font-semibold">Notifications</p><span className="mono text-[.58rem] text-muted-foreground">{unreadCount} unread</span></div><div className="space-y-3 text-xs">{dashboard.notifications.length ? dashboard.notifications.slice(0, 4).map((notification) => <button type="button" key={notification.id} onClick={async () => { await apiMutation(`/api/notifications/${notification.id}/read`, { method: "POST", body: "{}" }); await queryClient.invalidateQueries({ queryKey: getGetDashboardQueryKey() }); }} className="block w-full border-l-2 border-primary pl-3 text-left text-muted-foreground hover:text-foreground"><strong className="block text-foreground">{notification.title}</strong>{notification.body}</button>) : <p className="text-muted-foreground">No notifications yet.</p>}</div></div>}
          </div>
        </header>
        <div className="mx-auto max-w-[1500px] px-5 pb-10 pt-7 sm:px-8 lg:px-10">
           <div className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div className="reveal"><p className="eyebrow mb-2 text-muted-foreground">Portfolio overview</p><h1 className="text-3xl font-semibold tracking-[-0.055em] sm:text-[2.55rem]">{greeting}</h1><p className="mt-2 max-w-[540px] text-sm leading-relaxed text-muted-foreground">Your account view is connected to the live Vaultora ledger.</p></div><div className="reveal-2 flex items-center gap-2"><button type="button" disabled data-testid="button-withdraw-disabled" className="flex cursor-not-allowed items-center gap-2 rounded-lg border border-border px-3.5 py-2 text-xs font-semibold text-muted-foreground opacity-55"><ArrowDownRight size={15} />Withdraw</button><button type="button" disabled data-testid="button-add-funds-disabled" className="flex cursor-not-allowed items-center gap-2 rounded-lg bg-primary px-3.5 py-2 text-xs font-bold text-primary-foreground opacity-55"><ArrowUpRight size={15} />Add funds</button></div></div>
           <div className="mb-5 flex items-start gap-3 rounded-lg border border-[hsl(var(--accent)/.2)] bg-[hsl(var(--accent)/.06)] px-3.5 py-3 text-[.69rem] leading-5 text-[hsl(43_70%_76%)]"><ShieldCheck size={15} className="mt-0.5 shrink-0 text-accent" /><span><strong className="font-semibold">Funding unavailable.</strong> Add funds and Withdraw are disabled while Vaultora completes business model, licensing, and compliance review. Account creation does not accept money.</span></div>
          <section className="grid gap-5 xl:grid-cols-[minmax(0,1.65fr)_minmax(320px,.78fr)]"><PortfolioChart dashboard={dashboard} timeframe={timeframe} /><AllocationCard dashboard={dashboard} /></section>
           {!dashboard.holdings.length && !dashboard.transactions.length && <section className="panel-soft mt-5 rounded-2xl border-dashed p-6 sm:p-8"><div className="flex flex-col gap-5 sm:flex-row sm:items-start"><div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[hsl(var(--primary)/.1)] text-positive"><Landmark size={20} /></div><div><p className="eyebrow text-positive">Workspace ready</p><h2 className="mt-2 text-xl font-semibold tracking-[-.03em]">Your private view is ready for real records.</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">There are no holdings or activity to display yet. When records are added through an approved Vaultora workflow, they will appear here. Until then, nothing on this page is simulated.</p></div></div></section>}
          <section className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1.58fr)_minmax(290px,.72fr)]"><HoldingsTable dashboard={dashboard} query={query} onQuery={setQuery} onFeedback={notify} /><div className="space-y-5"><AccountStatus dashboard={dashboard} onFeedback={notify} /><ActivityCard requests={dashboard.fundingRequests} currency={currency} /></div></section>
        </div>
      </main>
      {toast && <div role="status" className="fixed bottom-5 left-1/2 z-40 flex -translate-x-1/2 items-center gap-2 rounded-lg border border-[hsl(var(--primary)/.25)] bg-[hsl(220_44%_15%/.96)] px-4 py-3 text-xs font-semibold text-foreground shadow-[0_12px_34px_hsl(220_50%_3%_/.35)] reveal"><CheckCircle2 size={14} className="text-positive" />{toast}</div>}
    </div>
  );
}

function ProfileMenu({ user }: { user: Dashboard["user"] }) {
  const { signOut } = useClerk();
  const [, setLocation] = useLocation();
  const [open, setOpen] = useState(false);
  const initials = `${user.firstName?.[0] ?? ""}${user.lastName?.[0] ?? ""}` || "VA";
  return <div className="relative"><button type="button" onClick={() => setOpen((value) => !value)} className="flex items-center gap-2 rounded-lg border border-border bg-card px-2 py-1.5 text-left hover:bg-secondary"><span className="flex h-7 w-7 items-center justify-center rounded-md bg-[hsl(188_48%_57%/.18)] text-[.67rem] font-bold text-[hsl(188_48%_70%)]">{initials}</span><span className="hidden text-xs font-semibold sm:block">{user.firstName || user.email || "Account"}</span><ChevronDown size={14} className="text-muted-foreground" /></button>{open && <div className="panel absolute right-0 top-12 z-20 w-52 rounded-xl p-2 reveal"><p className="truncate px-3 py-2 text-xs text-muted-foreground">{user.email || "Signed-in account"}</p>{user.role === "admin" && <button type="button" onClick={() => { setOpen(false); setLocation("/admin"); }} className="w-full rounded-lg px-3 py-2 text-left text-xs font-semibold text-muted-foreground hover:bg-secondary hover:text-foreground">Admin review</button>}<button type="button" onClick={() => signOut({ redirectUrl: basePath || "/" })} className="w-full rounded-lg px-3 py-2 text-left text-xs font-semibold text-muted-foreground hover:bg-secondary hover:text-foreground">Log out</button></div>}</div>;
}

function AccountStatus({ dashboard, onFeedback }: { dashboard: Dashboard; onFeedback: (message: string) => void }) {
  const status = dashboard.kyc?.status ?? "not_started";
  return <div className="panel reveal-3 rounded-2xl p-5"><div className="flex items-center justify-between"><div><p className="label">Account readiness</p><p className="mt-1 text-xs text-muted-foreground">Required checks before activity.</p></div><ShieldCheck size={16} className="text-positive" /></div><div className="mt-5 space-y-3 text-xs"><div className="flex items-center justify-between border-b border-border pb-3"><span className="text-muted-foreground">Identity verification</span><span className={`rounded-full px-2 py-1 text-[.6rem] font-bold ${status === "approved" ? "bg-[hsl(var(--primary)/.12)] text-positive" : "bg-secondary text-muted-foreground"}`}>{status.replace("_", " ")}</span></div><div className="flex items-center justify-between"><span className="text-muted-foreground">Base currency</span><span className="mono font-bold">{dashboard.portfolio.baseCurrency.toUpperCase()}</span></div></div><button type="button" onClick={() => onFeedback(status === "approved" ? "Your identity verification is approved." : "Identity verification is managed from your account review flow.")} className="mt-5 flex w-full items-center justify-between text-[.68rem] font-semibold text-positive hover:underline">Review account <ChevronRight size={13} /></button></div>;
}

function ActivityCard({ requests, currency }: { requests: FundingRequest[]; currency: string }) {
  return <div className="panel reveal-3 rounded-2xl p-5"><div className="flex items-center justify-between"><div><p className="label">Funding activity</p><p className="mt-1 text-xs text-muted-foreground">Server-side request status.</p></div><WalletCards size={16} className="text-warm" /></div><div className="mt-5 space-y-3">{requests.length ? requests.slice(0, 3).map((request) => <div key={request.id} className="flex items-center justify-between border-b border-border pb-3 text-xs last:border-0 last:pb-0"><div><p className="font-semibold capitalize">{request.type}</p><p className="mt-1 text-[.65rem] text-muted-foreground">{formatDate(request.createdAt)}</p></div><div className="text-right"><p className="mono font-bold">{formatMoney(request.amount, currency)}</p><p className="mt-1 text-[.62rem] capitalize text-muted-foreground">{request.status}</p></div></div>) : <p className="text-xs leading-relaxed text-muted-foreground">No deposit or withdrawal requests have been created.</p>}</div></div>;
}

function AdminPanel() {
  const { isSignedIn } = useAuth();
  const [requests, setRequests] = useState<FundingRequest[]>([]);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");

  async function loadRequests() {
    if (!isSignedIn) return;
    try {
      setError("");
      setRequests(await apiMutation<FundingRequest[]>("/api/admin/funding-requests", { method: "GET" }));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to load administrative requests");
    }
  }

  useEffect(() => {
    void loadRequests();
  }, [isSignedIn]);

  async function review(id: string, status: "approved" | "rejected") {
    setBusyId(id);
    setError("");
    try {
      await apiMutation(`/api/admin/funding-requests/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      await loadRequests();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to review request");
    } finally {
      setBusyId("");
    }
  }

  if (!isSignedIn) {
    return <div className="GlobQuantu-shell flex min-h-[100dvh] items-center justify-center text-sm text-muted-foreground">Authentication required.</div>;
  }

  return (
    <div className="GlobQuantu-shell min-h-[100dvh] px-5 py-8 text-foreground sm:px-8 lg:px-12">
      <div className="mx-auto max-w-6xl">
        <div className="mb-7 flex items-end justify-between gap-4">
          <div>
            <p className="eyebrow text-positive">Protected operations</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-[-.05em]">Funding review</h1>
            <p className="mt-2 text-sm text-muted-foreground">Only approved administrators can review pending withdrawals. Approval does not mark a payout complete.</p>
          </div>
          <a href={basePath || "/"} className="soft-button rounded-lg border border-border px-3 py-2 text-xs font-semibold text-muted-foreground">Back to dashboard</a>
        </div>
        {error && <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>}
        <div className="panel overflow-hidden rounded-2xl">
          <div className="border-b border-border px-5 py-4"><p className="text-sm font-semibold">Funding requests</p></div>
          {requests.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[680px] text-left text-xs">
                <thead><tr className="border-b border-border text-[.63rem] uppercase tracking-[.13em] text-muted-foreground"><th className="px-5 py-3">Request</th><th className="px-3 py-3">Amount</th><th className="px-3 py-3">Status</th><th className="px-3 py-3">Created</th><th className="px-4 py-3">Action</th></tr></thead>
                <tbody>{requests.map((request) => <tr key={request.id} className="border-b border-border/70 last:border-0"><td className="px-5 py-4"><span className="mono">{request.id.slice(0, 12)}…</span><span className="mt-1 block text-[.65rem] text-muted-foreground">{request.type}</span></td><td className="mono px-3 font-bold">{formatMoney(request.amount, request.currency)}</td><td className="px-3 capitalize text-muted-foreground">{request.status}</td><td className="px-3 text-muted-foreground">{formatDate(request.createdAt)}</td><td className="px-4">{request.status === "pending" && request.type === "withdrawal" && <div className="flex gap-2"><button type="button" disabled={busyId === request.id} onClick={() => void review(request.id, "approved")} className="rounded-md bg-primary/15 px-2.5 py-1.5 text-[.68rem] font-bold text-positive disabled:opacity-50">Approve</button><button type="button" disabled={busyId === request.id} onClick={() => void review(request.id, "rejected")} className="rounded-md bg-destructive/10 px-2.5 py-1.5 text-[.68rem] font-bold text-destructive disabled:opacity-50">Reject</button></div>}</td></tr>)}</tbody>
              </table>
            </div>
          ) : <div className="px-6 py-14 text-center"><p className="text-sm font-semibold">No funding requests are awaiting review.</p><p className="mt-1 text-xs text-muted-foreground">The server returns only records permitted for the signed-in administrator.</p></div>}
        </div>
      </div>
    </div>
  );
}

function useAuthState() {
  return useAuth();
}

function HomeRedirect() {
  return <><Show when="signed-in"><DashboardPage /></Show><Show when="signed-out"><Landing /></Show></>;
}

function SignInPage() {
  return <div className="GlobQuantu-shell flex min-h-[100dvh] items-center justify-center px-4"><SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} /></div>;
}

function SignUpPage() {
  return <div className="GlobQuantu-shell flex min-h-[100dvh] items-center justify-center px-4"><SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} /></div>;
}

function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();
  return <ClerkProvider publishableKey={clerkPubKey} proxyUrl={clerkProxyUrl} appearance={{ theme: shadcn, cssLayerName: "clerk", options: { logoPlacement: "inside", logoLinkUrl: basePath || "/", logoImageUrl: `${window.location.origin}${basePath}/logo.svg` }, variables: { colorPrimary: "#65cfa3", colorForeground: "#eef4f1", colorMutedForeground: "#98aaa5", colorBackground: "#101a27", colorInput: "#152332", colorInputForeground: "#eef4f1", colorNeutral: "#2c3b50", colorDanger: "#ef8f85", fontFamily: "DM Sans, sans-serif", borderRadius: "0.75rem" }, elements: { rootBox: "w-full flex justify-center", cardBox: "bg-[#101a27] rounded-2xl w-[440px] max-w-full overflow-hidden", card: "!shadow-none !border-0 !bg-transparent !rounded-none", footer: "!shadow-none !border-0 !bg-transparent !rounded-none", headerTitle: "text-[#eef4f1]", headerSubtitle: "text-[#98aaa5]", formFieldLabel: "text-[#eef4f1]", footerActionLink: "text-[#65cfa3]", footerActionText: "text-[#98aaa5]", dividerText: "text-[#98aaa5]", formFieldInput: "bg-[#152332] text-[#eef4f1] border-[#2c3b50]", formButtonPrimary: "bg-[#65cfa3] text-[#08120f] hover:bg-[#7addb0]", socialButtonsBlockButton: "border-[#2c3b50] bg-[#152332] text-[#eef4f1]", socialButtonsBlockButtonText: "text-[#eef4f1]" } }} signInUrl={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} routerPush={(to) => setLocation(stripBase(to))} routerReplace={(to) => setLocation(stripBase(to), { replace: true })}><QueryClientProvider client={queryClient}><ErrorBoundary><Switch><Route path="/" component={HomeRedirect} /><Route path="/investing" component={() => <PublicInfoPage kind="investing" />} /><Route path="/risk" component={() => <PublicInfoPage kind="risk" />} /><Route path="/security" component={() => <PublicInfoPage kind="security" />} /><Route path="/admin" component={AdminPanel} /><Route path="/sign-in/*?" component={SignInPage} /><Route path="/sign-up/*?" component={SignUpPage} /><Route component={NotFound} /></Switch></ErrorBoundary></QueryClientProvider></ClerkProvider>;
}

function App() {
  if (!clerkPubKey) throw new Error("Missing VITE_CLERK_PUBLISHABLE_KEY");
  return <TooltipProvider><WouterRouter base={basePath}><ClerkProviderWithRoutes /></WouterRouter><Toaster /></TooltipProvider>;
}

export default App;
