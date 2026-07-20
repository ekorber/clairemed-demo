import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import DeleteConversation from "./DeleteConversation";

vi.mock("../api/client", () => ({ api: { deleteConversation: vi.fn() } }));
import { api } from "../api/client";

const setup = () => {
  const onDeleted = vi.fn();
  render(<DeleteConversation id="abc" patientName="Ana" onDeleted={onDeleted} />);
  return onDeleted;
};

const openConfirm = () => fireEvent.click(screen.getByRole("button", { name: /^delete$/i }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.deleteConversation).mockResolvedValue(undefined);
});

describe("DeleteConversation", () => {
  it("does not delete anything until the action is confirmed", () => {
    setup();
    openConfirm();

    expect(screen.getByText(/cannot be undone/i)).toBeInTheDocument();
    expect(api.deleteConversation).not.toHaveBeenCalled();
  });

  it("names the patient in the confirmation so you know what you are deleting", () => {
    setup();
    openConfirm();
    expect(screen.getByText(/Ana's conversation/)).toBeInTheDocument();
  });

  it("abandons the delete on Cancel", () => {
    const onDeleted = setup();
    openConfirm();
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));

    expect(api.deleteConversation).not.toHaveBeenCalled();
    expect(onDeleted).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /^delete$/i })).toBeInTheDocument();
  });

  it("deletes and notifies the parent once confirmed", async () => {
    const onDeleted = setup();
    openConfirm();
    fireEvent.click(screen.getByRole("button", { name: /^delete$/i }));

    await waitFor(() => expect(onDeleted).toHaveBeenCalled());
    expect(api.deleteConversation).toHaveBeenCalledWith("abc");
  });

  it("keeps the entry and surfaces the reason when the delete fails", async () => {
    vi.mocked(api.deleteConversation).mockRejectedValue(new Error("This conversation no longer exists."));
    const onDeleted = setup();
    openConfirm();
    fireEvent.click(screen.getByRole("button", { name: /^delete$/i }));

    expect(await screen.findByText(/no longer exists/i)).toBeInTheDocument();
    expect(onDeleted).not.toHaveBeenCalled(); // parent must not drop a row that still exists
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
  });

  it("blocks a second submit while the delete is in flight", async () => {
    let release: () => void = () => {};
    vi.mocked(api.deleteConversation).mockReturnValue(new Promise((res) => { release = () => res(undefined); }));
    setup();
    openConfirm();

    const confirm = screen.getByRole("button", { name: /^delete$/i });
    fireEvent.click(confirm);
    await waitFor(() => expect(screen.getByRole("button", { name: /deleting/i })).toBeDisabled());

    fireEvent.click(screen.getByRole("button", { name: /deleting/i }));
    expect(api.deleteConversation).toHaveBeenCalledTimes(1);
    release();
  });
});
