import { WorkspacePulseCanvas } from "./workspace-pulse-canvas";

export default {
  title: "Overview/Workspace Pulse Canvas",
  component: WorkspacePulseCanvas,
  parameters: {
    layout: "fullscreen",
  },
};

export function SeedState() {
  return <WorkspacePulseCanvas projects={[]} tasks={[]} recentAudit={[]} />;
}
