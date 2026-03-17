import pino from "pino";

/** @param {string} level */
export function createLogger(level = "info") {
  return pino({
    level,
    transport:
      process.stdout.isTTY
        ? { target: "pino-pretty", options: { colorize: true, translateTime: "SYS:yyyy-mm-dd HH:MM:ss" } }
        : undefined,
  });
}
