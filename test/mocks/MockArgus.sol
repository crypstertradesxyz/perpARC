// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { CreateLaunchParams, IArgusPortal, IArgusRevenueSplitter } from "../../src/interfaces/IArgusPortal.sol";

/// @notice Minimal stand-ins for Argus's Portal/RevenueSplitter, good
/// enough to exercise ArcPerpRelay/ArcPerpVaultFactory's side of the
/// integration. NOT a claim that this matches Argus's real mainnet
/// behavior -- see SPEC.md "Verification status".
contract MockUSDC is ERC20 {
    constructor() ERC20("Mock USDC", "mUSDC") { }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract MockLaunchToken is ERC20 {
    constructor(string memory name_, string memory symbol_) ERC20(name_, symbol_) {
        _mint(msg.sender, 1_000_000_000 ether);
    }
}

contract MockArgusRevenueSplitter is IArgusRevenueSplitter {
    address public immutable creator;

    mapping(address => uint256) public creditedToCreator;

    error NotAuthorized();
    error NothingToClaim();

    constructor(address creator_) {
        creator = creator_;
    }

    /// @notice Test helper standing in for a real swap's tax landing here.
    function credit(address quoteAsset, uint256 amount) external {
        creditedToCreator[quoteAsset] += amount;
    }

    function claim(address to, address quoteAsset) external {
        if (msg.sender != creator) revert NotAuthorized();
        uint256 amount = creditedToCreator[quoteAsset];
        if (amount == 0) revert NothingToClaim();
        creditedToCreator[quoteAsset] = 0;
        IERC20(quoteAsset).transfer(to, amount);
    }
}

contract MockArgusPortal is IArgusPortal {
    struct LaunchRecord {
        address creator;
        int24 tickStart;
        bool tokenIsToken0;
        address locker;
        address hook;
        address splitter;
        uint16 buyTaxBps;
        uint16 sellTaxBps;
        uint256 positionId;
        int24 tickBond;
        address quoteAsset;
    }

    mapping(address => LaunchRecord) private _launches;

    function createLaunch(CreateLaunchParams calldata p) external override returns (address token) {
        MockLaunchToken t = new MockLaunchToken(p.name, p.symbol);
        token = address(t);
        MockArgusRevenueSplitter splitter = new MockArgusRevenueSplitter(msg.sender);
        _launches[token] = LaunchRecord({
            creator: msg.sender,
            tickStart: p.tickStart,
            tokenIsToken0: false,
            locker: address(0),
            hook: address(0),
            splitter: address(splitter),
            buyTaxBps: p.buyTaxBps,
            sellTaxBps: p.sellTaxBps,
            positionId: 0,
            tickBond: p.tickBond,
            quoteAsset: p.quoteAsset
        });
    }

    function launches(address token)
        external
        view
        override
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
        )
    {
        LaunchRecord memory r = _launches[token];
        return (
            r.creator,
            r.tickStart,
            r.tokenIsToken0,
            r.locker,
            r.hook,
            r.splitter,
            r.buyTaxBps,
            r.sellTaxBps,
            r.positionId,
            r.tickBond,
            r.quoteAsset
        );
    }
}
