// SPDX-License-Identifier: UNLICENSED
// Code Author: UNCX by SDDTech

pragma solidity 0.8.19;

import {IERC721Receiver} from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {INonfungiblePositionManager} from "../uniswap-updated/INonfungiblePositionManager.sol";
import {TransferHelper} from "@uniswap/v3-periphery/contracts/libraries/TransferHelper.sol";
import {IUniswapV3Factory} from "@uniswap/v3-core/contracts/interfaces/IUniswapV3Factory.sol";
import {IUNCX_LiquidityLocker_UniV3} from "../IUNCX_LiquidityLocker_UniV3.sol";

contract FullRangeConvertorV2 is IERC721Receiver, ReentrancyGuard {

    IUNCX_LiquidityLocker_UniV3 public UNIV3_LOCKER;

    struct ConversionData {
      uint256 newNftId;
      uint256 amountLiquidity0;
      uint256 amountLiquidity1;
      uint256 refund0;
      uint256 refund1;
    }

    struct SlippageChecks {
      uint256 amount0LiquidityMin;
      uint256 amount1LiquidityMin;
      uint256 amount0RefundMin;
      uint256 amount1RefundMin;
    }

    constructor(IUNCX_LiquidityLocker_UniV3 _univ3_locker) {
      UNIV3_LOCKER = _univ3_locker;
    }

    function convertToFullRangeAndLock (
        IUNCX_LiquidityLocker_UniV3.LockParams memory _lockParams, 
        SlippageChecks memory _slippageParams
      ) external payable nonReentrant returns (
        uint256 newLockId,
        uint256 amountLiquidity0,
        uint256 amountLiquidity1,
        uint256 refund0,
        uint256 refund1
        ) {

      _lockParams.nftPositionManager.safeTransferFrom(msg.sender, address(this), _lockParams.nft_id);

      (bool isFullRange, int24 maxTick) = getRangeAndMaxTick(_lockParams.nftPositionManager, _lockParams.nft_id);
      
      ConversionData memory conversionData;
      if (isFullRange) {
        conversionData.newNftId = _lockParams.nft_id;
      } else {
        // convert the position to full range by minting a new full range NFT
        require(_slippageParams.amount0LiquidityMin > 0 && _slippageParams.amount1LiquidityMin > 0, 'Liquidity slippage must be > 0');
        conversionData = _convertPositionToFullRange(_lockParams.nftPositionManager, _lockParams.nft_id, maxTick, _lockParams.dustRecipient, _slippageParams.amount0LiquidityMin, _slippageParams.amount1LiquidityMin);
      }
      require(conversionData.refund0 >= _slippageParams.amount0RefundMin && conversionData.refund1 >= _slippageParams.amount1RefundMin, 'Refund slippage check');
      
      _lockParams.nftPositionManager.approve(address(UNIV3_LOCKER), conversionData.newNftId);
      _lockParams.nft_id = conversionData.newNftId;
      newLockId = UNIV3_LOCKER.lock{value: msg.value}(_lockParams);
      return (newLockId, conversionData.amountLiquidity0, conversionData.amountLiquidity1, conversionData.refund0, conversionData.refund1);
    }

    function getRangeAndMaxTick (INonfungiblePositionManager _nftPositionManager, uint256 _nftId) public view returns (bool _isFullRange, int24 _maxTick) {
      INonfungiblePositionManager.Position memory position;
      (
        , // nonce
        , // operator
        , // token0
        , // token1
        position.fee, // fee
        position.tickLower, // tickLower
        position.tickUpper, // tickUpper
        , // liquidity
        , // feeGrowthInside0LastX128
        , // feeGrowthInside1LastX128
        , // tokensOwed0
          // tokensOwed1
      ) = _nftPositionManager.positions(_nftId);

      IUniswapV3Factory factory = IUniswapV3Factory(_nftPositionManager.factory());
      _maxTick = tickSpacingToMaxTick(factory.feeAmountTickSpacing(position.fee));
      
      if (position.tickLower == -_maxTick && position.tickUpper == _maxTick) {
        _isFullRange = true;
      } else {
        _isFullRange = false;
      }
    }

    function _convertPositionToFullRange (
        INonfungiblePositionManager _nftPositionManager,
        uint256 _tokenId, 
        int24 _maxTick, 
        address _dustRecipient, 
        uint256 _amount0LiquidityMin, 
        uint256 _amount1LiquidityMin
      ) private returns (
          ConversionData memory
        ) {
        INonfungiblePositionManager.MintParams memory mintParams;
        uint128 positionLiquidity;
        (
          , // nonce
          , // operator
          mintParams.token0, // token0
          mintParams.token1, // token1
          mintParams.fee, // fee
          , // tickLower
          , // tickUpper
          positionLiquidity,
          , // feeGrowthInside0LastX128
          , // feeGrowthInside1LastX128
          , // tokensOwed0
           // tokensOwed1
        ) = _nftPositionManager.positions(_tokenId);

        _nftPositionManager.decreaseLiquidity(INonfungiblePositionManager.DecreaseLiquidityParams(_tokenId, positionLiquidity, 0, 0, block.timestamp));
        _nftPositionManager.collect(INonfungiblePositionManager.CollectParams(_tokenId, address(this), type(uint128).max, type(uint128).max));

        mintParams.tickLower = -_maxTick;
        mintParams.tickUpper = _maxTick;
        mintParams.amount0Desired = IERC20(mintParams.token0).balanceOf(address(this));
        mintParams.amount1Desired = IERC20(mintParams.token1).balanceOf(address(this));
        mintParams.amount0Min = _amount0LiquidityMin;
        mintParams.amount1Min = _amount1LiquidityMin;
        mintParams.recipient = address(this);
        mintParams.deadline = block.timestamp;

        TransferHelper.safeApprove(mintParams.token0, address(_nftPositionManager), mintParams.amount0Desired);
        TransferHelper.safeApprove(mintParams.token1, address(_nftPositionManager), mintParams.amount1Desired);

        ConversionData memory conversionData;
        (conversionData.newNftId,, conversionData.amountLiquidity0, conversionData.amountLiquidity1) = _nftPositionManager.mint(mintParams);

        _nftPositionManager.burn(_tokenId);

        // Refund the tokens which dont fit into full range liquidity
        conversionData.refund0 = IERC20(mintParams.token0).balanceOf(address(this));
        conversionData.refund1 = IERC20(mintParams.token1).balanceOf(address(this));
        if (conversionData.refund0 > 0) {
            TransferHelper.safeTransfer(mintParams.token0, _dustRecipient, conversionData.refund0);
        }
        if (conversionData.refund1 > 0) {
            TransferHelper.safeTransfer(mintParams.token1, _dustRecipient, conversionData.refund1);
        }
        return (conversionData);
    }

    /**
    * @dev gets the maximum tick for a tickSpacing
    * source: https://github.com/Uniswap/v3-core/blob/main/contracts/libraries/Tick.sol
    */
    function tickSpacingToMaxTick(int24 tickSpacing) public pure returns (int24 maxTick) {
        maxTick = (887272 / tickSpacing) * tickSpacing;
    }

    function onERC721Received(
        address operator,
        address from,
        uint256 tokenId,
        bytes calldata data
    ) external override returns (bytes4) {
        return IERC721Receiver.onERC721Received.selector;
    }
}