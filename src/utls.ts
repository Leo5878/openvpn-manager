import { LoggerAdapter } from "./core/core.js";

export function createDefaultLogger(debug: boolean): LoggerAdapter {
  return {
    info: console.log.bind(console),
    error: console.error.bind(console),
    warn: console.warn.bind(console),
    debug: () => {
      if (debug) {
        console.debug.bind(console);
      }
    },
  };
}
