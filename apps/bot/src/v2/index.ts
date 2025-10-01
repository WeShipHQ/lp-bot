// Main entry point for v2 architecture
export * from "./types/core.types";
export * from "./interfaces/dex-adapter.interface";
export * from "./adapters/base-dex.adapter";
export * from "./adapters/meteora.adapter";
// export * from "./adapters/saros.adapter";
export * from "./services/dex-registry.service";
export * from "./services/unified-pool.service";
export * from "./services/unified-position.service";
export * from "./services/unified-input-detection.service";

import { dexRegistry } from "./services/dex-registry.service";
// import { MeteoraAdapter } from "./adapters/meteora.adapter";
import { SarosAdapter } from "@/services/saros/saros.adapter";

export function initializeV2Architecture(): void {
  console.log("Initializing v2 multi-DEX architecture...");

  // dexRegistry.register(new MeteoraAdapter());
  dexRegistry.register(new SarosAdapter());

  console.log(
    `Registered ${dexRegistry.getSupportedDexes().length} DEX adapters:`,
    dexRegistry.getSupportedDexes()
  );
}

export { dexRegistry };
