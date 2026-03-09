import { useToast, ToastProvider } from "./toast-provider";

function ToastPlayground() {
  const { notify } = useToast();

  return (
    <div style={{ display: "flex", gap: "0.75rem", padding: "1.25rem" }}>
      <button
        className="button button-primary"
        type="button"
        onClick={() => notify("success", "Saved successfully")}
      >
        Success Toast
      </button>
      <button
        className="button"
        type="button"
        onClick={() => notify("info", "Background sync is running")}
      >
        Info Toast
      </button>
      <button
        className="button"
        type="button"
        onClick={() => notify("error", "Failed to save changes")}
      >
        Error Toast
      </button>
    </div>
  );
}

export default {
  title: "Feedback/Toast Provider",
  decorators: [
    (Story) => (
      <ToastProvider>
        <Story />
      </ToastProvider>
    ),
  ],
};

export function InteractiveToasts() {
  return <ToastPlayground />;
}
