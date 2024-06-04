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
      
      const FeeResolver = await ethers.getContractFactory("FeeResolver");
      const feeResolver = await FeeResolver.deploy(univ3locker.target, owner.address, owner.address);

      univ3locker.setFeeResolver(feeResolver.target)

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

      await NftPositionManager.connect(owner).approve(univ3locker.target, nftId_unlocked)

      return { owner, bob, dustReceiver, additionalCollector, weth, uncx, tokenA, tokenB, univ3locker, feeResolver, pool, nftId_unlocked, NftPositionManager };
  }

  describe("Flat Fee Whitelist Testing", function () {

      it("Should allow a lock to go through without paying the flat fee", async function () {
          const { univ3locker, feeResolver, owner, bob, additionalCollector, dustReceiver, nftId_unlocked, NftPositionManager } = await loadFixture(deployFixture);
          
          await univ3locker.addOrEditFee(
            "DEFAULT", 
            200, // _lpFee
            50, // _collectFee
            20000, // _flatFee
            ethers.ZeroAddress
          )

          await feeResolver.whitelistFeeAccount(owner.address, true)
          
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
              [
                ethers.AbiCoder.defaultAbiCoder().encode(["string"], ["DEFAULT"])
              ]
          ]
          await univ3locker.connect(owner).lock(lockParams)
      });

  });

});
