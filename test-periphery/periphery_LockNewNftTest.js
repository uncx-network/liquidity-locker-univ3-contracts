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

function stringifyBigints(item) {
    return JSON.stringify(item, (key, value) =>
        typeof value === 'bigint'
            ? value.toString()
            : value, // return everything else unchanged
        2
    );
}

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

        // Deploy FullRangeConvertor
        const FullRangeConvertor = await ethers.getContractFactory("FullRangeConvertorV2");
        const fullRangeConvertor = await FullRangeConvertor.deploy(univ3locker.target);

        var NftPositionManager = new ethers.Contract(SETTINGS.contracts.NonfungiblePositionManager, INonfungiblePositionManagerABI.abi, ethers.provider)
        var UniswapV3Factory = new ethers.Contract(await NftPositionManager.factory(), IUniswapV3Factory.abi, ethers.provider)
        var SwapRouter = new ethers.Contract(SETTINGS.contracts.SwapRouter, ISwapRouter.abi, ethers.provider)

        await NftPositionManager.connect(owner).createAndInitializePoolIfNecessary(tokenA.target, tokenB.target, fee, TickMath.getSqrtRatioAtTick(0).toString())
        var poolAddress = await UniswapV3Factory.getPool(tokenA.target, tokenB.target, fee)
        var pool = new ethers.Contract(poolAddress, IUniswapV3PoolABI.abi, ethers.provider)

        await weth.connect(owner).approve(NftPositionManager.target, ethers.parseUnits('1000000', 18).toString())
        await uncx.connect(owner).approve(NftPositionManager.target, ethers.parseUnits('1000000', 18).toString())

        await weth.connect(owner).approve(SwapRouter.target, ethers.parseUnits('10000', 18).toString())
        await uncx.connect(owner).approve(SwapRouter.target, ethers.parseUnits('10000', 18).toString())

        // Mint a NFT lp position
        var mintParams = [
            tokenA.target,
            tokenB.target,
            fee, // fee
            -887270, // tickLower
            887270, // tickUpper
            ethers.parseUnits('10000', 18).toString(), // amount0Desired
            ethers.parseUnits('10000', 18).toString(), // amount1Desired;
            0, // amount0Min;
            0, // amount1Min;
            owner.address, // recipient
            Math.floor(Date.now() / 1000) + 10000
        ]
        
        var currentOffset = Number(await NftPositionManager.balanceOf(owner.address))

        await NftPositionManager.connect(owner).mint(mintParams)

        var nftId_unlocked = await NftPositionManager.tokenOfOwnerByIndex(owner.address, currentOffset)
        nftId_unlocked = Number(nftId_unlocked)

        await NftPositionManager.connect(owner).approve(fullRangeConvertor.target, nftId_unlocked)

        return { owner, bob, dustReceiver, additionalCollector, weth, uncx, tokenA, tokenB, univ3locker, fullRangeConvertor, pool, nftId_unlocked, NftPositionManager };
    }

    describe("New Lock Testing", function () {

        it("Should fail to allow to lock someone elses NFT", async function () {
            const { univ3locker, fullRangeConvertor, owner, bob, additionalCollector, dustReceiver, nftId_unlocked, NftPositionManager } = await loadFixture(deployFixture);
            var lockParams = [
                NftPositionManager.target, 
                nftId_unlocked, 
                dustReceiver.address, // receiver of collect() and tokens which dont fit in liquidity
                owner.address, // lock owner
                additionalCollector.address, // additionalCollector
                additionalCollector.address, // collectToAddress
                Math.floor(Date.now() / 1000) + 100, // unlockDate
                12, // country code
                "DEFAULT",
                [] // r
            ]
            await expect(fullRangeConvertor.connect(bob).convertToFullRangeAndLock(lockParams, [1,1,0,0])).to.be.revertedWith('ERC721: transfer of token that is not own')
        });

        it("Should fail to allow to lock with an unwhitelisted nftpositionmanager address", async function () {
            const { univ3locker, fullRangeConvertor, owner, uncx, additionalCollector, dustReceiver, nftId_unlocked, NftPositionManager } = await loadFixture(deployFixture);
            var lockParams = [
                uncx.target, // not a valid nft position manager
                nftId_unlocked, 
                dustReceiver.address, // receiver of collect() and tokens which dont fit in liquidity
                owner.address, // lock owner
                additionalCollector.address, // additionalCollector
                additionalCollector.address, // collectToAddress
                Math.floor(Date.now() / 1000) + 100, // unlockDate
                12, // country code
                "DEFAULT",
                [] // r
            ]
            await expect(fullRangeConvertor.connect(owner).convertToFullRangeAndLock(lockParams, [1,1,0,0])).to.be.revertedWithoutReason()
        });

        it("Should fail to allow to lock with a date greater than 1e10 (incase someone mistakenly enters a date in miliseconds)", async function () {
            const { univ3locker, fullRangeConvertor, owner, bob, additionalCollector, dustReceiver, nftId_unlocked, NftPositionManager } = await loadFixture(deployFixture);
            var lockParams = [
                NftPositionManager.target, 
                nftId_unlocked, 
                dustReceiver.address, // receiver of collect() and tokens which dont fit in liquidity
                owner.address, // lock owner
                additionalCollector.address, // additionalCollector
                additionalCollector.address, // collectToAddress
                '10000000000', // unlockDate
                12, // country code
                "DEFAULT",
                []
            ]
            await expect(fullRangeConvertor.connect(owner).convertToFullRangeAndLock(lockParams, [1,1,0,0])).to.be.revertedWith('MILLISECONDS')
        });

        it("Should fail on invalid country code", async function () {
            const { univ3locker, fullRangeConvertor, owner, bob, additionalCollector, dustReceiver, nftId_unlocked, NftPositionManager } = await loadFixture(deployFixture);
            var lockParams = [
                NftPositionManager.target, 
                nftId_unlocked, 
                dustReceiver.address, // receiver of collect() and tokens which dont fit in liquidity
                owner.address, // lock owner
                additionalCollector.address, // additionalCollector
                additionalCollector.address, // collectToAddress
                '9000000000', // unlockDate
                277, // country code
                "DEFAULT",
                []
            ]
            await expect(fullRangeConvertor.connect(owner).convertToFullRangeAndLock(lockParams, [1,1,0,0])).to.be.revertedWith('COUNTRY')
        });

        it("Should store a lock with the same params as what was sent to the lock method", async function () {
            const { univ3locker, fullRangeConvertor, owner, bob, additionalCollector, dustReceiver, nftId_unlocked, NftPositionManager } = await loadFixture(deployFixture);
            var lockParams = [
                NftPositionManager.target, 
                nftId_unlocked, 
                dustReceiver.address, // receiver of collect() and tokens which dont fit in liquidity
                owner.address, // lock owner
                additionalCollector.address, // additionalCollector
                additionalCollector.address, // collectToAddress
                '9000000000', // unlockDate
                BigInt(20), // country code
                "DEFAULT",
                []
            ]
            await fullRangeConvertor.connect(owner).convertToFullRangeAndLock(lockParams, [1,1,0,0])

            var lock = await univ3locker.getUserLockAtIndex(owner.address, 0)
            var lock2 = await univ3locker.getLock(lock.lock_id)
            var lock3 = await univ3locker.LOCKS(lock.lock_id)
            expect(stringifyBigints(lock)).to.equal(stringifyBigints(lock2))
            expect(stringifyBigints(lock)).to.equal(stringifyBigints(lock3))
            var lockA = {
                nftPositionManager: lock.nftPositionManager,
                owner: lock.owner,
                additionalCollector: lock.additionalCollector,
                unlockDate: lock.unlockDate.toString(),
                countryCode: lock.countryCode
            }
            var lockB = {
                nftPositionManager: NftPositionManager.target,
                owner: owner.address,
                additionalCollector: additionalCollector.address,
                unlockDate: "9000000000",
                countryCode: BigInt(20)
            }
            expect(stringifyBigints(lockA)).to.equal(stringifyBigints(lockB))
        });

        it("Should check lock nonces and nft_id integrity", async function () {
            const { univ3locker, fullRangeConvertor, owner, bob, weth, uncx, additionalCollector, dustReceiver, nftId_unlocked, NftPositionManager } = await loadFixture(deployFixture);
            
            var [tokenA, tokenB] = sortTokens(weth, uncx)
            // Mint a NFT lp position
            var mintParams = [
                tokenA.target,
                tokenB.target,
                500, // fee
                -887270, // tickLower
                887270, // tickUpper
                ethers.parseUnits('10000', 18).toString(), // amount0Desired
                ethers.parseUnits('10000', 18).toString(), // amount1Desired;
                0, // amount0Min;
                0, // amount1Min;
                owner.address, // recipient
                Math.floor(Date.now() / 1000) + 10000
            ]

            var balanceBefore = await NftPositionManager.balanceOf(owner.address)

            await NftPositionManager.connect(owner).mint(mintParams)
            await NftPositionManager.connect(owner).mint(mintParams)
            await NftPositionManager.connect(owner).mint(mintParams)

            var balance = await NftPositionManager.balanceOf(owner.address)
            expect(Number(balance) - Number(balanceBefore)).to.equal(3)

            var nftId1 = Number(await NftPositionManager.connect(owner).tokenOfOwnerByIndex(owner.address, 1))
            var nftId2 = Number(await NftPositionManager.connect(owner).tokenOfOwnerByIndex(owner.address, 2))
            var nftId3 = Number(await NftPositionManager.connect(owner).tokenOfOwnerByIndex(owner.address, 3))

            expect(nftId1).to.equal(nftId2 - 1)
            expect(nftId2).to.equal(nftId3 - 1)

            await NftPositionManager.connect(owner).approve(fullRangeConvertor.target, nftId1)
            await NftPositionManager.connect(owner).approve(fullRangeConvertor.target, nftId2)
            await NftPositionManager.connect(owner).approve(fullRangeConvertor.target, nftId3)

            // console.log(await NftPositionManager.positions(nftId1))
            
            var lockParams = [
                NftPositionManager.target, 
                nftId1, 
                dustReceiver.address, // receiver of collect() and tokens which dont fit in liquidity
                owner.address, // lock owner
                additionalCollector.address, // additionalCollector
                additionalCollector.address, // collectToAddress
                '9000000000', // unlockDate
                20, // country code
                "DEFAULT",
                []
            ]
            await fullRangeConvertor.connect(owner).convertToFullRangeAndLock(lockParams, [1,1,0,0])

            lockParams = [
                NftPositionManager.target, 
                nftId2, 
                dustReceiver.address, // receiver of collect() and tokens which dont fit in liquidity
                owner.address, // lock owner
                additionalCollector.address, // additionalCollector
                additionalCollector.address, // collectToAddress
                '9000000000', // unlockDate
                20, // country code
                "DEFAULT",
                []
            ]
            await fullRangeConvertor.connect(owner).convertToFullRangeAndLock(lockParams, [1,1,0,0])

            lockParams = [
                NftPositionManager.target, 
                nftId3, 
                dustReceiver.address, // receiver of collect() and tokens which dont fit in liquidity
                owner.address, // lock owner
                additionalCollector.address, // additionalCollector
                additionalCollector.address, // collectToAddress
                '9000000000', // unlockDate
                BigInt(20), // country code
                "DEFAULT",
                []
            ]
            await fullRangeConvertor.connect(owner).convertToFullRangeAndLock(lockParams, [1,1,0,0])

            var length1 = (await univ3locker.getLocksLength()).toString()
            var length2 = (await univ3locker.NONCE()).toString()
            expect(length1).to.equal(length2)
            expect(length1).to.equal('3')

            var lock1 = await univ3locker.getLock(0)
            var lock2 = await univ3locker.getLock(1)
            var lock3 = await univ3locker.getLock(2)

            // console.log(await NftPositionManager.positions(lock1.nft_id))
            
            expect(lock1.nft_id).to.equal(nftId1)
            expect(lock2.nft_id).to.equal(nftId2)
            expect(lock3.nft_id).to.equal(nftId3)

        });

        it("Should check events", async function () {
            const { univ3locker, fullRangeConvertor, pool, tokenA, tokenB, owner, bob, additionalCollector, dustReceiver, nftId_unlocked, NftPositionManager } = await loadFixture(deployFixture);
            var lockParams = [
                NftPositionManager.target, 
                nftId_unlocked, 
                dustReceiver.address, // receiver of collect() and tokens which dont fit in liquidity
                owner.address, // lock owner
                additionalCollector.address, // additionalCollector
                additionalCollector.address, // collectToAddress
                '9000000000', // unlockDate
                20, // country code
                "DEFAULT",
                []
            ]

            var position = await NftPositionManager.positions(nftId_unlocked)

            var call = fullRangeConvertor.connect(owner).convertToFullRangeAndLock(lockParams, [1,1,0,0])
            // https://ethereum.stackexchange.com/questions/110762/testing-arguments-of-contract-events-with-hardhat-chai
            await expect(call)
                .to.emit(univ3locker, 'onLock')
                .withArgs(
                    0, // lockId
                    NftPositionManager.target, // nftPositionManager
                    nftId_unlocked, // nftId
                    owner.address, // owner
                    additionalCollector.address, // additionalCollector
                    additionalCollector.address, // collectToAddress
                    '9000000000', // unlockDate
                    20, // countryCode
                    200, // uncxCollectFee
                    pool.target, // pool,
                    [
                        0, // nonce
                        '0x0000000000000000000000000000000000000000', // operator
                        tokenA.target, // token0
                        tokenB.target, // token1
                        500, // fee
                        -887270, // tickLower
                        887270, // tickUpper
                        '9950000000000000000540', // liquidity
                        0, // feeGrowthInside0LastX128
                        0, // feeGrowthInside1LastX128
                        0, // tokensOwed0
                        0 // tokensOwed1
                    ]
                )

        });

        it("Should log some stuff about fees", async function () {
            const { univ3locker, fullRangeConvertor, owner, bob, additionalCollector, dustReceiver, nftId_unlocked, NftPositionManager } = await loadFixture(deployFixture);
            var lockParams = [
                NftPositionManager.target, 
                nftId_unlocked, 
                dustReceiver.address, // receiver of collect() and tokens which dont fit in liquidity
                owner.address, // lock owner
                additionalCollector.address, // additionalCollector
                additionalCollector.address, // collectToAddress
                '9000000000', // unlockDate
                20, // country code
                "DEFAULT",
                []
            ]
            await fullRangeConvertor.connect(owner).convertToFullRangeAndLock(lockParams, [1,1,0,0])

            
            var lock1 = await univ3locker.getLock(0)
            console.log(lock1)

            const PeripheryLiquidityMath = await ethers.getContractFactory("PeripheryLiquidityMath");
            const peripheryMath = await PeripheryLiquidityMath.deploy();
            if (SETTINGS.isPCSFork) {
                var liquidity = await peripheryMath.getLiquidityForLockPCS(univ3locker.target,  0)
            } else {
                var liquidity = await peripheryMath.getLiquidityForLock(univ3locker.target,  0)
            }

            console.log(liquidity)
        });

    });

});
