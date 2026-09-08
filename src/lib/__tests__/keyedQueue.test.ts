import { describe, it, expect, vi } from "vitest";
import { createKeyedQueue } from "../keyedQueue";

function delay<T>(ms: number, value: T): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

describe("createKeyedQueue", () => {
  it("runs same-key calls strictly in call order, even if an earlier one is slower", async () => {
    const queue = createKeyedQueue<string>();
    const order: number[] = [];

    const first = queue("player-1", () => delay(30, 1).then((v) => order.push(v)));
    const second = queue("player-1", () => delay(5, 2).then((v) => order.push(v)));

    await Promise.all([first, second]);
    expect(order).toEqual([1, 2]); // second waits for first, not "whichever resolves first"
  });

  it("keeps different keys fully independent", async () => {
    const queue = createKeyedQueue<string>();
    const calls: string[] = [];
    const a = queue("a", () => delay(20, "a").then((v) => calls.push(v)));
    const b = queue("b", () => delay(1, "b").then((v) => calls.push(v)));
    await Promise.all([a, b]);
    expect(calls).toContain("a");
    expect(calls).toContain("b");
    expect(calls[0]).toBe("b"); // unrelated key isn't blocked by the slower one
  });

  it("continues the queue for a key even after a failure", async () => {
    const queue = createKeyedQueue<string>();
    const fn = vi.fn();
    await expect(queue("x", () => Promise.reject(new Error("boom")))).rejects.toThrow("boom");
    await queue("x", async () => fn());
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
