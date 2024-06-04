// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.19;

import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {EnumerableSet} from "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

import {IUNCX_LiquidityLocker_UniV3} from "./IUNCX_LiquidityLocker_UniV3.sol";

// Allows overriding locker fees with a special promo key

contract FeeResolver is Ownable2Step {
    using EnumerableSet for EnumerableSet.AddressSet;

    address public A_SIGNER; // this signer can set fees as low as zero (admin)
    address public B_SIGNER; // this signer cannot set fees below a certain threshold (sales team)

    // a unique salt added to the start of a signature hash (must include chainId, contractId, at bare minimum). Similar to domain seperators
    // ensures signatures are unique per chain, and destination contract.
    bytes32 public HASH_PREFIX;

    // 10 = 0.1%, 100 = 1%, 10,000 = 100%
    uint256 public LP_MIN = 30; // the minimum lp fee B_SIGNER can set
    uint256 public COLLECT_MIN = 30; // the minimum collect fee B_SIGNER can set

    mapping(bytes32 => bool) public NONCE_USED;
    bool public ENABLED = true;
    address public LOCKER;

    EnumerableSet.AddressSet private FLAT_FEE_WHITELIST;

    struct SettingsStruct {
        address aSigner;
        address bSigner;
        bytes32 hashPrefix;
        uint256 lpMin;
        uint256 collectMin;
        bool enabled;
    }

    constructor(address _UNCX_UniswapV3Locker, address _aSigner, address _bSigner) {
        LOCKER = _UNCX_UniswapV3Locker;
        A_SIGNER = _aSigner;
        B_SIGNER = _bSigner;
        // Initialise this contract with a unique HashPrefix per chain and contract address
        HASH_PREFIX = keccak256(abi.encode(block.chainid, address(this)));
    }

    /**
    * @notice whitelisted accounts dont pay flatrate fees on locking
    */
    function whitelistFeeAccount(address _address, bool _add) public onlyOwner {
        if (_add) {
            FLAT_FEE_WHITELIST.add(_address);
        } else {
            FLAT_FEE_WHITELIST.remove(_address);
        }
    }

    function getFeeWhitelistLength () external view returns (uint256) {
        return FLAT_FEE_WHITELIST.length();
    }
    
    function getFeeWhitelistAddressAtIndex (uint256 _index) external view returns (address) {
        return FLAT_FEE_WHITELIST.at(_index);
    }
    
    function addressIsFlatFeeWhitelisted (address _address) external view returns (bool) {
        return FLAT_FEE_WHITELIST.contains(_address);
    }

    // one call to get all settings for UI
    function getSettings() external view returns (SettingsStruct memory settings) {
        settings.aSigner = A_SIGNER;
        settings.bSigner = B_SIGNER;
        settings.hashPrefix = HASH_PREFIX;
        settings.lpMin = LP_MIN;
        settings.collectMin = COLLECT_MIN;
        settings.enabled = ENABLED;
    }

    function setHashPrefix (bytes32 _hashPrefix) external onlyOwner {
        HASH_PREFIX = _hashPrefix;
    }

    function setMinThresholds (uint256 _lpMin, uint256 _collectMin) external onlyOwner {
        LP_MIN = _lpMin;
        COLLECT_MIN = _collectMin;
    }

    function setASigner (address _signer) external onlyOwner {
        A_SIGNER = _signer;
    }

    function setBSigner (address _signer) external onlyOwner {
        B_SIGNER = _signer;
    }

    function setEnabled (bool _enabled) external onlyOwner {
        ENABLED = _enabled;
    }

    // For reference of the non bytes way to validate
    /* function validateSignatureNativeType(bytes32 _referralCode, uint256 _lpFee, uint256 _collectFee, bytes memory signature) public view returns (bool) {
        bytes32 messageHash = keccak256(abi.encodePacked(_referralCode, _lpFee, _collectFee));
        bytes32 prefixedHash = ECDSA.toEthSignedMessageHash(messageHash);
        address signer = ECDSA.recover(prefixedHash, signature);
        return (signer == SIGNER);
    } */

    function concatBytes(bytes[] memory args)
        public
        view
        returns (bytes memory encoded)
    {
        encoded = bytes.concat(encoded, HASH_PREFIX);
        for (uint256 i = 0; i < args.length - 1; i++) {
            encoded = bytes.concat(encoded, args[i]);
        }
    }

    function validateSignature (bytes[] memory args, address requiredSigner) public view {
        bytes32 messageHash = keccak256(concatBytes(args));
        bytes32 prefixedHash = ECDSA.toEthSignedMessageHash(messageHash);
        address signer = ECDSA.recover(prefixedHash, args[args.length - 1]);
        require(signer == requiredSigner, "R sig");
    }

    // public getter
    function getFee(bytes[] memory args) public view returns (IUNCX_LiquidityLocker_UniV3.FeeStruct memory) {
        bytes32 nonce = abi.decode(args[0], (bytes32));

        require(args.length == 6, "R Length");
        require(NONCE_USED[nonce] != true, "R used");
        require(ENABLED, "R not enabled");

        uint256 lpFee = abi.decode(args[2], (uint256));
        uint256 collectFee = abi.decode(args[3], (uint256));

        if (abi.decode(args[1], (bool))) {
            validateSignature(args, A_SIGNER);
        } else {
            require(lpFee >= LP_MIN && collectFee >= COLLECT_MIN, "R threshold");
            validateSignature(args, B_SIGNER);
        }

        IUNCX_LiquidityLocker_UniV3.FeeStruct memory newFee;
        newFee.lpFee = lpFee;
        newFee.collectFee = collectFee;
        return newFee;
    }

    // public setter (uses the nonce if it succeeds)
    // [0] bytes32 = single use nonce (prevents replays on same chain)
    // [1] bool = signerA (true = A_SIGNER; false = B_SIGNER)
    // [2] uint256 = lp fee
    // [3] uint256 = collect fee
    // [4] address = user
    // [5] bytes = signature
    function useFee(bytes[] memory args, address sender) external returns (IUNCX_LiquidityLocker_UniV3.FeeStruct memory fee) {
        require(msg.sender == LOCKER, "SENDER NOT LOCKER");
        if (FLAT_FEE_WHITELIST.contains(sender)) {
            fee = IUNCX_LiquidityLocker_UniV3(LOCKER).getFee(abi.decode(args[0], (string)));
            fee.flatFee = 0;
        } else {
            require(sender == abi.decode(args[4], (address)), "MSG.SENDER");
            bytes32 nonce = abi.decode(args[0], (bytes32));
            fee = getFee(args);
            NONCE_USED[nonce] = true;
        }
    }
}