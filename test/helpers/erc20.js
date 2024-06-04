import { Token } from '@uniswap/sdk-core'
import SETTINGS from '../../settings.js'

const Self = {
    async getUniToken (_address) {
        var erc = await Self.getMetadata(_address)
        var chainId = SETTINGS.chainId
        var token = new Token(chainId, erc.address, erc.decimals, erc.symbol, erc.name)
        return token
    },
    async getMetadata (_address) {
        return {
            name: await Self.getName(_address),
            symbol: await Self.getSymbol(_address),
            decimals: await Self.getDecimals(_address),
            address: ethers.getAddress(_address) // checksum address
        }
    },
    async getName(_address) {
        var name, nameABI, nameContract
        try {
            nameABI = [{ "constant": true, "inputs": [], "name": "name", "outputs": [{ "name": "", "type": "string" }], "payable": false, "stateMutability": "view", "type": "function" }]
            nameContract = new ethers.Contract(_address, nameABI, ethers.provider)
            name = await nameContract.name()
        } catch (e) { }
        if (!name) {
            try {
                nameABI = [{ "constant": true, "inputs": [], "name": "name", "outputs": [{ "name": "", "type": "bytes32" }], "payable": false, "stateMutability": "view", "type": "function" }]
                nameContract = new ethers.Contract(_address, nameABI, ethers.provider)
                name = await nameContract.name()
                name = ethers.utils.parseBytes32String(name)
            } catch (e) { }
        }
        return name
    },
    async getSymbol(_address) {
        var symbol, symbolABI, symbolContract
        try {
            symbolABI = [{ "constant": true, "inputs": [], "name": "symbol", "outputs": [{ "name": "", "type": "string" }], "payable": false, "stateMutability": "view", "type": "function" }]
            symbolContract = new ethers.Contract(_address, symbolABI, ethers.provider)
            symbol = await symbolContract.symbol()
        } catch (e) { }
        if (!symbol) {
            try {
                symbolABI = [{ "constant": true, "inputs": [], "name": "symbol", "outputs": [{ "name": "", "type": "bytes32" }], "payable": false, "stateMutability": "view", "type": "function" }]
                symbolContract = new ethers.Contract(_address, symbolABI, ethers.provider)
                symbol = await symbolContract.symbol()
                symbol = ethers.utils.parseBytes32String(symbol)
            } catch (e) { }
        }
        return symbol
    },
    async getDecimals(_address) {
        var decimalABI = [{ "constant": true, "inputs": [], "name": "decimals", "outputs": [{ "name": "", "type": "uint8" }], "payable": false, "stateMutability": "view", "type": "function" }]
        var tokenContract = new ethers.Contract(_address, decimalABI, ethers.provider)
        var decimals = await tokenContract.decimals()
        return decimals
    },
    async balanceOf(_tokenAddress, _address) {
        var balanceABI = [{ "inputs": [ { "internalType": "address", "name": "account", "type": "address" } ], "name": "balanceOf", "outputs": [ { "internalType": "uint256", "name": "", "type": "uint256" } ], "stateMutability": "view", "type": "function" }]
        var tokenContract = new ethers.Contract(_tokenAddress, balanceABI, ethers.provider)
        var balance = await tokenContract.balanceOf(_address)
        return balance
    }
}

export default Self