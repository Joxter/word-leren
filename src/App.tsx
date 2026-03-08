import { Router, Route, Switch, Link, useRoute } from "wouter";
import { css } from "@linaria/core";
import CardsPage from "./pages/Cards";
import GrammarPage from "./pages/Grammar";

const nav = css`
  background: #fff;
  border-bottom: 1px solid #e5e5e5;
  padding: 0 1.5rem;
  display: flex;
  gap: 0.25rem;
`;

const navLink = css`
  display: inline-block;
  padding: 0.75rem 0.875rem;
  font-size: 0.875rem;
  font-weight: 500;
  color: #555;
  text-decoration: none;
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;

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
    <Link href={href} className={isActive ? `${navLink} ${navLinkActive}` : navLink}>
      {children}
    </Link>
  );
}

function Layout() {
  return (
    <>
      <nav className={nav}>
        <NavLink href="/">Cards</NavLink>
        <NavLink href="/grammar">Grammar</NavLink>
      </nav>
      <Switch>
        <Route path="/" component={CardsPage} />
        <Route path="/grammar" component={GrammarPage} />
      </Switch>
    </>
  );
}

export default function App() {
  return (
    <Router base={import.meta.env.BASE_URL}>
      <Layout />
    </Router>
  );
}
