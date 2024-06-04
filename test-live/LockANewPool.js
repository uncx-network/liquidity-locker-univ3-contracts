import {
    time,
    loadFixture,
  } from "@nomicfoundation/hardhat-network-helpers"
  // import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs"
  import { expect } from "chai"
  import { computePoolAddress, Pool, FeeAmount, NonfungiblePositionManager } from '@uniswap/v3-sdk'
  import { SupportedChainId, Token, CurrencyAmount, Percent } from '@uniswap/sdk-core'
  import IUniswapV3PoolABI from '@uniswap/v3-core/artifacts/contracts/interfaces/IUniswapV3Pool.sol/IUniswapV3Pool.json' assert { type: "json" }
  import INonfungiblePositionManagerABI from '@uniswap/v3-periphery/artifacts/contracts/interfaces/INonfungiblePositionManager.sol/INonfungiblePositionManager.json' assert { type: "json" }
  import { encodePriceSqrt, sortTokens, getPoolInfo, constructPosition } from "./helpers/uniswap-math.js"
  import { fromReadableAmount } from './helpers/conversion.js'

  // Uniswap Deployment Addresses
  // https://docs.uniswap.org/contracts/v3/reference/deployments

  const UNI_CONTRACTS = {
    NonfungiblePositionManager: '0xC36442b4a4522E871399CD717aBDD847Ab11FE88',
    UniswapV3Factory: '0x1F98431c8aD98523631AE4a59f267346ea31F984'
  }
  
  describe("Uniswap Locks", function () {
    // We define a fixture to reuse the same setup in every test.
    // We use loadFixture to run this setup once, snapshot that state,
    // and reset Hardhat Network to that snapshot in every test.
    async function deployFixture() {
  
      // Contracts are deployed using the first signer/account by default
      const [owner, otherAccount] = await ethers.getSigners();
  
      const SimpleERC20 = await ethers.getContractFactory("Erc20Simple");
      const weth = await SimpleERC20.deploy('Wrapped Ether', 'WETH');
      const uncx = await SimpleERC20.deploy('UNCX', 'UNCX');

      // Locker
      const UniV3Locker = await ethers.getContractFactory("UNCX_ProofOfReservesV2_UniV3");
      const univ3locker = await UniV3Locker.deploy();

      const WETH_TOKEN = new Token(
        SupportedChainId.ARBITRUM_ONE,
        weth.address,
        18,
        await weth.name(),
        await weth.symbol()
      )
      const UNCX_TOKEN = new Token(
        SupportedChainId.ARBITRUM_ONE,
        uncx.address,
        18,
        await uncx.name(),
        await uncx.symbol()
      )

      var [tokenA, tokenB] = sortTokens(WETH_TOKEN, UNCX_TOKEN)
      var NftPositionManager = new ethers.Contract( UNI_CONTRACTS.NonfungiblePositionManager , INonfungiblePositionManagerABI.abi , ethers.provider )
      await NftPositionManager.connect(owner).createAndInitializePoolIfNecessary(
        tokenA.address,
        tokenB.address,
        FeeAmount.MEDIUM,
        encodePriceSqrt(1, 1)
      )

      var poolInfo = await getPoolInfo(UNI_CONTRACTS.UniswapV3Factory, tokenA, tokenB, FeeAmount.MEDIUM, ethers.provider)

      var positionToMint = await constructPosition(
        CurrencyAmount.fromRawAmount(
          tokenA,
          fromReadableAmount(
            10,
            tokenA.decimals
          )
        ),
        CurrencyAmount.fromRawAmount(
          tokenB,
          fromReadableAmount(
            10,
            tokenB.decimals
          )
        ),
        poolInfo)

      // console.log(positionToMint)

      const mintOptions = {
        recipient: owner.address,
        deadline: Math.floor(Date.now() / 1000) + 60 * 20,
        slippageTolerance: new Percent(50, 10_000),
      }
    
      // get calldata for minting a position
      const { calldata, value } = NonfungiblePositionManager.addCallParameters(
        positionToMint,
        mintOptions
      )

      const transaction = {
        data: calldata,
        to: UNI_CONTRACTS.NonfungiblePositionManager,
        value: 0,
        from: owner.address,
        // maxFeePerGas: '100000000000',
        // maxPriorityFeePerGas: '100000000000',
      }
      
      await weth.approve(UNI_CONTRACTS.NonfungiblePositionManager, '100000000000000000000000')
      await uncx.approve(UNI_CONTRACTS.NonfungiblePositionManager, '100000000000000000000000')
      await owner.sendTransaction(transaction)

      var balance = await NftPositionManager.balanceOf(owner.address)
      // console.log('balance', balance)

      var tokenId = await NftPositionManager.tokenOfOwnerByIndex(owner.address, 0)
      tokenId = tokenId.toNumber()
      console.log('tokenId to lock', tokenId)

      const currentPoolAddress = computePoolAddress({
        factoryAddress: UNI_CONTRACTS.UniswapV3Factory,
        tokenA: tokenA,
        tokenB: tokenB,
        fee: FeeAmount.MEDIUM,
      })

      var poolBalancesBefore = []
      poolBalancesBefore[0] = await uncx.balanceOf(currentPoolAddress)
      poolBalancesBefore[1] = await weth.balanceOf(currentPoolAddress)

      var poolInfoBefore = await getPoolInfo(UNI_CONTRACTS.UniswapV3Factory, tokenA, tokenB, FeeAmount.MEDIUM, ethers.provider)
      var positionBefore = await NftPositionManager.positions(tokenId)

      // Lock the nft
      await NftPositionManager.connect(owner).approve(univ3locker.address, tokenId)
      await univ3locker.connect(owner).lock(NftPositionManager.address, tokenId)

      // TestStuuf
      // await NftPositionManager.connect(owner).mint([uncx.address, weth.address, 3000, -887220, 887220, 500000000, 500000000, 0, 0, owner.address, Date.now() + 100000])

      var poolBalancesAfter = []
      poolBalancesAfter[0]= await uncx.balanceOf(currentPoolAddress)
      poolBalancesAfter[1] = await weth.balanceOf(currentPoolAddress)

      var feeBalancesAfter = []
      feeBalancesAfter[0]= await uncx.balanceOf('0xAA3d85aD9D128DFECb55424085754F6dFa643eb1')
      feeBalancesAfter[1] = await weth.balanceOf('0xAA3d85aD9D128DFECb55424085754F6dFa643eb1')

      console.log('Pool Balance Before lock:')
      console.log('TokenO', poolBalancesBefore[0].toString())
      console.log('Token1', poolBalancesBefore[1].toString())

      console.log('Pool Balance After lock:')
      console.log('TokenO', poolBalancesAfter[0].toString())
      console.log('Token1', poolBalancesAfter[1].toString())

      console.log('Fee Balance After lock:')
      console.log('TokenO', feeBalancesAfter[0].toString())
      console.log('Token1', feeBalancesAfter[1].toString())

      var balance = await NftPositionManager.balanceOf(univ3locker.address)
      console.log('balance', balance)

      var tokenId = await NftPositionManager.tokenOfOwnerByIndex(univ3locker.address, 0)
      tokenId = tokenId.toNumber()
      console.log('tokenId', tokenId)

      var poolInfoAfter = await getPoolInfo(UNI_CONTRACTS.UniswapV3Factory, tokenA, tokenB, FeeAmount.MEDIUM, ethers.provider)
      var positionAfter = await NftPositionManager.positions(tokenId)

      console.log("Pool info Before")
      console.log(poolInfoBefore)
      console.log("Pool info After")
      console.log(poolInfoAfter)

      console.log("Position Before")
      console.log(positionBefore)
      console.log("Position After")
      console.log(positionAfter)
  
      return { weth, uncx, owner, otherAccount };
    }
  
    describe("Deployment", function () {
      it("Should log tokens", async function () {
        const { weth, uncx } = await loadFixture(deployFixture);
  
      });
  
      it("Should do the next task", async function () {
        const { weth, uncx } = await loadFixture(deployFixture);
  
        console.log('Done')
      });
  
    });
  
  });
  