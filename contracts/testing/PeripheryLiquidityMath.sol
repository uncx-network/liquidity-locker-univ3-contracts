

pragma solidity 0.8.19;

import "../v1/IUNCX_ProofOfReservesUniV3.sol";
import "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";

interface IPancakeV3Pool {
  function slot0()
    external
    view
    returns (
        uint160 sqrtPriceX96,
        int24 tick,
        uint16 observationIndex,
        uint16 observationCardinality,
        uint16 observationCardinalityNext,
        uint32 feeProtocol,
        bool unlocked
    );
}

contract PeripheryLiquidityMath {

  /**
  * @dev convenience function to get a locks liquidity in amounts of token0 and token1 just with a _lockId
  * Only works on exact forks of Uniswap V3
  */
  function getLiquidityForLock (IUNCX_ProofOfReservesUniV3 POR, uint256 _lockId) external view returns (uint256 amount0, uint256 amount1, address token0, address token1, uint128 liquidity) {
      IUNCX_ProofOfReservesUniV3.Lock memory _lock = POR.getLock(_lockId);

      (,, address _token0, address _token1,, int24 tickLower, int24 tickUpper, uint128 _liquidity,,,,) = _lock.nftPositionManager.positions(_lock.nft_id);
      (,int24 currentTick,,,,,) = IUniswapV3Pool(_lock.pool).slot0();
      (amount0, amount1) = POR.getAmountsForLiquidity(currentTick, tickLower, tickUpper, _liquidity);
      token0 = _token0;
      token1 = _token1;
      liquidity = _liquidity;
  }

  // same as above but for PCS
  function getLiquidityForLockPCS (IUNCX_ProofOfReservesUniV3 POR, uint256 _lockId) external view returns (uint256 amount0, uint256 amount1, address token0, address token1, uint128 liquidity) {
      IUNCX_ProofOfReservesUniV3.Lock memory _lock = POR.getLock(_lockId);

      (,, address _token0, address _token1,, int24 tickLower, int24 tickUpper, uint128 _liquidity,,,,) = _lock.nftPositionManager.positions(_lock.nft_id);
      (,int24 currentTick,,,,,) = IPancakeV3Pool(_lock.pool).slot0();
      (amount0, amount1) = POR.getAmountsForLiquidity(currentTick, tickLower, tickUpper, _liquidity);
      token0 = _token0;
      token1 = _token1;
      liquidity = _liquidity;
  }
}