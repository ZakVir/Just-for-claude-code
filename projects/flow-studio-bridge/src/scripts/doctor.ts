/**
 * scripts/doctor.ts — `npm run doctor` entry point. Launches the isolated
 * profile, navigates to Flow, and prints a resolution table for every
 * logical selector-map element. Read-only against Flow: never fills or
 * clicks anything.
 */
import { loadConfig } from "../config.js";
import { launchSession, closeSession } from "../browser/session.js";
import { runDoctor, formatDoctorReport } from "../flow/doctor.js";
import { log } from "../log.js";

async function main() {
  const config = loadConfig();
  const context = await launchSession(config);
  const page = context.pages()[0] ?? (await context.newPage());
  await page.goto(config.flowUrl, { waitUntil: "domcontentloaded" });

  const rows = await runDoctor(page);
  await closeSession(context);

  console.log(formatDoctorReport(rows));
  const misses = rows.filter((r) => !r.ok);
  if (misses.length > 0) {
    log.warn({ count: misses.length }, "flow_doctor found MISSes — update selectors/flow.map.json");
    process.exitCode = 1;
  } else {
    log.info("flow_doctor: all logical elements resolved");
  }
}

main().catch((err) => {
  log.error({ err }, "doctor run failed");
  process.exit(1);
});
