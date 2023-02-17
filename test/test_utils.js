const { ethers } = require('hardhat');

module.exports = {
  deriveRootRole: (managerAddress) => {
    return ethers.utils.solidityKeccak256(['address'], [managerAddress]);
  },
  deriveRole: (adminRole, roleDescription) => {
    return ethers.utils.solidityKeccak256(
      ['bytes32', 'bytes32'],
      [adminRole, ethers.utils.solidityKeccak256(['string'], [roleDescription])]
    );
  },
};
