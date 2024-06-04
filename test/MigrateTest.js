import {
    time,
    loadFixture,
} from "@nomicfoundation/hardhat-network-helpers"
// import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs"
import { expect } from "chai"
import { TickMath } from '@uniswap/v3-sdk'
import IUniswapV3Factory from '@uniswap/v3-core/artifacts/contracts/interfaces/IUniswapV3Factory.sol/IUniswapV3Factory.json' assert { type: "json" }
import IUniswapV3PoolABI from '@uniswap/v3-core/artifacts/contracts/interfaces/IUniswapV3Pool.sol/IUniswapV3Pool.json' assert { type: "json" }
import INonfungiblePositionManagerABI from '@uniswap/v3-periphery/artifacts/contracts/interfaces/INonfungiblePositionManager.sol/INonfungiblePositionManager.json' assert { type: "json" }
import ISwapRouter from '@uniswap/swap-router-contracts/artifacts/contracts/interfaces/ISwapRouter02.sol/ISwapRouter02.json' assert { type: "json" }
import { sortTokens } from "./helpers/uniswap-math.js"
import LogPosition from './helpers/log-position.js'
import SETTINGS from '../settings.js'

describe("Uniswap V3 Lockers", function () {
    // We define a fixture to reuse the same setup in every test.
    // We use loadFixture to run this setup once, snapshot that state,
    // and reset Hardhat Network to that snapshot in every test.
    async function deployFixture() {

        const [owner, dustReceiver, bob, additionalCollector, autoCollector, lpFeeReceiver, collectFeeReceiver] = await ethers.getSigners();

        const SimpleERC20 = await ethers.getContractFactory("Erc20Simple");
        const weth = await SimpleERC20.deploy('Wrapped Ether', 'WETH');
        const uncx = await SimpleERC20.deploy('UNCX', 'UNCX');
        const fee = 500
        var [tokenA, tokenB] = sortTokens(weth, uncx)

        // Deploy Locker and initialize pool
        const OldUniV3Locker = await ethers.getContractFactory("UNCX_ProofOfReservesV2_UniV3");
        const old_univ3locker = await OldUniV3Locker.deploy(SETTINGS.contracts.CountryList, autoCollector.address, lpFeeReceiver.address, collectFeeReceiver.address);

        const NewUniV3Locker = await ethers.getContractFactory("UNCX_LiquidityLocker_UniV3");
        const new_univ3locker = await NewUniV3Locker.deploy(SETTINGS.contracts.CountryList, autoCollector.address, lpFeeReceiver.address, collectFeeReceiver.address);
        await new_univ3locker.allowNftPositionManager(SETTINGS.contracts.NonfungiblePositionManager)

        var NftPositionManager = new ethers.Contract(SETTINGS.contracts.NonfungiblePositionManager, INonfungiblePositionManagerABI.abi, ethers.provider)
        var UniswapV3Factory = new ethers.Contract(await NftPositionManager.factory(), IUniswapV3Factory.abi, ethers.provider)
        var SwapRouter = new ethers.Contract(SETTINGS.contracts.SwapRouter, ISwapRouter.abi, ethers.provider)

        await NftPositionManager.connect(owner).createAndInitializePoolIfNecessary(tokenA.target, tokenB.target, fee, TickMath.getSqrtRatioAtTick(0).toString())
        var poolAddress = await UniswapV3Factory.getPool(tokenA.target, tokenB.target, fee)
        var pool = new ethers.Contract(poolAddress, IUniswapV3PoolABI.abi, ethers.provider)

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

        await weth.connect(owner).approve(NftPositionManager.target, ethers.parseUnits('10000', 18).toString())
        await uncx.connect(owner).approve(NftPositionManager.target, ethers.parseUnits('10000', 18).toString())

        await weth.connect(owner).approve(SwapRouter.target, ethers.parseUnits('10000', 18).toString())
        await uncx.connect(owner).approve(SwapRouter.target, ethers.parseUnits('10000', 18).toString())

        await NftPositionManager.connect(owner).mint(mintParams)

        var ownerNftBalance = await NftPositionManager.balanceOf(owner.address)
        var nftId_unlocked = await NftPositionManager.tokenOfOwnerByIndex(owner.address, Number(ownerNftBalance) - 1)
        nftId_unlocked = Number(nftId_unlocked)

        await NftPositionManager.connect(owner).approve(old_univ3locker.target, nftId_unlocked)

        var lockParams = [
            NftPositionManager.target, 
            nftId_unlocked, 
            dustReceiver.address, // receiver of collect() and tokens which dont fit in liquidity
            owner.address, // lock owner
            additionalCollector.address, // additionalCollector
            additionalCollector.address, // collectAddress
            Math.floor(Date.now() / 1000) + 100, // unlockDate
            12, // country code
            "DEFAULT",
            [] // r
        ]
        await old_univ3locker.connect(owner).lock(lockParams)

        // Perform two swaps to generate some fees to collect
        var swapParams = [
            tokenA.target, // tokenId
            tokenB.target, // tokenOut
            fee,
            owner.address, // recipient
            ethers.parseUnits('333', 18).toString(), // Amount in
            0, // Amount out
            TickMath.getSqrtRatioAtTick(-887220).toString() // price limit
        ]
        await SwapRouter.connect(owner).exactInputSingle(swapParams)
        swapParams = [
            tokenB.target, // tokenId
            tokenA.target, // tokenOut
            fee,
            owner.address, // recipient
            ethers.parseUnits('333', 18).toString(), // Amount in
            0, // Amount out
            TickMath.getSqrtRatioAtTick(887220).toString() // price limit
        ]
        await SwapRouter.connect(owner).exactInputSingle(swapParams)

        var numLocks = await old_univ3locker.getNumUserLocks(owner.address)
        expect(numLocks.toString()).to.equal('1')
        expect(await old_univ3locker.NONCE()).to.equal('1')

        var lock = await old_univ3locker.getUserLockAtIndex(owner.address, 0)

        return { owner, bob, additionalCollector, old_univ3locker, new_univ3locker, nftId_unlocked, lock, NftPositionManager, autoCollector, tokenA, tokenB };
    }

    describe("Migration Testing", function () {

        it("Should fail to migrate when migrator not set", async function () {
            const { owner, old_univ3locker, lock } = await loadFixture(deployFixture);

            var migrationCall = old_univ3locker.connect(owner).migrate(lock.lock_id)
            await expect(migrationCall).to.be.revertedWith("NOT SET");
        });

        it("Should fail to migrate if nftPositionManager incorrectly set", async function () {
            const { owner, old_univ3locker, lock } = await loadFixture(deployFixture);

            const Migrator = await ethers.getContractFactory("MigrateV3NFT");
            const migrator = await Migrator.deploy(owner.address, owner.address); // using any address which is not the univ3locker address
            await old_univ3locker.connect(owner).setMigrator(migrator.target)

            var migrationCall = old_univ3locker.connect(owner).migrate(lock.lock_id)
            await expect(migrationCall).to.be.revertedWith("SENDER NOT UNCX LOCKER");
        });

        it("Should fail to allow non owner to set migrator address", async function () {
            const { owner, bob, old_univ3locker, new_univ3locker } = await loadFixture(deployFixture);

            const Migrator = await ethers.getContractFactory("MigrateV3NFT");
            const migrator = await Migrator.deploy(old_univ3locker.target, new_univ3locker.target);
            var setMigratorCall = old_univ3locker.connect(bob).setMigrator(migrator.target) // Using an address which is not the owner of univ3locker
            await expect(setMigratorCall).to.be.revertedWith("Ownable: caller is not the owner");
        });

        it("Should fail to migrate for a user who is not the locker", async function () {
            const { owner, bob, old_univ3locker, new_univ3locker, lock } = await loadFixture(deployFixture);

            const Migrator = await ethers.getContractFactory("MigrateV3NFT");
            const migrator = await Migrator.deploy(old_univ3locker.target, new_univ3locker.target);
            await old_univ3locker.setMigrator(migrator.target)

            var migrationCall = old_univ3locker.connect(bob).migrate(lock.lock_id) // owner is not the lock owner
            await expect(migrationCall).to.be.revertedWith("OWNER");
        });

        it("Should allow to migrate", async function () {
            const { owner, old_univ3locker, new_univ3locker, NftPositionManager, lock, tokenA, tokenB } = await loadFixture(deployFixture);

            const positionBefore = await LogPosition.getPosition(NftPositionManager, lock.nft_id)

            const Migrator = await ethers.getContractFactory("MigrateV3NFT");
            const migrator = await Migrator.deploy(old_univ3locker.target, new_univ3locker.target); // Correctly defined
            await old_univ3locker.setMigrator(migrator.target)
            await new_univ3locker.setMigrateInContract(migrator.target)

            await old_univ3locker.connect(owner).migrate(lock.lock_id)

            const numLocks = await new_univ3locker.getLocksLength()
            expect(numLocks).to.equal(1)

            const newLock = await new_univ3locker.getLock(0)
            
            expect(newLock.nftPositionManager).to.equal(lock.nftPositionManager)
            expect(newLock.pool).to.equal(lock.pool)
            expect(newLock.nft_id).to.equal(lock.nft_id)
            expect(newLock.owner).to.equal(lock.owner)
            expect(newLock.additionalCollector).to.equal(lock.additionalCollector)
            expect(newLock.collectAddress).to.equal(lock.collectAddress)
            expect(newLock.unlockDate).to.equal(lock.unlockDate)
            expect(newLock.countryCode).to.equal(lock.countryCode)
            expect(newLock.ucf).to.equal(lock.ucf)

            // const oldLock = await old_univ3locker.getLock(lock.lock_id)
            // console.log(oldLock)

            const positionAfter = await LogPosition.getPosition(NftPositionManager, newLock.nft_id)

            expect(positionBefore.amount0).to.equal(positionAfter.amount0)
            expect(positionBefore.amount1).to.equal(positionAfter.amount1)
            expect(positionBefore.ratio).to.equal(positionAfter.ratio)

            // fees are harvested on lock
            // expect(positionBefore.fee0).to.equal(positionAfter.fee0)
            // expect(positionBefore.fee1).to.equal(positionAfter.fee1)

            // console.log(positionAfter)
            console.log("Liquidity", positionAfter.token0.symbol, ethers.formatUnits(positionAfter.amount0.toString(), positionAfter.token0.decimals))
            console.log("Liquidity", positionAfter.token1.symbol, ethers.formatUnits(positionAfter.amount1.toString(), positionAfter.token1.decimals))

        });

    });

});
