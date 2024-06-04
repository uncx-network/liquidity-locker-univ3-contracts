# running tests
npx hardhat test

# test breakdown
In the /test directory there are two tests

- /LiveMigrateTest.js
This file tests migration of the live uncx lock on a forknet
At the moment that is configured to use ETH chain and lockId 1: the lock can be found here: https://univ3.uncx.network/lock/univ3/chain/1/manage/lock/1

- /MigrateTest.js
This file tests migration of a new lock created on a fork net

# expectations of migration contract
- only callable by lock owner
- it will collect outstanding v3 fees to the collectAddress of the lock owner, and otherwise no fees will be paid onLock() to UNCX when migrating
- the new lock created on the new locker will be exactly the same as the lock on the old locker, with the exception of fees being zero on the new lock and auto collection of fees onLock.

# contracts
- the current live lockers which are deployed have been moved to /contracts/v1/UNCX_ProofOfReservesUniV3.sol
- the new lockers which contain the fix for decreaseLiquidity() are in /contacts/UNCX_ProofOfReservesV2_UniV3.sol
- I'd recommend git diffing the above two files