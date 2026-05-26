import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface Props {
  toolName: string;
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/** Evita pantalla en blanco si una herramienta revienta al montar o renderizar. */
export class ToolErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(`[${this.props.toolName}]`, error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base text-destructive">
              <AlertTriangle className="size-5" />
              Error en {this.props.toolName}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <pre className="whitespace-pre-wrap font-mono text-xs text-muted-foreground">
              {this.state.error.message}
            </pre>
            <Button
              size="sm"
              variant="outline"
              onClick={() => this.setState({ error: null })}
            >
              Reintentar
            </Button>
          </CardContent>
        </Card>
      );
    }
    return this.props.children;
  }
}
