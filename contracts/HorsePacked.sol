// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @title HorsePacked
/// @notice The token's core word. A horse is 48 bits of genotype plus the pedigree that makes it
///         a lineage; together they are 160 bits, so one uint256 holds the whole animal.
///         Layout, low bit first:
///           genome 48 | lineage 8 | sex 8 | bornSeason 16 | sireId 32 | damId 32 | rulesVersion 16
///         assets/token.js packs the same word, and tests/token.test.mjs holds the vectors.
library HorsePacked {
    uint256 internal constant GENOME_BITS = 48;
    uint256 internal constant LINEAGE_BITS = 8;
    uint256 internal constant SEX_BITS = 8;
    uint256 internal constant SEASON_BITS = 16;
    uint256 internal constant ID_BITS = 32;
    uint256 internal constant RULES_BITS = 16;

    function pack(
        uint64 genome_,
        uint8 lineage_,
        uint8 sex_,
        uint16 bornSeason_,
        uint32 sireId_,
        uint32 damId_,
        uint16 rulesVersion_
    ) internal pure returns (uint256 core) {
        require(genomeFits(genome_), "genome overflows 48 bits");
        core = uint256(genome_);
        core |= uint256(lineage_) << 48;
        core |= uint256(sex_) << 56;
        core |= uint256(bornSeason_) << 64;
        core |= uint256(sireId_) << 80;
        core |= uint256(damId_) << 112;
        core |= uint256(rulesVersion_) << 144;
    }

    function genome(uint256 core) internal pure returns (uint64) {
        return uint64(core & ((1 << GENOME_BITS) - 1));
    }

    function lineage(uint256 core) internal pure returns (uint8) {
        return uint8((core >> 48) & 0xff);
    }

    function sex(uint256 core) internal pure returns (uint8) {
        return uint8((core >> 56) & 0xff);
    }

    function bornSeason(uint256 core) internal pure returns (uint16) {
        return uint16((core >> 64) & 0xffff);
    }

    function sireId(uint256 core) internal pure returns (uint32) {
        return uint32((core >> 80) & 0xffffffff);
    }

    function damId(uint256 core) internal pure returns (uint32) {
        return uint32((core >> 112) & 0xffffffff);
    }

    function rulesVersion(uint256 core) internal pure returns (uint16) {
        return uint16((core >> 144) & 0xffff);
    }

    /// @notice A genome is 24 alleles of two bits, so 48 bits is the whole space.
    function genomeFits(uint64 genome_) internal pure returns (bool) {
        return genome_ < (1 << GENOME_BITS);
    }
}
