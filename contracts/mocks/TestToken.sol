// SPDX-License-Identifier: MIT
pragma solidity 0.8.27;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice Mintable ERC-20 used for local tests and the local Robinhood fork.
///         The deployer is the only minter. This token is not a production asset.
contract TestToken is ERC20 {
    address public immutable minter;
    uint8 private immutable _customDecimals;

    error NotMinter();

    constructor(string memory tokenName, string memory tokenSymbol, uint8 decimals_) ERC20(tokenName, tokenSymbol) {
        minter = msg.sender;
        _customDecimals = decimals_;
    }

    function decimals() public view override returns (uint8) {
        return _customDecimals;
    }

    function mint(address to, uint256 amount) external {
        if (msg.sender != minter) revert NotMinter();
        _mint(to, amount);
    }
}
