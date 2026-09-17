// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @notice Argus (argus.world) Portal interface, as read from
/// `arguspad/argus-world` on GitHub on 2026-09-17.
///
/// UNVERIFIED (see SPEC.md "Verification status"): that repo reads like a
/// reference/docs mirror rather than a confirmed 1:1 match for the verified
/// bytecode at Argus's real mainnet Portal. Re-derive this interface from
/// Arcscan's verified source for `0xB021Be536808f551b31789422Fd28a6c9c6e97Da`
/// before any real deploy, and fix this file (and PerpArcRelay's
/// constructor, which depends on the exact tuple shape `launches()`
/// returns) if it disagrees.
struct CreateLaunchParams {
    string name;
    string symbol;
    string imageURI;
    string website;
    string twitter;
    string telegram;
    address quoteAsset;
    uint16 buyTaxBps;
    uint16 sellTaxBps;
    uint16 creatorFundsBps;
    uint16 buybackBurnBps;
    uint16 dividendsBps;
    uint16 liquidityBps;
    uint160 openingSqrtPriceX96;
    int24 tickStart;
    int24 tickBond;
    uint256 devBuyAmount;
}

interface IArgusPortal {
    function createLaunch(CreateLaunchParams calldata p) external returns (address token);

    /// @dev Solidity's public-mapping-to-struct auto-getter returns each
    /// field positionally, not the struct itself -- this must match
    /// Portal.LaunchRecord's field order exactly.
    function launches(address token)
        external
        view
        returns (
            address creator,
            int24 tickStart,
            bool tokenIsToken0,
            address locker,
            address hook,
            address splitter,
            uint16 buyTaxBps,
            uint16 sellTaxBps,
            uint256 positionId,
            int24 tickBond,
            address quoteAsset
        );
}

interface IArgusRevenueSplitter {
    /// @notice Pays the named account the caller's full credited
    /// `creatorFunds` balance for `quoteAsset`. Reverts unless
    /// `msg.sender == creator` (the address that called `createLaunch()`).
    function claim(address to, address quoteAsset) external;

    function creditedToCreator(address quoteAsset) external view returns (uint256);
}
