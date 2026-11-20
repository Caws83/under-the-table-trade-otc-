// SPDX-License-Identifier: MIT
pragma solidity 0.8.27;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {StakingPool} from "./StakingPool.sol";

/// @title StakingPoolFactory
/// @notice Creates Under The Counter staking pools and holds the platform fee schedule.
///         Only the factory owner can change fees or the treasury.
contract StakingPoolFactory is Ownable2Step, ReentrancyGuard {
    string public constant name = "Under The Counter Staking Factory";

    uint256 public constant MIN_DURATION = 60;
    uint256 public constant MAX_DURATION = 366 days;

    address public treasury;
    uint256 public creationFee;
    uint256 public renewalFee;

    address[] private _pools;
    mapping(address => bool) public isPool;
    mapping(address => address[]) private _byCreator;

    event PoolCreated(
        address indexed pool,
        address indexed creator,
        address stakingToken,
        address rewardToken,
        uint256 duration
    );
    event CreationFeeUpdated(uint256 fee);
    event RenewalFeeUpdated(uint256 fee);
    event TreasuryUpdated(address indexed treasury);

    error ZeroAddress();
    error BadDuration();
    error BadToken();
    error FeeShort();
    error NotPool();
    error PaymentFailed();

    constructor(address treasury_, uint256 creationFee_, uint256 renewalFee_) Ownable(msg.sender) {
        if (treasury_ == address(0)) revert ZeroAddress();
        treasury = treasury_;
        creationFee = creationFee_;
        renewalFee = renewalFee_;
    }

    function durationBounds() external pure returns (uint256 minDuration, uint256 maxDuration) {
        return (MIN_DURATION, MAX_DURATION);
    }

    function createPool(address stakingToken, address rewardToken, uint256 duration)
        external
        payable
        nonReentrant
        returns (address pool)
    {
        if (stakingToken == address(0) || rewardToken == address(0)) revert ZeroAddress();
        if (stakingToken.code.length == 0 || rewardToken.code.length == 0) revert BadToken();
        if (duration < MIN_DURATION || duration > MAX_DURATION) revert BadDuration();
        if (msg.value < creationFee) revert FeeShort();

        pool = address(new StakingPool(stakingToken, rewardToken, msg.sender, duration, address(this)));
        isPool[pool] = true;
        _pools.push(pool);
        _byCreator[msg.sender].push(pool);

        _pay(treasury, creationFee);
        if (msg.value > creationFee) _pay(msg.sender, msg.value - creationFee);

        emit PoolCreated(pool, msg.sender, stakingToken, rewardToken, duration);
    }

    /// @notice Called by a pool during renewal. Forwards the configured fee to the treasury.
    function collectRenewalFee() external payable nonReentrant {
        if (!isPool[msg.sender]) revert NotPool();
        if (msg.value < renewalFee) revert FeeShort();
        _pay(treasury, renewalFee);
        if (msg.value > renewalFee) _pay(msg.sender, msg.value - renewalFee);
    }

    function setCreationFee(uint256 fee) external onlyOwner {
        creationFee = fee;
        emit CreationFeeUpdated(fee);
    }

    function setRenewalFee(uint256 fee) external onlyOwner {
        renewalFee = fee;
        emit RenewalFeeUpdated(fee);
    }

    function setTreasury(address treasury_) external onlyOwner {
        if (treasury_ == address(0)) revert ZeroAddress();
        treasury = treasury_;
        emit TreasuryUpdated(treasury_);
    }

    function poolCount() external view returns (uint256) {
        return _pools.length;
    }

    function poolAt(uint256 index) external view returns (address) {
        return _pools[index];
    }

    function creatorPoolCount(address creator) external view returns (uint256) {
        return _byCreator[creator].length;
    }

    function creatorPoolAt(address creator, uint256 index) external view returns (address) {
        return _byCreator[creator][index];
    }

    function _pay(address to, uint256 amount) internal {
        if (amount == 0) return;
        (bool ok,) = to.call{value: amount}("");
        if (!ok) revert PaymentFailed();
    }
}
