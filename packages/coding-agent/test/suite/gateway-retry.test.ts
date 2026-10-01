import { fauxAssistantMessage } from "@earendil-works/pi-ai";
import { describe, expect, it, vi } from "vitest";
import { createHarness } from "./harness.ts";

const errors = [
	"Upstream service temporarily unavailable",
	"Upstream response stream was interrupted",
	"Upstream HTTP/2 stream failed",
];

describe("Gateway transient error retries", () => {
	it.each(errors)("retries %s and omits the failed response from model context", async (errorMessage) => {
		const harness = await createHarness({ settings: { retry: { enabled: true, maxRetries: 1, baseDelayMs: 0 } } });
		try {
			harness.setResponses([
				fauxAssistantMessage("partial output", { stopReason: "error", errorMessage }),
				fauxAssistantMessage("recovered"),
			]);
			await harness.session.prompt("test");
			expect(harness.faux.state.callCount).toBe(2);
			expect(harness.eventsOfType("auto_retry_start").map((event) => event.errorMessage)).toEqual([errorMessage]);
			expect(harness.eventsOfType("auto_retry_end").map((event) => event.success)).toEqual([true]);
			expect(harness.session.messages.filter((message) => message.role === "assistant")).toEqual([
				expect.objectContaining({ content: [{ type: "text", text: "recovered" }] }),
			]);
		} finally {
			harness.cleanup();
		}
	});

	it("keeps repeated gateway errors within the retry budget", async () => {
		const harness = await createHarness({ settings: { retry: { enabled: true, maxRetries: 1, baseDelayMs: 0 } } });
		try {
			harness.setResponses(
				errors.map((errorMessage) => fauxAssistantMessage("", { stopReason: "error", errorMessage })),
			);
			await harness.session.prompt("test");
			expect(harness.faux.state.callCount).toBe(2);
			expect(harness.eventsOfType("auto_retry_start")).toHaveLength(1);
			expect(harness.eventsOfType("auto_retry_end")).toEqual([
				expect.objectContaining({ success: false, attempt: 1, finalError: errors[1] }),
			]);
		} finally {
			harness.cleanup();
		}
	});

	it("cancels gateway retry backoff without sending another request", async () => {
		const harness = await createHarness({
			settings: { retry: { enabled: true, maxRetries: 3, baseDelayMs: 60000 } },
		});
		try {
			harness.setResponses([
				fauxAssistantMessage("", { stopReason: "error", errorMessage: errors[0] }),
				fauxAssistantMessage("unused"),
			]);
			const prompt = harness.session.prompt("test");
			await vi.waitFor(() => expect(harness.session.isRetrying).toBe(true));
			await harness.session.abort();
			await prompt;
			expect(harness.faux.state.callCount).toBe(1);
			expect(harness.eventsOfType("auto_retry_end")).toEqual([
				expect.objectContaining({ success: false, attempt: 1, finalError: "Retry cancelled" }),
			]);
		} finally {
			harness.cleanup();
		}
	});

	it.each([
		["disabled", false, "error", errors[0]],
		["quota exhausted", true, "error", `${errors[0]}: quota exceeded`],
		["aborted", true, "aborted", errors[1]],
	] as const)("does not retry when %s", async (_name, enabled, stopReason, errorMessage) => {
		const harness = await createHarness({ settings: { retry: { enabled, maxRetries: 3, baseDelayMs: 0 } } });
		try {
			harness.setResponses([fauxAssistantMessage("", { stopReason, errorMessage }), fauxAssistantMessage("unused")]);
			await harness.session.prompt("test");
			expect(harness.faux.state.callCount).toBe(1);
			expect(harness.eventsOfType("auto_retry_start")).toEqual([]);
		} finally {
			harness.cleanup();
		}
	});
});
