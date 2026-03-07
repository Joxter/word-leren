import { Router, Route, Switch } from "wouter";
import CardsPage from "./pages/Cards";

export default function App() {
  return (
    <Router base={import.meta.env.BASE_URL}>
      <Switch>
        <Route path="/" component={CardsPage} />
      </Switch>
    </Router>
  );
}
