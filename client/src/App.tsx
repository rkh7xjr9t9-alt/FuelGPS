import { Switch, Route, Router } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import MapPage from "@/pages/MapPage";
import AuthPage from "@/pages/AuthPage";
import RoutePlanPage from "@/pages/RoutePlanPage";
import SettingsPage from "@/pages/SettingsPage";
import Layout from "@/components/Layout";

function AppRouter() {
  return (
    <Layout>
      <Switch>
        <Route path="/" component={MapPage} />
        <Route path="/auth" component={AuthPage} />
        <Route path="/route" component={RoutePlanPage} />
        <Route path="/settings" component={SettingsPage} />
        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router hook={useHashLocation}>
          <AppRouter />
        </Router>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
