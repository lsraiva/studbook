// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ERC1155} from "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";

/// @title CoveringToken
/// @notice A covering is a frozen straw: five per stallion per season, one series per vintage.
///         Using it in a breed burns it — that burn is the nullifier the mint depends on.
contract CoveringToken is ERC1155 {
    uint256 public constant PER_SEASON = 5;

    address public immutable server;
    mapping(uint256 => uint256) public minted; // series id -> minted so far

    event CoveringMinted(uint256 indexed id, address indexed to, uint32 sireId, uint16 vintage, uint256 amount);
    event CoveringBurned(uint256 indexed id, address indexed from, uint256 amount);

    error NotServer();

    constructor(address server_) ERC1155("https://studbook.example/covering/{id}.json") {
        require(server_ != address(0), "server required");
        server = server_;
    }

    modifier onlyServer() {
        if (msg.sender != server) revert NotServer();
        _;
    }

    /// @notice Series id: stallion in the high bits, season in the low eight.
    function idOf(uint32 sireId, uint16 vintage) public pure returns (uint256) {
        return (uint256(sireId) << 8) | uint256(vintage);
    }

    function mint(address to, uint32 sireId, uint16 vintage, uint256 amount) external onlyServer {
        uint256 id = idOf(sireId, vintage);
        require(minted[id] + amount <= PER_SEASON, "five a season");
        minted[id] += amount;
        _mint(to, id, amount, "");
        emit CoveringMinted(id, to, sireId, vintage, amount);
    }

    /// @notice Spend it on a mare: the series cannot be spent twice.
    function burn(address from, uint32 sireId, uint16 vintage, uint256 amount) external onlyServer {
        uint256 id = idOf(sireId, vintage);
        _burn(from, id, amount);
        emit CoveringBurned(id, from, amount);
    }
}
