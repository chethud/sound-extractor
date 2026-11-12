import type { Browser } from "playwright-core";

function isServerlessRuntime() {
  return Boolean(
    process.env.VERCEL ||
      process.env.AWS_LAMBDA_FUNCTION_NAME ||
      process.env.FUNCTION_NAME,
  );
}

export async function launchAnalyzerBrowser(): Promise<Browser> {
  if (isServerlessRuntime()) {
    const [{ chromium }, chromiumPack] = await Promise.all([
      import("playwright-core"),
      import("@sparticuz/chromium"),
    ]);

    const executablePath = await chromiumPack.default.executablePath();

    return chromium.launch({
      args: [
        ...chromiumPack.default.args,
        "--disable-blink-features=AutomationControlled",
        "--disable-dev-shm-usage",
      ],
      executablePath,
      headless: true,
    });
  }

  const { chromium } = await import("playwright");
  return chromium.launch({
    headless: true,
    args: [
      "--disable-blink-features=AutomationControlled",
      "--disable-dev-shm-usage",
    ],
  });
}
