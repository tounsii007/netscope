import { test, expect } from "@playwright/test";

test.describe("Landing and navigation", () => {
  test("homepage renders and lists tools", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /Network diagnostics/i })).toBeVisible();
    await expect(page.getByText("Port Checker")).toBeVisible();
    await expect(page.getByText("DNS Propagation")).toBeVisible();
  });

  test("port checker page works with mocked backend", async ({ page }) => {
    await page.route("**/api/v1/port/check", (route) =>
      route.fulfill({ json: {
        target: "example.com", resolvedIp: "93.184.216.34", port: 443,
        protocol: "tcp", open: true, latencyMs: 42, service: "https", error: null,
      }}));
    await page.goto("/port-checker");
    await page.getByRole("button", { name: /Check/i }).click();
    await expect(page.getByText("OPEN")).toBeVisible();
  });

  test("404 page renders", async ({ page }) => {
    const res = await page.goto("/this-does-not-exist");
    expect(res?.status()).toBe(404);
    await expect(page.getByText("404")).toBeVisible();
  });

  test("security headers present", async ({ request }) => {
    const res = await request.get("/");
    const headers = res.headers();
    expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(headers["x-frame-options"]).toBe("DENY");
    expect(headers["strict-transport-security"]).toContain("max-age");
  });
});
