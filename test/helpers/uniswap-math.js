import bn from 'bignumber.js'
// import { ethers } from 'hardhat';
import JSBI from 'jsbi'
import { computePoolAddress, Pool, Position, nearestUsableTick, TickMath, SqrtPriceMath } from '@uniswap/v3-sdk'
import IUniswapV3PoolABI from '@uniswap/v3-core/artifacts/contracts/interfaces/IUniswapV3Pool.sol/IUniswapV3Pool.json' assert { type: "json" }

// const { BigNumber, BigNumberish } = pkg;

bn.config({ EXPONENTIAL_AT: 999999, DECIMAL_PLACES: 40 })

// returns the sqrt price as a 64x96
function encodePriceSqrt(reserve1, reserve0) {
  return hre.ethers.BigNumber.from(
    new bn(reserve1.toString())
      .div(reserve0.toString())
      .sqrt()
      .multipliedBy(new bn(2).pow(96))
      .integerValue(3)
      .toString()
  )
}

function sortTokens(tokenA, tokenB) {
  return tokenA.target.toLowerCase() < tokenB.target.toLowerCase() ? [tokenA, tokenB] : [tokenB, tokenA]
}

// refactored amount0() from uniswap SDK
// https://github.com/Uniswap/v3-sdk/blob/main/src/entities/position.ts
// Retuns the amount0 tokens of a position
function positionAmount0(slot0, position) {
  if (slot0.tick < position.tickLower) {
    return SqrtPriceMath.getAmount0Delta(
      TickMath.getSqrtRatioAtTick(position.tickLower),
      TickMath.getSqrtRatioAtTick(position.tickUpper),
      JSBI.BigInt(position.liquidity),
      false
    )
  } else if (slot0.tick < position.tickUpper) {
    return SqrtPriceMath.getAmount0Delta(
      JSBI.BigInt(slot0.sqrtPriceX96.toString()),
      TickMath.getSqrtRatioAtTick(Number(position.tickUpper)),
      JSBI.BigInt(position.liquidity.toString()),
      false
    )
  } else {
    return 0
  }
}
function positionAmount1(slot0, position) {
  if (slot0.tick < position.tickLower) {
    return 0
  } else if (slot0.tick < position.tickUpper) {
    return SqrtPriceMath.getAmount1Delta(
      TickMath.getSqrtRatioAtTick(Number(position.tickLower)),
      JSBI.BigInt(slot0.sqrtPriceX96.toString()),
      JSBI.BigInt(position.liquidity.toString()),
      false
    )
  } else {
    return SqrtPriceMath.getAmount1Delta(
      TickMath.getSqrtRatioAtTick(Number(position.tickLower)),
      TickMath.getSqrtRatioAtTick(Number(position.tickUpper)),
      JSBI.BigInt(position.liquidity.toString()),
      false
    )
  }
}

// Sourced from Uniswap Interface -> PositionPage.tsx -> getRatio()
function getRatio(
  tickLower,
  tickCurrent,
  tickUpper
) {

  var lower = TickMath.getSqrtRatioAtTick(Number(tickLower))
  var current = TickMath.getSqrtRatioAtTick(Number(tickCurrent))
  var upper = TickMath.getSqrtRatioAtTick(Number(tickUpper))

  try {
    if (!JSBI.greaterThan(current, lower)) {
      return 100
    } else if (!JSBI.lessThan(current, upper)) {
      return 0
    }

    const a = Number(lower)
    const b = Number(upper)
    const c = Number(current)

    const ratio = Math.floor((1 / ((Math.sqrt(a * b) - Math.sqrt(b * c)) / (c - Math.sqrt(b * c)) + 1)) * 100)

    if (ratio < 0 || ratio > 100) {
      throw Error('Out of range')
    }

    return ratio
  } catch {
    return undefined
  }
}

// https://github.com/Uniswap/v3-periphery/blob/main/contracts/libraries/PositionValue.sol
async function getFeeGrowthInside(slot0, position, pool) {
  var tickCurrent = slot0.tickCurrent
  var tickLower = position.tickLower
  var tickUpper = position.tickUpper
  var lowerTickInfo = await pool.ticks(tickLower)
  var lowerFeeGrowthOutside0X128 = JSBI.BigInt(lowerTickInfo.feeGrowthOutside0X128)
  var lowerFeeGrowthOutside1X128 = JSBI.BigInt(lowerTickInfo.feeGrowthOutside1X128)
  var upperTickInfo = await pool.ticks(tickUpper)
  var upperFeeGrowthOutside0X128 = JSBI.BigInt(upperTickInfo.feeGrowthOutside0X128)
  var upperFeeGrowthOutside1X128 = JSBI.BigInt(upperTickInfo.feeGrowthOutside1X128)

  var feeGrowthInside0X128, feeGrowthInside1X128
  if (tickCurrent < tickLower) {
    feeGrowthInside0X128 = lowerFeeGrowthOutside0X128 - upperFeeGrowthOutside0X128;
    feeGrowthInside1X128 = lowerFeeGrowthOutside1X128 - upperFeeGrowthOutside1X128;
  } else if (tickCurrent < tickUpper) {
    var feeGrowthGlobal0X128 = JSBI.BigInt(await pool.feeGrowthGlobal0X128());
    var feeGrowthGlobal1X128 = JSBI.BigInt(await pool.feeGrowthGlobal1X128());
    feeGrowthInside0X128 = feeGrowthGlobal0X128 - lowerFeeGrowthOutside0X128 - upperFeeGrowthOutside0X128;
    feeGrowthInside1X128 = feeGrowthGlobal1X128 - lowerFeeGrowthOutside1X128 - upperFeeGrowthOutside1X128;
  } else {
    feeGrowthInside0X128 = upperFeeGrowthOutside0X128 - lowerFeeGrowthOutside0X128;
    feeGrowthInside1X128 = upperFeeGrowthOutside1X128 - lowerFeeGrowthOutside1X128;
  }
  return [feeGrowthInside0X128, feeGrowthInside1X128]
}

// https://github.com/Uniswap/examples/blob/b5e64e3d6c17cb91bc081f1ed17581bbf22024bc/v3-sdk/minting-position/src/libs/positions.ts#L111-L118
async function getPoolInfo(_factoryAddress, _tokenA, _tokenB, _fee, _provider) {
  const currentPoolAddress = computePoolAddress({
    factoryAddress: _factoryAddress,
    tokenA: _tokenA,
    tokenB: _tokenB,
    fee: _fee,
  })

  const poolContract = new ethers.Contract(
    currentPoolAddress,
    IUniswapV3PoolABI.abi,
    _provider
  )

  const [token0, token1, fee, tickSpacing, liquidity, slot0] =
    await Promise.all([
      poolContract.token0(),
      poolContract.token1(),
      poolContract.fee(),
      poolContract.tickSpacing(),
      poolContract.liquidity(),
      poolContract.slot0(),
    ])

  return {
    token0,
    token1,
    fee,
    tickSpacing,
    liquidity,
    sqrtPriceX96: slot0[0],
    tick: slot0[1],
  }
}

async function constructPosition(token0Amount, token1Amount, poolInfo) {

  // construct pool instance
  const configuredPool = new Pool(
    token0Amount.currency,
    token1Amount.currency,
    poolInfo.fee,
    poolInfo.sqrtPriceX96.toString(),
    poolInfo.liquidity.toString(),
    poolInfo.tick
  )

  // create position using the maximum liquidity from input amounts
  return Position.fromAmounts({
    pool: configuredPool,
    tickLower:
      nearestUsableTick(poolInfo.tick, poolInfo.tickSpacing) -
      poolInfo.tickSpacing * 2,
    tickUpper:
      nearestUsableTick(poolInfo.tick, poolInfo.tickSpacing) +
      poolInfo.tickSpacing * 2,
    amount0: token0Amount.quotient,
    amount1: token1Amount.quotient,
    useFullPrecision: true,
  })
}

export { encodePriceSqrt, sortTokens, getPoolInfo, constructPosition, positionAmount0, positionAmount1, getFeeGrowthInside, getRatio }