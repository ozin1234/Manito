import { hostedRequest } from "../../../services/api/src/hosted.mjs";
import { withCloudRequest } from "../lib/cloud-context.mjs";
import handler from "vinext/server/fetch-handler";
import { runWithConnectorBinding } from "../lib/connector-context";
import type { ConnectorBinding } from "../lib/connector-contract.mjs";

const worker = {
  fetch(request: Request, env: Cloudflare.Env, ctx: ExecutionContext<{ CONNECTORS?: ConnectorBinding }>) {
    let binding = ctx.props?.CONNECTORS;
    // Local preview emulates the same request-scoped capability. This branch and
    // the auxiliary service binding are absent from production builds.
    if (import.meta.env.DEV && !binding && env.CONNECTORS) {
      const preview = env.CONNECTORS;
      const expiresAt = Date.now() + 60_000;
      binding = {
        async getContext() {
          if (Date.now() >= expiresAt) return { status: "request_context_expired" };
          return preview.getContext?.() ?? { status: "binding_unavailable" };
        },
        async invoke(connectorId, actionName, args) {
          if (Date.now() >= expiresAt) {
            return { status: "request_context_expired", message: "This request has expired. Please try again." };
          }
          return preview.invoke(connectorId, actionName, args);
        },
      };
    }
    const hosted = env.DB && env.BUCKET;
    const execute = Object.assign((input: Request) => hostedRequest(input, env), { publicOrigin: env.KROAD_PUBLIC_ORIGIN || new URL(request.url).origin });
    return runWithConnectorBinding(binding, () => withCloudRequest(hosted ? execute : null, () => {
      const url = new URL(request.url);
      if (hosted && (url.pathname === "/api/v1" || url.pathname.startsWith("/api/v1/"))) {
        url.pathname = url.pathname.slice(4);
        return execute(new Request(url, request));
      }
      return handler.fetch(request, env, ctx);
    }));
  },
};

export default worker;
