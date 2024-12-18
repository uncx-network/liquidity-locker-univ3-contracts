
const Self = {
    async impersonate(_address) {
        await network.provider.request({
            method: "hardhat_impersonateAccount",
            params: [_address],
        });

        const signer = await ethers.getSigner(_address);
        return signer
    },
    async sendEth(sender, receiverAddress, amount) {
        await sender.sendTransaction({
            to: receiverAddress,
            value: ethers.parseEther(amount),
        });
    },
    async drainAccount(from, to) {
        const balance = await ethers.provider.getBalance(from.address);

        // Estimate the gas cost for the transaction
        // const gasPrice = await ethers.provider.getGasPrice();
        const gasPrice = (await ethers.provider.getFeeData()).gasPrice;
        const gasLimit = BigInt(21000); // standard gas limit for a transfer
        const gasCost = gasPrice * gasLimit;

        // Calculate the amount to send
        const amountToSend = balance - gasCost;

        // Construct and send the transaction
        await from.sendTransaction({
            to: to.address,
            value: amountToSend,
            gasLimit: gasLimit,
            gasPrice: gasPrice,
        });
    }
}

export default Self