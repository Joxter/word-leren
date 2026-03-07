import { Route, Switch } from "wouter";
import CardsPage from "./pages/Cards";

export default function App() {
  return (
    <Switch>
      <Route path="/" component={CardsPage} />
    </Switch>
  );
}
