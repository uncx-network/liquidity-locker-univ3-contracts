// 

import hre from "hardhat"

async function main() {

  const [account1] = await ethers.getSigners();

  // SET THESE TWO CONTRACTS
  const oldLockerContract = '0x7f5C649856F900d15C83741f45AE46f5C6858234'
  const newLockerContract = '0xFD235968e65B0990584585763f837A5b5330e6DE'

  const MigratorContract = await hre.ethers.getContractFactory("MigrateV3NFT")
  const migrator = await MigratorContract.deploy(oldLockerContract, newLockerContract)
  await migrator.waitForDeployment()

  console.log('migrator', migrator.target)

  // var secondsToSleep = 18
  // for (var i=0; i < secondsToSleep; i++) {
  //   console.log(`Sleeping for ${ secondsToSleep - i } seconds`)
  //   await new Promise(resolve => setTimeout(resolve, 1000));
  // }

  // await hre.run("verify:verify", {
  //   address: migrator.target,
  //   constructorArguments: [
  //     oldLockerContract,
  //     newLockerContract
  //   ],
  // });

  // Or manual verification -- This line below worked to verify
  // npx hardhat verify --contract contracts/MigrateV3NFT.sol:MigrateV3NFT --network eth --constructor-args scripts/arguments.cjs 0x4bd7Ab5721208db79917C540FF0B51a631Cc3435
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
