import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/e2e", timeout: 90000, expect: { timeout: 12000 }, workers: 1,
  reporter: [["list"],["html",{open:"never"}]],
  use: { baseURL: "http://127.0.0.1:5173", screenshot:"only-on-failure", trace:"retain-on-failure" },
  webServer: { command:"npm run dev", url:"http://127.0.0.1:5173", reuseExistingServer:!process.env.CI, timeout:60000 },
  projects: [
    {name:"chromium",use:{...devices["Desktop Chrome"]}},
    {name:"firefox",use:{...devices["Desktop Firefox"]}},
    {name:"webkit",use:{...devices["Desktop Safari"]}},
  ],
});
