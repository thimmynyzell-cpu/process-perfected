import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { I18nProvider } from "@/i18n";
import { CheckboxOptions } from "./CheckboxOptions";

function Harness({ initial }: { initial: string }) {
  const [value, setValue] = useState(initial);
  return <CheckboxOptions value={value} onChange={setValue} />;
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

describe("CheckboxOptions", () => {
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
