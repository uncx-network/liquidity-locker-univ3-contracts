// This contract is just for reference, no deployment scripts have been written yet

// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// You can also run a script with `npx hardhat run <script>`. If you do that, Hardhat
// will compile your contracts, add the Hardhat Runtime Environment's members to the
// global scope, and execute the script.
import hre from "hardhat"

import INonfungiblePositionManagerABI from '@uniswap/v3-periphery/artifacts/contracts/interfaces/INonfungiblePositionManager.sol/INonfungiblePositionManager.json' assert { type: "json" }
import IUniswapV3Factory from '@uniswap/v3-core/artifacts/contracts/interfaces/IUniswapV3Factory.sol/IUniswapV3Factory.json' assert { type: "json" }
import ISwapRouter from '@uniswap/v3-periphery/artifacts/contracts/interfaces/ISwapRouter.sol/ISwapRouter.json' assert { type: "json" }

import SETTINGS from '../settings.js'
import AccountHelper from '../test/helpers/account.js'

async function main() {

    // Set these variables to send a univ3 nft to your wallet on a fork net
    var testing_wallet = '0x692C7972cd975EF122F3D0FAb5718f8A167075c6'
    // var nft_to_send = 9006 // WETH
    var nft_to_send = 482920 // DAI USDC

    // end settings

    const [account1] = await hre.ethers.getSigners();
    
    var NftPositionManager = new hre.ethers.Contract(SETTINGS.contracts.NonfungiblePositionManager, INonfungiblePositionManagerABI.abi, hre.ethers.provider)

    var ownerOfNft = await NftPositionManager.ownerOf(nft_to_send)
    var signer = await AccountHelper.impersonate(ownerOfNft)
    await NftPositionManager.connect(signer).transferFrom(signer.address, testing_wallet, nft_to_send)
    await AccountHelper.sendEth(account1, testing_wallet, "2")

    console.log(await NftPositionManager.ownerOf(nft_to_send))
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
