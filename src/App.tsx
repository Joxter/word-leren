import { useEffect, useRef } from "react";
import { Router, Route, Switch, Link, useRoute } from "wouter";
import { css } from "@linaria/core";
import CardsPage from "./pages/Cards";
import LearnPage from "./pages/Learn";
import LinePage from "./pages/Line";
import GrammarPage from "./pages/Grammar";
import GrammarDetailPage from "./pages/GrammarDetail";
import GrammarEditPage from "./pages/GrammarEdit";
import DictionaryPage from "./pages/Dictionary";

// The fades must sit on a non-scrolling wrapper: overlaying the tabs requires
// them to be painted above the content, which a background on the scroll
// container itself can't do.
const navWrap = css`
  position: relative;
  border-bottom: 1px solid #e5e5e5;
  background: #fff;

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
    <div ref={wrapRef} className={navWrap}>
      <nav ref={scrollRef} className={nav}>
        <NavLink href="/">Cards</NavLink>
        <NavLink href="/dictionary">Dictionary</NavLink>
        <NavLink href="/learn">Learn</NavLink>
        <NavLink href="/grammar">Grammar</NavLink>
        <NavLink href="/line">Line</NavLink>
      </nav>
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
        <Route path="/line" component={LinePage} />
        <Route path="/dictionary" component={DictionaryPage} />
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
      <Layout />
    </Router>
  );
}
