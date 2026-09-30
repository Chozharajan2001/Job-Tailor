import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, act } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

const verifyEmail = vi.fn();

vi.mock("../services/auth", () => ({
  authService: {
    verifyEmail: (...args: unknown[]) => verifyEmail(...args),
    resendVerificationEmail: vi.fn(),
  },
}));

const VerifyEmailPage = (await import("../pages/VerifyEmailPage")).default;

/**
 * M6 / H6 companion: the auto-verify effect re-fires whenever isLoading drops
 * while success is still false, so a rejected token retried forever. The page
 * must stop after a bounded number of attempts and hand control to the user.
 */
describe("VerifyEmailPage retry bound", () => {
  beforeEach(() => {
    verifyEmail.mockReset();
  });

  it("gives up after a few failed attempts instead of looping", async () => {
    verifyEmail.mockRejectedValue({
      response: {
        data: {
          error: { code: "INVALID_VERIFICATION_TOKEN", message: "bad token" },
        },
      },
    });

    await act(async () => {
      render(
        <MemoryRouter initialEntries={["/verify-email/tok-123"]}>
          <Routes>
            <Route path="/verify-email/:token" element={<VerifyEmailPage />} />
          </Routes>
        </MemoryRouter>,
      );
    });

    // Drain enough cycles that an unbounded retry loop would blow past the cap.
    for (let i = 0; i < 15; i++) {
      await act(async () => {
        await new Promise((r) => setTimeout(r, 0));
      });
    }

    expect(verifyEmail.mock.calls.length).toBeGreaterThan(0);
    expect(verifyEmail.mock.calls.length).toBeLessThanOrEqual(3);
    expect(
      await screen.findByText(/invalid or expired verification token/i),
    ).toBeInTheDocument();
  });
});
