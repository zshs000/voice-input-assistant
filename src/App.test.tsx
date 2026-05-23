import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "./App";

describe("App", () => {
  it("renders the main workspace and keeps settings hidden by default", async () => {
    render(<App />);

    expect(screen.getByRole("heading", { name: "语音输入助手" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "开始录音" })).toBeInTheDocument();
    expect(screen.getByLabelText("润色模板")).toBeInTheDocument();
    expect(screen.getByLabelText("输出方式")).toBeInTheDocument();
    expect(screen.getByText("最近历史")).toBeInTheDocument();
    expect(await screen.findByText("待机中")).toBeInTheDocument();
    expect(screen.queryByLabelText("DashScope API Key")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("LLM Base URL")).not.toBeInTheDocument();
  });

  it("opens the settings modal with all configuration fields", async () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "打开设置" }));

    expect(await screen.findByRole("dialog", { name: "设置" })).toBeInTheDocument();
    expect(screen.getByLabelText("STT Provider")).toBeInTheDocument();
    expect(screen.getByLabelText("DashScope API Key")).toBeInTheDocument();
    expect(screen.getByLabelText("ASR Model")).toBeInTheDocument();
    expect(screen.getByLabelText("识别语言")).toBeInTheDocument();
    expect(screen.getByLabelText("LLM Base URL")).toBeInTheDocument();
    expect(screen.getByLabelText("模板名称")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /添加模板/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /保存设置/ })).toBeInTheDocument();
  });
});
