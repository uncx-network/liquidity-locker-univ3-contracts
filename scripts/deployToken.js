// This contract is just for reference, no deployment scripts have been written yet

// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// You can also run a script with `npx hardhat run <script>`. If you do that, Hardhat
// will compile your contracts, add the Hardhat Runtime Environment's members to the
// global scope, and execute the script.
import hre from "hardhat"

async function main() {

  const [account1, signerA, signerB] = await ethers.getSigners();

  const metamaskOwner = '0x692C7972cd975EF122F3D0FAb5718f8A167075c6'

  const SimpleERC20 = await hre.ethers.getContractFactory("Erc20Simple")
  const token = await SimpleERC20.deploy('TEST404', 'TEST404');
  await token.waitForDeployment()

  console.log('Token Address', token.target)

  // This line below worked to verify
  // npx hardhat verify --contract contracts/testing/Erc20Simple.sol:Erc20Simple --network bsc --constructor-args scripts/arguments.cjs 0x7d322eB2F7149dE1613f4310A73254AbD08a9CC5
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
