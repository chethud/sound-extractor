import type { Browser } from "playwright-core";
import { chromium as playwrightCore } from "playwright-core";
import chromium from "@sparticuz/chromium";

function isServerlessRuntime() {
  return Boolean(
    process.env.VERCEL ||
      process.env.AWS_LAMBDA_FUNCTION_NAME ||
      process.env.FUNCTION_NAME,
  );
}

export async function launchAnalyzerBrowser(): Promise<Browser> {
  if (isServerlessRuntime()) {
    // Disable WebGL graphics path on serverless Chromium.
    (chromium as { setGraphicsMode?: boolean }).setGraphicsMode = false;

    return playwrightCore.launch({
      args: [
        ...chromium.args,
        "--disable-blink-features=AutomationControlled",
        "--disable-dev-shm-usage",
        "--single-process",
      ],
      executablePath: await chromium.executablePath(),
      headless: true,
    });
  }

  const { chromium: localChromium } = await import("playwright");
  return localChromium.launch({
    headless: true,
    args: [
      "--disable-blink-features=AutomationControlled",
      "--disable-dev-shm-usage",
    ],
  });
}
