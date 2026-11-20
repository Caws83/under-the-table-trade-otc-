// SPDX-License-Identifier: MIT
pragma solidity 0.8.27;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

interface IStakingPoolFactory {
    function renewalFee() external view returns (uint256);
    function collectRenewalFee() external payable;
    function durationBounds() external view returns (uint256 minDuration, uint256 maxDuration);
}

/// @title StakingPool
/// @notice Renewable staking pool for Under The Counter.
/// @dev Reward accounting follows a per-second accured-reward model.
///      The pool creator can fund, renew, and recover only unallocated surplus.
///      Staked principal and rewards already accrued to stakers stay locked for those stakers.
contract StakingPool is ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant PRECISION = 1e18;
    string public constant name = "Under The Counter Staking Pool";

    IERC20 public immutable stakingToken;
    IERC20 public immutable rewardToken;
    address public immutable factory;

    address public creator;
    uint256 public duration;

    uint256 public rewardRate;
    uint256 public periodFinish;
    uint256 public lastUpdateTime;
    uint256 public rewardPerTokenStored;
    uint256 public totalStaked;

    /// @dev Cumulative rewards that have been (or are about to be) assigned to stakers.
    ///      This intentionally over-reserves rounding dust so surplus recovery cannot touch it.
    uint256 public rewardsAccrued;
    uint256 public rewardsClaimed;

    mapping(address => uint256) public stakedBalance;
    mapping(address => uint256) public userRewardPerTokenPaid;
    mapping(address => uint256) public accruedRewards;

    event Staked(address indexed account, uint256 amount);
    event Withdrawn(address indexed account, uint256 amount);
    event Claimed(address indexed account, uint256 amount);
    event EmergencyWithdrawn(address indexed account, uint256 amount);
    event Funded(address indexed funder, uint256 amount, uint256 rewardRate, uint256 periodFinish);
    event Renewed(
        address indexed funder,
        uint256 newDuration,
        uint256 addedRewards,
        uint256 rewardRate,
        uint256 periodFinish
    );
    event SurplusRecovered(address indexed token, address indexed to, uint256 amount);
    event CreatorshipTransferred(address indexed previousCreator, address indexed newCreator);

    error NotCreator();
    error ZeroAmount();
    error ZeroAddress();
    error BadDuration();
    error FeeShort();
    error RateZero();
    error InsufficientStake();
    error NothingToRecover();
    error ProtectedToken();
    error RefundFailed();

    modifier onlyCreator() {
        if (msg.sender != creator) revert NotCreator();
        _;
    }

    constructor(
        address stakingToken_,
        address rewardToken_,
        address creator_,
        uint256 duration_,
        address factory_
    ) {
        if (
            stakingToken_ == address(0) || rewardToken_ == address(0) || creator_ == address(0)
                || factory_ == address(0)
        ) revert ZeroAddress();
        stakingToken = IERC20(stakingToken_);
        rewardToken = IERC20(rewardToken_);
        creator = creator_;
        duration = duration_;
        factory = factory_;
    }

    function lastTimeRewardApplicable() public view returns (uint256) {
        return block.timestamp < periodFinish ? block.timestamp : periodFinish;
    }

    function rewardPerToken() public view returns (uint256) {
        if (totalStaked == 0) return rewardPerTokenStored;
        uint256 dt = lastTimeRewardApplicable() - lastUpdateTime;
        return rewardPerTokenStored + Math.mulDiv(rewardRate, dt * PRECISION, totalStaked);
    }

    function earned(address account) public view returns (uint256) {
        return Math.mulDiv(
            stakedBalance[account], rewardPerToken() - userRewardPerTokenPaid[account], PRECISION
        ) + accruedRewards[account];
    }

    /// @notice Rewards that must remain in the pool: unclaimed accruals plus scheduled emissions.
    function reservedRewards() public view returns (uint256) {
        uint256 applicable = lastTimeRewardApplicable();
        uint256 dt = applicable - lastUpdateTime;
        uint256 pending = totalStaked > 0 ? dt * rewardRate : 0;
        uint256 future = periodFinish > applicable ? (periodFinish - applicable) * rewardRate : 0;
        return rewardsAccrued + pending + future - rewardsClaimed;
    }

    function rewardBalance() public view returns (uint256) {
        uint256 balance = rewardToken.balanceOf(address(this));
        if (address(stakingToken) == address(rewardToken)) {
            return balance > totalStaked ? balance - totalStaked : 0;
        }
        return balance;
    }

    function rewardSurplus() public view returns (uint256) {
        uint256 balance = rewardBalance();
        uint256 reserved = reservedRewards();
        return balance > reserved ? balance - reserved : 0;
    }

    function stakeSurplus() public view returns (uint256) {
        if (address(stakingToken) == address(rewardToken)) return 0;
        uint256 balance = stakingToken.balanceOf(address(this));
        return balance > totalStaked ? balance - totalStaked : 0;
    }

    function stake(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        _update(msg.sender);
        uint256 beforeBalance = stakingToken.balanceOf(address(this));
        stakingToken.safeTransferFrom(msg.sender, address(this), amount);
        uint256 received = stakingToken.balanceOf(address(this)) - beforeBalance;
        if (received == 0) revert ZeroAmount();
        stakedBalance[msg.sender] += received;
        totalStaked += received;
        emit Staked(msg.sender, received);
    }

    function withdraw(uint256 amount) external nonReentrant {
        if (amount == 0 || stakedBalance[msg.sender] < amount) revert InsufficientStake();
        _update(msg.sender);
        stakedBalance[msg.sender] -= amount;
        totalStaked -= amount;
        stakingToken.safeTransfer(msg.sender, amount);
        emit Withdrawn(msg.sender, amount);
    }

    function claim() external nonReentrant {
        _update(msg.sender);
        uint256 reward = accruedRewards[msg.sender];
        if (reward == 0) return;
        accruedRewards[msg.sender] = 0;
        rewardsClaimed += reward;
        rewardToken.safeTransfer(msg.sender, reward);
        emit Claimed(msg.sender, reward);
    }

    /// @notice Returns the caller's full principal. Rewards already accrued stay claimable.
    function emergencyWithdraw() external nonReentrant {
        _update(msg.sender);
        uint256 amount = stakedBalance[msg.sender];
        if (amount == 0) revert ZeroAmount();
        stakedBalance[msg.sender] = 0;
        totalStaked -= amount;
        stakingToken.safeTransfer(msg.sender, amount);
        emit EmergencyWithdrawn(msg.sender, amount);
    }

    /// @notice Pull reward tokens and start, or top up, the active emission schedule.
    function fund(uint256 amount) external nonReentrant onlyCreator {
        if (amount == 0) revert ZeroAmount();
        _update(address(0));
        uint256 received = _pullReward(amount);
        if (block.timestamp >= periodFinish) {
            rewardRate = received / duration;
            if (rewardRate == 0) revert RateZero();
            periodFinish = block.timestamp + duration;
            lastUpdateTime = block.timestamp;
        } else {
            uint256 remaining = periodFinish - block.timestamp;
            uint256 leftover = remaining * rewardRate;
            rewardRate = (leftover + received) / remaining;
            if (rewardRate == 0) revert RateZero();
        }
        emit Funded(msg.sender, received, rewardRate, periodFinish);
    }

    /// @notice Restart a finished pool, or extend a live one, and optionally add rewards.
    ///         A platform renewal fee is forwarded to the factory treasury.
    function renew(uint256 newDuration, uint256 additionalRewards) external payable nonReentrant onlyCreator {
        (uint256 minDuration, uint256 maxDuration) = IStakingPoolFactory(factory).durationBounds();
        if (newDuration < minDuration || newDuration > maxDuration) revert BadDuration();
        _payRenewalFee();
        _update(address(0));
        uint256 received = additionalRewards > 0 ? _pullReward(additionalRewards) : 0;

        if (block.timestamp >= periodFinish) {
            if (received == 0) revert ZeroAmount();
            duration = newDuration;
            rewardRate = received / newDuration;
            if (rewardRate == 0) revert RateZero();
            periodFinish = block.timestamp + newDuration;
            lastUpdateTime = block.timestamp;
        } else {
            uint256 remaining = periodFinish - block.timestamp;
            uint256 leftover = remaining * rewardRate;
            uint256 window = remaining + newDuration;
            rewardRate = (leftover + received) / window;
            if (rewardRate == 0) revert RateZero();
            periodFinish = block.timestamp + window;
            duration = newDuration;
            lastUpdateTime = block.timestamp;
        }

        emit Renewed(msg.sender, newDuration, received, rewardRate, periodFinish);
    }

    function recoverSurplusRewards(address to) external nonReentrant onlyCreator {
        if (to == address(0)) revert ZeroAddress();
        _update(address(0));
        uint256 surplus = rewardSurplus();
        if (surplus == 0) revert NothingToRecover();
        rewardToken.safeTransfer(to, surplus);
        emit SurplusRecovered(address(rewardToken), to, surplus);
    }

    function recoverSurplusStake(address to) external nonReentrant onlyCreator {
        if (to == address(0)) revert ZeroAddress();
        if (address(stakingToken) == address(rewardToken)) revert ProtectedToken();
        uint256 surplus = stakeSurplus();
        if (surplus == 0) revert NothingToRecover();
        stakingToken.safeTransfer(to, surplus);
        emit SurplusRecovered(address(stakingToken), to, surplus);
    }

    function recoverUnrelatedToken(address token, address to, uint256 amount) external nonReentrant onlyCreator {
        if (to == address(0) || token == address(0)) revert ZeroAddress();
        if (token == address(stakingToken) || token == address(rewardToken)) revert ProtectedToken();
        if (amount == 0) revert ZeroAmount();
        IERC20(token).safeTransfer(to, amount);
        emit SurplusRecovered(token, to, amount);
    }

    function transferCreatorship(address newCreator) external onlyCreator {
        if (newCreator == address(0)) revert ZeroAddress();
        address previous = creator;
        creator = newCreator;
        emit CreatorshipTransferred(previous, newCreator);
    }

    function _update(address account) internal {
        uint256 applicable = lastTimeRewardApplicable();
        uint256 dt = applicable - lastUpdateTime;
        if (dt > 0 && totalStaked > 0) {
            rewardsAccrued += dt * rewardRate;
        }
        rewardPerTokenStored = rewardPerToken();
        lastUpdateTime = applicable;
        if (account != address(0)) {
            accruedRewards[account] = earned(account);
            userRewardPerTokenPaid[account] = rewardPerTokenStored;
        }
    }

    function _pullReward(uint256 amount) internal returns (uint256 received) {
        uint256 beforeBalance = rewardToken.balanceOf(address(this));
        rewardToken.safeTransferFrom(msg.sender, address(this), amount);
        received = rewardToken.balanceOf(address(this)) - beforeBalance;
        if (received == 0) revert ZeroAmount();
    }

    function _payRenewalFee() internal {
        uint256 fee = IStakingPoolFactory(factory).renewalFee();
        if (msg.value < fee) revert FeeShort();
        if (fee > 0) {
            IStakingPoolFactory(factory).collectRenewalFee{value: fee}();
        }
        uint256 refund = msg.value - fee;
        if (refund > 0) {
            (bool ok,) = msg.sender.call{value: refund}("");
            if (!ok) revert RefundFailed();
        }
    }
}
