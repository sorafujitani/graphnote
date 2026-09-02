import { describe, expect, it } from "vite-plus/test";
import { toggleTask } from "./taskList";

describe("toggleTask", () => {
  const body = ["intro [ ] not a task", "- [ ] one", "  * [x] two", "3. [ ] three", "- plain"].join(
    "\n",
  );

  it("checks the nth task item only", () => {
    expect(toggleTask(body, 0).split("\n")[1]).toBe("- [x] one");
    expect(toggleTask(body, 0).split("\n")[0]).toBe("intro [ ] not a task");
  });

  it("unchecks a checked item and handles nested and ordered markers", () => {
    expect(toggleTask(body, 1).split("\n")[2]).toBe("  * [ ] two");
    expect(toggleTask(body, 2).split("\n")[3]).toBe("3. [x] three");
  });

  it("leaves the body alone for an index that does not exist", () => {
    expect(toggleTask(body, 9)).toBe(body);
  });
});
