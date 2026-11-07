// All provider configs, in tab order. Add a new provider file here (and its id to ProviderId
// in src/lib/streams/types.ts — a shared-contract change that needs UI sign-off).

import type { ProviderConfig } from "@/lib/streams/config-types";
import { abcConfig } from "./abc";
import { cbsConfig } from "./cbs";
import { nbcConfig } from "./nbc";

export const providerConfigs: readonly ProviderConfig[] = [nbcConfig, abcConfig, cbsConfig];
