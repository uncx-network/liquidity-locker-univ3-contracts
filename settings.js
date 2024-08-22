
// Set this to true to use a non forked rpc url (for deployments)
const DEPLOY_MODE = true

var isPCSFork = false // is pancakeswap fork?

var provider
if (DEPLOY_MODE) {
  provider = ethers.provider // Use this for deployment on mainnets
} else {
  provider = new ethers.JsonRpcProvider(hre.network.config.forking.url) // use this for local & fork testing
}

var n = await provider.getNetwork()
var CHAIN = String(n.chainId)

/*
    SwapRouter = SwapRouter02 NOT SwapRouter(01)
    https://docs.uniswap.org/contracts/v3/reference/deployments
*/

const SETTINGS = {
    '1' : { // eth mainnet
        NonfungiblePositionManager: '0xC36442b4a4522E871399CD717aBDD847Ab11FE88',
        SwapRouter: '0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45',
        CountryList: '0x9720526C803aeee9c7558dBD19A4d6b512a49B94',
        ProofOfReservesV1: '0x231278eDd38B00B07fBd52120CEf685B9BaEBCC1'
    },
    '5': { // goerli
        NonfungiblePositionManager: '0xC36442b4a4522E871399CD717aBDD847Ab11FE88',
        SwapRouter: '0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45',
        CountryList: '0x7D75876e0af45437c0ba5b7B59CA099d908f4BBE',
        ProofOfReservesV1: '' // Not set
    },
    '56' : { // BSC mainnet
        pancakeswap: {
            NonfungiblePositionManager: '0x46A15B0b27311cedF172AB29E4f4766fbE7F4364',
            SwapRouter: '0x13f4EA83D0bd40E75C8222255bc855a974568Dd4',
        },
        uniswap: {
            NonfungiblePositionManager: '0x7b8A01B39D58278b5DE7e48c8449c9f4F5170613',
            SwapRouter: '0xB971eF87ede563556b2ED4b1C0b0019111Dd85d2',
        },
        CountryList: '0x7600265b6713503A52C1D6db31F4c70f8863F994',
        ProofOfReservesV1: '0x0D29598EC01fa03665feEAD91d4Fb423F393886c'
    },
    '137': { // polygon
        NonfungiblePositionManager: '0xC36442b4a4522E871399CD717aBDD847Ab11FE88',
        SwapRouter: '0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45',
        CountryList: '0x1A5281580b65fCadE3979d027B27C089e2aAc50a',
        ProofOfReservesV1: '0xC22218406983bF88BB634bb4Bf15fA4E0A1a8c84'
    },
    '8453': { // base
        NonfungiblePositionManager: '0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1',
        SwapRouter: '0x2626664c2603336E57B271c5C0b26F421741e481',
        CountryList: '0xfA104eb3925A27E6263E05acc88F2e983A890637',
        ProofOfReservesV1: ''
    },
    '42161': { // arbitrum
        NonfungiblePositionManager: '0xC36442b4a4522E871399CD717aBDD847Ab11FE88',
        SwapRouter: '0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45',
        CountryList: '0xBAB21591d9f4FE88912F2FAA4E502C7D5A00FF76',
        ProofOfReservesV1: '0xfA104eb3925A27E6263E05acc88F2e983A890637'
    },
    '43114': { // avalanche
        NonfungiblePositionManager: '0x655C406EBFa14EE2006250925e54ec43AD184f8B',
        SwapRouter: '0xbb00FF08d01D300023C629E8fFfFcb65A5a578cE',
        CountryList: '0xDffCa4B8c6DEfB2FC0fbc0a1B07D4ba34a2c1453',
        ProofOfReservesV1: ''
    },
    '11155111': { // sepolia
        NonfungiblePositionManager: '0x1238536071E1c677A632429e3655c799b22cDA52',
        SwapRouter: '????',
        CountryList: '0xfA104eb3925A27E6263E05acc88F2e983A890637',
        ProofOfReservesV1: ''
    },
    '10': { // optimism
        NonfungiblePositionManager: '0xC36442b4a4522E871399CD717aBDD847Ab11FE88',
        SwapRouter: '????',
        CountryList: '0x8045Bf666404bB03AdEe2B3f633feA5A6086F0bc',
        ProofOfReservesV1: ''
    },
    '42220': { // celo
        NonfungiblePositionManager: '0x3d79EdAaBC0EaB6F08ED885C05Fc0B014290D95A',
        SwapRouter: '????',
        CountryList: '0xfA104eb3925A27E6263E05acc88F2e983A890637',
        ProofOfReservesV1: ''
    },
}

var contracts = SETTINGS[CHAIN]

if (CHAIN === '56') {
    if (isPCSFork) {
        contracts = {
            NonfungiblePositionManager: SETTINGS[CHAIN].pancakeswap.NonfungiblePositionManager,
            SwapRouter: SETTINGS[CHAIN].pancakeswap.SwapRouter,
            CountryList: SETTINGS[CHAIN].CountryList,
            ProofOfReservesV1: SETTINGS[CHAIN].ProofOfReservesV1
        }
    } else if (!isPCSFork) {
        contracts = {
            NonfungiblePositionManager: SETTINGS[CHAIN].uniswap.NonfungiblePositionManager,
            SwapRouter: SETTINGS[CHAIN].uniswap.SwapRouter,
            CountryList: SETTINGS[CHAIN].CountryList,
            ProofOfReservesV1: SETTINGS[CHAIN].ProofOfReservesV1
        }
    }
}

const Self = {
    contracts: contracts,
    chainId: n.chainId,
    isPCSFork: isPCSFork
}

// console.log(Self)
console.log('Chain', CHAIN, 'isPCSFork', isPCSFork)

export default Self