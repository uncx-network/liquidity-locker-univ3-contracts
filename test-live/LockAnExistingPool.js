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
import { positionAmount0, positionAmount1, getRatio } from "./helpers/uniswap-math.js"
import { getFees } from './helpers/uniswap-fees.js'
import Erc20Helper from './helpers/erc20.js'
import AccountHelper from './helpers/account.js'
import LogPosition from './helpers/log-position.js'
import JSBI from 'jsbi'
import SETTINGS from '../settings.js'

// Uniswap Deployment Addresses
// https://docs.uniswap.org/contracts/v3/reference/deployments

describe("Uniswap Locks", function () {
    // We define a fixture to reuse the same setup in every test.
    // We use loadFixture to run this setup once, snapshot that state,
    // and reset Hardhat Network to that snapshot in every test.
    async function deployFixture() {

        // Contracts are deployed using the first signer/account by default
        const [owner, alice, bob, additionalCollector, autoCollector, lpFeeReceiver, collectFeeReceiver, signerA, signerB] = await ethers.getSigners();

        // Locker
        const UniV3Locker = await ethers.getContractFactory("UNCX_ProofOfReservesV2_UniV3");
        const univ3locker = await UniV3Locker.deploy(SETTINGS.contracts.CountryList, autoCollector.address, lpFeeReceiver.address, collectFeeReceiver.address);

        var NftPositionManager = new ethers.Contract(SETTINGS.contracts.NonfungiblePositionManager, INonfungiblePositionManagerABI.abi, ethers.provider)
        var UniswapV3Factory = new ethers.Contract(NftPositionManager.factory(), IUniswapV3Factory.abi, ethers.provider)

        // Settings
        var SET = {
            tokenId: 12199, // The tokenId of the NFT you want to lock
        }
        // https://app.uniswap.org/#/remove/403786 use this page to confirm results

        var position = await NftPositionManager.positions(SET.tokenId)
        // console.log(position)

        var poolAddress = await UniswapV3Factory.getPool(position.token0, position.token1, position.fee)
        var pool = new ethers.Contract(poolAddress, IUniswapV3PoolABI.abi, ethers.provider)

        var slot0 = await pool.slot0()
        // console.log(slot0)

        var re = await univ3locker.getAmountsForLiquidity(slot0.tick, position.tickLower, position.tickUpper, position.liquidity)
        console.log('---------------------------------------')
        console.log(re)

        var token0Meta = await Erc20Helper.getMetadata(position.token0)
        var token1Meta = await Erc20Helper.getMetadata(position.token1)

        console.log(`-------------Pre Lock: ${SET.tokenId}  ------------`)
        await LogPosition.logPosition(NftPositionManager, SET.tokenId)

        var tokenOwner = await NftPositionManager.ownerOf(SET.tokenId)
        // console.log('Owner', tokenOwner)
        var signer = await AccountHelper.impersonate(tokenOwner)
        // Send owned eth incase they dont have enough to perform transactions
        await AccountHelper.sendEth(owner, tokenOwner, "1")

        // Test Collect
        // var fees = await getFees(pool, position, slot0)
        // fees[0] = 1000
        // fees[1] = 1000
        // await NftPositionManager.connect(signer).collect([SET.tokenId, signer.address, fees[0], fees[1]])

        await NftPositionManager.connect(signer).approve(univ3locker.address, SET.tokenId)
        await univ3locker.connect(signer).lock([NftPositionManager.address, SET.tokenId, SETTINGS.DustRecipient, signer.address, 1000, 12])

        var balance = await NftPositionManager.balanceOf(univ3locker.address)
        // console.log('balance', balance)

        var newNftId = await NftPositionManager.tokenOfOwnerByIndex(univ3locker.address, 0)
        newNftId = newNftId.toNumber()

        console.log(`-------------Post Lock: ${newNftId}  ------------`)
        await LogPosition.logPosition(NftPositionManager, newNftId)

        var token0 = new ethers.Contract(position.token0, IERC20Minimal.abi, ethers.provider)
        var token1 = new ethers.Contract(position.token1, IERC20Minimal.abi, ethers.provider)

        var leftOver0 = await token0.balanceOf(univ3locker.address)
        var leftOver1 = await token1.balanceOf(univ3locker.address)

        // This should be zero
        console.log('Dust', ethers.formatUnits(leftOver0, token0Meta.decimals), token0Meta.symbol)
        console.log('Dust', ethers.formatUnits(leftOver1, token1Meta.decimals), token1Meta.symbol)

        // Fees
        var fee0 = await token0.balanceOf(SETTINGS.FeeAddress)
        var fee1 = await token1.balanceOf(SETTINGS.FeeAddress)

        console.log('FeeAddress', ethers.formatUnits(fee0, token0Meta.decimals), token0Meta.symbol)
        console.log('FeeAddress', ethers.formatUnits(fee1, token1Meta.decimals), token1Meta.symbol)

        // Dust refund
        var refund0 = await token0.balanceOf(SETTINGS.DustRecipient)
        var refund1 = await token1.balanceOf(SETTINGS.DustRecipient)

        console.log('DustRefund', ethers.formatUnits(refund0, token0Meta.decimals), token0Meta.symbol)
        console.log('DustRefund', ethers.formatUnits(refund1, token1Meta.decimals), token1Meta.symbol)

        return {};
    }

    describe("Deployment", function () {
        it("Should log tokens", async function () {
            const { } = await loadFixture(deployFixture);

        });

        it("Should do the next task", async function () {

        });

    });

});
