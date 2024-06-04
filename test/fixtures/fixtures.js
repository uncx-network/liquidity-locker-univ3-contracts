import INonfungiblePositionManagerABI from '@uniswap/v3-periphery/artifacts/contracts/interfaces/INonfungiblePositionManager.sol/INonfungiblePositionManager.json' assert { type: "json" }
import IUniswapV3Factory from '@uniswap/v3-core/artifacts/contracts/interfaces/IUniswapV3Factory.sol/IUniswapV3Factory.json' assert { type: "json" }
import ISwapRouter from '@uniswap/swap-router-contracts/artifacts/contracts/interfaces/ISwapRouter02.sol/ISwapRouter02.json' assert { type: "json" }
import IUniswapV3PoolABI from '@uniswap/v3-core/artifacts/contracts/interfaces/IUniswapV3Pool.sol/IUniswapV3Pool.json' assert { type: "json" }
import { TickMath } from '@uniswap/v3-sdk'

import { sortTokens } from "../helpers/uniswap-math.js"

import SETTINGS from '../../settings.js'

const Self = {
    async deployContracts () {

        // Contracts are deployed using the first signer/account by default
        const [owner, alice, bob, additionalCollector, autoCollector, lpFeeReceiver, collectFeeReceiver, signerA, signerB] = await ethers.getSigners();

        // Deploy Locker and initialize pool
        const UniV3Locker = await ethers.getContractFactory("UNCX_LiquidityLocker_UniV3");
        const univ3locker = await UniV3Locker.deploy(SETTINGS.contracts.CountryList, autoCollector.address, lpFeeReceiver.address, collectFeeReceiver.address);
        await univ3locker.allowNftPositionManager(SETTINGS.contracts.NonfungiblePositionManager)
        
        // Deploy FullRangeConvertor
        const FullRangeConvertor = await ethers.getContractFactory("FullRangeConvertorV2");
        const fullRangeConvertor = await FullRangeConvertor.deploy(univ3locker.target);

        const FeeResolver = await ethers.getContractFactory("FeeResolver");
        const feeResolver = await FeeResolver.deploy(univ3locker.target, signerA.address, signerB.address);

        var NftPositionManager = new ethers.Contract(SETTINGS.contracts.NonfungiblePositionManager, INonfungiblePositionManagerABI.abi, ethers.provider)
        var UniswapV3Factory = new ethers.Contract(await NftPositionManager.factory(), IUniswapV3Factory.abi, ethers.provider)
        var SwapRouter = new ethers.Contract(SETTINGS.contracts.SwapRouter, ISwapRouter.abi, ethers.provider)

        return { 
            owner, alice, bob, additionalCollector, autoCollector, lpFeeReceiver, collectFeeReceiver, signerA, signerB, 
            univ3locker, fullRangeConvertor, feeResolver, NftPositionManager, UniswapV3Factory, SwapRouter
        };
    },

    async mintPosition (owner, UniswapV3Factory, NftPositionManager, SwapRouter) {
        const SimpleERC20 = await ethers.getContractFactory("Erc20Simple");
        const weth = await SimpleERC20.deploy('Wrapped Ether', 'WETH');
        const uncx = await SimpleERC20.deploy('UNCX', 'UNCX');
        const fee = 500
        var [tokenA, tokenB] = sortTokens(weth, uncx)

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

        return {
            uncx, weth, fee, pool
        }
    },

    async doSwaps (weth, uncx, fee, owner, SwapRouter) {
        // Perform two swaps to generate some fees to collect
        var [tokenA, tokenB] = sortTokens(weth, uncx)
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
    }
}

export default Self