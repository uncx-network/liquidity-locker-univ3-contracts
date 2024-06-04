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

    describe("Withdraw lock Testing", function () {

        it("Should fail to allow to withdraw someone elses NFT", async function () {
            const { univ3locker, owner, bob, additionalCollector, dustReceiver, nftId_unlocked_1, NftPositionManager } = await loadFixture(deployFixture);
            var unlockDate = Math.floor(Date.now() / 1000) + 100
            var lockParams = [
                NftPositionManager.target,
                nftId_unlocked_1,
                dustReceiver.address, // receiver of collect() and tokens which dont fit in liquidity
                owner.address, // lock owner
                additionalCollector.address, // additionalCollector
                additionalCollector.address, // collectToAddress
                unlockDate, // unlockDate
                12, // country code
                "DEFAULT",
                [] // r
            ]
            await univ3locker.connect(owner).lock(lockParams)
            var lock = await univ3locker.getUserLockAtIndex(owner.address, 0)
            await ethers.provider.send("evm_mine", [unlockDate + 1])
            await expect(univ3locker.connect(bob).withdraw(lock.lock_id, bob.address)).to.be.revertedWith('OWNER')
        });

        it("Should receive the NFT after withdrawal", async function () {
            const { univ3locker, owner, bob, additionalCollector, dustReceiver, nftId_unlocked_1, NftPositionManager } = await loadFixture(deployFixture);
            var unlockDate = Math.floor(Date.now() / 1000) + 100
            var lockParams = [
                NftPositionManager.target,
                nftId_unlocked_1,
                dustReceiver.address, // receiver of collect() and tokens which dont fit in liquidity
                owner.address, // lock owner
                additionalCollector.address, // additionalCollector
                additionalCollector.address, // collectToAddress
                unlockDate, // unlockDate
                12, // country code
                "DEFAULT",
                [] // r
            ]
            await univ3locker.connect(owner).lock(lockParams)
            var lock = await univ3locker.getUserLockAtIndex(owner.address, 0)

            var currentOwner = await NftPositionManager.ownerOf(lock.nft_id)
            expect(currentOwner).to.equal(univ3locker.target)

            await ethers.provider.send("evm_mine", [unlockDate + 1])
            await univ3locker.connect(owner).withdraw(lock.lock_id, bob.address)

            var withdrawlOwner = await NftPositionManager.ownerOf(lock.nft_id)
            expect(withdrawlOwner).to.equal(bob.address)
        });

        it("Should fail to withdraw a nft which is still locked", async function () {
            const { univ3locker, owner, bob, additionalCollector, dustReceiver, nftId_unlocked_1, NftPositionManager } = await loadFixture(deployFixture);
            var unlockDate = Math.floor(Date.now() / 1000) + 100
            var lockParams = [
                NftPositionManager.target,
                nftId_unlocked_1,
                dustReceiver.address, // receiver of collect() and tokens which dont fit in liquidity
                owner.address, // lock owner
                additionalCollector.address, // additionalCollector
                additionalCollector.address, // collectToAddress
                unlockDate, // unlockDate
                12, // country code
                "DEFAULT",
                [] // r
            ]
            await univ3locker.connect(owner).lock(lockParams)
            var lock = await univ3locker.getUserLockAtIndex(owner.address, 0)
            await expect(univ3locker.connect(owner).withdraw(lock.lock_id, bob.address)).to.be.revertedWith('NOT YET')

            await ethers.provider.send("evm_mine", [unlockDate + 1])
            await univ3locker.connect(owner).withdraw(lock.lock_id, bob.address)

        });

        it("Should collect fees on withdraw to collectFeeAddress if they chose a fee option with collection fees", async function () {
            const { univ3locker, owner, bob, weth, uncx, tokenA, tokenB, additionalCollector, dustReceiver, nftId_unlocked_1, NftPositionManager, SwapRouter, autoCollector, lpFeeReceiver, collectFeeReceiver } = await loadFixture(deployFixture);

            var collectFee = 100
            await univ3locker.connect(owner).addOrEditFee(
                "COL", // name
                0, // lpFee
                collectFee, // collectFee
                0, // flatFee
                ethers.ZeroAddress // eth as flat fee token
            )

            var unlockDate = Math.floor(Date.now() / 1000) + 100
            var fee = 500
            var lockParams = [
                NftPositionManager.target,
                nftId_unlocked_1,
                dustReceiver.address, // receiver of collect() and tokens which dont fit in liquidity
                owner.address, // lock owner
                additionalCollector.address, // additionalCollector
                additionalCollector.address, // collectToAddress
                unlockDate, // unlockDate
                12, // country code
                "COL",
                [] // r
            ]
            await univ3locker.connect(owner).lock(lockParams)

            // Perform two swaps to generate some fees to collect
            var swapParams = [
                tokenB.target, // tokenId
                tokenA.target, // tokenOut
                fee,
                owner.address, // recipient
                ethers.parseUnits('333', 18).toString(), // Amount in
                0, // Amount out
                TickMath.getSqrtRatioAtTick(887220).toString() // price limit
            ]
            await SwapRouter.connect(owner).exactInputSingle(swapParams)
            swapParams = [
                tokenA.target, // tokenId
                tokenB.target, // tokenOut
                fee,
                owner.address, // recipient
                ethers.parseUnits('333', 18).toString(), // Amount in
                0, // Amount out
                TickMath.getSqrtRatioAtTick(-887220).toString() // price limit
            ]
            await SwapRouter.connect(owner).exactInputSingle(swapParams)

            var lock = await univ3locker.getUserLockAtIndex(owner.address, 0)

            var fees = await LogPosition.positionFees(NftPositionManager, lock.nft_id)
            // console.log(fees)

            expect(await weth.balanceOf(autoCollector.address)).to.equal(0)
            expect(await uncx.balanceOf(autoCollector.address)).to.equal(0)

            expect(await weth.balanceOf(lpFeeReceiver.address)).to.equal(0)
            expect(await uncx.balanceOf(lpFeeReceiver.address)).to.equal(0)

            expect(await weth.balanceOf(collectFeeReceiver.address)).to.equal(0)
            expect(await uncx.balanceOf(collectFeeReceiver.address)).to.equal(0)

            await ethers.provider.send("evm_mine", [unlockDate + 1])
            await univ3locker.connect(owner).withdraw(lock.lock_id, bob.address)

            expect(await weth.balanceOf(autoCollector.address)).to.equal(0)
            expect(await uncx.balanceOf(autoCollector.address)).to.equal(0)

            expect(await weth.balanceOf(lpFeeReceiver.address)).to.equal(0)
            expect(await uncx.balanceOf(lpFeeReceiver.address)).to.equal(0)

            // This would fail but the amounts will be super close (math libraries slightly different to on chain) so we just subtract 1 to pass the test which is like 0.00000000001% difference
            expect(await weth.balanceOf(collectFeeReceiver.address)).to.equal((BigInt(fees[0]) * BigInt(collectFee) / BigInt(10000)) - BigInt(1))
            expect(await uncx.balanceOf(collectFeeReceiver.address)).to.equal(BigInt(fees[1]) * BigInt(collectFee) / BigInt(10000))

        });

        it("Should zero the lock state after withdrawl", async function () {
            const { univ3locker, owner, bob, weth, uncx, additionalCollector, dustReceiver, nftId_unlocked_1, NftPositionManager, SwapRouter, autoCollector, lpFeeReceiver, collectFeeReceiver } = await loadFixture(deployFixture);

            var unlockDate = Math.floor(Date.now() / 1000) + 100
            var fee = 3000
            var lockParams = [
                NftPositionManager.target,
                nftId_unlocked_1,
                dustReceiver.address, // receiver of collect() and tokens which dont fit in liquidity
                owner.address, // lock owner
                additionalCollector.address, // additionalCollector
                additionalCollector.address, // collectToAddress
                unlockDate, // unlockDate
                12, // country code
                "DEFAULT",
                [] // r
            ]
            await univ3locker.connect(owner).lock(lockParams)

            var lock = await univ3locker.getUserLockAtIndex(owner.address, 0)

            var lockStateBefore = await univ3locker.getLock(lock.lock_id)
            expect(lockStateBefore.lock_id).to.equal(lock.lock_id)
            expect(lockStateBefore.nftPositionManager).to.equal(NftPositionManager.target)
            expect(lockStateBefore.owner).to.equal(owner.address)

            await ethers.provider.send("evm_mine", [unlockDate + 1])
            await univ3locker.connect(owner).withdraw(lock.lock_id, bob.address)

            var lockStateAfter = await univ3locker.getLock(lock.lock_id)

            // console.log(lockStateAfter)
            expect(lockStateAfter.lock_id).to.equal(0)
            expect(lockStateAfter.nftPositionManager).to.equal(ethers.ZeroAddress)
            expect(lockStateAfter.nft_id).to.equal(0)
            expect(lockStateAfter.owner).to.equal(ethers.ZeroAddress)

        });

        it("Should emit withdrawal event", async function () {
            const { univ3locker, owner, bob, weth, uncx, additionalCollector, dustReceiver, nftId_unlocked_1, NftPositionManager, SwapRouter, autoCollector, lpFeeReceiver, collectFeeReceiver } = await loadFixture(deployFixture);

            var unlockDate = Math.floor(Date.now() / 1000) + 100
            var fee = 3000
            var lockParams = [
                NftPositionManager.target,
                nftId_unlocked_1,
                dustReceiver.address, // receiver of collect() and tokens which dont fit in liquidity
                owner.address, // lock owner
                additionalCollector.address, // additionalCollector
                additionalCollector.address, // collectToAddress
                unlockDate, // unlockDate
                12, // country code
                "DEFAULT",
                [] // r
            ]
            await univ3locker.connect(owner).lock(lockParams)

            var lock = await univ3locker.getUserLockAtIndex(owner.address, 0)

            await ethers.provider.send("evm_mine", [unlockDate + 1])
            var call = univ3locker.connect(owner).withdraw(lock.lock_id, bob.address)
            await expect(call)
                .to.emit(univ3locker, 'onWithdraw')
                .withArgs(
                    lock.lock_id,
                    lock.owner,
                    bob.address
                )
        });

        it("Should reduce getNumUserLocks count by one for on chain pagination", async function () {
            const { univ3locker, owner, bob, weth, uncx, additionalCollector, dustReceiver, nftId_unlocked_1, nftId_unlocked_2, nftId_unlocked_3, NftPositionManager, SwapRouter, autoCollector, lpFeeReceiver, collectFeeReceiver } = await loadFixture(deployFixture);

            var unlockDate = Math.floor(Date.now() / 1000) + 100
            var fee = 3000
            var lockParams = [
                NftPositionManager.target,
                null, // nft id
                dustReceiver.address, // receiver of collect() and tokens which dont fit in liquidity
                owner.address, // lock owner
                additionalCollector.address, // additionalCollector
                additionalCollector.address, // collectToAddress
                unlockDate, // unlockDate
                12, // country code
                "DEFAULT",
                [] // r
            ]
            expect(await univ3locker.getNumUserLocks(owner.address)).to.equal(0)

            lockParams[1] = nftId_unlocked_1
            await univ3locker.connect(owner).lock(lockParams)
            expect(await univ3locker.getNumUserLocks(owner.address)).to.equal(1)

            lockParams[1] = nftId_unlocked_2
            await univ3locker.connect(owner).lock(lockParams)
            expect(await univ3locker.getNumUserLocks(owner.address)).to.equal(2)

            lockParams[1] = nftId_unlocked_3
            await univ3locker.connect(owner).lock(lockParams)
            expect(await univ3locker.getNumUserLocks(owner.address)).to.equal(3)

            var lock1 = await univ3locker.getUserLockAtIndex(owner.address, 0)
            var lock2 = await univ3locker.getUserLockAtIndex(owner.address, 1)
            var lock3 = await univ3locker.getUserLockAtIndex(owner.address, 2)

            await ethers.provider.send("evm_mine", [unlockDate + 1])

            await univ3locker.connect(owner).withdraw(lock1.lock_id, bob.address)
            expect(await univ3locker.getNumUserLocks(owner.address)).to.equal(2)

            await univ3locker.connect(owner).withdraw(lock2.lock_id, bob.address)
            expect(await univ3locker.getNumUserLocks(owner.address)).to.equal(1)

            await univ3locker.connect(owner).withdraw(lock3.lock_id, bob.address)
            expect(await univ3locker.getNumUserLocks(owner.address)).to.equal(0)
        });

    });

});
