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
import IUniswapV3PoolABI from '@uniswap/v3-core/artifacts/contracts/interfaces/IUniswapV3Pool.sol/IUniswapV3Pool.json' assert { type: "json" }

import SETTINGS from '../settings.js'
import AccountHelper from '../test/helpers/account.js'

async function main() {

  const [account1, signerA, signerB] = await ethers.getSigners();

  const metamaskOwner = '0x692C7972cd975EF122F3D0FAb5718f8A167075c6'

  const autoCollector = '0x692C7972cd975EF122F3D0FAb5718f8A167075c6'
  const lpFeeReceiver = '0x224cc7923EC5193a5703Ec9E9d7899D986cce7a2'
  const collectFeeReceiver = '0xAA3d85aD9D128DFECb55424085754F6dFa643eb1'

  const UniV3Locker = await hre.ethers.getContractFactory("UNCX_ProofOfReservesV2_UniV3")
  const univ3locker = await UniV3Locker.deploy(SETTINGS.contracts.CountryList, autoCollector, lpFeeReceiver, collectFeeReceiver)
  await univ3locker.waitForDeployment()
  await univ3locker.transferOwnership(metamaskOwner)

  const FeeResolver = await hre.ethers.getContractFactory("FeeResolver");
  const feeResolver = await FeeResolver.deploy(univ3locker.target, signerA.address, signerB.address)
  await feeResolver.waitForDeployment()
  await feeResolver.transferOwnership(metamaskOwner)

  var NftPositionManager = new hre.ethers.Contract(SETTINGS.contracts.NonfungiblePositionManager, INonfungiblePositionManagerABI.abi, hre.ethers.provider)
  var UniswapV3Factory = new hre.ethers.Contract(NftPositionManager.factory(), IUniswapV3Factory.abi, hre.ethers.provider)
  var SwapRouter = new hre.ethers.Contract(SETTINGS.contracts.SwapRouter, ISwapRouter.abi, hre.ethers.provider)

  await AccountHelper.sendEth(account1, autoCollector, "10")

  console.log('NftPositionManager', NftPositionManager.target)
  console.log('univ3locker', univ3locker.target)
  console.log('feeResolver', feeResolver.target)
  console.log('account1', account1.address)
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
