import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  completeProjectAttachmentUpload,
  createProjectAttachmentUpload,
  deleteProjectAttachment,
  listProjectAttachments,
} from "./api";

const authFetch = vi.fn();

vi.mock("../auth/auth-fetch", () => ({
  authFetch: (...args: unknown[]) => authFetch(...args),
}));

describe("projects api attachments", () => {
  beforeEach(() => {
    authFetch.mockReset();
  });

  it("lists project attachments", async () => {
    authFetch.mockResolvedValueOnce([{ id: "a1" }]);

    const result = await listProjectAttachments("p1");

    expect(result).toEqual([{ id: "a1" }]);
    expect(authFetch).toHaveBeenCalledWith("/projects/p1/attachments");
  });

  it("creates upload intent", async () => {
    authFetch.mockResolvedValueOnce({ attachment: { id: "a1" } });

    await createProjectAttachmentUpload("p1", {
      fileName: "brief.pdf",
      mimeType: "application/pdf",
      sizeBytes: 128,
    });

    expect(authFetch).toHaveBeenCalledWith("/projects/p1/attachments/uploads", {
      method: "POST",
      body: {
        fileName: "brief.pdf",
        mimeType: "application/pdf",
        sizeBytes: 128,
      },
    });
  });

  it("completes upload and deletes attachment", async () => {
    authFetch.mockResolvedValueOnce({ id: "a1" });
    authFetch.mockResolvedValueOnce({ ok: true });

    await completeProjectAttachmentUpload("p1", "a1", "token-1");
    await deleteProjectAttachment("p1", "a1");

    expect(authFetch).toHaveBeenNthCalledWith(
      1,
      "/projects/p1/attachments/a1/complete",
      {
        method: "POST",
        body: { uploadToken: "token-1" },
      },
    );
    expect(authFetch).toHaveBeenNthCalledWith(
      2,
      "/projects/p1/attachments/a1",
      {
        method: "DELETE",
      },
    );
  });
});
