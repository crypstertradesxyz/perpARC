#!/usr/bin/env bash
# Read-only on-chain check (eth_call simulations only -- sends nothing, needs
# no keys) of whether a Coinbarrel token's CREATOR can redirect its revenue
# to a third-party wallet on Arc mainnet. First run 2026-09-17 against real
# token 0x8e7a98377ea1dc2783a85cbd7370f76901eebf13; results recorded in
# ../../SPEC.md "Coinbarrel verification".
#
# Usage: ./verify-coinbarrel-redirect.sh [token] [creator] [target]
set -euo pipefail

RPC=${ARC_RPC_URL:-https://rpc.arc-scan.org}
ROUTER=0xa80d97a8090d68f92a012194c8ff33867e85bef0   # Coinbarrel Arc AdvancedV5FeeRouter (proxy)
TOKEN=${1:-0x8e7a98377ea1dc2783a85cbd7370f76901eebf13}
CREATOR=${2:-0xe4c39be960c19c27bac7c000b3a8e95d66d35fbe}
TARGET=${3:-0x63Ac62971A6F99BDE037f9974Cd390BF80F5de0b}
STRANGER=0x1111111111111111111111111111111111111111
ADMIN=$(cast call $ROUTER "revenueRotationAdmin()(address)" --rpc-url $RPC)

check() {
  local label=$1; shift
  local out
  out=$(cast call $ROUTER "$@" --rpc-url $RPC 2>&1 || true)
  local verdict="succeeds -> ${out:0:80}"
  for pair in 0x01827213:NotPendingRevenueController 0x82b42900:Unauthorized 0x969bf728:NothingToClaim \
              0xffb8ed9d:NotRevenueRotationAdmin 0x259ba1ad:TokenNotRegistered 0x9c8d2cd2:InvalidRecipient; do
    [[ $out == *"${pair%%:*}"* ]] && verdict="reverts ${pair##*:}()" && break
  done
  printf '%-58s %s\n' "$label" "$verdict"
}

echo "router $ROUTER | revenueRotationAdmin $ADMIN | token $TOKEN"
check "pendingRevenue(token, creator) [18-dec native USDC]"  "pendingRevenue(address,address)(uint256)" $TOKEN $CREATOR
check "proposeRevenueController from CREATOR"                "proposeRevenueController(address,address)" $TOKEN $TARGET --from $CREATOR
check "proposeRevenueController from ADMIN"                  "proposeRevenueController(address,address)" $TOKEN $TARGET --from $ADMIN
check "settleAndPayoutCreator(token, TARGET) from CREATOR"   "settleAndPayoutCreator(address,address)(uint256)" $TOKEN $TARGET --from $CREATOR
check "settleAndPayoutCreator(token, CREATOR) from STRANGER" "settleAndPayoutCreator(address,address)(uint256)" $TOKEN $CREATOR --from $STRANGER
