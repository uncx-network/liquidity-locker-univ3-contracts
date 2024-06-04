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
import IERC20Minimal from '@uniswap/v3-core/artifacts/contracts/interfaces/IERC20Minimal.sol/IERC20Minimal.json' assert { type: "json" }
import { sortTokens } from "./helpers/uniswap-math.js"
import { getFees } from './helpers/uniswap-fees.js'
import Erc20Helper from './helpers/erc20.js'
import AccountHelper from './helpers/account.js'
import LogPosition from './helpers/log-position.js'
import Fixtures from './fixtures/fixtures.js'

describe("Uniswap V3 Lockers", function () {
    // We define a fixture to reuse the same setup in every test.
    // We use loadFixture to run this setup once, snapshot that state,
    // and reset Hardhat Network to that snapshot in every test.
    async function deployFixture() {

        const { owner, alice, bob, additionalCollector, autoCollector, lpFeeReceiver, collectFeeReceiver, signerA, signerB, 
            univ3locker, fullRangeConvertor, feeResolver, NftPositionManager, UniswapV3Factory, SwapRouter } = await Fixtures.deployContracts()
  
          const { uncx, weth, fee } = await Fixtures.mintPosition(owner, UniswapV3Factory, NftPositionManager, SwapRouter)
  
          var nftId_unlocked = Number(await NftPositionManager.tokenOfOwnerByIndex(owner.address, 0))
          await NftPositionManager.connect(owner).approve(fullRangeConvertor.target, nftId_unlocked)
  
          var lockParams = [
              NftPositionManager.target,
              nftId_unlocked, 
              alice.address, // receiver of collect() and tokens which dont fit in liquidity
              owner.address, // lock owner
              additionalCollector.address, // additionalCollector
              additionalCollector.address, // collectAddress
              Math.floor(Date.now() / 1000) + 100, // unlockDate
              12, // country code
              "DEFAULT",
              [] // r
          ]
  
          await fullRangeConvertor.connect(owner).convertToFullRangeAndLock(lockParams, [1,1,0,0])
          await Fixtures.doSwaps (weth, uncx, fee, owner, SwapRouter)
  
          var lock = await univ3locker.getUserLockAtIndex(owner.address, 0)
  
          return { owner, bob, additionalCollector, autoCollector, lpFeeReceiver, collectFeeReceiver, uncx, weth, univ3locker, fullRangeConvertor, nftId_unlocked, lock, NftPositionManager, autoCollector, signerA, signerB, feeResolver };
    }

    describe("Collect via locker Testing", function () {

        it("Should fail to collect fees for a user who is not the lock owner", async function () {
            const { univ3locker, owner, bob, lock } = await loadFixture(deployFixture);
            var call = univ3locker.connect(bob).collect(lock.lock_id, owner.address, 10, 10) // bob is not the lock owner
            await expect(call).to.be.revertedWith("OWNER");
        });

        it("Should allow collecting fees for lock owner", async function () {
            const { univ3locker, owner, lock } = await loadFixture(deployFixture);
            await univ3locker.connect(owner).collect(lock.lock_id, owner.address, 10, 10)
        });

        it("Should allow collecting when there is no fees, same as NftPositionManager", async function () {
            const { univ3locker, owner, lock } = await loadFixture(deployFixture);
            await univ3locker.connect(owner).collect(lock.lock_id, owner.address, ethers.parseUnits('2', 18).toString(), ethers.parseUnits('2', 18).toString())
            // These calls are collecting when there is zero fees
            await univ3locker.connect(owner).collect(lock.lock_id, owner.address, ethers.parseUnits('2', 18).toString(), ethers.parseUnits('2', 18).toString())
            await univ3locker.connect(owner).collect(lock.lock_id, owner.address, ethers.parseUnits('2', 18).toString(), ethers.parseUnits('2', 18).toString())
        });

        it("Should allow collecting fees for additionalCollector", async function () {
            const { univ3locker, additionalCollector, lock } = await loadFixture(deployFixture)
            await univ3locker.connect(additionalCollector).collect(lock.lock_id, additionalCollector.address, 10, 10)
        });

        it("Should not allow setting additionalCollector from non lock owner", async function () {
            const { univ3locker, bob, lock } = await loadFixture(deployFixture)
            await expect(univ3locker.connect(bob).setAdditionalCollector(lock.lock_id, bob.address)).to.be.revertedWith('OWNER')
        });

        it("Should allow setting additionalCollector from lock owner", async function () {
            const { univ3locker, owner, bob, lock } = await loadFixture(deployFixture)
            await univ3locker.connect(owner).setAdditionalCollector(lock.lock_id, bob.address)
        });

        it("Should set bob as additional collector", async function () {
            const { univ3locker, owner, bob, lock, NftPositionManager } = await loadFixture(deployFixture)
            await expect(univ3locker.connect(bob).collect(lock.lock_id, bob.address, 10, 10)).to.be.revertedWith('OWNER')

            await univ3locker.connect(owner).setAdditionalCollector(lock.lock_id, bob.address)
            await univ3locker.connect(bob).collect(lock.lock_id, bob.address, 10, 10)

            await LogPosition.logPosition(NftPositionManager, lock.nft_id)
        });

        it("Should not allow someone to collect via the nft manager", async function () {
            const { owner, bob, lock, NftPositionManager } = await loadFixture(deployFixture)
            await expect(NftPositionManager.connect(owner).collect([lock.nft_id, bob.address, 10, 10])).to.be.revertedWith('Not approved')
        });

        it("Should allow collecting via the auto collector", async function () {
            const { univ3locker, bob, lock, autoCollector } = await loadFixture(deployFixture)

            await univ3locker.setFeeParams(bob.address, await univ3locker.FEE_ADDR_LP(), await univ3locker.FEE_ADDR_COLLECT())

            await expect(univ3locker.connect(autoCollector).collect(lock.lock_id, bob.address, 10, 10)).to.be.revertedWith('OWNER')

            await univ3locker.setFeeParams(autoCollector.address, await univ3locker.FEE_ADDR_LP(), await univ3locker.FEE_ADDR_COLLECT())
            await univ3locker.connect(autoCollector).collect(lock.lock_id, bob.address, 10, 10)
        });

    });

});
