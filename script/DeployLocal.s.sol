// SPDX-License-Identifier: MIT
pragma solidity 0.8.27;

import {Script, console2} from "forge-std/Script.sol";
import {UnderTheCounterDesk} from "../contracts/UnderTheCounterDesk.sol";
import {StakingPoolFactory} from "../contracts/StakingPoolFactory.sol";
import {TestToken} from "../contracts/mocks/TestToken.sol";

/// @notice Deploys the desk, the staking factory, and two local test tokens.
///         Requires PRIVATE_KEY of the local Anvil deployer. Never point this at mainnet.
contract DeployLocal is Script {
    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(pk);
        address second = vm.envOr("SECOND_ACCOUNT", address(0x70997970C51812dc3A010C7d01b50e0d17dc79C8));

        vm.startBroadcast(pk);

        TestToken stake = new TestToken("Counter Stake", "STAKE", 18);
        TestToken pay = new TestToken("Counter Pay", "PAY", 18);
        UnderTheCounterDesk desk = new UnderTheCounterDesk(deployer, deployer);
        StakingPoolFactory factory = new StakingPoolFactory(deployer, 0.01 ether, 0.005 ether);

        stake.mint(deployer, 1_000_000 ether);
        stake.mint(second, 1_000_000 ether);
        pay.mint(deployer, 1_000_000 ether);
        pay.mint(second, 1_000_000 ether);

        vm.stopBroadcast();

        console2.log("DESK %s", address(desk));
        console2.log("FACTORY %s", address(factory));
        console2.log("STAKE %s", address(stake));
        console2.log("PAY %s", address(pay));
        console2.log("DEPLOYER %s", deployer);
    }
}
