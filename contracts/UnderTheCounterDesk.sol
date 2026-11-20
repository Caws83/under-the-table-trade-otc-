// SPDX-License-Identifier: MIT
pragma solidity 0.8.27;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

/// @title UnderTheCounterDesk
/// @notice Escrowed OTC desk. Sellers lock an asset and buyers pay ETH or an ERC-20.
/// @dev `pricePerUnit` is the payment-asset amount, in raw units, for one whole sold token
///      (10^sellDecimals raw units). Settlement is atomic: the desk delivers the sold asset
///      and the payment, including fees, in the same transaction.
///      address(0) means the chain's native ETH.
contract UnderTheCounterDesk is Ownable2Step, ReentrancyGuard {
    using SafeERC20 for IERC20;

    address public constant NATIVE = address(0);
    uint256 public constant MAX_FEE_BPS = 300;
    string public constant name = "Under The Counter Desk";

    struct Offer {
        address seller;
        address sellToken;
        address payToken;
        address designatedBuyer;
        uint256 escrowed;
        uint256 filled;
        uint256 pricePerUnit;
        uint8 sellDecimals;
        uint8 payDecimals;
        bool wholeFill;
        bool active;
    }

    struct Trade {
        uint256 offerId;
        address buyer;
        address seller;
        address sellToken;
        address payToken;
        uint256 quantity;
        uint256 cost;
        uint256 sellFee;
        uint256 buyFee;
        uint256 pricePerUnit;
        uint256 timestamp;
    }

    Offer[] private _offers;
    Trade[] private _trades;
    mapping(address => uint256[]) private _sellerOffers;

    uint256 public sellFeeBps = 50;
    uint256 public buyFeeBps = 50;
    address public treasury;
    address public operator;
    uint256 public activeOfferCount;

    mapping(address => uint256) public escrowOf;
    mapping(address => uint256) public volumeOf;
    mapping(address => uint256) public feesOf;
    mapping(address => bool) public blacklisted;
    mapping(address => bool) private _volumeSeen;
    address[] private _volumeTokens;

    event OfferCreated(
        uint256 indexed offerId,
        address indexed seller,
        address sellToken,
        address payToken,
        uint256 amount,
        uint256 pricePerUnit,
        address designatedBuyer,
        bool wholeFill
    );
    event OfferFilled(
        uint256 indexed offerId,
        address indexed buyer,
        uint256 quantity,
        uint256 cost,
        uint256 sellFee,
        uint256 buyFee
    );
    event OfferCancelled(uint256 indexed offerId, address indexed caller, uint256 refunded);
    event PriceAdjusted(uint256 indexed offerId, uint256 newPrice);
    event FeesUpdated(uint256 sellFeeBps, uint256 buyFeeBps);
    event TreasuryUpdated(address indexed treasury);
    event OperatorUpdated(address indexed operator);
    event BlacklistUpdated(address indexed token, bool blocked);

    error ZeroAmount();
    error ZeroPrice();
    error ZeroCost();
    error ZeroAddress();
    error SameAsset();
    error Blacklisted();
    error BadToken();
    error NoCode();
    error NativeMismatch();
    error NotSeller();
    error Inactive();
    error NotBuyer();
    error InsufficientRemaining();
    error WholeFillRequired();
    error PriceTooHigh();
    error FeeTooHigh();
    error FeeCap();
    error PaymentShort();
    error EscrowProtected();
    error TransferFailed();

    constructor(address treasury_, address operator_) Ownable(msg.sender) {
        if (treasury_ == address(0) || operator_ == address(0)) revert ZeroAddress();
        treasury = treasury_;
        operator = operator_;
    }

    function offerCount() external view returns (uint256) {
        return _offers.length;
    }

    function tradeCount() external view returns (uint256) {
        return _trades.length;
    }

    function getOffer(uint256 id) external view returns (Offer memory) {
        return _offers[id];
    }

    function remaining(uint256 id) external view returns (uint256) {
        Offer storage offer = _offers[id];
        return offer.escrowed - offer.filled;
    }

    function getOffers(uint256 offset, uint256 limit) external view returns (Offer[] memory page) {
        return _sliceOffers(offset, limit);
    }

    function getTrades(uint256 offset, uint256 limit) external view returns (Trade[] memory page) {
        uint256 total = _trades.length;
        if (offset >= total || limit == 0) return new Trade[](0);
        uint256 end = offset + limit;
        if (end > total) end = total;
        page = new Trade[](end - offset);
        for (uint256 i = offset; i < end; i++) {
            page[i - offset] = _trades[i];
        }
    }

    function sellerOfferCount(address seller) external view returns (uint256) {
        return _sellerOffers[seller].length;
    }

    function sellerOfferId(address seller, uint256 index) external view returns (uint256) {
        return _sellerOffers[seller][index];
    }

    function volumeTokenCount() external view returns (uint256) {
        return _volumeTokens.length;
    }

    function volumeTokenAt(uint256 index) external view returns (address) {
        return _volumeTokens[index];
    }

    /// @notice Payment required to buy `quantity` of offer `id` at the current price and fees.
    function quote(uint256 id, uint256 quantity)
        public
        view
        returns (uint256 cost, uint256 sellFee, uint256 buyFee, uint256 sellerReceives, uint256 buyerPays)
    {
        Offer storage offer = _offers[id];
        uint256 scale = 10 ** uint256(offer.sellDecimals);
        cost = Math.mulDiv(quantity, offer.pricePerUnit, scale);
        sellFee = Math.mulDiv(cost, sellFeeBps, 10_000);
        buyFee = Math.mulDiv(cost, buyFeeBps, 10_000);
        sellerReceives = cost - sellFee;
        buyerPays = cost + buyFee;
    }

    function createOffer(
        address sellToken,
        address payToken,
        uint256 amount,
        uint256 pricePerUnit,
        address designatedBuyer,
        bool wholeFill
    ) external payable nonReentrant returns (uint256 id) {
        if (sellToken == payToken) revert SameAsset();
        if (amount == 0) revert ZeroAmount();
        if (pricePerUnit == 0) revert ZeroPrice();
        if (blacklisted[sellToken] || blacklisted[payToken]) revert Blacklisted();

        uint8 sellDecimals = _decimals(sellToken);
        uint8 payDecimals = _decimals(payToken);
        uint256 received;

        if (sellToken == NATIVE) {
            if (msg.value != amount) revert NativeMismatch();
            received = amount;
        } else {
            if (msg.value != 0) revert NativeMismatch();
            uint256 beforeBalance = IERC20(sellToken).balanceOf(address(this));
            IERC20(sellToken).safeTransferFrom(msg.sender, address(this), amount);
            received = IERC20(sellToken).balanceOf(address(this)) - beforeBalance;
            if (received == 0) revert ZeroAmount();
        }

        id = _offers.length;
        _offers.push(
            Offer({
                seller: msg.sender,
                sellToken: sellToken,
                payToken: payToken,
                designatedBuyer: designatedBuyer,
                escrowed: received,
                filled: 0,
                pricePerUnit: pricePerUnit,
                sellDecimals: sellDecimals,
                payDecimals: payDecimals,
                wholeFill: wholeFill,
                active: true
            })
        );
        escrowOf[sellToken] += received;
        _sellerOffers[msg.sender].push(id);
        activeOfferCount += 1;

        emit OfferCreated(id, msg.sender, sellToken, payToken, received, pricePerUnit, designatedBuyer, wholeFill);
    }

    function fill(
        uint256 id,
        uint256 quantity,
        uint256 maxPricePerUnit,
        uint256 maxSellFeeBps,
        uint256 maxBuyFeeBps
    ) external payable nonReentrant {
        Offer storage offer = _offers[id];
        if (!offer.active) revert Inactive();
        if (offer.designatedBuyer != address(0) && offer.designatedBuyer != msg.sender) revert NotBuyer();
        if (quantity == 0) revert ZeroAmount();

        uint256 left = offer.escrowed - offer.filled;
        if (quantity > left) revert InsufficientRemaining();
        if (offer.wholeFill && quantity != left) revert WholeFillRequired();
        if (offer.pricePerUnit > maxPricePerUnit) revert PriceTooHigh();
        if (sellFeeBps > maxSellFeeBps || buyFeeBps > maxBuyFeeBps) revert FeeTooHigh();

        (uint256 cost, uint256 sellFee, uint256 buyFee, uint256 sellerReceives, uint256 buyerPays) = quote(id, quantity);
        if (cost == 0) revert ZeroCost();

        offer.filled += quantity;
        escrowOf[offer.sellToken] -= quantity;
        if (offer.filled == offer.escrowed) {
            offer.active = false;
            activeOfferCount -= 1;
        }

        volumeOf[offer.payToken] += cost;
        feesOf[offer.payToken] += sellFee + buyFee;
        _noteVolumeToken(offer.sellToken);
        _noteVolumeToken(offer.payToken);
        _trades.push(
            Trade({
                offerId: id,
                buyer: msg.sender,
                seller: offer.seller,
                sellToken: offer.sellToken,
                payToken: offer.payToken,
                quantity: quantity,
                cost: cost,
                sellFee: sellFee,
                buyFee: buyFee,
                pricePerUnit: offer.pricePerUnit,
                timestamp: block.timestamp
            })
        );

        if (offer.sellToken == NATIVE) {
            _sendEth(msg.sender, quantity);
        } else {
            IERC20(offer.sellToken).safeTransfer(msg.sender, quantity);
        }

        if (offer.payToken == NATIVE) {
            if (msg.value < buyerPays) revert PaymentShort();
            if (sellerReceives > 0) _sendEth(offer.seller, sellerReceives);
            uint256 feeTotal = sellFee + buyFee;
            if (feeTotal > 0) _sendEth(treasury, feeTotal);
            uint256 refund = msg.value - buyerPays;
            if (refund > 0) _sendEth(msg.sender, refund);
        } else {
            if (msg.value != 0) revert NativeMismatch();
            _collectErc20Payment(offer.payToken, offer.seller, buyerPays, sellerReceives, sellFee + buyFee);
        }

        emit OfferFilled(id, msg.sender, quantity, cost, sellFee, buyFee);
    }

    function adjustPrice(uint256 id, uint256 newPrice) external {
        Offer storage offer = _offers[id];
        if (msg.sender != offer.seller) revert NotSeller();
        if (!offer.active) revert Inactive();
        if (newPrice == 0) revert ZeroPrice();
        offer.pricePerUnit = newPrice;
        emit PriceAdjusted(id, newPrice);
    }

    /// @notice Seller, operator, or owner may cancel. Unfilled escrow is returned to the seller.
    function cancel(uint256 id) external nonReentrant {
        Offer storage offer = _offers[id];
        if (!offer.active) revert Inactive();
        if (msg.sender != offer.seller && msg.sender != operator && msg.sender != owner()) revert NotSeller();

        uint256 refund = offer.escrowed - offer.filled;
        offer.active = false;
        activeOfferCount -= 1;
        escrowOf[offer.sellToken] -= refund;

        if (refund > 0) {
            if (offer.sellToken == NATIVE) _sendEth(offer.seller, refund);
            else IERC20(offer.sellToken).safeTransfer(offer.seller, refund);
        }

        emit OfferCancelled(id, msg.sender, refund);
    }

    function setSellFeeBps(uint256 bps) external onlyOwner {
        if (bps > MAX_FEE_BPS) revert FeeCap();
        sellFeeBps = bps;
        emit FeesUpdated(sellFeeBps, buyFeeBps);
    }

    function setBuyFeeBps(uint256 bps) external onlyOwner {
        if (bps > MAX_FEE_BPS) revert FeeCap();
        buyFeeBps = bps;
        emit FeesUpdated(sellFeeBps, buyFeeBps);
    }

    function setTreasury(address treasury_) external onlyOwner {
        if (treasury_ == address(0)) revert ZeroAddress();
        treasury = treasury_;
        emit TreasuryUpdated(treasury_);
    }

    function setOperator(address operator_) external onlyOwner {
        if (operator_ == address(0)) revert ZeroAddress();
        operator = operator_;
        emit OperatorUpdated(operator_);
    }

    function setBlacklisted(address token, bool blocked) external onlyOwner {
        blacklisted[token] = blocked;
        emit BlacklistUpdated(token, blocked);
    }

    /// @notice Recovers tokens that are not part of live escrow. Cannot seize listed inventory.
    function rescue(address token, address to, uint256 amount) external onlyOwner nonReentrant {
        if (to == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();
        uint256 balance = token == NATIVE ? address(this).balance : IERC20(token).balanceOf(address(this));
        if (balance < escrowOf[token] + amount) revert EscrowProtected();
        if (token == NATIVE) _sendEth(to, amount);
        else IERC20(token).safeTransfer(to, amount);
    }

    function _collectErc20Payment(
        address payToken,
        address seller,
        uint256 buyerPays,
        uint256 sellerReceives,
        uint256 feeTotal
    ) internal {
        uint256 beforeBalance = IERC20(payToken).balanceOf(address(this));
        IERC20(payToken).safeTransferFrom(msg.sender, address(this), buyerPays);
        uint256 received = IERC20(payToken).balanceOf(address(this)) - beforeBalance;
        if (received != buyerPays) revert PaymentShort();
        if (sellerReceives > 0) IERC20(payToken).safeTransfer(seller, sellerReceives);
        if (feeTotal > 0) IERC20(payToken).safeTransfer(treasury, feeTotal);
    }

    function _decimals(address token) internal view returns (uint8) {
        if (token == NATIVE) return 18;
        if (token.code.length == 0) revert NoCode();
        try IERC20Metadata(token).decimals() returns (uint8 decimals_) {
            if (decimals_ > 18) revert BadToken();
            return decimals_;
        } catch {
            revert BadToken();
        }
    }

    function _noteVolumeToken(address token) internal {
        if (_volumeSeen[token]) return;
        _volumeSeen[token] = true;
        _volumeTokens.push(token);
    }

    function _sendEth(address to, uint256 amount) internal {
        (bool ok,) = to.call{value: amount}("");
        if (!ok) revert TransferFailed();
    }

    function _sliceOffers(uint256 offset, uint256 limit) internal view returns (Offer[] memory page) {
        uint256 total = _offers.length;
        if (offset >= total || limit == 0) return new Offer[](0);
        uint256 end = offset + limit;
        if (end > total) end = total;
        page = new Offer[](end - offset);
        for (uint256 i = offset; i < end; i++) {
            page[i - offset] = _offers[i];
        }
    }
}
