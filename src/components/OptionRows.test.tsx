import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { I18nProvider } from "@/i18n";
import { OptionRows } from "./OptionRows";

function Harness({ initial }: { initial: string }) {
  const [value, setValue] = useState(initial);
  return <OptionRows kind="checkbox" value={value} onChange={setValue} />;
}

function setup(initial: string) {
  render(
    <I18nProvider>
      <Harness initial={initial} />
    </I18nProvider>,
  );
}

const rows = () => screen.getAllByPlaceholderText("Text för kryssrutan") as HTMLInputElement[];
const tab = (i: number) => fireEvent.keyDown(rows()[i]!, { key: "Tab" });

describe("OptionRows", () => {
  it("Tab on a filled last row adds a new focused row", () => {
    setup("Ett");
    tab(0);
    expect(rows()).toHaveLength(2);
    expect(document.activeElement).toBe(rows()[1]);
  });

  it("Tab on an empty last row does not add a row", () => {
    setup("Ett\n");
    tab(1);
    expect(rows()).toHaveLength(2);
  });

  it("Tab on a row that is not last does not add a row", () => {
    setup("Ett\nTvå");
    tab(0);
    expect(rows()).toHaveLength(2);
  });
});

describe("OptionRows extras", () => {
  it("renders the extra next to each row and reports renames", () => {
    const renames: [string, string][] = [];
    function H() {
      const [value, setValue] = useState("A\nB");
      return (
        <OptionRows
          kind="dropdown"
          value={value}
          onChange={setValue}
          onRename={(from, to) => renames.push([from, to])}
          extra={(o) => <span data-testid="extra">{o}</span>}
        />
      );
    }
    render(
      <I18nProvider>
        <H />
      </I18nProvider>,
    );
    expect(screen.getAllByTestId("extra").map((e) => e.textContent)).toEqual(["A", "B"]);
    fireEvent.change(screen.getAllByPlaceholderText("Text för alternativet")[0]!, {
      target: { value: "A2" },
    });
    expect(renames).toEqual([["A", "A2"]]);
    expect(screen.getAllByTestId("extra").map((e) => e.textContent)).toEqual(["A2", "B"]);
  });
});

describe("OptionRows add button", () => {
  it("adds a first row to an empty list", () => {
    setup("");
    fireEvent.click(screen.getByRole("button", { name: /Lägg till kryssruta/ }));
    expect(rows()).toHaveLength(1);
    expect(document.activeElement).toBe(rows()[0]);
  });
});

describe("OptionRows tip", () => {
  it("pops up a tip when a row is focused", async () => {
    localStorage.clear();
    (await import("@/lib/tips")).resetTipsForTest();
    setup("Ett");
    fireEvent.focus(rows()[0]!);
    expect(screen.getByRole("status").textContent).toMatch(/Tab/);
    fireEvent.click(screen.getByRole("button", { name: "Visa inte igen" }));
    expect(screen.queryByRole("status")).toBeNull();
  });
});
