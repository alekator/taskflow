import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectAttachmentsPanel } from "./project-attachments-panel";

const mockNotify = vi.fn();
const mockList = vi.fn();
const mockCreate = vi.fn();
const mockComplete = vi.fn();
const mockDelete = vi.fn();

vi.mock("../feedback/toast-provider", () => ({
  useToast: () => ({ notify: mockNotify }),
}));

vi.mock("../../lib/projects/api", () => ({
  listProjectAttachments: (...args: unknown[]) => mockList(...args),
  createProjectAttachmentUpload: (...args: unknown[]) => mockCreate(...args),
  completeProjectAttachmentUpload: (...args: unknown[]) => mockComplete(...args),
  deleteProjectAttachment: (...args: unknown[]) => mockDelete(...args),
}));

describe("ProjectAttachmentsPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockList.mockResolvedValue([
      {
        id: "a1",
        fileName: "brief.pdf",
        mimeType: "application/pdf",
        sizeBytes: 2048,
        storageProvider: "LOCAL",
        status: "AVAILABLE",
        uploadedAt: null,
        createdAt: "2026-03-09T10:00:00.000Z",
        updatedAt: "2026-03-09T10:00:00.000Z",
        downloadUrl: "/api/projects/p1/attachments/a1/download",
      },
    ]);
    mockCreate.mockResolvedValue({
      attachment: { id: "a2" },
      uploadToken: "token-1",
    });
    mockComplete.mockResolvedValue({ id: "a2" });
    mockDelete.mockResolvedValue({ ok: true });
  });

  it("loads and displays attachments", async () => {
    render(<ProjectAttachmentsPanel projectId="p1" />);

    await waitFor(() => expect(mockList).toHaveBeenCalledWith("p1"));
    expect(await screen.findByText("brief.pdf")).toBeInTheDocument();
  });

  it("creates and completes project attachment upload flow", async () => {
    const user = userEvent.setup();
    render(<ProjectAttachmentsPanel projectId="p1" />);

    await screen.findByText("brief.pdf");
    await user.clear(screen.getByTestId("project-attachment-name"));
    await user.type(
      screen.getByTestId("project-attachment-name"),
      "release-notes.pdf",
    );
    await user.clear(screen.getByTestId("project-attachment-size"));
    await user.type(screen.getByTestId("project-attachment-size"), "4096");
    await user.click(screen.getByTestId("project-attachment-submit"));

    await waitFor(() =>
      expect(mockCreate).toHaveBeenCalledWith("p1", {
        fileName: "release-notes.pdf",
        mimeType: "application/pdf",
        sizeBytes: 4096,
      }),
    );
    expect(mockComplete).toHaveBeenCalledWith("p1", "a2", "token-1");
    expect(mockNotify).toHaveBeenCalledWith("success", "Project attachment uploaded");
  });

  it("deletes attachment", async () => {
    const user = userEvent.setup();
    render(<ProjectAttachmentsPanel projectId="p1" />);

    await screen.findByText("brief.pdf");
    await user.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(mockDelete).toHaveBeenCalledWith("p1", "a1"));
  });
});
