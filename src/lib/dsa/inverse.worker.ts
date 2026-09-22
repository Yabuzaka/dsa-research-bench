import {
  runInverse,
  type InverseOptions,
  type InverseProgress,
  type InverseReport,
  type InverseTarget,
} from "./inverse.ts";
import type { SimConfig } from "./types.ts";

export type InverseWorkerRequest = {
  type: "run-inverse";
  requestId: string;
  config: SimConfig;
  target: InverseTarget;
  options: Omit<InverseOptions, "onProgress">;
};
export type InverseWorkerResponse =
  | { type: "progress"; requestId: string; progress: InverseProgress }
  | { type: "completed"; requestId: string; report: InverseReport }
  | { type: "error"; requestId: string; error: string };

self.onmessage = (event: MessageEvent<InverseWorkerRequest>) => {
  const request = event.data;
  if (request.type !== "run-inverse") return;
  const send = (response: InverseWorkerResponse) => self.postMessage(response);
  try {
    const report = runInverse(request.config, request.target, {
      ...request.options,
      onProgress: (progress) => send({ type: "progress", requestId: request.requestId, progress }),
    });
    send({ type: "completed", requestId: request.requestId, report });
  } catch (error) {
    send({
      type: "error",
      requestId: request.requestId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};
