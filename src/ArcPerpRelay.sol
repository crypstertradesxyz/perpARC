// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { CreateLaunchParams, IArgusPortal, IArgusRevenueSplitter } from "./interfaces/IArgusPortal.sol";

/// @notice One per launched token, deployed by ArcPerpVaultFactory.launch().
/// Its constructor itself calls Argus's Portal.createLaunch(), so this
/// contract becomes Argus's immutable `creator` for the launch in the same
/// transaction the token is born in -- it is therefore the only address
/// that will ever be able to call the Argus RevenueSplitter's claim().
///
/// Adapts Argus's single `creatorFunds` bucket (set to 100% of the creator
/// share at launch -- see ArcPerpVaultFactory.launch()) to ArcPerp's own
/// 80/20 position-capital/buyback split. See SPEC.md "Fee split (ours, not
/// Argus's)" for why we don't use Argus's native buybackBurn/dividends/
/// liquidity buckets. Modeled directly on Longshot's PonsFeeRelay.sol,
/// which solves the same "adapt a launchpad we don't own" problem for pons
/// on Robinhood Chain.
contract ArcPerpRelay {
    using SafeERC20 for IERC20;

    error NotOwner();
    error NotKeeper();
    error ZeroAddress();

    event KeeperUpdated(address indexed keeper, bool enabled);
    event FeesCollected(uint256 claimed, uint256 toBuyback, uint256 toPosition);
    event PositionCapitalSwept(address indexed to, uint256 amount);

    uint256 public constant POSITION_BPS = 8000; // 80%, see SPEC.md "Fee split"
    uint256 public constant BUYBACK_BPS = 2000; // 20%
    uint256 public constant BPS_DENOMINATOR = 10_000;

    address public immutable owner;
    IERC20 public immutable usdc;
    address public immutable token;
    IArgusRevenueSplitter public immutable splitter;
    address public immutable buybackWallet;
    bytes32 public immutable asset;
    bool public immutable isLong;
    uint8 public immutable leverage;
    /// @notice Attribution only -- no on-chain powers in v1 (see SPEC.md
    /// "Design decisions"). The real Argus `creator` role is held by this
    /// contract itself, not by this address.
    address public immutable realCreator;

    mapping(address => bool) public isKeeper;
    uint256 public pendingPosition;

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyKeeper() {
        if (!isKeeper[msg.sender]) revert NotKeeper();
        _;
    }

    constructor(
        address owner_,
        address portal_,
        CreateLaunchParams memory launchParams,
        address usdc_,
        address buybackWallet_,
        address initialKeeper_,
        bytes32 asset_,
        bool isLong_,
        uint8 leverage_,
        address realCreator_
    ) {
        if (
            owner_ == address(0) || portal_ == address(0) || usdc_ == address(0) || buybackWallet_ == address(0)
                || realCreator_ == address(0)
        ) revert ZeroAddress();

        owner = owner_;
        usdc = IERC20(usdc_);
        buybackWallet = buybackWallet_;
        asset = asset_;
        isLong = isLong_;
        leverage = leverage_;
        realCreator = realCreator_;

        // msg.sender for this call is this contract itself -- that's what
        // makes it Argus's `creator` for the launch. See IArgusPortal.sol
        // for the verification caveat on this whole interaction.
        token = IArgusPortal(portal_).createLaunch(launchParams);
        (,,,,, address splitterAddr,,,,,) = IArgusPortal(portal_).launches(token);
        if (splitterAddr == address(0)) revert ZeroAddress();
        splitter = IArgusRevenueSplitter(splitterAddr);

        if (initialKeeper_ != address(0)) {
            isKeeper[initialKeeper_] = true;
            emit KeeperUpdated(initialKeeper_, true);
        }
    }

    function setKeeper(address keeper, bool enabled) external onlyOwner {
        if (keeper == address(0)) revert ZeroAddress();
        isKeeper[keeper] = enabled;
        emit KeeperUpdated(keeper, enabled);
    }

    /// @notice Permissionless, like Longshot's LaunchPool.collectFees() --
    /// it only ever realizes fees Argus already credited to this contract.
    /// Pulls the full accrued creatorFunds balance out of Argus, then
    /// splits it 80/20 in the same call: the 20% buyback share is sent out
    /// immediately (nothing to track for it later), the 80% position share
    /// accrues in `pendingPosition` until sweepPositionCapital drains it.
    function collectFees() external returns (uint256 claimed) {
        uint256 before = usdc.balanceOf(address(this));
        splitter.claim(address(this), address(usdc));
        claimed = usdc.balanceOf(address(this)) - before;
        if (claimed == 0) return 0;

        uint256 toBuyback = (claimed * BUYBACK_BPS) / BPS_DENOMINATOR;
        uint256 toPosition = claimed - toBuyback;

        if (toBuyback > 0) usdc.safeTransfer(buybackWallet, toBuyback);
        pendingPosition += toPosition;

        emit FeesCollected(claimed, toBuyback, toPosition);
    }

    function sweepPositionCapital(address to) external onlyKeeper returns (uint256 amount) {
        if (to == address(0)) revert ZeroAddress();
        amount = pendingPosition;
        pendingPosition = 0;
        if (amount > 0) usdc.safeTransfer(to, amount);
        emit PositionCapitalSwept(to, amount);
    }
}
