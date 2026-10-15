import { resetTipsForTest, takeTip, turnOffTips } from "./tips";

const DAY = 24 * 60 * 60 * 1000;

describe("takeTip", () => {
  beforeEach(() => {
    localStorage.clear();
    resetTipsForTest();
  });

  it("shows the first tip, then at most once per page load", () => {
    expect(takeTip(1000)).toBe(0);
    expect(takeTip(1000 + 10 * DAY)).toBeNull();
  });

  it("waits a few days between tips and rotates them", () => {
    takeTip(1000);
    resetTipsForTest();
    expect(takeTip(1000 + DAY)).toBeNull();
    resetTipsForTest();
    expect(takeTip(1000 + 4 * DAY)).toBe(1);
  });

  it("stops for good when turned off", () => {
    turnOffTips();
    expect(takeTip(1000)).toBeNull();
  });
});
