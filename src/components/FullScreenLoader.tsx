import { Lightbulb } from "lucide-react";

const FullScreenLoader = () => (
  <div className="min-h-screen bg-background flex items-center justify-center">
    <div className="text-center">
      <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center mx-auto mb-4 animate-pulse">
        <Lightbulb className="w-6 h-6 text-white" />
      </div>
      <p className="text-sm text-muted-foreground">Loading Idearupt…</p>
    </div>
  </div>
);

export default FullScreenLoader;
