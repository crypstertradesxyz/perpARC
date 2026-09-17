// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import { Test } from "forge-std/Test.sol";
import { PerpArcVaultFactory } from "../src/PerpArcVaultFactory.sol";
import { PerpArcRelay } from "../src/PerpArcRelay.sol";
import { CreateLaunchParams } from "../src/interfaces/IArgusPortal.sol";
import { MockUSDC, MockArgusPortal, MockArgusRevenueSplitter } from "./mocks/MockArgus.sol";

contract PerpArcTest is Test {
    address internal owner = makeAddr("owner");
    address internal keeper = makeAddr("keeper");
    address internal launcher = makeAddr("launcher");
    address internal buybackWallet = makeAddr("buybackWallet");
    address internal realCreator = makeAddr("realCreator");
    address internal positionSink = makeAddr("positionSink");

    MockUSDC internal usdc;
    MockArgusPortal internal portal;
    PerpArcVaultFactory internal factory;

    bytes32 internal constant BTC = bytes32("BTC");

    function setUp() public {
        usdc = new MockUSDC();
        portal = new MockArgusPortal();
        factory = new PerpArcVaultFactory(owner, address(portal), address(usdc), buybackWallet, keeper);

        vm.startPrank(owner);
        factory.setLauncher(launcher, true);
        factory.setAssetLeverageCap(BTC, 20);
        vm.stopPrank();
    }

    function _defaultParams() internal pure returns (CreateLaunchParams memory p) {
        p.name = "Test Token";
        p.symbol = "TEST";
        p.buyTaxBps = 500;
        p.sellTaxBps = 500;
        p.tickStart = 0;
        p.tickBond = 100;
    }

    function _launch(bool isLong, uint8 leverage) internal returns (address token, address relayAddr) {
        vm.prank(launcher);
        (token, relayAddr) = factory.launch(_defaultParams(), BTC, isLong, leverage, realCreator);
    }

    function test_launch_makesRelayTheArgusCreator() public {
        (address token, address relayAddr) = _launch(true, 5);

        (address creator,,,,, address splitter,,,,,) = portal.launches(token);
        assertEq(creator, relayAddr, "relay must be Argus's creator, not realCreator or the launcher");

        PerpArcRelay relay = PerpArcRelay(relayAddr);
        assertEq(address(relay.splitter()), splitter);
        assertEq(relay.token(), token);
        assertEq(relay.realCreator(), realCreator);
        assertEq(relay.asset(), BTC);
        assertTrue(relay.isLong());
        assertEq(relay.leverage(), 5);
        assertTrue(relay.isKeeper(keeper));
    }

    function test_launch_forcesArgusAllocationTo100PercentCreatorFunds() public {
        CreateLaunchParams memory p = _defaultParams();
        // Attempt to smuggle in a different allocation -- factory must
        // override it regardless of what's passed.
        p.creatorFundsBps = 1000;
        p.buybackBurnBps = 3000;
        p.dividendsBps = 4000;
        p.liquidityBps = 2000;
        p.quoteAsset = address(0xdead);

        vm.prank(launcher);
        (address token,) = factory.launch(p, BTC, true, 5, realCreator);
        (,,,,,,,,,, address quoteAsset) = portal.launches(token);
        assertEq(quoteAsset, address(usdc), "quoteAsset must be forced to PerpArc's USDC");
    }

    function test_launch_revertsForNonLauncher() public {
        vm.expectRevert(PerpArcVaultFactory.NotLauncher.selector);
        factory.launch(_defaultParams(), BTC, true, 5, realCreator);
    }

    function test_launch_revertsForUnsupportedAsset() public {
        vm.prank(launcher);
        vm.expectRevert(PerpArcVaultFactory.AssetNotSupported.selector);
        factory.launch(_defaultParams(), bytes32("ETH"), true, 5, realCreator);
    }

    function test_launch_revertsForLeverageAboveCap() public {
        vm.prank(launcher);
        vm.expectRevert(PerpArcVaultFactory.LeverageAboveAssetCap.selector);
        factory.launch(_defaultParams(), BTC, true, 21, realCreator);
    }

    function test_collectFees_splits80_20AndSendsBuybackImmediately() public {
        (, address relayAddr) = _launch(true, 5);
        PerpArcRelay relay = PerpArcRelay(relayAddr);

        uint256 accrued = 1000e18;
        usdc.mint(address(relay.splitter()), accrued);
        MockArgusRevenueSplitter(address(relay.splitter())).credit(address(usdc), accrued);

        uint256 claimed = relay.collectFees();
        assertEq(claimed, accrued);
        assertEq(usdc.balanceOf(buybackWallet), accrued * 20 / 100, "buyback wallet must receive 20% immediately");
        assertEq(relay.pendingPosition(), accrued * 80 / 100, "80% must accrue as pendingPosition");
        assertEq(usdc.balanceOf(address(relay)), accrued * 80 / 100, "80% stays in the relay until swept");
    }

    function test_collectFees_isPermissionless() public {
        (, address relayAddr) = _launch(true, 5);
        PerpArcRelay relay = PerpArcRelay(relayAddr);
        usdc.mint(address(relay.splitter()), 100e18);
        MockArgusRevenueSplitter(address(relay.splitter())).credit(address(usdc), 100e18);

        vm.prank(makeAddr("rando"));
        relay.collectFees(); // must not revert
    }

    function test_sweepPositionCapital_onlyKeeper() public {
        (, address relayAddr) = _launch(true, 5);
        PerpArcRelay relay = PerpArcRelay(relayAddr);
        usdc.mint(address(relay.splitter()), 100e18);
        MockArgusRevenueSplitter(address(relay.splitter())).credit(address(usdc), 100e18);
        relay.collectFees();

        vm.expectRevert(PerpArcRelay.NotKeeper.selector);
        relay.sweepPositionCapital(positionSink);

        vm.prank(keeper);
        uint256 amount = relay.sweepPositionCapital(positionSink);
        assertEq(amount, 80e18);
        assertEq(usdc.balanceOf(positionSink), 80e18);
        assertEq(relay.pendingPosition(), 0);
    }

    function test_setKeeper_onlyOwner() public {
        (, address relayAddr) = _launch(true, 5);
        PerpArcRelay relay = PerpArcRelay(relayAddr);
        address newKeeper = makeAddr("newKeeper");

        vm.expectRevert(PerpArcRelay.NotOwner.selector);
        relay.setKeeper(newKeeper, true);

        vm.prank(owner);
        relay.setKeeper(newKeeper, true);
        assertTrue(relay.isKeeper(newKeeper));
    }
}
