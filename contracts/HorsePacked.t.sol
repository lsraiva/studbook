// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {HorsePacked} from "../HorsePacked.sol";

/// @notice The same vector tests/token.test.mjs asserts, so the two packers cannot drift.
contract HorsePackedTest is Test {
    function testVector() public pure {
        uint256 core = HorsePacked.pack(0x3F0F0FF00FF, 3, 1, 7, 12, 34, 2);
        assertEq(core, 0x2000000220000000c0007010303f0f0ff00ff);

        assertEq(HorsePacked.genome(core), 0x3F0F0FF00FF);
        assertEq(HorsePacked.lineage(core), 3);
        assertEq(HorsePacked.sex(core), 1);
        assertEq(HorsePacked.bornSeason(core), 7);
        assertEq(HorsePacked.sireId(core), 12);
        assertEq(HorsePacked.damId(core), 34);
        assertEq(HorsePacked.rulesVersion(core), 2);
    }
}
