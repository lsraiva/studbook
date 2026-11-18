// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {IERC1155} from "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

/// @title HorseMarket
/// @notice Custody and price. Listing a horse escorts it out of the yard, exactly as the game does,
///         so a listed horse cannot race, breed or be entered. Money is GNS, which lives in the
///         game's ledger: settlement arrives as a voucher signed by the server, and the contract
///         moves the asset. Two fees ride on every sale: the market rake and the breeder's royalty.
contract HorseMarket {
    uint256 public constant RAKE_BPS = 500;     // 5% to the treasury
    uint256 public constant ROYALTY_BPS = 200;  // 2% to the breeder
    uint256 public constant DECAY_BPS = 7500;   // 0.75 per season on a stale lot
    uint256 public constant FLOOR = 20;

    IERC721 public immutable horses;
    IERC1155 public immutable coverings;
    address public immutable treasury;
    address public immutable server;

    struct Listing {
        address seller;
        uint256 price;
        uint16 season;
        bool active;
    }

    mapping(uint256 => Listing) public horseLots;          // tokenId -> lot
    mapping(uint256 => Listing) public coveringLots;       // series id -> lot
    mapping(uint256 => uint256) public coveringAmount;     // series id -> units in escrow
    uint256 public lastSettlementNonce;

    event Listed(uint256 indexed id, address indexed seller, uint256 price, uint16 season);
    event Delisted(uint256 indexed id, address indexed seller);
    event Sold(
        uint256 indexed id,
        bool indexed isCovering,
        address buyer,
        address seller,
        uint256 price,
        uint256 fee,
        uint256 royalty
    );

    error NotSeller();
    error NotListed();
    error StaleNonce();
    error BadVoucher();

    constructor(IERC721 horses_, IERC1155 coverings_, address treasury_, address server_) {
        horses = horses_;
        coverings = coverings_;
        treasury = treasury_;
        server = server_;
    }

    /* ------------------------------------------------------------------ price */

    /// @notice A lot marks down 25% a season until it clears, with a floor.
    function currentPrice(uint256 price, uint16 listedSeason, uint16 nowSeason) public pure returns (uint256) {
        uint256 p = price;
        for (uint16 s = listedSeason; s < nowSeason; s++) {
            p = (p * DECAY_BPS) / 10_000;
        }
        return p < FLOOR ? FLOOR : p;
    }

    /// @notice The split the seller can check before signing. Parts always sum to the price.
    function quote(uint256 price)
        public
        pure
        returns (uint256 fee, uint256 royalty, uint256 toSeller)
    {
        fee = (price * RAKE_BPS) / 10_000;
        royalty = (price * ROYALTY_BPS) / 10_000;
        toSeller = price - fee - royalty;
    }

    /* ---------------------------------------------------------------- horses */

    function listHorse(uint256 tokenId, uint256 price) external {
        require(price >= FLOOR, "under the floor");
        horses.transferFrom(msg.sender, address(this), tokenId);
        horseLots[tokenId] = Listing(msg.sender, price, 0, true);
        emit Listed(tokenId, msg.sender, price, 0);
    }

    function listHorseAt(uint256 tokenId, uint256 price, uint16 season) external {
        require(price >= FLOOR, "under the floor");
        horses.transferFrom(msg.sender, address(this), tokenId);
        horseLots[tokenId] = Listing(msg.sender, price, season, true);
        emit Listed(tokenId, msg.sender, price, season);
    }

    function cancelHorse(uint256 tokenId) external {
        Listing memory lot = horseLots[tokenId];
        if (!lot.active || lot.seller != msg.sender) revert NotSeller();
        delete horseLots[tokenId];
        horses.transferFrom(address(this), msg.sender, tokenId);
        emit Delisted(tokenId, msg.sender);
    }

    function buyHorse(uint256 tokenId, address buyer, uint256 paid, uint16 season, uint256 nonce, bytes calldata voucher)
        external
    {
        Listing memory lot = horseLots[tokenId];
        if (!lot.active) revert NotListed();
        uint256 price = currentPrice(lot.price, lot.season, season);
        require(paid == price, "voucher must match the price");
        _verify(voucher, nonce, keccak256(abi.encode(address(this), tokenId, true, buyer, paid, season)));

        delete horseLots[tokenId];
        (uint256 fee, uint256 royalty, ) = quote(price);
        horses.transferFrom(address(this), buyer, tokenId);
        emit Sold(tokenId, true, buyer, lot.seller, price, fee, royalty);
    }

    /* ------------------------------------------------------------- coverings */

    function listCovering(uint256 id, uint256 amount, uint256 price, uint16 season) external {
        coverings.safeTransferFrom(msg.sender, address(this), id, amount, "");
        coveringAmount[id] += amount;
        coveringLots[id] = Listing(msg.sender, price, season, true);
        emit Listed(id, msg.sender, price, season);
    }

    function buyCovering(uint256 id, address buyer, uint256 paid, uint16 season, uint256 nonce, bytes calldata voucher)
        external
    {
        Listing memory lot = coveringLots[id];
        if (!lot.active) revert NotListed();
        uint256 price = currentPrice(lot.price, lot.season, season);
        require(paid == price, "voucher must match the price");
        _verify(voucher, nonce, keccak256(abi.encode(address(this), id, false, buyer, paid, season)));

        uint256 amount = coveringAmount[id];
        delete coveringLots[id];
        delete coveringAmount[id];
        (uint256 fee, , ) = quote(price);
        coverings.safeTransferFrom(address(this), buyer, id, amount, "");
        emit Sold(id, false, buyer, lot.seller, price, fee, 0);
    }

    /* -------------------------------------------------------------- vouchers */

    function _verify(bytes calldata voucher, uint256 nonce, bytes32 subject) internal {
        if (nonce <= lastSettlementNonce) revert StaleNonce();
        bytes32 digest = MessageHashUtils.toEthSignedMessageHash(keccak256(abi.encode(subject, nonce)));
        if (ECDSA.recover(digest, voucher) != server) revert BadVoucher();
        lastSettlementNonce = nonce;
    }
}
