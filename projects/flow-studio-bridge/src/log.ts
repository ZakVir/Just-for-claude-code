/**
 * log.ts — shared structured logger.
 *
 * Every log line goes to stderr (stdout is reserved for the MCP stdio
 * transport in index.ts). Job outcomes are additionally appended to
 * ./logs/jobs.jsonl by queue.ts, not by this logger.
 */
import pino from "pino";

export const log = pino({
  level: process.env.LOG_LEVEL ?? "info",
  transport: {
    target: "pino-pretty",
    options: { destination: 2, colorize: false },
  },
});
