import Erc20Helper from './erc20.js'
import { positionAmount0, positionAmount1, getRatio } from "./uniswap-math.js"
import INonfungiblePositionManagerABI from '@uniswap/v3-periphery/artifacts/contracts/interfaces/INonfungiblePositionManager.sol/INonfungiblePositionManager.json' assert { type: "json" }
import IUniswapV3Factory from '@uniswap/v3-core/artifacts/contracts/interfaces/IUniswapV3Factory.sol/IUniswapV3Factory.json' assert { type: "json" }
import IUniswapV3PoolABI from '@uniswap/v3-core/artifacts/contracts/interfaces/IUniswapV3Pool.sol/IUniswapV3Pool.json' assert { type: "json" }
import { getFees } from './uniswap-fees.js'

// Getting positionkey and pool position if needed
// var positionKey = ethers.utils.solidityKeccak256(["address", "int24", "int24"], [UNI_CONTRACTS.NonfungiblePositionManager, position.tickLower, position.tickUpper]);
// var poolPosition = await pool.positions(positionKey)

const Self = {
    async getPosition(NftPositionManager, _tokenId) {
        // SETUP
        var UniswapV3Factory = new ethers.Contract(await NftPositionManager.factory(), IUniswapV3Factory.abi, ethers.provider)

        var position = await NftPositionManager.positions(_tokenId)
        var poolAddress = await UniswapV3Factory.getPool(position.token0, position.token1, position.fee)
        var pool = new ethers.Contract(poolAddress, IUniswapV3PoolABI.abi, ethers.provider)

        var slot0 = await pool.slot0()
        // END SETUP

        var token0Meta = await Erc20Helper.getMetadata(position.token0)
        var token1Meta = await Erc20Helper.getMetadata(position.token1)

        var amount0 = positionAmount0(slot0, position)
        var amount1 = positionAmount1(slot0, position)

        // console.log("Liquidity", token0Meta.symbol, ethers.formatUnits(amount0.toString(), token0Meta.decimals))
        // console.log("Liquidity", token1Meta.symbol, ethers.formatUnits(amount1.toString(), token1Meta.decimals))

        var fees = await getFees(pool, position, slot0)
        // console.log("Fees", ethers.formatUnits(fees[0], token0Meta.decimals))
        // console.log("Fees", ethers.formatUnits(fees[1], token1Meta.decimals))

        var ratio = getRatio(position.tickLower, slot0.tick, position.tickUpper)
        // console.log("Ratio", token0Meta.symbol, `${ratio}%`)
        // console.log("Ratio", token1Meta.symbol, `${100 - ratio}%`)

        return {
            amount0: amount0.toString(),
            amount1: amount1.toString(),
            token0: token0Meta,
            token1: token1Meta,
            ratio: ratio,
            fee0: fees[0],
            fee1: fees[1]
        }
    },
    async logPosition(NftPositionManager, _tokenId) {
        // SETUP
        var UniswapV3Factory = new ethers.Contract(await NftPositionManager.factory(), IUniswapV3Factory.abi, ethers.provider)

        var position = await NftPositionManager.positions(_tokenId)
        var poolAddress = await UniswapV3Factory.getPool(position.token0, position.token1, position.fee)
        var pool = new ethers.Contract(poolAddress, IUniswapV3PoolABI.abi, ethers.provider)

        var slot0 = await pool.slot0()
        // END SETUP

        var token0Meta = await Erc20Helper.getMetadata(position.token0)
        var token1Meta = await Erc20Helper.getMetadata(position.token1)

        var amount0 = positionAmount0(slot0, position)
        var amount1 = positionAmount1(slot0, position)

        console.log("Liquidity", token0Meta.symbol, ethers.formatUnits(amount0.toString(), token0Meta.decimals))
        console.log("Liquidity", token1Meta.symbol, ethers.formatUnits(amount1.toString(), token1Meta.decimals))

        var fees = await getFees(pool, position, slot0)
        console.log("Fees", ethers.formatUnits(fees[0], token0Meta.decimals))
        console.log("Fees", ethers.formatUnits(fees[1], token1Meta.decimals))

        var ratio = getRatio(position.tickLower, slot0.tick, position.tickUpper)
        console.log("Ratio", token0Meta.symbol, `${ratio}%`)
        console.log("Ratio", token1Meta.symbol, `${100 - ratio}%`)
    },
    async positionFees (NftPositionManager, _tokenId) {
        var UniswapV3Factory = new ethers.Contract(await NftPositionManager.factory(), IUniswapV3Factory.abi, ethers.provider)

        var position = await NftPositionManager.positions(_tokenId)
        var poolAddress = await UniswapV3Factory.getPool(position.token0, position.token1, position.fee)
        var pool = new ethers.Contract(poolAddress, IUniswapV3PoolABI.abi, ethers.provider)

        var slot0 = await pool.slot0()

        var fees = await getFees(pool, position, slot0)
        return fees
    }
}

export default Self