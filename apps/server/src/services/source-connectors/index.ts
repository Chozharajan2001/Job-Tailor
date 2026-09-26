import type { SourceConnectorType } from "../../models/SourceRegistry.model.js";
import type { SourceConnector } from "./types.js";
import { greenhouseConnector } from "./greenhouse.js";
import { leverConnector } from "./lever.js";
import { ashbyConnector } from "./ashby.js";
import { remoteokConnector } from "./remoteok.js";

const REGISTRY: Record<SourceConnectorType, SourceConnector> = {
  greenhouse: greenhouseConnector,
  lever: leverConnector,
  ashby: ashbyConnector,
  remoteok: remoteokConnector,
};

export function getConnector(type: SourceConnectorType): SourceConnector {
  const connector = REGISTRY[type];
  if (!connector) {
    throw new Error(`No connector registered for type: ${type}`);
  }
  return connector;
}
