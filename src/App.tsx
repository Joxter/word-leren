import { useEffect, useRef } from "react";
import { Router, Route, Switch, Link, useRoute } from "wouter";
import { css } from "@linaria/core";
import { db } from "./db";
import AuthGate from "./components/AuthGate";
import CardsPage from "./pages/Cards";
import LearnPage from "./pages/Learn";
import DeckPage from "./pages/Deck";
import GrammarPage from "./pages/Grammar";
import GrammarDetailPage from "./pages/GrammarDetail";
import GrammarEditPage from "./pages/GrammarEdit";
import DictionaryPage from "./pages/Dictionary";
import ExamplesPage from "./pages/Examples";
import AccountPage from "./pages/Account";

// The tabs scroll; the account corner beside them doesn't. The rule under both
// belongs to the bar, so it runs the full width whatever the tabs are doing.
const bar = css`
  display: flex;
  align-items: center;
  border-bottom: 1px solid #e5e5e5;
  background: #fff;
`;

// The fades must sit on a non-scrolling wrapper: overlaying the tabs requires
// them to be painted above the content, which a background on the scroll
// container itself can't do.
const navWrap = css`
  position: relative;
  flex: 1;
  min-width: 0;

  /* White fade-outs over the edges, shown only when that side is scrollable. */
  &::before,
  &::after {
    content: "";
    position: absolute;
    top: 0;
    bottom: 0;
    width: 2.5rem;
    pointer-events: none;
    opacity: 0;
    transition: opacity 0.15s;
  }

  &::before {
    left: 0;
    background: linear-gradient(90deg, #fff, rgba(255, 255, 255, 0));
  }

  &::after {
    right: 0;
    background: linear-gradient(270deg, #fff, rgba(255, 255, 255, 0));
  }

  &[data-fade-left="1"]::before {
    opacity: 1;
  }

  &[data-fade-right="1"]::after {
    opacity: 1;
  }
`;

const nav = css`
  padding: 0 1.5rem;
  display: flex;
  gap: 0.25rem;
  overflow-x: auto;

  /* Invisible scrollbar. */
  scrollbar-width: none;
  &::-webkit-scrollbar {
    display: none;
  }
`;

const navLink = css`
  display: inline-block;
  flex-shrink: 0;
  padding: 0.75rem 0.875rem;
  font-size: 0.875rem;
  font-weight: 500;
  color: #555;
  text-decoration: none;
  border-bottom: 2px solid transparent;

  &:hover {
    color: #111;
  }
`;

const navLinkActive = css`
  color: #111;
  border-bottom-color: #1a1a1a;
`;

const account = css`
  display: flex;
  align-items: center;
  flex-shrink: 0;
  padding: 0 1.25rem 0 0.75rem;
`;

// The only way into the personal cabinet — signing out and everything else
// about the account lives on that page now, so the corner is just an icon.
const accountLink = css`
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0.4rem;
  border-radius: 50%;
  color: #888;

  &:hover {
    color: #111;
    background: #f2f2f2;
  }
`;

const accountLinkActive = css`
  color: #111;
  background: #f0f0f0;
`;

function Account() {
  const { user } = db.useAuth();
  const [isActive] = useRoute("/account");
  if (!user) return null;
  return (
    <div className={account}>
      <Link
        href="/account"
        className={
          isActive ? `${accountLink} ${accountLinkActive}` : accountLink
        }
        title={user.email}
        aria-label="Account"
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="8" r="4" />
          <path d="M4 21c0-4 3.6-6 8-6s8 2 8 6" />
        </svg>
      </Link>
    </div>
  );
}

function NavLink({ href, children }: { href: string; children: string }) {
  const [isActive] = useRoute(href === "/" ? "/" : `${href}*`);
  return (
    <Link
      href={href}
      className={isActive ? `${navLink} ${navLinkActive}` : navLink}
    >
      {children}
    </Link>
  );
}

// Nav in a wrapper that shows a white fade over whichever edge still has
// tabs hidden behind it. Scroll state is written straight to data attributes
// so scrolling doesn't re-render React.
function Nav() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    const wrap = wrapRef.current;
    if (!el || !wrap) return;

    function update() {
      if (!el || !wrap) return;
      wrap.dataset.fadeLeft = el.scrollLeft > 1 ? "1" : "0";
      wrap.dataset.fadeRight =
        el.scrollLeft < el.scrollWidth - el.clientWidth - 1 ? "1" : "0";
    }

    update();
    el.addEventListener("scroll", update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      ro.disconnect();
    };
  }, []);

  return (
    <div className={bar}>
      <div ref={wrapRef} className={navWrap}>
        <nav ref={scrollRef} className={nav}>
          <NavLink href="/">Cards</NavLink>
          <NavLink href="/dictionary">Dictionary</NavLink>
          <NavLink href="/learn">Learn</NavLink>
          <NavLink href="/deck">Backlog</NavLink>
          <NavLink href="/examples">Examples</NavLink>
          <NavLink href="/grammar">Grammar</NavLink>
        </nav>
      </div>
      <Account />
    </div>
  );
}

function Layout() {
  return (
    <>
      <Nav />
      <Switch>
        <Route path="/" component={CardsPage} />
        <Route path="/learn" component={LearnPage} />
        <Route path="/deck" component={DeckPage} />
        <Route path="/dictionary" component={DictionaryPage} />
        <Route path="/examples" component={ExamplesPage} />
        <Route path="/account" component={AccountPage} />
        <Route path="/grammar" component={GrammarPage} />
        <Route path="/grammar/new" component={GrammarEditPage} />
        <Route path="/grammar/:id/edit" component={GrammarEditPage} />
        <Route path="/grammar/:id" component={GrammarDetailPage} />
      </Switch>
    </>
  );
}

export default function App() {
  return (
    <Router base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
      <AuthGate>
        <Layout />
      </AuthGate>
    </Router>
  );
}
