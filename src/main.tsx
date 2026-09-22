import { Component, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { Workbench } from "@/components/workbench";
import { AppErrorComponent } from "@/lib/error-component";
import "./styles.css";

class AppErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    return this.state.error
      ? <AppErrorComponent error={this.state.error} />
      : this.props.children;
  }
}

createRoot(document.getElementById("root")!).render(
  <AppErrorBoundary><Workbench /></AppErrorBoundary>,
);
