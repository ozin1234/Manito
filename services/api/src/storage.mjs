import * as native from "node:fs/promises";
import { AsyncLocalStorage } from "node:async_hooks";
const context = new AsyncLocalStorage();
const bundled = new Map();
export function registerBundledJson(path, value) { bundled.set(path, JSON.stringify(value)); }
export function withStorage(storage, work) { return context.run(storage, work); }
export async function readFile(path, options) {
  if (bundled.has(path) && context.getStore()) return options ? bundled.get(path) : Buffer.from(bundled.get(path));
  return (context.getStore() ?? native).readFile(path, options);
}
export async function stat(path) {
  if (bundled.has(path) && context.getStore()) return { mtimeMs: 1, size: Buffer.byteLength(bundled.get(path)) };
  return (context.getStore() ?? native).stat(path);
}
export const mkdir = (...args) => (context.getStore() ?? native).mkdir(...args);
export const readdir = (...args) => (context.getStore() ?? native).readdir(...args);
export const writeFile = (...args) => (context.getStore() ?? native).writeFile(...args);
export const rename = (...args) => (context.getStore() ?? native).rename(...args);
export const unlink = (...args) => (context.getStore() ?? native).unlink(...args);
