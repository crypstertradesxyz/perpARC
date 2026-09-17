import { defineChain } from "viem";
import { config } from "./config.js";

// Arc isn't in viem/chains yet (mainnet is one day old as of this file) --
// defined here from values independently confirmed live (see SPEC.md):
// chain id 5042 via eth_chainId against both rpc.arc-scan.org and
// 5042.rpc.thirdweb.com, USDC as the native gas token.
export const arc = defineChain({
  id: 5042,
  name: "Arc",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 6 },
  rpcUrls: { default: { http: [config.arcRpcUrl] } },
});
