import {
    time,
    loadFixture,
} from "@nomicfoundation/hardhat-network-helpers"
// import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs"
import { expect } from "chai"
import { computePoolAddress, Pool, FeeAmount, NonfungiblePositionManager, TickMath, SqrtPriceMath, PositionLibrary } from '@uniswap/v3-sdk'
import { SupportedChainId, Token, CurrencyAmount, Percent } from '@uniswap/sdk-core'
import IERC20Minimal from '@uniswap/v3-core/artifacts/contracts/interfaces/IERC20Minimal.sol/IERC20Minimal.json' assert { type: "json" }
import { getFees } from './helpers/uniswap-fees.js'
import Erc20Helper from './helpers/erc20.js'
import AccountHelper from './helpers/account.js'
import LogPosition from './helpers/log-position.js'
import JSBI from 'jsbi'
import SETTINGS from '../settings.js'
import Fixtures from './fixtures/fixtures.js'
import { sortTokens } from "./helpers/uniswap-math.js"

// Uniswap Deployment Addresses
// https://docs.uniswap.org/contracts/v3/reference/deployments

describe("Uniswap V3 Lockers", function () {
    // We define a fixture to reuse the same setup in every test.
    // We use loadFixture to run this setup once, snapshot that state,
    // and reset Hardhat Network to that snapshot in every test.
    async function deployFixture() {

        const { owner, alice, bob, additionalCollector, autoCollector, lpFeeReceiver, collectFeeReceiver, signerA, signerB,
            univ3locker, feeResolver, NftPositionManager, UniswapV3Factory, SwapRouter } = await Fixtures.deployContracts()

        var currentOffset = Number(await NftPositionManager.balanceOf(owner.address))
        const { uncx, weth, fee } = await Fixtures.mintPosition(owner, UniswapV3Factory, NftPositionManager, SwapRouter)

        var nftId_unlocked = Number(await NftPositionManager.tokenOfOwnerByIndex(owner.address, currentOffset))
        await NftPositionManager.connect(owner).approve(univ3locker.target, nftId_unlocked)

        var lockParams = [
            NftPositionManager.target,
            nftId_unlocked,
            alice.address, // receiver of collect() and tokens which dont fit in liquidity
            bob.address, // lock owner
            additionalCollector.address, // additionalCollector
            additionalCollector.address, // collectAddress
            Math.floor(Date.now() / 1000) + 100, // unlockDate
            12, // country code
            "DEFAULT",
            [] // r
        ]

        await univ3locker.connect(owner).lock(lockParams)
        await Fixtures.doSwaps(weth, uncx, fee, owner, SwapRouter)

        var lock = await univ3locker.getUserLockAtIndex(bob.address, 0)

        return { owner, bob, additionalCollector, autoCollector, lpFeeReceiver, collectFeeReceiver, uncx, weth, univ3locker, nftId_unlocked, lock, NftPositionManager, autoCollector, signerA, signerB, feeResolver };
    }

    describe("Fee Testing", function () {

        it("Should collect a portion of the collection fees", async function () {
            const { univ3locker, owner, bob, collectFeeReceiver, weth, uncx, NftPositionManager, lock } = await loadFixture(deployFixture);

            var fees = await LogPosition.positionFees(NftPositionManager, lock.nft_id)

            var [tokenA, tokenB] = sortTokens(weth, uncx)

            expect(await tokenA.balanceOf(bob.address)).to.equal(0)
            expect(await tokenB.balanceOf(bob.address)).to.equal(0)

            await univ3locker.connect(bob).collect(lock.lock_id, bob.address, 100, 150)

            expect(await tokenA.balanceOf(bob.address)).to.equal(98)
            expect(await tokenB.balanceOf(bob.address)).to.equal(147)

            var feesAfter = await LogPosition.positionFees(NftPositionManager, lock.nft_id)
            expect(feesAfter[0]).to.equal(BigInt(fees[0]) - BigInt(100) - BigInt(1))
            expect(feesAfter[1]).to.equal(BigInt(fees[1]) - BigInt(150))
        });

    });

});
