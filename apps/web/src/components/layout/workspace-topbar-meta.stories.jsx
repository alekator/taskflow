import { WorkspaceContextMeta, WorkspaceTopbarLinks } from "./workspace-topbar-meta";

export default {
  title: "Layout/Workspace Topbar",
  parameters: {
    layout: "padded",
  },
};

export function ContextMeta() {
  return <WorkspaceContextMeta />;
}

export function TopbarLinks() {
  return <WorkspaceTopbarLinks />;
}

export function Combined() {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: "1rem",
      }}
    >
      <WorkspaceContextMeta />
      <WorkspaceTopbarLinks />
    </div>
  );
}
