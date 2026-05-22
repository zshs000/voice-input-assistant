import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "./App";

describe("App", () => {
  it("renders the voice input MVP workspace", async () => {
    render(<App />);

    expect(screen.getByRole("heading", { name: "语音输入助手" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "开始录音" })).toBeInTheDocument();
    expect(screen.getByLabelText("润色模板")).toBeInTheDocument();
    expect(screen.getByLabelText("输出方式")).toBeInTheDocument();
    expect(screen.getByLabelText("LLM Base URL")).toBeInTheDocument();
    expect(screen.getByLabelText("自定义模板名称")).toBeInTheDocument();
    expect(screen.getByText("最近历史")).toBeInTheDocument();
    expect(await screen.findByText("待机中")).toBeInTheDocument();
  });
});
