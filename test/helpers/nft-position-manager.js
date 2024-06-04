

import { TickMath, SqrtPriceMath } from '@uniswap/v3-sdk'
import { Price } from '@uniswap/sdk-core'

import JSBI from 'jsbi'
import { Q192 } from './internalConstants.js'

import IUniswapV3PoolABI from '@uniswap/v3-core/artifacts/contracts/interfaces/IUniswapV3Pool.sol/IUniswapV3Pool.json' assert { type: "json" }

const Self = {
    async getLiquidity(NftPositionManager, UniV3Factory, token0, token1, tokenId) {
        var position = await NftPositionManager.positions(tokenId)
        var poolAddress = await UniV3Factory.getPool(position.token0, position.token1, position.fee)
        var pool = new ethers.Contract(poolAddress, IUniswapV3PoolABI.abi, ethers.provider)
        var slot0 = await pool.slot0()
        var positionAmount0 = Self.positionAmount0(slot0, position)
        var positionAmount1 = Self.positionAmount1(slot0, position)

        var priceLower = Self.token0PriceLower(token0, token1, position.tickLower)
        var priceUpper = Self.token0PriceUpper(token0, token1, position.tickUpper)
        var sqrtRatioX96 = JSBI.BigInt(slot0.sqrtPriceX96)
        var token0Price = new Price(
            token0,
            token1,
            Q192,
            JSBI.multiply(sqrtRatioX96, sqrtRatioX96)
        )

        var ratio = Self.getRatio(priceLower, token0Price, priceUpper)
        return {
            positionAmount0: positionAmount0,
            positionAmount1: positionAmount1,
            ratio: ratio
        }
    },

    async slot0(NftPositionManager, UniV3Factory, tokenId) {
        var position = await NftPositionManager.positions(tokenId)
        var poolAddress = await UniV3Factory.getPool(position.token0, position.token1, position.fee)
        var pool = new ethers.Contract(poolAddress, IUniswapV3PoolABI.abi, ethers.provider)
        var slot0 = await pool.slot0()
        return slot0
    },

    token0PriceLower(token0, token1, tickLower) {
        return Self.tickToPrice(token0, token1, tickLower)
    },

    token0PriceUpper(token0, token1, tickUpper) {
        return Self.tickToPrice(token0, token1, tickUpper)
    },
    tickToPrice(baseToken, quoteToken, tick) {
        const sqrtRatioX96 = TickMath.getSqrtRatioAtTick(tick)

        const ratioX192 = JSBI.multiply(sqrtRatioX96, sqrtRatioX96)

        return baseToken.sortsBefore(quoteToken)
            ? new Price(baseToken, quoteToken, Q192, ratioX192)
            : new Price(baseToken, quoteToken, ratioX192, Q192)
    },

    // Sourced from Uniswap Interface -> PositionPage.tsx -> getRatio()
    getRatio(lower, current, upper) {
        try {
            if (!current.greaterThan(lower)) {
                return 100
            } else if (!current.lessThan(upper)) {
                return 0
            }

            const a = Number.parseFloat(lower.toSignificant(15))
            const b = Number.parseFloat(upper.toSignificant(15))
            const c = Number.parseFloat(current.toSignificant(15))

            const ratio = Math.floor((1 / ((Math.sqrt(a * b) - Math.sqrt(b * c)) / (c - Math.sqrt(b * c)) + 1)) * 100)

            if (ratio < 0 || ratio > 100) {
                throw Error('Out of range')
            }

            return ratio
        } catch {
            return undefined
        }
    },

    // refactored amount0() from uniswap SDK
    // https://github.com/Uniswap/v3-sdk/blob/main/src/entities/position.ts
    positionAmount0(slot0, position) {
        if (slot0.tick < position.tickLower) {
            return SqrtPriceMath.getAmount0Delta(
                TickMath.getSqrtRatioAtTick(position.tickLower),
                TickMath.getSqrtRatioAtTick(position.tickUpper),
                JSBI.BigInt(position.liquidity),
                false
            )
        } else if (slot0.tick < position.tickUpper) {
            return SqrtPriceMath.getAmount0Delta(
                JSBI.BigInt(slot0.sqrtPriceX96),
                TickMath.getSqrtRatioAtTick(position.tickUpper),
                JSBI.BigInt(position.liquidity),
                false
            )
        } else {
            return 0
        }
    },

    positionAmount1(slot0, position) {
        if (slot0.tick < position.tickLower) {
            return 0
        } else if (slot0.tick < position.tickUpper) {
            return SqrtPriceMath.getAmount1Delta(
                TickMath.getSqrtRatioAtTick(position.tickLower),
                JSBI.BigInt(slot0.sqrtPriceX96),
                JSBI.BigInt(position.liquidity),
                false
            )
        } else {
            return SqrtPriceMath.getAmount1Delta(
                TickMath.getSqrtRatioAtTick(position.tickLower),
                TickMath.getSqrtRatioAtTick(position.tickUpper),
                JSBI.BigInt(position.liquidity),
                false
            )
        }
    }
}

export default Self