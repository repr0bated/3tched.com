import { expect, it, vi } from "vitest";
const { launchMcpConfig, serveMcpStdio } = vi.hoisted(() => ({ launchMcpConfig: vi.fn(), serveMcpStdio: vi.fn() }));
vi.mock("./launch", () => ({ launchMcpConfig, launchDoorConfig: () => { throw new Error("MCP must not bootstrap chat."); } }));
vi.mock("./mcp-proxy", () => ({ serveMcpStdio }));
vi.mock("../chat/door-chat-adapter", () => { throw new Error("MCP must start without loading chat UI fixtures."); });
vi.mock("./run", () => { throw new Error("MCP must not load the chat command dispatcher."); });
import { main } from "./main";
it("starts MCP without importing the chat adapter or requiring dashboard fixture files", async () => {
  const config = { url: "https://10.0.0.2:8090" };
  launchMcpConfig.mockResolvedValue(config);
  serveMcpStdio.mockResolvedValue(undefined);
  expect(await main(["--issuer", "http://10.0.0.1:51888", "mcp"])).toBe(0);
  expect(serveMcpStdio).toHaveBeenCalledWith(config);
});
