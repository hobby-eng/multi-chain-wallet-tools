import { expect, it, vi } from "vitest";
import { UiEventScope } from "../src/ui-event-scope.js";

it("retires native actions and refuses registration after disposal", () => {
  const target = new EventTarget();
  const action = vi.fn();
  const error = vi.fn();
  const scope = new UiEventScope(error);
  scope.listen(target, "test", action);
  target.dispatchEvent(new Event("test"));
  expect(action).toHaveBeenCalledOnce();
  scope[Symbol.dispose]();
  scope.dispose();
  target.dispatchEvent(new Event("test"));
  expect(action).toHaveBeenCalledOnce();
  expect(error).not.toHaveBeenCalled();
  expect(() => scope.listen(target, "test", action)).toThrow(
    expect.objectContaining({ code: "ui.events.released" }),
  );
});

it("hands a failed native action to the diagnostic owner once", () => {
  const target = new EventTarget();
  const failure = new Error("Public synthetic native fault");
  const error = vi.fn();
  using scope = new UiEventScope(error);
  scope.listen(target, "test", () => {
    throw failure;
  });
  expect(() => target.dispatchEvent(new Event("test"))).not.toThrow();
  expect(error).toHaveBeenCalledExactlyOnceWith(failure);
});
