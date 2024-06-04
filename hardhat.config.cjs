require("@nomicfoundation/hardhat-toolbox");
require("@nomicfoundation/hardhat-verify");
require("hardhat-gas-reporter");
require("dotenv/config");
require('hardhat-contract-sizer');

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  gasReporter: {
    enabled: false,
    currency: 'EUR',
    gasPrice: 54, // https://ethgasstation.info/
    token: "ETH",
    coinmarketcap: process.env.CMC_KEY
  },

  sourcify: {
    enabled: true
  },

  solidity: {
    compilers: [
      {
        version: "0.8.19",
        settings: {
          evmVersion: "istanbul",
          optimizer: {
            enabled: true,
            runs: 1000,
          },
        },
      },
    ],
  },

  // https://hardhat.org/hardhat-runner/plugins/nomicfoundation-hardhat-verify
  // npx hardhat verify --list-networks
  etherscan: {
    apiKey: {
      mainnet: process.env.ETHER_SCAN_KEY,
      bsc: process.env.BSC_SCAN_KEY,
      optimisticEthereum: process.env.OPTIMISM_SCAN_KEY,
      arbitrumOne: process.env.ARBI_SCAN_KEY,
      polygon: process.env.POLYGON_SCAN_KEY,
      goerli: process.env.GOERLI_SCAN_KEY,
      base: process.env.BASE_SCAN_KEY,
      sepolia: process.env.SEPOLIA_SCAN_KEY,
      avalanche: process.env.AVALANCHE_SNOWTRACE_KEY,
      // Celo - https://docs.celo.org/developer/verify/hardhat
      alfajores: process.env.CELO_SCAN_KEY,
      celo: process.env.CELO_SCAN_KEY,
    },
    customChains: [
      {
        network: "alfajores",
        chainId: 44787,
        urls: {
          apiURL: "https://api-alfajores.celoscan.io/api",
          browserURL: "https://alfajores.celoscan.io",
        },
      },
      {
        network: "celo",
        chainId: 42220,
        urls: {
          apiURL: "https://api.celoscan.io/api",
          browserURL: "https://celoscan.io/",
        },
      },
    ]
  },

  networks: {

    eth: {
      url: process.env.ETHEREUM_PROVIDER,
      accounts: [process.env.DEPLOYER_KEY]
    },

    bsc: {
      url: process.env.BSC_PROVIDER,
      accounts: [process.env.DEPLOYER_KEY]
    },

    arb: {
      url: process.env.ARBITRUM_PROVIDER,
      accounts: [process.env.DEPLOYER_KEY]
    },

    poly: {
      url: process.env.POLYGON_PROVIDER,
      accounts: [process.env.DEPLOYER_KEY]
    },

    goerli: {
      url: process.env.GOERLI_PROVIDER,
      accounts: [process.env.DEPLOYER_KEY]
    },

    sepolia: {
      url: process.env.SEPOLIA_PROVIDER,
      accounts: [process.env.DEPLOYER_KEY]
    },

    base: {
      url: process.env.BASE_PROVIDER,
      accounts: [process.env.DEPLOYER_KEY]
    },

    avax: {
      url: process.env.AVALANCHE_PROVIDER,
      accounts: [process.env.DEPLOYER_KEY]
    },

    optimism: {
      url: process.env.OPTIMISM_PROVIDER,
      accounts: [process.env.DEPLOYER_KEY]
    },

    celo: {
      url: process.env.CELO_PROVIDER,
      accounts: [process.env.DEPLOYER_KEY]
    },

    // this network is used for forked mainnet UI tests and requires starting a node in a seperate terminal first
    // Example:
    // npx hardhat node
    // npx hardhat run --network forked scripts/sendNft.js
    forked: {
      chainId: 1337,
      url: "http://127.0.0.1:8545/",
      forking: {
        url: process.env.ETHEREUM_PROVIDER
      }
    },

    hardhat: {
      chainId: 1337,
      forking: {
        // BSC
        // url: process.env.BSC_PROVIDER

        // Eth Mainnet
        // url: process.env.ETHEREUM_PROVIDER

        // Avalanche
        url: process.env.AVALANCHE_PROVIDER

        // Base
        // url: process.env.BASE_PROVIDER

        // Arbitrum Mainnet
        // url: process.env.ARBITRUM_PROVIDER

        // Polygon
        // url: process.env.POLYGON_PROVIDER
      }
    }
  }
};
