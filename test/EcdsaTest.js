import {
    time,
    loadFixture,
} from "@nomicfoundation/hardhat-network-helpers"
import { expect } from "chai"
import keccak256 from 'keccak256'

// Uniswap Deployment Addresses
// https://docs.uniswap.org/contracts/v3/reference/deployments

/* 
Native type signatures (reference)

const messageHash = ethers.utils.solidityPack(
    ["bytes32", "uint256", "uint256"],
    [message.refCode, message.lpFee, message.collectFee]
);
    
var kec = keccak256(messageHash)
var signature = await signerA.signMessage(kec);
var result = await feeResolver.checkSignature(
    message.refCode, 
    message.lpFee, 
    message.collectFee, 
    signature
)
var concatenated = ethers.utils.solidityPack(
    bytesArray.map(item => "bytes"),
    bytesArray
)
*/

var HASH_PREFIX;

async function generateSignedByteArray(message, signer) {
    var bytesArray = [
        ethers.AbiCoder.defaultAbiCoder().encode(["bytes32"], [message.refCode]),
        ethers.AbiCoder.defaultAbiCoder().encode(["bool"], [message.isSignerA]),
        ethers.AbiCoder.defaultAbiCoder().encode(["uint256"], [message.lpFee]),
        ethers.AbiCoder.defaultAbiCoder().encode(["uint256"], [message.collectFee]),
        ethers.AbiCoder.defaultAbiCoder().encode(["address"], [message.user]),
    ]

    // this is favoured over solidityPack and abi.encodePacked for security
    var concatenated = ethers.concat([HASH_PREFIX, ...bytesArray])
    var msgHash = keccak256(concatenated)

    var bytesSignature = await signer.signMessage(msgHash);
    bytesArray.push(bytesSignature)
    return bytesArray
}

describe("Uniswap V3 Lockers", function () {
    // We define a fixture to reuse the same setup in every test.
    // We use loadFixture to run this setup once, snapshot that state,
    // and reset Hardhat Network to that snapshot in every test.
    async function deployFixture() {

        // Contracts are deployed using the first signer/account by default
        const [owner, bob, signerA, signerB] = await ethers.getSigners();

        const FeeResolver = await ethers.getContractFactory("FeeResolver");
        const feeResolver = await FeeResolver.deploy(owner.address, signerA.address, signerB.address);
        HASH_PREFIX = await feeResolver.HASH_PREFIX()
        // console.log('HashPrefix', HASH_PREFIX)

        return { owner, bob, signerA, signerB, feeResolver };
    }

    describe("ECDSA test, on FeeResolver directly", function () {

        it("Should allow signerA to set fees as low as zero", async function () {
            const { feeResolver, owner, signerA, signerB } = await loadFixture(deployFixture);

            var message = {
                refCode: ethers.id('RefCode_01'),
                isSignerA: true,
                lpFee: '0',
                collectFee: '0',
                user: owner.address
            }

            var signedByteArray = await generateSignedByteArray(message, signerA)

            expect(await feeResolver.NONCE_USED(message.refCode)).to.equal(false)

            await feeResolver.useFee(signedByteArray, owner.address)

            expect(await feeResolver.NONCE_USED(message.refCode)).to.equal(true)

        });

        it("Should prevent signerB setting fees as low as zero", async function () {
            const { feeResolver, owner, signerA, signerB } = await loadFixture(deployFixture);

            var message = {
                refCode: ethers.id('RefCode_01'),
                isSignerA: false,
                lpFee: '0',
                collectFee: '0',
                user: owner.address
            }

            var signedByteArray = await generateSignedByteArray(message, signerB)
            await expect(feeResolver.useFee(signedByteArray, owner.address)).to.be.revertedWith('R threshold')

        });

        it("Should allow signerB to set fees above or equal to the threshold", async function () {
            const { feeResolver, owner, signerA, signerB } = await loadFixture(deployFixture);

            var message = {
                refCode: ethers.id('RefCode_01'),
                isSignerA: false,
                lpFee: '30',
                collectFee: '30',
                user: owner.address
            }

            var signedByteArray = await generateSignedByteArray(message, signerB)
            await feeResolver.useFee(signedByteArray, owner.address)

        });

        it("Should return the desired fee struct before use", async function () {
            const { feeResolver, owner, signerA, signerB } = await loadFixture(deployFixture);

            var message = {
                refCode: ethers.id('RefCode_01'),
                isSignerA: false,
                lpFee: '30',
                collectFee: '35',
                user: owner.address
            }

            var signedByteArray = await generateSignedByteArray(message, signerB)
            var feeStruct = await feeResolver.getFee(signedByteArray)
            // console.log(feeStruct)

            expect(feeStruct.lpFee).to.equal(30)
            expect(feeStruct.collectFee).to.equal(35)
            expect(feeStruct.flatFee).to.equal(0)

        });

        it("Should prevent another account from using a signature meant for a different account", async function () {
            const { feeResolver, owner, signerA, signerB } = await loadFixture(deployFixture);

            var message = {
                refCode: ethers.id('RefCode_01'),
                isSignerA: true,
                lpFee: '0',
                collectFee: '0',
                user: owner.address
            }

            var signedByteArray = await generateSignedByteArray(message, signerA)

            expect(await feeResolver.NONCE_USED(message.refCode)).to.equal(false)

            await expect(feeResolver.useFee(signedByteArray, signerA.address)).to.be.revertedWith('MSG.SENDER')

        });

    });

});
