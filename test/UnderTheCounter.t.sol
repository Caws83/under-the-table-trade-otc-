// SPDX-License-Identifier: MIT
pragma solidity 0.8.27;

import {Test} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {UnderTheCounterDesk} from "../contracts/UnderTheCounterDesk.sol";
import {StakingPool} from "../contracts/StakingPool.sol";
import {StakingPoolFactory} from "../contracts/StakingPoolFactory.sol";
import {TestToken} from "../contracts/mocks/TestToken.sol";

contract FeeOnTransferToken is ERC20 {
    constructor() ERC20("Fee Token", "FEE") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function decimals() public pure override returns (uint8) {
        return 18;
    }

    function _update(address from, address to, uint256 value) internal override {
        if (from != address(0) && to != address(0) && value > 0) {
            uint256 fee = value / 100;
            super._update(from, to, value - fee);
            super._update(from, address(0xdead), fee);
        } else {
            super._update(from, to, value);
        }
    }
}

contract FalseReturnToken {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function decimals() external pure returns (uint8) {
        return 18;
    }

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return false;
    }

    function transfer(address, uint256) external pure returns (bool) {
        return false;
    }

    function transferFrom(address, address, uint256) external pure returns (bool) {
        return false;
    }
}

contract NoReturnToken {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    string public name = "Silent";
    string public symbol = "SIL";

    function decimals() external pure returns (uint8) {
        return 18;
    }

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function approve(address spender, uint256 amount) external {
        allowance[msg.sender][spender] = amount;
    }

    function transfer(address to, uint256 amount) external {
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
    }

    function transferFrom(address from, address to, uint256 amount) external {
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
    }
}

contract ReenterToken is ERC20 {
    UnderTheCounterDesk public desk;
    bool public attack;

    constructor() ERC20("Reenter", "RE") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function arm(UnderTheCounterDesk desk_) external {
        desk = desk_;
        attack = true;
    }

    function _update(address from, address to, uint256 value) internal override {
        super._update(from, to, value);
        if (attack && address(desk) != address(0) && from != address(0)) {
            desk.cancel(0);
        }
    }
}

contract UnderTheCounterTest is Test {
    uint256 internal constant DURATION = 1000;

    TestToken internal stake;
    TestToken internal pay;
    TestToken internal six;
    UnderTheCounterDesk internal desk;
    StakingPoolFactory internal factory;

    address internal treasury = makeAddr("treasury");
    address internal operator = makeAddr("operator");
    address internal seller = makeAddr("seller");
    address internal buyer = makeAddr("buyer");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    address internal creator = makeAddr("creator");
    address internal stranger = makeAddr("stranger");

    function setUp() public {
        stake = new TestToken("Counter Stake", "STAKE", 18);
        pay = new TestToken("Counter Pay", "PAY", 18);
        six = new TestToken("Six", "SIX", 6);
        desk = new UnderTheCounterDesk(treasury, operator);
        factory = new StakingPoolFactory(treasury, 0.01 ether, 0.005 ether);

        stake.mint(seller, 10_000 ether);
        stake.mint(buyer, 10_000 ether);
        stake.mint(alice, 10_000 ether);
        stake.mint(bob, 10_000 ether);
        stake.mint(creator, 10_000 ether);
        pay.mint(seller, 10_000 ether);
        pay.mint(buyer, 10_000 ether);
        pay.mint(alice, 10_000 ether);
        pay.mint(bob, 10_000 ether);
        pay.mint(creator, 10_000 ether);
        six.mint(seller, 10_000_000e6);

        vm.deal(seller, 100 ether);
        vm.deal(buyer, 100 ether);
        vm.deal(creator, 100 ether);
        vm.deal(alice, 100 ether);
        vm.deal(stranger, 10 ether);
    }

    function test_Journey_CreatePartialFillAndCancel() public {
        uint256 price = 0.001 ether;
        uint256 listed = 1_000 ether;

        vm.startPrank(seller);
        stake.approve(address(desk), listed);
        uint256 id = desk.createOffer(address(stake), address(0), listed, price, address(0), false);
        vm.stopPrank();

        assertEq(desk.activeOfferCount(), 1);
        assertEq(stake.balanceOf(address(desk)), listed);
        assertEq(desk.escrowOf(address(stake)), listed);

        uint256 quantity = 400 ether;
        (uint256 cost, uint256 sellFee, uint256 buyFee, uint256 sellerReceives, uint256 buyerPays) =
            desk.quote(id, quantity);
        assertEq(cost, 0.4 ether);
        assertEq(sellFee, 0.002 ether);
        assertEq(buyFee, 0.002 ether);
        assertEq(sellerReceives, 0.398 ether);
        assertEq(buyerPays, 0.402 ether);

        uint256 sellerEthBefore = seller.balance;
        uint256 treasuryBefore = treasury.balance;
        uint256 buyerStakeBefore = stake.balanceOf(buyer);
        uint256 buyerEthBefore = buyer.balance;

        vm.prank(buyer);
        desk.fill{value: 1 ether}(id, quantity, price, 50, 50);

        assertEq(stake.balanceOf(buyer) - buyerStakeBefore, quantity);
        assertEq(buyerEthBefore - buyer.balance, buyerPays);
        assertEq(seller.balance - sellerEthBefore, sellerReceives);
        assertEq(treasury.balance - treasuryBefore, sellFee + buyFee);
        assertEq(desk.escrowOf(address(stake)), 600 ether);
        assertEq(stake.balanceOf(address(desk)), 600 ether);
        assertEq(desk.feesOf(address(0)), 0.004 ether);
        assertEq(desk.volumeOf(address(0)), 0.4 ether);
        assertEq(desk.tradeCount(), 1);
        assertTrue(desk.getOffer(id).active);

        vm.prank(buyer);
        vm.expectRevert(UnderTheCounterDesk.NotSeller.selector);
        desk.cancel(id);

        vm.prank(seller);
        desk.cancel(id);

        assertEq(stake.balanceOf(address(desk)), 0);
        assertEq(desk.escrowOf(address(stake)), 0);
        assertEq(desk.activeOfferCount(), 0);
        assertFalse(desk.getOffer(id).active);
        assertEq(stake.balanceOf(seller), 10_000 ether - quantity);
    }

    function test_PartialFillsCannotExceedEscrow() public {
        vm.startPrank(seller);
        stake.approve(address(desk), 100 ether);
        uint256 id = desk.createOffer(address(stake), address(pay), 100 ether, 2 ether, address(0), false);
        vm.stopPrank();

        vm.startPrank(buyer);
        pay.approve(address(desk), type(uint256).max);
        desk.fill(id, 60 ether, 2 ether, 50, 50);
        vm.expectRevert(UnderTheCounterDesk.InsufficientRemaining.selector);
        desk.fill(id, 50 ether, 2 ether, 50, 50);
        desk.fill(id, 40 ether, 2 ether, 50, 50);
        vm.stopPrank();

        assertFalse(desk.getOffer(id).active);
        assertEq(stake.balanceOf(address(desk)), 0);
        assertEq(pay.balanceOf(address(desk)), 0);
    }

    function test_EthSalePartialAndCancelRefundsNative() public {
        vm.prank(seller);
        uint256 id = desk.createOffer{value: 1 ether}(address(0), address(pay), 1 ether, 2 ether, address(0), false);

        vm.startPrank(buyer);
        pay.approve(address(desk), type(uint256).max);
        uint256 buyerEth = buyer.balance;
        desk.fill(id, 0.4 ether, 2 ether, 50, 50);
        vm.stopPrank();

        assertEq(buyer.balance - buyerEth, 0.4 ether);
        (,, , uint256 sellerReceives,) = desk.quote(id, 0.4 ether);
        assertEq(pay.balanceOf(seller), 10_000 ether + sellerReceives);

        uint256 sellerEth = seller.balance;
        vm.prank(operator);
        desk.cancel(id);
        assertEq(seller.balance - sellerEth, 0.6 ether);
        assertEq(address(desk).balance, 0);
    }

    function test_WholeFillDesignatedBuyerAndPriceSlippage() public {
        address onlyBuyer = buyer;
        vm.startPrank(seller);
        stake.approve(address(desk), 100 ether);
        uint256 id = desk.createOffer(address(stake), address(pay), 100 ether, 1 ether, onlyBuyer, true);
        vm.stopPrank();

        pay.mint(stranger, 200 ether);
        vm.startPrank(stranger);
        pay.approve(address(desk), type(uint256).max);
        vm.expectRevert(UnderTheCounterDesk.NotBuyer.selector);
        desk.fill(id, 100 ether, 1 ether, 50, 50);
        vm.stopPrank();

        vm.startPrank(buyer);
        pay.approve(address(desk), type(uint256).max);
        vm.expectRevert(UnderTheCounterDesk.WholeFillRequired.selector);
        desk.fill(id, 10 ether, 1 ether, 50, 50);
        vm.stopPrank();

        vm.prank(seller);
        desk.adjustPrice(id, 3 ether);

        vm.startPrank(buyer);
        vm.expectRevert(UnderTheCounterDesk.PriceTooHigh.selector);
        desk.fill(id, 100 ether, 2 ether, 50, 50);
        desk.fill(id, 100 ether, 3 ether, 50, 50);
        vm.stopPrank();
        assertFalse(desk.getOffer(id).active);
    }

    function test_FeeCapSlippageAndOperatorCannotSeize() public {
        vm.expectRevert(UnderTheCounterDesk.FeeCap.selector);
        desk.setSellFeeBps(301);

        vm.prank(stranger);
        vm.expectRevert();
        desk.setBuyFeeBps(0);

        vm.prank(address(this));
        desk.setSellFeeBps(100);

        vm.startPrank(seller);
        stake.approve(address(desk), 10 ether);
        uint256 id = desk.createOffer(address(stake), address(pay), 10 ether, 1 ether, address(0), false);
        vm.stopPrank();

        vm.startPrank(buyer);
        pay.approve(address(desk), type(uint256).max);
        vm.expectRevert(UnderTheCounterDesk.FeeTooHigh.selector);
        desk.fill(id, 1 ether, 1 ether, 50, 50);
        desk.fill(id, 1 ether, 1 ether, 100, 50);
        vm.stopPrank();

        uint256 operatorStake = stake.balanceOf(operator);
        vm.prank(operator);
        desk.cancel(id);
        assertEq(stake.balanceOf(operator), operatorStake);
        assertEq(stake.balanceOf(seller), 10_000 ether - 1 ether);
    }

    function test_SixDecimalPricingAndZeroCostGuard() public {
        vm.startPrank(seller);
        six.approve(address(desk), 1_000_000);
        uint256 id = desk.createOffer(address(six), address(pay), 1_000_000, 2 ether, address(0), false);
        vm.stopPrank();

        (uint256 cost,,,,) = desk.quote(id, 1_000_000);
        assertEq(cost, 2 ether);

        vm.startPrank(seller);
        stake.approve(address(desk), 100);
        uint256 tiny = desk.createOffer(address(stake), address(pay), 100, 1, address(0), false);
        vm.stopPrank();
        vm.startPrank(buyer);
        pay.approve(address(desk), type(uint256).max);
        vm.expectRevert(UnderTheCounterDesk.ZeroCost.selector);
        desk.fill(tiny, 1, 1, 50, 50);
        vm.stopPrank();
    }

    function test_FeeOnTransferSellIsEscrowedNetAndPaymentTaxReverts() public {
        FeeOnTransferToken feeToken = new FeeOnTransferToken();
        feeToken.mint(seller, 1_000 ether);
        feeToken.mint(buyer, 1_000 ether);

        vm.startPrank(seller);
        feeToken.approve(address(desk), 1_000 ether);
        uint256 id = desk.createOffer(address(feeToken), address(pay), 1_000 ether, 1 ether, address(0), false);
        vm.stopPrank();
        assertEq(desk.getOffer(id).escrowed, 990 ether);

        vm.startPrank(buyer);
        pay.approve(address(desk), type(uint256).max);
        desk.fill(id, 100 ether, 1 ether, 50, 50);
        vm.stopPrank();
        assertEq(feeToken.balanceOf(buyer), 1_000 ether + 99 ether);

        vm.startPrank(seller);
        pay.approve(address(desk), 10 ether);
        uint256 payId = desk.createOffer(address(pay), address(feeToken), 10 ether, 1 ether, address(0), false);
        vm.stopPrank();

        vm.startPrank(buyer);
        feeToken.approve(address(desk), type(uint256).max);
        vm.expectRevert(UnderTheCounterDesk.PaymentShort.selector);
        desk.fill(payId, 1 ether, 1 ether, 50, 50);
        vm.stopPrank();
    }

    function test_FalseReturnAndSilentErc20() public {
        FalseReturnToken bad = new FalseReturnToken();
        bad.mint(seller, 10 ether);
        vm.startPrank(seller);
        bad.approve(address(desk), 10 ether);
        vm.expectRevert();
        desk.createOffer(address(bad), address(pay), 1 ether, 1 ether, address(0), false);
        vm.stopPrank();

        NoReturnToken silent = new NoReturnToken();
        silent.mint(seller, 10 ether);
        silent.mint(buyer, 10 ether);
        vm.startPrank(seller);
        silent.approve(address(desk), 10 ether);
        uint256 id = desk.createOffer(address(silent), address(pay), 10 ether, 1 ether, address(0), false);
        vm.stopPrank();
        assertEq(desk.getOffer(id).escrowed, 10 ether);

        vm.startPrank(buyer);
        pay.approve(address(desk), 20 ether);
        desk.fill(id, 4 ether, 1 ether, 50, 50);
        vm.stopPrank();
        assertEq(silent.balanceOf(buyer), 14 ether);
    }

    function test_ReentrancyOnTransferIsBlocked() public {
        ReenterToken token = new ReenterToken();
        token.mint(seller, 10 ether);
        vm.startPrank(seller);
        token.approve(address(desk), 10 ether);
        desk.createOffer(address(token), address(pay), 10 ether, 1 ether, address(0), false);
        token.arm(desk);
        vm.stopPrank();

        vm.startPrank(buyer);
        pay.approve(address(desk), type(uint256).max);
        vm.expectRevert();
        desk.fill(0, 1 ether, 1 ether, 50, 50);
        vm.stopPrank();

        assertEq(desk.getOffer(0).filled, 0);
        assertEq(token.balanceOf(address(desk)), 10 ether);
    }

    function test_RescueCannotTakeEscrowButCanTakeDonation() public {
        vm.startPrank(seller);
        stake.approve(address(desk), 50 ether);
        desk.createOffer(address(stake), address(pay), 50 ether, 1 ether, address(0), false);
        vm.stopPrank();

        stake.mint(address(this), 5 ether);
        stake.transfer(address(desk), 5 ether);

        vm.expectRevert(UnderTheCounterDesk.EscrowProtected.selector);
        desk.rescue(address(stake), treasury, 6 ether);

        desk.rescue(address(stake), treasury, 5 ether);
        assertEq(stake.balanceOf(address(desk)), 50 ether);
        assertEq(stake.balanceOf(treasury), 5 ether);
    }

    function test_BlacklistZeroPriceAndSameAsset() public {
        vm.prank(seller);
        vm.expectRevert(UnderTheCounterDesk.SameAsset.selector);
        desk.createOffer(address(stake), address(stake), 1 ether, 1 ether, address(0), false);

        desk.setBlacklisted(address(stake), true);
        vm.startPrank(seller);
        stake.approve(address(desk), 1 ether);
        vm.expectRevert(UnderTheCounterDesk.Blacklisted.selector);
        desk.createOffer(address(stake), address(pay), 1 ether, 1 ether, address(0), false);
        vm.stopPrank();

        desk.setBlacklisted(address(stake), false);
        vm.startPrank(seller);
        uint256 id = desk.createOffer(address(stake), address(pay), 1 ether, 1 ether, address(0), false);
        vm.expectRevert(UnderTheCounterDesk.ZeroPrice.selector);
        desk.adjustPrice(id, 0);
        vm.stopPrank();

        vm.prank(buyer);
        vm.expectRevert(UnderTheCounterDesk.NotSeller.selector);
        desk.adjustPrice(id, 2 ether);
    }

    function test_ExcessEthIsRefunded() public {
        vm.startPrank(seller);
        stake.approve(address(desk), 10 ether);
        uint256 id = desk.createOffer(address(stake), address(0), 10 ether, 1 ether, address(0), false);
        vm.stopPrank();

        uint256 before = buyer.balance;
        vm.prank(buyer);
        desk.fill{value: 5 ether}(id, 1 ether, 1 ether, 50, 50);
        (,,,, uint256 buyerPays) = desk.quote(id, 1 ether);
        assertEq(before - buyer.balance, buyerPays);
        assertEq(address(desk).balance, 0);
    }

    function test_Journey_StakingFundStakeClaimWithdrawRenew() public {
        vm.prank(creator);
        address poolAddress = factory.createPool{value: 0.02 ether}(address(stake), address(pay), DURATION);
        assertEq(factory.poolCount(), 1);
        assertEq(factory.creatorPoolAt(creator, 0), poolAddress);
        assertEq(treasury.balance, 0.01 ether);
        assertEq(creator.balance, 100 ether - 0.01 ether);

        StakingPool pool = StakingPool(poolAddress);
        vm.startPrank(creator);
        pay.approve(address(pool), type(uint256).max);
        pool.fund(1_000 ether);
        vm.stopPrank();
        assertEq(pool.rewardRate(), 1 ether);

        vm.startPrank(alice);
        stake.approve(address(pool), type(uint256).max);
        pool.stake(100 ether);
        vm.stopPrank();
        vm.startPrank(bob);
        stake.approve(address(pool), type(uint256).max);
        pool.stake(300 ether);
        vm.stopPrank();

        vm.warp(block.timestamp + 100);
        assertEq(pool.earned(alice), 25 ether);
        assertEq(pool.earned(bob), 75 ether);

        uint256 alicePay = pay.balanceOf(alice);
        vm.prank(alice);
        pool.claim();
        assertEq(pay.balanceOf(alice) - alicePay, 25 ether);
        assertEq(stake.balanceOf(alice), 10_000 ether - 100 ether);

        vm.prank(creator);
        vm.expectRevert(StakingPool.NothingToRecover.selector);
        pool.recoverSurplusRewards(creator);

        vm.prank(alice);
        pool.withdraw(40 ether);
        assertEq(pool.stakedBalance(alice), 60 ether);
        assertEq(stake.balanceOf(alice), 10_000 ether - 60 ether);

        uint256 treasuryBefore = treasury.balance;
        uint256 creatorBefore = creator.balance;
        vm.startPrank(creator);
        pool.renew{value: 0.007 ether}(DURATION, 500 ether);
        vm.stopPrank();
        assertEq(treasury.balance - treasuryBefore, 0.005 ether);
        assertEq(creatorBefore - creator.balance, 0.005 ether);
        assertEq(pool.periodFinish(), block.timestamp + (900 + DURATION));

        vm.warp(pool.periodFinish() + 1);
        uint256 bobStake = stake.balanceOf(bob);
        vm.prank(bob);
        pool.withdraw(300 ether);
        assertEq(stake.balanceOf(bob) - bobStake, 300 ether);

        vm.prank(bob);
        pool.claim();
        assertGt(pay.balanceOf(bob), 10_000 ether);
    }

    function test_CreatorCannotTakePrincipalOrAccruedRewards() public {
        StakingPool pool = _freshPool();
        vm.startPrank(creator);
        pay.approve(address(pool), type(uint256).max);
        pool.fund(1_000 ether);
        vm.stopPrank();

        vm.startPrank(alice);
        stake.approve(address(pool), type(uint256).max);
        pool.stake(100 ether);
        vm.stopPrank();

        vm.warp(block.timestamp + 250);
        assertEq(pool.earned(alice), 250 ether);

        vm.startPrank(creator);
        vm.expectRevert(StakingPool.NothingToRecover.selector);
        pool.recoverSurplusRewards(creator);
        vm.expectRevert(StakingPool.NothingToRecover.selector);
        pool.recoverSurplusStake(creator);
        vm.expectRevert(StakingPool.ProtectedToken.selector);
        pool.recoverUnrelatedToken(address(stake), creator, 1 ether);
        vm.expectRevert(StakingPool.ProtectedToken.selector);
        pool.recoverUnrelatedToken(address(pay), creator, 1 ether);
        vm.stopPrank();

        assertEq(pool.stakedBalance(alice), 100 ether);
        assertEq(pool.earned(alice), 250 ether);
    }

    function test_SkippedEmissionsAreSurplusAndUnclaimedStayReserved() public {
        StakingPool pool = _freshPool();
        vm.startPrank(creator);
        pay.approve(address(pool), type(uint256).max);
        pool.fund(1_000 ether);
        vm.stopPrank();

        vm.warp(block.timestamp + 100);
        assertEq(pool.rewardSurplus(), 100 ether);

        vm.prank(creator);
        pool.recoverSurplusRewards(creator);
        assertEq(pay.balanceOf(creator), 10_000 ether - 1_000 ether + 100 ether);

        vm.startPrank(alice);
        stake.approve(address(pool), type(uint256).max);
        pool.stake(50 ether);
        vm.stopPrank();

        vm.warp(block.timestamp + 50);
        assertEq(pool.earned(alice), 50 ether);

        vm.prank(creator);
        vm.expectRevert(StakingPool.NothingToRecover.selector);
        pool.recoverSurplusRewards(creator);

        vm.warp(pool.periodFinish() + 10);
        uint256 earned = pool.earned(alice);
        vm.prank(alice);
        pool.claim();
        assertEq(pay.balanceOf(alice), 10_000 ether + earned);
        assertEq(pool.stakedBalance(alice), 50 ether);
    }

    function test_EmergencyWithdrawKeepsRewardsClaimable() public {
        StakingPool pool = _freshPool();
        vm.startPrank(creator);
        pay.approve(address(pool), type(uint256).max);
        pool.fund(1_000 ether);
        vm.stopPrank();

        vm.startPrank(alice);
        stake.approve(address(pool), type(uint256).max);
        pool.stake(20 ether);
        vm.warp(block.timestamp + 15);
        pool.emergencyWithdraw();
        assertEq(stake.balanceOf(alice), 10_000 ether);
        assertEq(pool.stakedBalance(alice), 0);
        assertEq(pool.earned(alice), 15 ether);
        pool.claim();
        vm.stopPrank();
        assertEq(pay.balanceOf(alice), 10_000 ether + 15 ether);

        vm.prank(creator);
        vm.expectRevert(StakingPool.NothingToRecover.selector);
        pool.recoverSurplusRewards(creator);
    }

    function test_SameTokenPoolPreservesPrincipal() public {
        vm.prank(creator);
        StakingPool pool = StakingPool(
            factory.createPool{value: 0.01 ether}(address(stake), address(stake), DURATION)
        );

        vm.startPrank(creator);
        stake.approve(address(pool), type(uint256).max);
        pool.fund(1_000 ether);
        vm.stopPrank();

        vm.startPrank(alice);
        stake.approve(address(pool), type(uint256).max);
        pool.stake(100 ether);
        vm.stopPrank();

        assertEq(stake.balanceOf(address(pool)), 1_100 ether);
        vm.warp(block.timestamp + 40);
        assertEq(pool.earned(alice), 40 ether);

        vm.prank(creator);
        vm.expectRevert(StakingPool.ProtectedToken.selector);
        pool.recoverSurplusStake(creator);
        vm.prank(creator);
        vm.expectRevert(StakingPool.NothingToRecover.selector);
        pool.recoverSurplusRewards(creator);

        vm.startPrank(alice);
        pool.withdraw(100 ether);
        pool.claim();
        vm.stopPrank();
        assertEq(stake.balanceOf(alice), 10_000 ether + 40 ether);
        assertEq(stake.balanceOf(address(pool)), 960 ether);
    }

    function test_RenewPreservesAlreadyEarnedRewards() public {
        StakingPool pool = _freshPool();
        vm.startPrank(creator);
        pay.approve(address(pool), type(uint256).max);
        pool.fund(1_000 ether);
        vm.stopPrank();

        vm.startPrank(alice);
        stake.approve(address(pool), type(uint256).max);
        pool.stake(100 ether);
        vm.stopPrank();

        vm.warp(block.timestamp + 100);
        assertEq(pool.earned(alice), 100 ether);

        vm.startPrank(creator);
        pool.renew{value: 0.005 ether}(DURATION, 100 ether);
        vm.stopPrank();

        assertEq(pool.earned(alice), 100 ether);
        vm.prank(alice);
        pool.claim();
        assertEq(pay.balanceOf(alice), 10_000 ether + 100 ether);
        assertEq(pool.stakedBalance(alice), 100 ether);
    }

    function test_ExtendWithoutNewFundsLowersRateAndKeepsLiability() public {
        StakingPool pool = _freshPool();
        vm.startPrank(creator);
        pay.approve(address(pool), type(uint256).max);
        pool.fund(1_000 ether);
        vm.warp(block.timestamp + 100);
        pool.renew{value: 0.005 ether}(DURATION, 0);
        vm.stopPrank();

        assertEq(pool.rewardRate(), 900 ether / (900 + DURATION));
        assertGe(pay.balanceOf(address(pool)), pool.reservedRewards());
    }

    function test_FactoryFeePermissionsAndDurationBounds() public {
        vm.prank(stranger);
        vm.expectRevert();
        factory.setCreationFee(1);

        vm.prank(stranger);
        vm.expectRevert();
        factory.setRenewalFee(1);

        vm.expectRevert(StakingPoolFactory.FeeShort.selector);
        vm.prank(creator);
        factory.createPool{value: 0.001 ether}(address(stake), address(pay), DURATION);

        vm.expectRevert(StakingPoolFactory.BadDuration.selector);
        vm.prank(creator);
        factory.createPool{value: 0.01 ether}(address(stake), address(pay), 30);

        vm.expectRevert(StakingPoolFactory.NotPool.selector);
        factory.collectRenewalFee{value: 1 ether}();

        factory.setCreationFee(0);
        vm.prank(creator);
        address pool = factory.createPool{value: 0}(address(stake), address(pay), 60);
        assertTrue(factory.isPool(pool));
    }

    function test_DonationSurplusAndUnrelatedRecovery() public {
        StakingPool pool = _freshPool();
        vm.startPrank(creator);
        pay.approve(address(pool), type(uint256).max);
        pool.fund(100 ether);
        vm.stopPrank();

        vm.prank(alice);
        pay.transfer(address(pool), 7 ether);
        vm.prank(alice);
        stake.transfer(address(pool), 3 ether);

        vm.startPrank(creator);
        pool.recoverSurplusRewards(creator);
        pool.recoverSurplusStake(creator);
        vm.stopPrank();

        assertEq(pay.balanceOf(creator), 10_000 ether - 100 ether + 7 ether);
        assertEq(stake.balanceOf(creator), 10_000 ether + 3 ether);

        six.mint(address(pool), 5e6);
        vm.prank(creator);
        pool.recoverUnrelatedToken(address(six), creator, 5e6);
        assertEq(six.balanceOf(creator), 5e6);
    }

    function test_NonCreatorCannotFundOrRenew() public {
        StakingPool pool = _freshPool();
        vm.startPrank(alice);
        pay.approve(address(pool), type(uint256).max);
        vm.expectRevert(StakingPool.NotCreator.selector);
        pool.fund(1 ether);
        vm.expectRevert(StakingPool.NotCreator.selector);
        pool.renew{value: 0.005 ether}(DURATION, 1 ether);
        vm.stopPrank();
    }

    function test_DeskPagingAndSellerIndex() public {
        vm.startPrank(seller);
        stake.approve(address(desk), 30 ether);
        desk.createOffer(address(stake), address(pay), 10 ether, 1 ether, address(0), false);
        desk.createOffer(address(stake), address(pay), 10 ether, 1 ether, address(0), false);
        desk.createOffer(address(stake), address(0), 10 ether, 1 ether, address(0), false);
        vm.stopPrank();

        assertEq(desk.sellerOfferCount(seller), 3);
        assertEq(desk.sellerOfferId(seller, 2), 2);
        assertEq(desk.getOffers(1, 2).length, 2);
        assertEq(desk.getOffers(5, 1).length, 0);
    }

    function _freshPool() internal returns (StakingPool pool) {
        vm.prank(creator);
        pool = StakingPool(factory.createPool{value: 0.01 ether}(address(stake), address(pay), DURATION));
    }
}
