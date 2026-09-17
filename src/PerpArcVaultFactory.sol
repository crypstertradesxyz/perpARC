// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import { PerpArcRelay } from "./PerpArcRelay.sol";
import { CreateLaunchParams } from "./interfaces/IArgusPortal.sol";

/// @notice Launches tokens through Argus and wires each into PerpArc.
/// Owner-curates the Hyperliquid asset/leverage allowlist and, in v1, who
/// may call launch() at all -- see SPEC.md "Design decisions" for why this
/// isn't fully permissionless yet (Argus's mainnet contracts are one day
/// old and unverified against Arcscan as of this writing).
contract PerpArcVaultFactory {
    error NotOwner();
    error NotLauncher();
    error AssetNotSupported();
    error LeverageAboveAssetCap();
    error ZeroAddress();

    event LauncherUpdated(address indexed launcher, bool enabled);
    event AssetLeverageCapSet(bytes32 indexed asset, uint256 cap);
    event KeeperUpdated(address indexed keeper);
    event RelayDeployed(
        address indexed token, address indexed relay, bytes32 asset, bool isLong, uint8 leverage, address realCreator
    );

    address public immutable owner;
    address public immutable portal;
    address public immutable usdc;
    address public immutable buybackWallet;
    address public keeper;

    /// @notice Owner-curated, synced by hand from Hyperliquid's live
    /// catalog -- same pattern as Longshot's LaunchFactory.
    /// maxLeverageForAsset / syncAssetAllowlist.ts.
    mapping(bytes32 => uint256) public maxLeverageForAsset;
    bytes32[] public allowedAssets;

    mapping(address => bool) public isLauncher;

    address[] public allTokens;
    mapping(address => address) public relayForToken;
    /// @notice Same enumeration shape as Longshot's PonsFeeRelayFactory
    /// (allRelaysCount()/allRelays(i)), deliberately -- the keeper's relay
    /// discovery code ports over unchanged against this factory.
    address[] public allRelays;

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    constructor(address owner_, address portal_, address usdc_, address buybackWallet_, address keeper_) {
        if (owner_ == address(0) || portal_ == address(0) || usdc_ == address(0) || buybackWallet_ == address(0)) {
            revert ZeroAddress();
        }
        owner = owner_;
        portal = portal_;
        usdc = usdc_;
        buybackWallet = buybackWallet_;
        keeper = keeper_;
    }

    function setKeeper(address keeper_) external onlyOwner {
        if (keeper_ == address(0)) revert ZeroAddress();
        keeper = keeper_;
        emit KeeperUpdated(keeper_);
    }

    function setLauncher(address launcher, bool enabled) external onlyOwner {
        if (launcher == address(0)) revert ZeroAddress();
        isLauncher[launcher] = enabled;
        emit LauncherUpdated(launcher, enabled);
    }

    function setAssetLeverageCap(bytes32 asset, uint256 cap) external onlyOwner {
        if (maxLeverageForAsset[asset] == 0 && cap > 0) {
            allowedAssets.push(asset);
        }
        maxLeverageForAsset[asset] = cap;
        emit AssetLeverageCapSet(asset, cap);
    }

    function allowedAssetsCount() external view returns (uint256) {
        return allowedAssets.length;
    }

    function allTokensCount() external view returns (uint256) {
        return allTokens.length;
    }

    function allRelaysCount() external view returns (uint256) {
        return allRelays.length;
    }

    /// @notice Launches a token through Argus and deploys its PerpArcRelay
    /// in one transaction. Forces the Argus-side allocation to 100%
    /// creatorFunds regardless of what's passed in `params` -- see
    /// SPEC.md "Design decisions" for why PerpArc doesn't use Argus's
    /// native buybackBurn/dividends/liquidity buckets. `realCreator` is
    /// attribution only (see PerpArcRelay.realCreator).
    function launch(CreateLaunchParams memory params, bytes32 asset, bool isLong, uint8 leverage, address realCreator)
        external
        returns (address token, address relay)
    {
        if (!isLauncher[msg.sender]) revert NotLauncher();
        uint256 cap = maxLeverageForAsset[asset];
        if (cap == 0) revert AssetNotSupported();
        if (leverage == 0 || leverage > cap) revert LeverageAboveAssetCap();

        params.quoteAsset = usdc;
        params.creatorFundsBps = 10_000;
        params.buybackBurnBps = 0;
        params.dividendsBps = 0;
        params.liquidityBps = 0;

        PerpArcRelay r =
            new PerpArcRelay(owner, portal, params, usdc, buybackWallet, keeper, asset, isLong, leverage, realCreator);
        token = r.token();
        relay = address(r);

        allTokens.push(token);
        relayForToken[token] = relay;
        allRelays.push(relay);

        emit RelayDeployed(token, relay, asset, isLong, leverage, realCreator);
    }
}
