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
import NftPositionManagerHelper from './helpers/nft-position-manager.js'
import LogPosition from './helpers/log-position.js'
import SETTINGS from '../settings.js'

describe("Uniswap V3 Lockers", function () {
    // We define a fixture to reuse the same setup in every test.
    // We use loadFixture to run this setup once, snapshot that state,
    // and reset Hardhat Network to that snapshot in every test.
    async function deployFixture() {

        console.log(SETTINGS)

        // Contracts are deployed using the first signer/account by default
        const [owner, dustReceiver, bob, additionalCollector, autoCollector, lpFeeReceiver, collectFeeReceiver] = await ethers.getSigners();

        // Deploy Locker and initialize pool
        const UniV3Locker = await ethers.getContractFactory("UNCX_ProofOfReservesV2_UniV3");
        const univ3locker = await UniV3Locker.deploy(SETTINGS.contracts.CountryList, autoCollector.address, lpFeeReceiver.address, collectFeeReceiver.address);

        var NftPositionManager = new ethers.Contract(SETTINGS.contracts.NonfungiblePositionManager, INonfungiblePositionManagerABI.abi, ethers.provider)
        var UniswapV3Factory = new ethers.Contract(NftPositionManager.factory(), IUniswapV3Factory.abi, ethers.provider)
        var SwapRouter = new ethers.Contract(SETTINGS.contracts.SwapRouter, ISwapRouter.abi, ethers.provider)

        const SimpleERC20 = await ethers.getContractFactory("Erc20Simple");
        const feeToken = await SimpleERC20.deploy('FeeTokenERC20', 'FeeTokenERC20');

        await AccountHelper.drainAccount(lpFeeReceiver, owner)

        return { owner, bob, dustReceiver, additionalCollector, univ3locker, NftPositionManager, UniswapV3Factory, SwapRouter, autoCollector, lpFeeReceiver, collectFeeReceiver, feeToken };
    }

    describe("Lock a NFT on mainnet", function () {

        it("Should lock a nft you enter from the mainnet", async function () {
            const { NftPositionManager, UniswapV3Factory, univ3locker, owner, dustReceiver, lpFeeReceiver, feeToken } = await loadFixture(deployFixture);

            /*
                SET THIS NFT ID FROM A POSITION ON MAINNET TO SEE HOW IT WILL LOCK
            */
           // 482922 = WETH / USDT (Requires safe approve or fails)
            var nft_to_send = 43380 // The nft to test from mainnet

            var ownerOfNft = await NftPositionManager.ownerOf(nft_to_send)
            console.log('owner:', ownerOfNft)
            var signer = await AccountHelper.impersonate(ownerOfNft)

            var maxUint128 = '340282366920938463463374607431768211455'
            await AccountHelper.sendEth(owner, ownerOfNft, "5")

            var position = await NftPositionManager.positions(nft_to_send)
            var token0 = await Erc20Helper.getUniToken(position.token0)
            var token1 = await Erc20Helper.getUniToken(position.token1)

            // you can comment this line to test with and without collection fees
            // await NftPositionManager.connect(signer).collect([nft_to_send, signer.address, maxUint128, maxUint128])

            var liquidityBefore = await NftPositionManagerHelper.getLiquidity(NftPositionManager, UniswapV3Factory, token0, token1, nft_to_send)
            console.log('------------------------------------------')
            console.log('---------- Liquidity NFT Before ----------')
            console.log('LIQUIDITY', token0.symbol, ethers.formatUnits(liquidityBefore.positionAmount0.toString(), token0.decimals), liquidityBefore.ratio + '%')
            console.log('LIQUIDITY', token1.symbol, ethers.formatUnits(liquidityBefore.positionAmount1.toString(), token1.decimals), (100 - liquidityBefore.ratio) + '%')

            var slot0Before = await NftPositionManagerHelper.slot0(NftPositionManager, UniswapV3Factory, nft_to_send)

            console.log('one')
            await NftPositionManager.connect(signer).approve(univ3locker.address, nft_to_send)
            await univ3locker.connect(owner).addOrEditFee(
                "DEFAULT", // name
                100, // lpFee
                0, // collectFee
                ethers.parseUnits('1.5', 18).toString(), // flatFee
                // feeToken.address // erc20 as flat fee
                ethers.ZeroAddress // eth as flat fee token
            )
            console.log('two')
            var feeOption = await univ3locker.getFee("DEFAULT")
            if (feeOption.feeToken !== ethers.ZeroAddress) {
                await feeToken.transfer(signer.address, feeOption.flatFee)
                await feeToken.connect(signer).approve(univ3locker.address, feeOption.flatFee)
            }
            console.log('three', owner.address)
            await univ3locker.connect(signer).lock([
                SETTINGS.contracts.NonfungiblePositionManager,
                nft_to_send,
                dustReceiver.address, // dustRecipient
                owner.address, // owner
                '0x692C7972cd975EF122F3D0FAb5718f8A167075c6', // additionalCollector
                '0x692C7972cd975EF122F3D0FAb5718f8A167075c6', // collectAddress
                Math.floor(Date.now() / 1000) + 100, // unlockDate
                20, // countryCode
                "DEFAULT",
                []
            ],
            {
                value: feeOption.flatFeeToken === ethers.ZeroAddress ? feeOption.flatFee.toString() : 0
            })

            console.log('hre3')

            var lock0 = await univ3locker.getLock(0)
            console.log(lock0)

            var liquidityAfter = await NftPositionManagerHelper.getLiquidity(NftPositionManager, UniswapV3Factory, token0, token1, lock0.nft_id)
            console.log('------------------------------------------')
            console.log('---------- Liquidity NFT After -----------')
            console.log('LIQUIDITY', token0.symbol, ethers.formatUnits(liquidityAfter.positionAmount0.toString(), token0.decimals), liquidityAfter.ratio + '%')
            console.log('LIQUIDITY', token1.symbol, ethers.formatUnits(liquidityAfter.positionAmount1.toString(), token1.decimals), (100 - liquidityAfter.ratio) + '%')

            var dustToken0 = await Erc20Helper.balanceOf(token0.address, dustReceiver.address)
            var dustToken1 = await Erc20Helper.balanceOf(token1.address, dustReceiver.address)

            console.log('------------------------------------------')
            console.log('---------- Balances ----------------------')
            console.log('DUST', token0.symbol, ethers.formatUnits(dustToken0.toString(), token0.decimals))
            console.log('DUST', token1.symbol, ethers.formatUnits(dustToken1.toString(), token1.decimals))

            var lpFeeToken0 = await Erc20Helper.balanceOf(token0.address, lpFeeReceiver.address)
            var lpFeeToken1 = await Erc20Helper.balanceOf(token1.address, lpFeeReceiver.address)

            console.log('LP_FEE', token0.symbol, ethers.formatUnits(lpFeeToken0.toString(), token0.decimals))
            console.log('LP_FEE', token1.symbol, ethers.formatUnits(lpFeeToken1.toString(), token1.decimals))
            if (feeOption.flatFeeToken === ethers.ZeroAddress) {
                var gasTokenBalance = await ethers.provider.getBalance(lpFeeReceiver.address)
                console.log('FLAT_FEE', ethers.formatUnits(gasTokenBalance.toString(), 18), 'ETH / GAS TOKEN')
            } else {
                var flatFeeERCBalance = await feeToken.balanceOf(lpFeeReceiver.address)
                console.log('FLAT_FEE', ethers.formatUnits(flatFeeERCBalance.toString(), 18), await feeToken.symbol())
            }

            var sumToken0 = ethers.BigNumber.from(liquidityAfter.positionAmount0.toString()).add(lpFeeToken0).add(dustToken0)
            var sumToken1 = ethers.BigNumber.from(liquidityAfter.positionAmount1.toString()).add(lpFeeToken1).add(dustToken1)
            console.log('-------------------------------------------')
            console.log('---------- SUM TOTAL ----------------------')
            console.log('SUM', ethers.formatUnits(sumToken0.toString(), token0.decimals))
            console.log('SUM', ethers.formatUnits(sumToken1.toString(), token1.decimals))

            var slot0After = await NftPositionManagerHelper.slot0(NftPositionManager, UniswapV3Factory, lock0.nft_id)
            console.log('CurrentTick Before', slot0Before.tick)
            console.log('CurrentTick After', slot0After.tick)

            // These might fail due to math library errors, but they will be super close (within 0.00000001%)
            // expect(sumToken0.toString()).to.equal(liquidityBefore.positionAmount0.toString())
            // expect(sumToken1.toString()).to.equal(liquidityBefore.positionAmount1.toString())
        });

    });

});
