import {
    time,
    loadFixture,
} from "@nomicfoundation/hardhat-network-helpers"
// import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs"
import { expect } from "chai"
import { computePoolAddress, Pool, FeeAmount, NonfungiblePositionManager, TickMath, SqrtPriceMath, PositionLibrary } from '@uniswap/v3-sdk'
import { SupportedChainId, Token, CurrencyAmount, Percent } from '@uniswap/sdk-core'
import IUniswapV3Factory from '@uniswap/v3-core/artifacts/contracts/interfaces/IUniswapV3Factory.sol/IUniswapV3Factory.json' assert { type: "json" }
import IUniswapV3PoolABI from '@uniswap/v3-core/artifacts/contracts/interfaces/IUniswapV3Pool.sol/IUniswapV3Pool.json' assert { type: "json" }
import INonfungiblePositionManagerABI from '@uniswap/v3-periphery/artifacts/contracts/interfaces/INonfungiblePositionManager.sol/INonfungiblePositionManager.json' assert { type: "json" }
import ISwapRouter from '@uniswap/swap-router-contracts/artifacts/contracts/interfaces/ISwapRouter02.sol/ISwapRouter02.json' assert { type: "json" }
import IERC20Minimal from '@uniswap/v3-core/artifacts/contracts/interfaces/IERC20Minimal.sol/IERC20Minimal.json' assert { type: "json" }
import { sortTokens } from "./helpers/uniswap-math.js"
import { getFees } from './helpers/uniswap-fees.js'
import Erc20Helper from './helpers/erc20.js'
import AccountHelper from './helpers/account.js'
import LogPosition from './helpers/log-position.js'
import JSBI from 'jsbi'
import SETTINGS from '../settings.js'

describe("Uniswap V3 Lockers", function () {
    // We define a fixture to reuse the same setup in every test.
    // We use loadFixture to run this setup once, snapshot that state,
    // and reset Hardhat Network to that snapshot in every test.
    async function deployFixture() {

        // Contracts are deployed using the first signer/account by default
        const [owner, dustReceiver, bob, additionalCollector, autoCollector, lpFeeReceiver, collectFeeReceiver] = await ethers.getSigners();

        const SimpleERC20 = await ethers.getContractFactory("Erc20Simple");
        const weth = await SimpleERC20.deploy('Wrapped Ether', 'WETH');
        const uncx = await SimpleERC20.deploy('UNCX', 'UNCX');
        const fee = 500
        var [tokenA, tokenB] = sortTokens(weth, uncx)

        // Deploy Locker and initialize pool
        const UniV3Locker = await ethers.getContractFactory("UNCX_LiquidityLocker_UniV3");
        const univ3locker = await UniV3Locker.deploy(SETTINGS.contracts.CountryList, autoCollector.address, lpFeeReceiver.address, collectFeeReceiver.address);
        await univ3locker.allowNftPositionManager(SETTINGS.contracts.NonfungiblePositionManager)

        var NftPositionManager = new ethers.Contract(SETTINGS.contracts.NonfungiblePositionManager, INonfungiblePositionManagerABI.abi, ethers.provider)
        var UniswapV3Factory = new ethers.Contract(await NftPositionManager.factory(), IUniswapV3Factory.abi, ethers.provider)
        var SwapRouter = new ethers.Contract(SETTINGS.contracts.SwapRouter, ISwapRouter.abi, ethers.provider)

        await NftPositionManager.connect(owner).createAndInitializePoolIfNecessary(tokenA.target, tokenB.target, fee, TickMath.getSqrtRatioAtTick(0).toString())
        var poolAddress = await UniswapV3Factory.getPool(tokenA.target, tokenB.target, fee)
        var pool = new ethers.Contract(poolAddress, IUniswapV3PoolABI.abi, ethers.provider)

        await weth.connect(owner).approve(NftPositionManager.target, ethers.parseUnits('1000000', 18).toString())
        await uncx.connect(owner).approve(NftPositionManager.target, ethers.parseUnits('1000000', 18).toString())

        await weth.connect(owner).approve(SwapRouter.target, ethers.parseUnits('100000', 18).toString())
        await uncx.connect(owner).approve(SwapRouter.target, ethers.parseUnits('100000', 18).toString())

        // Mint a NFT lp position
        var mintParams = [
            tokenA.target,
            tokenB.target,
            fee, // fee
            -887220, // tickLower
            887220, // tickUpper
            ethers.parseUnits('10000', 18).toString(), // amount0Desired
            ethers.parseUnits('10000', 18).toString(), // amount1Desired;
            0, // amount0Min;
            0, // amount1Min;
            owner.address, // recipient
            Math.floor(Date.now() / 1000) + 10000
        ]

        var currentOffset = Number(await NftPositionManager.balanceOf(owner.address))

        await NftPositionManager.connect(owner).mint(mintParams)
        await NftPositionManager.connect(owner).mint(mintParams)
        await NftPositionManager.connect(owner).mint(mintParams)

        var nftId_unlocked_1 = Number(await NftPositionManager.tokenOfOwnerByIndex(owner.address, currentOffset))
        var nftId_unlocked_2 = Number(await NftPositionManager.tokenOfOwnerByIndex(owner.address, currentOffset + 1))
        var nftId_unlocked_3 = Number(await NftPositionManager.tokenOfOwnerByIndex(owner.address, currentOffset + 2))

        await NftPositionManager.connect(owner).approve(univ3locker.target, nftId_unlocked_1)
        await NftPositionManager.connect(owner).approve(univ3locker.target, nftId_unlocked_2)
        await NftPositionManager.connect(owner).approve(univ3locker.target, nftId_unlocked_3)

        return { owner, bob, dustReceiver, additionalCollector, weth, uncx, tokenA, tokenB, univ3locker, pool, nftId_unlocked_1, nftId_unlocked_2, nftId_unlocked_3, NftPositionManager, SwapRouter, autoCollector, lpFeeReceiver, collectFeeReceiver };
    }

    describe("Decrease Liquidity Testing", function () {

        it("Should fail to decrease a locked positions liquidity if unlock date has not elapsed", async function () {
            const { univ3locker, owner, bob, additionalCollector, dustReceiver, nftId_unlocked_1, NftPositionManager } = await loadFixture(deployFixture);
            var unlockDate = Math.floor(Date.now() / 1000) + 10
            var lockParams = [
                NftPositionManager.target,
                nftId_unlocked_1,
                dustReceiver.address, // receiver of collect() and tokens which dont fit in liquidity
                bob.address, // lock owner
                additionalCollector.address, // additionalCollector
                additionalCollector.address, // collectToAddress
                unlockDate, // unlockDate
                12, // country code
                "DEFAULT",
                [] // r
            ]
            await univ3locker.connect(owner).lock(lockParams)
            var lock = await univ3locker.getUserLockAtIndex(bob.address, 0)
            var position = await NftPositionManager.positions(lock.nft_id)

            var liquidityToRemove = position.liquidity / BigInt(2)

            var call = univ3locker.connect(bob).decreaseLiquidity(lock.lock_id, [
                lock.nft_id, // tokenId
                liquidityToRemove, // liquidity
                ethers.parseUnits('100', 18).toString(), // amount0Min
                ethers.parseUnits('100', 18).toString(), // amount1Min;
                Math.floor(Date.now() / 1000) + 10 // deadline
            ])

            await expect(call).to.be.revertedWith('NOT YET')

        });

        it("Should allow to decrease a locked positions liquidity if unlock date has elapsed", async function () {
            const { univ3locker, owner, bob, additionalCollector, collectFeeReceiver, dustReceiver, weth, uncx, nftId_unlocked_1, NftPositionManager } = await loadFixture(deployFixture);

            var collectFee = 100
            await univ3locker.connect(owner).addOrEditFee(
                "COL", // name
                0, // lpFee
                collectFee, // collectFee
                0, // flatFee
                ethers.ZeroAddress // eth as flat fee token
            )

            var unlockDate = Math.floor(Date.now() / 1000) + 10
            var lockParams = [
                NftPositionManager.target,
                nftId_unlocked_1,
                dustReceiver.address, // receiver of collect() and tokens which dont fit in liquidity
                bob.address, // lock owner
                additionalCollector.address, // additionalCollector
                additionalCollector.address, // collectToAddress
                unlockDate, // unlockDate
                12, // country code
                "COL",
                [] // r
            ]
            await univ3locker.connect(owner).lock(lockParams)
            var lock = await univ3locker.getUserLockAtIndex(bob.address, 0)
            var positionBefore = await NftPositionManager.positions(lock.nft_id)

            var liquidityToRemove = positionBefore.liquidity / BigInt(2)

            var call = univ3locker.connect(bob).decreaseLiquidity(lock.lock_id, [
                lock.nft_id, // tokenId
                liquidityToRemove, // liquidity
                ethers.parseUnits('100', 18).toString(), // amount0Min
                ethers.parseUnits('100', 18).toString(), // amount1Min;
                Math.floor(Date.now() / 1000) + 10 // deadline
            ])

            await expect(call).to.be.revertedWith('NOT YET')
            await ethers.provider.send("evm_mine", [unlockDate + 1])

            expect(await weth.balanceOf(bob.address)).to.equal(0)
            expect(await uncx.balanceOf(bob.address)).to.equal(0)
            expect(await weth.balanceOf(collectFeeReceiver.address)).to.equal(0)
            expect(await uncx.balanceOf(collectFeeReceiver.address)).to.equal(0)

            const PeripheryLiquidityMath = await ethers.getContractFactory("PeripheryLiquidityMath");
            const peripheryMath = await PeripheryLiquidityMath.deploy();
            if (SETTINGS.isPCSFork) {
                var liquidityBefore = await peripheryMath.getLiquidityForLockPCS(univ3locker.target, lock.lock_id)
            } else {
                var liquidityBefore = await peripheryMath.getLiquidityForLock(univ3locker.target, lock.lock_id)
            }

            await univ3locker.connect(bob).decreaseLiquidity(lock.lock_id, [
                lock.nft_id, // tokenId
                liquidityToRemove, // liquidity
                ethers.parseUnits('0.00001', 18).toString(), // amount0Min
                ethers.parseUnits('0.00001', 18).toString(), // amount1Min;
                Math.floor(Date.now() / 1000) + 100 // deadline
            ])

            var positionAfter = await NftPositionManager.positions(lock.nft_id)

            expect(positionAfter.liquidity).to.equal(positionBefore.liquidity - liquidityToRemove)
            expect(await weth.balanceOf(bob.address)).to.equal(liquidityBefore.amount0 / BigInt(2))
            expect(await uncx.balanceOf(bob.address)).to.equal(liquidityBefore.amount1 / BigInt(2))
            expect(await weth.balanceOf(collectFeeReceiver.address)).to.equal(0)
            expect(await uncx.balanceOf(collectFeeReceiver.address)).to.equal(0)

        });

        it("Should fail to decrease a locked positions liquidity if not lock owner", async function () {
            const { univ3locker, owner, bob, additionalCollector, dustReceiver, nftId_unlocked_1, NftPositionManager } = await loadFixture(deployFixture);
            var unlockDate = Math.floor(Date.now() / 1000) + 10
            var lockParams = [
                NftPositionManager.target,
                nftId_unlocked_1,
                dustReceiver.address, // receiver of collect() and tokens which dont fit in liquidity
                bob.address, // lock owner
                additionalCollector.address, // additionalCollector
                additionalCollector.address, // collectToAddress
                unlockDate, // unlockDate
                12, // country code
                "DEFAULT",
                [] // r
            ]
            await univ3locker.connect(owner).lock(lockParams)
            var lock = await univ3locker.getUserLockAtIndex(bob.address, 0)
            var position = await NftPositionManager.positions(lock.nft_id)
            var liquidityToRemove = position.liquidity / BigInt(2)

            var call = univ3locker.connect(owner).decreaseLiquidity(lock.lock_id, [
                lock.nft_id, // tokenId
                liquidityToRemove, // liquidity
                ethers.parseUnits('100', 18).toString(), // amount0Min
                ethers.parseUnits('100', 18).toString(), // amount1Min;
                Math.floor(Date.now() / 1000) + 10 // deadline
            ])

            await expect(call).to.be.revertedWith('OWNER')

        });

    });

});
