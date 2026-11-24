import { AsyncLocalStorage } from "node:async_hooks";
const context = new AsyncLocalStorage();
export const withCloudRequest = (request, work) => context.run(request, work);
export const cloudRequest = () => context.getStore();

export const trustedRequestOrigin = (requestUrl, configuredOrigin) => new URL(context.getStore()?.publicOrigin || configuredOrigin || requestUrl).origin;
