// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {IERC2981} from "@openzeppelin/contracts/interfaces/IERC2981.sol";
import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import {HorsePacked} from "./HorsePacked.sol";

/// @title HorseNFT
/// @notice One token per horse, minted only from a covering the game has already consumed.
///         The game server holds the only mint and burn role; the chain is the registry.
contract HorseNFT is ERC721, IERC2981 {
        uint96 public constant ROYALTY_BPS = 200; // 2% to the breeder, forever

    address public immutable server;
    uint256 public nextId = 1;
    uint256 public lastNonce;

    /// @dev nullifier -> consumed. A covering can only ever produce one horse.
    mapping(bytes32 => bool) public spent;
    /// @dev the animal, kept even after the burn: children point at their sire forever.
    mapping(uint256 => uint256) public coreOf;
    mapping(uint256 => address) public creatorOf;
    mapping(uint256 => bool) public burned;

    event HorseMinted(uint256 indexed tokenId, address indexed to, bytes32 nullifier, address creator, uint256 core);
    event HorseBurned(uint256 indexed tokenId, address indexed owner, uint256 appraisal);

    error AlreadySpent();
    error NotServer();
    error StaleNonce();

    constructor(address server_) ERC721("Studbook Horse", "STUD") {
        require(server_ != address(0), "server required");
        server = server_;
    }

    modifier onlyServer() {
        if (msg.sender != server) revert NotServer();
        _;
    }

    /// @notice Mint the foal of a consumed covering.
    /// @param to owner; @param core the packed animal; @param creator the stable that bred it;
    /// @param nullifier keccak(coveringId, stableId, season); @param nonce monotonic per server.
    function mint(
        address to,
        uint256 core,
        address creator,
        bytes32 nullifier,
        uint256 nonce,
        bytes calldata signature
    ) external returns (uint256 tokenId) {
        if (spent[nullifier]) revert AlreadySpent();
        if (nonce <= lastNonce) revert StaleNonce();
        require(to != address(0), "no owner");
        require(HorsePacked.genomeFits(HorsePacked.genome(core)), "genome out of range");
        require(creator != address(0), "creator required");

        bytes32 digest = MessageHashUtils.toEthSignedMessageHash(
            keccak256(abi.encode(address(this), block.chainid, to, core, creator, nullifier, nonce))
        );
        require(ECDSA.recover(digest, signature) == server, "bad signature");

        spent[nullifier] = true;
        lastNonce = nonce;

        tokenId = nextId++;
        coreOf[tokenId] = core;
        creatorOf[tokenId] = creator;
        _mint(to, tokenId);

        emit HorseMinted(tokenId, to, nullifier, creator, core);
    }

    /// @notice The house takes the horse: supply leaves, history stays.
    function burn(uint256 tokenId, uint256 appraisal) external onlyServer {
        address owner = ownerOf(tokenId);
        burned[tokenId] = true; // coreOf and creatorOf are deliberately kept
        _burn(tokenId);
        emit HorseBurned(tokenId, owner, appraisal);
    }

    /// @notice Phenotype is derived off-chain; the contract only answers what the animal is.
    function genomeOf(uint256 tokenId) external view returns (uint256) {
        return coreOf[tokenId];
    }

    function isBurned(uint256 tokenId) external view returns (bool) {
        return burned[tokenId];
    }

    function royaltyInfo(uint256 tokenId, uint256 salePrice)
        external
        view
        override
        returns (address receiver, uint256 amount)
    {
        receiver = creatorOf[tokenId];
        amount = (salePrice * ROYALTY_BPS) / 10_000;
    }

    function supportsInterface(bytes4 interfaceId) public view override(ERC721, IERC165) returns (bool) {
        return interfaceId == type(IERC2981).interfaceId || super.supportsInterface(interfaceId);
    }
}
