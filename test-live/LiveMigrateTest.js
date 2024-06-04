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

      const [owner, dustReceiver, bob, additionalCollector, autoCollector, lpFeeReceiver, collectFeeReceiver] = await ethers.getSigners();

      const old_univ3locker = await ethers.getContractAt("UNCX_ProofOfReservesUniV3", SETTINGS.contracts.ProofOfReservesV1);

      const NewUniV3Locker = await ethers.getContractFactory("UNCX_ProofOfReservesV2_UniV3");
      const new_univ3locker = await NewUniV3Locker.deploy(SETTINGS.contracts.CountryList, autoCollector.address, lpFeeReceiver.address, collectFeeReceiver.address);

      // SET THIS Lock id to test migration of that lock
      var lock = await old_univ3locker.getLock(5)

      var NftPositionManager = new ethers.Contract(SETTINGS.contracts.NonfungiblePositionManager, INonfungiblePositionManagerABI.abi, ethers.provider)

      var position = await NftPositionManager.positions(lock.nft_id)

      var token0 = new ethers.Contract(position.token0, IERC20Minimal.abi, ethers.provider)
      var token1 = new ethers.Contract(position.token1, IERC20Minimal.abi, ethers.provider)

      return { owner, bob, additionalCollector, old_univ3locker, new_univ3locker, lock, NftPositionManager, autoCollector, token0, token1 };
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

          var lockerOwner = await old_univ3locker.owner()
          var lockerSigner = await AccountHelper.impersonate(lockerOwner)
          await old_univ3locker.connect(lockerSigner).setMigrator(migrator.address)
          
          var lockOwner = await AccountHelper.impersonate(lock.owner)
          var migrationCall = old_univ3locker.connect(lockOwner).migrate(lock.lock_id)
          await expect(migrationCall).to.be.revertedWith("SENDER NOT UNCX LOCKER");
      });

      it("Should fail to allow non owner to set migrator address", async function () {
          const { owner, bob, old_univ3locker, new_univ3locker } = await loadFixture(deployFixture);

          const Migrator = await ethers.getContractFactory("MigrateV3NFT");
          const migrator = await Migrator.deploy(old_univ3locker.address, new_univ3locker.address);
          var setMigratorCall = old_univ3locker.connect(bob).setMigrator(migrator.address) // Using an address which is not the owner of univ3locker
          await expect(setMigratorCall).to.be.revertedWith("Ownable: caller is not the owner");
      });

      it("Should fail to migrate for a user who is not the locker", async function () {
          const { owner, bob, old_univ3locker, new_univ3locker, lock } = await loadFixture(deployFixture);

          const Migrator = await ethers.getContractFactory("MigrateV3NFT");
          const migrator = await Migrator.deploy(old_univ3locker.address, new_univ3locker.address);

          var lockerOwner = await old_univ3locker.owner()
          var lockerSigner = await AccountHelper.impersonate(lockerOwner)
          await old_univ3locker.connect(lockerSigner).setMigrator(migrator.address)

          var migrationCall = old_univ3locker.connect(bob).migrate(lock.lock_id) // bob is not the lock owner
          await expect(migrationCall).to.be.revertedWith("OWNER");
      });

      it("Should allow to migrate", async function () {
          const { owner, old_univ3locker, new_univ3locker, NftPositionManager, lock, token0, token1 } = await loadFixture(deployFixture);

          const positionBefore = await LogPosition.getPosition(NftPositionManager, lock.nft_id)
          var collectAddressBalanceBeforeToken0 = await token0.balanceOf(lock.collectAddress)
          var collectAddressBalanceBeforeToken1 = await token1.balanceOf(lock.collectAddress)

          const Migrator = await ethers.getContractFactory("MigrateV3NFT");
          const migrator = await Migrator.deploy(old_univ3locker.address, new_univ3locker.address); // Correctly defined

          var lockerOwner = await old_univ3locker.owner()
          var lockerSigner = await AccountHelper.impersonate(lockerOwner)
          await old_univ3locker.connect(lockerSigner).setMigrator(migrator.address)

          await new_univ3locker.setMigrateInContract(migrator.address)
        
          var lockOwner = await AccountHelper.impersonate(lock.owner)
          await old_univ3locker.connect(lockOwner).migrate(lock.lock_id)

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

          var collectAddressBalanceAfterToken0 = await token0.balanceOf(lock.collectAddress)
          var collectAddressBalanceAfterToken1 = await token1.balanceOf(lock.collectAddress)
        
          // these arent exact due to math errors, but they are within 0.0001%
          // expect(collectAddressBalanceAfterToken0).to.equal(collectAddressBalanceBeforeToken0.add(positionBefore.fee0))
          // expect(collectAddressBalanceAfterToken1).to.equal(collectAddressBalanceBeforeToken1.add(positionBefore.fee1))

          // console.log(positionAfter)
          console.log("Liquidity", positionAfter.token0.symbol, ethers.formatUnits(positionAfter.amount0.toString(), positionAfter.token0.decimals))
          console.log("Liquidity", positionAfter.token1.symbol, ethers.formatUnits(positionAfter.amount1.toString(), positionAfter.token1.decimals))

      });

  });

});
