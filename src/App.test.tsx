import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "./App";

describe("App", () => {
  it("renders the MVP shell", () => {
    render(<App />);

    expect(screen.getByRole("heading", { name: "语音输入助手" })).toBeInTheDocument();
  });
});
