// 

import hre from "hardhat"

async function main() {

  const [account1] = await ethers.getSigners();

  // SET THESE CONTRACT ADDRESSES
  const metamaskOwner = '0xAA3d85aD9D128DFECb55424085754F6dFa643eb1'
  const lockerContract = '0x231278eDd38B00B07fBd52120CEf685B9BaEBCC1'
  const aSigner = '0xAA3d85aD9D128DFECb55424085754F6dFa643eb1'
  const bSigner = '0xAA3d85aD9D128DFECb55424085754F6dFa643eb1'

  const FeeResolver = await hre.ethers.getContractFactory("FeeResolver")
  const feeResolver = await FeeResolver.deploy(lockerContract, aSigner, bSigner)
  await feeResolver.waitForDeployment()

  await feeResolver.transferOwnership(metamaskOwner)

  console.log('FeeResolver.sol', feeResolver.target)

  var secondsToSleep = 10
  for (var i = 0; i < secondsToSleep; i++) {
    console.log(`Sleeping for ${secondsToSleep - i} seconds`)
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  await hre.run("verify:verify", {
    address: feeResolver.target,
    constructorArguments: [
      lockerContract,
      aSigner,
      bSigner
    ],
  });

  // Or manual verification -- This line below worked to verify
  // npx hardhat verify --contract contracts/FeeResolver.sol:FeeResolver --network avax --constructor-args scripts/arguments.cjs 0x94Da79cFCAba608A1c86aca73F80918BEad4BC10
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
