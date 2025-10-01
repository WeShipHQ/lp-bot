import { IDexAdapter } from "@/types/dex-adapter.interface";
import { DexType, DexAdapterError } from "@/types/core.types";

export class DexRegistryService {
  private adapters = new Map<DexType, IDexAdapter>();
  private static instance: DexRegistryService;

  private constructor() {}

  static getInstance(): DexRegistryService {
    if (!DexRegistryService.instance) {
      DexRegistryService.instance = new DexRegistryService();
    }
    return DexRegistryService.instance;
  }

  register(adapter: IDexAdapter): void {
    if (this.adapters.has(adapter.dexType)) {
      throw new Error(`Adapter for ${adapter.dexType} is already registered`);
    }

    this.adapters.set(adapter.dexType, adapter);
    console.log(`Registered DEX adapter: ${adapter.name} (${adapter.dexType})`);
  }

  get(dexType: DexType): IDexAdapter {
    const adapter = this.adapters.get(dexType);
    if (!adapter) {
      throw new DexAdapterError(
        `No adapter registered for DEX: ${dexType}`,
        dexType,
        "ADAPTER_NOT_FOUND"
      );
    }

    if (!adapter.isEnabled) {
      throw new DexAdapterError(
        `Adapter for ${dexType} is disabled`,
        dexType,
        "ADAPTER_DISABLED"
      );
    }

    return adapter;
  }

  getAll(): IDexAdapter[] {
    return Array.from(this.adapters.values());
  }

  getEnabled(): IDexAdapter[] {
    return this.getAll().filter((adapter) => adapter.isEnabled);
  }

  getSupportedDexes(): DexType[] {
    return Array.from(this.adapters.keys());
  }

  getEnabledDexes(): DexType[] {
    return this.getEnabled().map((adapter) => adapter.dexType);
  }

  isSupported(dexType: DexType): boolean {
    return this.adapters.has(dexType);
  }

  isEnabled(dexType: DexType): boolean {
    const adapter = this.adapters.get(dexType);
    return adapter ? adapter.isEnabled : false;
  }

  parseUrl(
    url: string
  ): { dex: DexType; adapter: IDexAdapter; result: any } | null {
    for (const adapter of this.getEnabled()) {
      const result = adapter.parsePoolUrl(url);
      if (result) {
        return { dex: adapter.dexType, adapter, result };
      }
    }
    return null;
  }

  async healthCheck(): Promise<Record<DexType, boolean>> {
    const results: Record<string, boolean> = {};

    for (const adapter of this.getAll()) {
      try {
        results[adapter.dexType] = await adapter.isHealthy();
      } catch (error) {
        console.error(`Health check failed for ${adapter.dexType}:`, error);
        results[adapter.dexType] = false;
      }
    }

    return results as Record<DexType, boolean>;
  }

  unregister(dexType: DexType): boolean {
    return this.adapters.delete(dexType);
  }

  clear(): void {
    this.adapters.clear();
  }
}

export const dexRegistry = DexRegistryService.getInstance();
