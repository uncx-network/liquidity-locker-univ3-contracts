// 

import hre from "hardhat"
import SETTINGS from '../settings.js'

async function main() {

  const [account1] = await ethers.getSigners();

  // SET THIS CONTRACT ADDRESS
  const newLockerContract = '0xb108D212d1aEDf054354E7E707eab5bce6e029C6'

  const FullRangeConvertor = await hre.ethers.getContractFactory("FullRangeConvertorV2")
  const fullRangeConvertor = await FullRangeConvertor.deploy(newLockerContract)
  await fullRangeConvertor.waitForDeployment()

  console.log('FullRangeConvertorV2.sol', fullRangeConvertor.target)

  var secondsToSleep = 10
  for (var i = 0; i < secondsToSleep; i++) {
    console.log(`Sleeping for ${secondsToSleep - i} seconds`)
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  await hre.run("verify:verify", {
    address: fullRangeConvertor.target,
    constructorArguments: [
      newLockerContract
    ],
  });

  // Or manual verification -- This line below worked to verify
  // npx hardhat verify --contract contracts/periphery/FullRangeConvertorV2.sol:FullRangeConvertorV2 --network avax --constructor-args scripts/arguments.cjs 0x94Da79cFCAba608A1c86aca73F80918BEad4BC10
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
