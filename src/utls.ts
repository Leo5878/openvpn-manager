import { LoggerAdapter } from "./core";

export function createDefaultLogger(): LoggerAdapter {
  return {
    info: console.log.bind(console),
    error: console.error.bind(console),
    warn: console.warn.bind(console),
    debug: console.debug.bind(console),
  };
}
