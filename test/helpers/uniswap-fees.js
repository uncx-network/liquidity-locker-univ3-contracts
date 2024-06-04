// Script taken from here
// https://ethereum.stackexchange.com/questions/140023/uniswap-v3-api-how-to-track-current-liquidity-and-fee-of-positions-programmati

import JSBI from 'jsbi'
import { ethers } from 'ethers'

const ZERO = JSBI.BigInt(0);
const Q128 = JSBI.exponentiate(JSBI.BigInt(2), JSBI.BigInt(128));
const Q256 = JSBI.exponentiate(JSBI.BigInt(2), JSBI.BigInt(256));


function toBigNumber(numstr) {
    let bi = numstr;
    if (typeof sqrtRatio !== 'bigint') {
        bi = JSBI.BigInt(numstr);
    }
    return bi;
};


function subIn256(x, y) {
    const difference = JSBI.subtract(x, y)

    if (JSBI.lessThan(difference, ZERO)) {
        return JSBI.add(Q256, difference)
    } else {
        return difference
    }
}


async function getFees(pool, position, slot0) {
    var lowerTickInfo = await pool.ticks(position.tickLower)
    var upperTickInfo = await pool.ticks(position.tickUpper)
    var liquidity = position.liquidity.toString()

    let feeGrowthGlobal_0 = toBigNumber((await pool.feeGrowthGlobal0X128()).toString());
    let feeGrowthGlobal_1 = toBigNumber((await pool.feeGrowthGlobal1X128()).toString());


    let tickLowerFeeGrowthOutside_0 = toBigNumber(lowerTickInfo.feeGrowthOutside0X128.toString());
    let tickLowerFeeGrowthOutside_1 = toBigNumber(lowerTickInfo.feeGrowthOutside1X128.toString());


    let tickUpperFeeGrowthOutside_0 = toBigNumber(upperTickInfo.feeGrowthOutside0X128.toString());
    let tickUpperFeeGrowthOutside_1 = toBigNumber(upperTickInfo.feeGrowthOutside1X128.toString());


    let tickLowerFeeGrowthBelow_0 = ZERO;
    let tickLowerFeeGrowthBelow_1 = ZERO;
    let tickUpperFeeGrowthAbove_0 = ZERO;
    let tickUpperFeeGrowthAbove_1 = ZERO;


    if (slot0.tick >= position.tickUpper) {
        tickUpperFeeGrowthAbove_0 = subIn256(feeGrowthGlobal_0, tickUpperFeeGrowthOutside_0);
        tickUpperFeeGrowthAbove_1 = subIn256(feeGrowthGlobal_1, tickUpperFeeGrowthOutside_1);
    } else {
        tickUpperFeeGrowthAbove_0 = tickUpperFeeGrowthOutside_0
        tickUpperFeeGrowthAbove_1 = tickUpperFeeGrowthOutside_1
    }


    if (slot0.tick >= position.tickLower) {
        tickLowerFeeGrowthBelow_0 = tickLowerFeeGrowthOutside_0
        tickLowerFeeGrowthBelow_1 = tickLowerFeeGrowthOutside_1
    } else {
        tickLowerFeeGrowthBelow_0 = subIn256(feeGrowthGlobal_0, tickLowerFeeGrowthOutside_0);
        tickLowerFeeGrowthBelow_1 = subIn256(feeGrowthGlobal_1, tickLowerFeeGrowthOutside_1);
    }


    let fr_t1_0 = subIn256(subIn256(feeGrowthGlobal_0, tickLowerFeeGrowthBelow_0), tickUpperFeeGrowthAbove_0);
    let fr_t1_1 = subIn256(subIn256(feeGrowthGlobal_1, tickLowerFeeGrowthBelow_1), tickUpperFeeGrowthAbove_1);


    let feeGrowthInsideLast_0 = toBigNumber(position.feeGrowthInside0LastX128.toString());
    let feeGrowthInsideLast_1 = toBigNumber(position.feeGrowthInside1LastX128.toString());


    let uncollectedFees_0 = (liquidity * subIn256(fr_t1_0, feeGrowthInsideLast_0)) / Q128;
    let uncollectedFees_1 = (liquidity * subIn256(fr_t1_1, feeGrowthInsideLast_1)) / Q128;
    // console.log("Amount fees token 0 in lowest decimal: " + Math.floor(uncollectedFees_0));
    // console.log("Amount fees token 1 in lowest decimal: " + Math.floor(uncollectedFees_1));


    /* let uncollectedFeesAdjusted_0 = (uncollectedFees_0 / toBigNumber(10 ** decimals0)).toFixed(decimals0);
    let uncollectedFeesAdjusted_1 = (uncollectedFees_1 / toBigNumber(10 ** decimals1)).toFixed(decimals1);
    console.log("Amount fees token 0 Human format: " + uncollectedFeesAdjusted_0);
    console.log("Amount fees token 1 Human format: " + uncollectedFeesAdjusted_1); */

    uncollectedFees_0 = BigInt(uncollectedFees_0) + BigInt(position.tokensOwed0)
    uncollectedFees_1 = BigInt(uncollectedFees_1) + BigInt(position.tokensOwed1)
    return [uncollectedFees_0.toString(), uncollectedFees_1.toString()]
}

export { getFees }
