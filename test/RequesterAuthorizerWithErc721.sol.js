const { ethers } = require('hardhat');
const helpers = require('@nomicfoundation/hardhat-network-helpers');
const { expect } = require('chai');
const testUtils = require('./test_utils');

describe('RequesterAuthorizerWithErc721', function () {
  async function deploy() {
    const accounts = await ethers.getSigners();
    const roles = {
      deployer: accounts[0],
      airnode: accounts[1],
      withdrawalLeadTimeSetter: accounts[2],
      requesterBlocker: accounts[3],
      user: accounts[4],
      requester: accounts[5],
      requesterNew: accounts[6],
      randomPerson: accounts[9],
    };
    const adminRoleDescription = 'RequesterAuthorizerWithErc721 admin';
    const withdrawalLeadTimeSetterRoleDescription = 'Withdrawal lead time setter';
    const requesterBlockerRoleDescription = 'Requester blocker';
    const AccessControlRegistryFactory = await ethers.getContractFactory('AccessControlRegistry', roles.deployer);
    const accessControlRegistry = await AccessControlRegistryFactory.deploy();
    const RequesterAuthorizerWithErc721Factory = await ethers.getContractFactory(
      'RequesterAuthorizerWithErc721',
      roles.deployer
    );
    const requesterAuthorizerWithErc721 = await RequesterAuthorizerWithErc721Factory.deploy(
      accessControlRegistry.address,
      adminRoleDescription
    );
    const rootRole = testUtils.deriveRootRole(roles.airnode.address);
    const adminRole = testUtils.deriveRole(rootRole, adminRoleDescription);
    const withdrawalLeadTimeSetterRole = testUtils.deriveRole(adminRole, withdrawalLeadTimeSetterRoleDescription);
    const requesterBlockerRole = testUtils.deriveRole(adminRole, requesterBlockerRoleDescription);
    await accessControlRegistry.connect(roles.airnode).initializeRoleAndGrantToSender(rootRole, adminRoleDescription);
    await accessControlRegistry
      .connect(roles.airnode)
      .initializeRoleAndGrantToSender(adminRole, withdrawalLeadTimeSetterRoleDescription);
    await accessControlRegistry
      .connect(roles.airnode)
      .initializeRoleAndGrantToSender(adminRole, requesterBlockerRoleDescription);
    await accessControlRegistry
      .connect(roles.airnode)
      .grantRole(withdrawalLeadTimeSetterRole, roles.withdrawalLeadTimeSetter.address);
    await accessControlRegistry.connect(roles.airnode).grantRole(requesterBlockerRole, roles.requesterBlocker.address);
    await accessControlRegistry
      .connect(roles.airnode)
      .renounceRole(withdrawalLeadTimeSetterRole, roles.airnode.address);
    await accessControlRegistry.connect(roles.airnode).renounceRole(requesterBlockerRole, roles.airnode.address);
    await accessControlRegistry.connect(roles.airnode).renounceRole(adminRole, roles.airnode.address);
    const Erc721Factory = await ethers.getContractFactory('MockErc721', roles.deployer);
    const erc721 = await Erc721Factory.deploy();
    for (let tokenId = 0; tokenId < 10; tokenId++) {
      await erc721
        .connect(roles.deployer) // eslint-disable-next-line no-unexpected-multiline
        ['safeTransferFrom(address,address,uint256)'](roles.deployer.address, roles.user.address, tokenId);
    }
    return {
      roles,
      accessControlRegistry,
      requesterAuthorizerWithErc721,
      erc721,
      adminRoleDescription,
      withdrawalLeadTimeSetterRoleDescription,
      requesterBlockerRoleDescription,
    };
  }

  describe('constructor', function () {
    it('constructs', async function () {
      const {
        accessControlRegistry,
        requesterAuthorizerWithErc721,
        adminRoleDescription,
        withdrawalLeadTimeSetterRoleDescription,
        requesterBlockerRoleDescription,
      } = await helpers.loadFixture(deploy);
      expect(await requesterAuthorizerWithErc721.accessControlRegistry()).to.equal(accessControlRegistry.address);
      expect(await requesterAuthorizerWithErc721.adminRoleDescription()).to.equal(adminRoleDescription);
      expect(await requesterAuthorizerWithErc721.WITHDRAWAL_LEAD_TIME_SETTER_ROLE_DESCRIPTION()).to.equal(
        withdrawalLeadTimeSetterRoleDescription
      );
      expect(await requesterAuthorizerWithErc721.REQUESTER_BLOCKER_ROLE_DESCRIPTION()).to.equal(
        requesterBlockerRoleDescription
      );
    });
  });

  describe('setWithdrawalLeadTime', function () {
    context('Sender is the Airnode', function () {
      context('Withdrawal lead time is not longer than 30 days', function () {
        it('sets withdrawal lead time', async function () {
          const { roles, requesterAuthorizerWithErc721 } = await helpers.loadFixture(deploy);
          const withdrawalLeadTime = 30 * 24 * 60 * 60;
          expect(await requesterAuthorizerWithErc721.airnodeToWithdrawalLeadTime(roles.airnode.address)).to.equal(0);
          await expect(
            requesterAuthorizerWithErc721
              .connect(roles.airnode)
              .setWithdrawalLeadTime(roles.airnode.address, withdrawalLeadTime)
          )
            .to.emit(requesterAuthorizerWithErc721, 'SetWithdrawalLeadTime')
            .withArgs(roles.airnode.address, withdrawalLeadTime, roles.airnode.address);
          expect(await requesterAuthorizerWithErc721.airnodeToWithdrawalLeadTime(roles.airnode.address)).to.equal(
            withdrawalLeadTime
          );
        });
      });
      context('Withdrawal lead time is longer than 30 days', function () {
        it('reverts', async function () {
          const { roles, requesterAuthorizerWithErc721 } = await helpers.loadFixture(deploy);
          const withdrawalLeadTime = 30 * 24 * 60 * 60 + 1;
          await expect(
            requesterAuthorizerWithErc721
              .connect(roles.airnode)
              .setWithdrawalLeadTime(roles.airnode.address, withdrawalLeadTime)
          ).to.be.revertedWith('Lead time too long');
        });
      });
    });
    context('Sender is a withdrawal lead time setter of the Airnode', function () {
      context('Withdrawal lead time is not longer than 30 days', function () {
        it('sets withdrawal lead time', async function () {
          const { roles, requesterAuthorizerWithErc721 } = await helpers.loadFixture(deploy);
          const withdrawalLeadTime = 30 * 24 * 60 * 60;
          expect(await requesterAuthorizerWithErc721.airnodeToWithdrawalLeadTime(roles.airnode.address)).to.equal(0);
          await expect(
            requesterAuthorizerWithErc721
              .connect(roles.withdrawalLeadTimeSetter)
              .setWithdrawalLeadTime(roles.airnode.address, withdrawalLeadTime)
          )
            .to.emit(requesterAuthorizerWithErc721, 'SetWithdrawalLeadTime')
            .withArgs(roles.airnode.address, withdrawalLeadTime, roles.withdrawalLeadTimeSetter.address);
          expect(await requesterAuthorizerWithErc721.airnodeToWithdrawalLeadTime(roles.airnode.address)).to.equal(
            withdrawalLeadTime
          );
        });
      });
      context('Withdrawal lead time is longer than 30 days', function () {
        it('reverts', async function () {
          const { roles, requesterAuthorizerWithErc721 } = await helpers.loadFixture(deploy);
          const withdrawalLeadTime = 30 * 24 * 60 * 60 + 1;
          await expect(
            requesterAuthorizerWithErc721
              .connect(roles.withdrawalLeadTimeSetter)
              .setWithdrawalLeadTime(roles.airnode.address, withdrawalLeadTime)
          ).to.be.revertedWith('Lead time too long');
        });
      });
    });
    context('Sender is not the Airnode or a withdrawal lead time setter of it', function () {
      it('reverts', async function () {
        const { roles, requesterAuthorizerWithErc721 } = await helpers.loadFixture(deploy);
        const withdrawalLeadTime = 30 * 24 * 60 * 60;
        await expect(
          requesterAuthorizerWithErc721
            .connect(roles.randomPerson)
            .setWithdrawalLeadTime(roles.airnode.address, withdrawalLeadTime)
        ).to.be.revertedWith('Sender cannot set lead time');
      });
    });
  });

  describe('setRequesterBlockStatus', function () {
    context('Sender is the Airnode', function () {
      context('Chain ID is not zero', function () {
        context('Requester address is not zero', function () {
          it('sets requester block status', async function () {
            const { roles, requesterAuthorizerWithErc721 } = await helpers.loadFixture(deploy);
            const chainId = 123;
            expect(
              await requesterAuthorizerWithErc721.airnodeToChainIdToRequesterToBlockStatus(
                roles.airnode.address,
                chainId,
                roles.requester.address
              )
            ).to.equal(false);
            await expect(
              requesterAuthorizerWithErc721
                .connect(roles.airnode)
                .setRequesterBlockStatus(roles.airnode.address, chainId, roles.requester.address, true)
            )
              .to.emit(requesterAuthorizerWithErc721, 'SetRequesterBlockStatus')
              .withArgs(roles.airnode.address, roles.requester.address, chainId, true, roles.airnode.address);
            expect(
              await requesterAuthorizerWithErc721.airnodeToChainIdToRequesterToBlockStatus(
                roles.airnode.address,
                chainId,
                roles.requester.address
              )
            ).to.equal(true);
          });
        });
        context('Requester address is zero', function () {
          it('reverts', async function () {
            const { roles, requesterAuthorizerWithErc721 } = await helpers.loadFixture(deploy);
            const chainId = 123;
            await expect(
              requesterAuthorizerWithErc721
                .connect(roles.airnode)
                .setRequesterBlockStatus(roles.airnode.address, chainId, ethers.constants.AddressZero, true)
            ).to.be.revertedWith('Requester address zero');
          });
        });
      });
      context('Chain ID is zero', function () {
        it('reverts', async function () {
          const { roles, requesterAuthorizerWithErc721 } = await helpers.loadFixture(deploy);
          await expect(
            requesterAuthorizerWithErc721
              .connect(roles.airnode)
              .setRequesterBlockStatus(roles.airnode.address, 0, roles.requester.address, true)
          ).to.be.revertedWith('Chain ID zero');
        });
      });
    });
    context('Sender is a requester blocker of the Airnode', function () {
      context('Chain ID is not zero', function () {
        context('Requester address is not zero', function () {
          it('sets requester block status', async function () {
            const { roles, requesterAuthorizerWithErc721 } = await helpers.loadFixture(deploy);
            const chainId = 123;
            expect(
              await requesterAuthorizerWithErc721.airnodeToChainIdToRequesterToBlockStatus(
                roles.airnode.address,
                chainId,
                roles.requester.address
              )
            ).to.equal(false);
            await expect(
              requesterAuthorizerWithErc721
                .connect(roles.requesterBlocker)
                .setRequesterBlockStatus(roles.airnode.address, chainId, roles.requester.address, true)
            )
              .to.emit(requesterAuthorizerWithErc721, 'SetRequesterBlockStatus')
              .withArgs(roles.airnode.address, roles.requester.address, chainId, true, roles.requesterBlocker.address);
            expect(
              await requesterAuthorizerWithErc721.airnodeToChainIdToRequesterToBlockStatus(
                roles.airnode.address,
                chainId,
                roles.requester.address
              )
            ).to.equal(true);
          });
        });
        context('Requester address is zero', function () {
          it('reverts', async function () {
            const { roles, requesterAuthorizerWithErc721 } = await helpers.loadFixture(deploy);
            const chainId = 123;
            await expect(
              requesterAuthorizerWithErc721
                .connect(roles.requesterBlocker)
                .setRequesterBlockStatus(roles.airnode.address, chainId, ethers.constants.AddressZero, true)
            ).to.be.revertedWith('Requester address zero');
          });
        });
      });
      context('Chain ID is zero', function () {
        it('reverts', async function () {
          const { roles, requesterAuthorizerWithErc721 } = await helpers.loadFixture(deploy);
          await expect(
            requesterAuthorizerWithErc721
              .connect(roles.requesterBlocker)
              .setRequesterBlockStatus(roles.airnode.address, 0, roles.requester.address, true)
          ).to.be.revertedWith('Chain ID zero');
        });
      });
    });
    context('Sender is not the Airnode or a requester blocker of it', function () {
      it('reverts', async function () {
        const { roles, requesterAuthorizerWithErc721 } = await helpers.loadFixture(deploy);
        const chainId = 123;
        await expect(
          requesterAuthorizerWithErc721
            .connect(roles.randomPerson)
            .setRequesterBlockStatus(roles.airnode.address, chainId, roles.requester.address, true)
        ).to.be.revertedWith('Sender cannot block requester');
      });
    });
  });

  describe('onERC721Received', function () {
    context('Data length is as expected', function () {
      context('Airnode address is not zero', function () {
        context('Chain ID is not zero', function () {
          context('Requester address is not zero', function () {
            context('Requester address is not blocked for the Airnode', function () {
              context('Sender has not deposited a token for the parameters before', function () {
                it('deposits token for the parameters', async function () {
                  const { roles, requesterAuthorizerWithErc721, erc721 } = await helpers.loadFixture(deploy);
                  const chainId = 123;
                  const tokenId = 5;
                  const onERC721ReceivedArguments = ethers.utils.defaultAbiCoder.encode(
                    ['address', 'uint256', 'address'],
                    [roles.airnode.address, chainId, roles.requester.address]
                  );
                  expect(
                    await requesterAuthorizerWithErc721.airnodeToChainIdToRequesterToTokenAddressToTokenDeposits(
                      roles.airnode.address,
                      chainId,
                      roles.requester.address,
                      erc721.address
                    )
                  ).to.equal(0);
                  const depositBefore =
                    await requesterAuthorizerWithErc721.airnodeToChainIdToRequesterToTokenToDepositorToDeposit(
                      roles.airnode.address,
                      chainId,
                      roles.requester.address,
                      erc721.address,
                      roles.user.address
                    );
                  expect(depositBefore.tokenId).to.equal(0);
                  expect(depositBefore.withdrawalLeadTime).to.equal(0);
                  expect(depositBefore.earliestWithdrawalTime).to.equal(0);
                  expect(await erc721.ownerOf(tokenId)).to.equal(roles.user.address);
                  expect(await erc721.balanceOf(requesterAuthorizerWithErc721.address)).to.equal(0);
                  await expect(
                    erc721
                      .connect(roles.user) // eslint-disable-next-line no-unexpected-multiline
                      ['safeTransferFrom(address,address,uint256,bytes)'](
                        roles.user.address,
                        requesterAuthorizerWithErc721.address,
                        tokenId,
                        onERC721ReceivedArguments
                      )
                  )
                    .to.emit(requesterAuthorizerWithErc721, 'DepositedToken')
                    .withArgs(
                      roles.airnode.address,
                      roles.requester.address,
                      roles.user.address,
                      chainId,
                      erc721.address,
                      tokenId,
                      1
                    );
                  expect(
                    await requesterAuthorizerWithErc721.airnodeToChainIdToRequesterToTokenAddressToTokenDeposits(
                      roles.airnode.address,
                      chainId,
                      roles.requester.address,
                      erc721.address
                    )
                  ).to.equal(1);
                  const depositAfter =
                    await requesterAuthorizerWithErc721.airnodeToChainIdToRequesterToTokenToDepositorToDeposit(
                      roles.airnode.address,
                      chainId,
                      roles.requester.address,
                      erc721.address,
                      roles.user.address
                    );
                  expect(depositAfter.tokenId).to.equal(tokenId);
                  expect(depositAfter.withdrawalLeadTime).to.equal(0);
                  expect(depositAfter.earliestWithdrawalTime).to.equal(ethers.BigNumber.from(2).pow(32).sub(1));
                  expect(await erc721.ownerOf(tokenId)).to.equal(requesterAuthorizerWithErc721.address);
                  expect(await erc721.balanceOf(requesterAuthorizerWithErc721.address)).to.equal(1);
                });
              });
              context('Sender has deposited a token for the parameters before', function () {
                it('reverts', async function () {
                  const { roles, requesterAuthorizerWithErc721, erc721 } = await helpers.loadFixture(deploy);
                  const tokenIdFirst = 5;
                  const tokenIdSecond = 7;
                  const chainId = 123;
                  const onERC721ReceivedArguments = ethers.utils.defaultAbiCoder.encode(
                    ['address', 'uint256', 'address'],
                    [roles.airnode.address, chainId, roles.requester.address]
                  );
                  await erc721
                    .connect(roles.user) // eslint-disable-next-line no-unexpected-multiline
                    ['safeTransferFrom(address,address,uint256,bytes)'](
                      roles.user.address,
                      requesterAuthorizerWithErc721.address,
                      tokenIdFirst,
                      onERC721ReceivedArguments
                    );
                  await expect(
                    erc721
                      .connect(roles.user) // eslint-disable-next-line no-unexpected-multiline
                      ['safeTransferFrom(address,address,uint256,bytes)'](
                        roles.user.address,
                        requesterAuthorizerWithErc721.address,
                        tokenIdSecond,
                        onERC721ReceivedArguments
                      )
                  ).to.be.revertedWith('Token already deposited');
                });
              });
            });
            context('Requester address is blocked for the Airnode', function () {
              it('reverts', async function () {
                const { roles, requesterAuthorizerWithErc721, erc721 } = await helpers.loadFixture(deploy);
                const chainId = 123;
                const tokenId = 5;
                const onERC721ReceivedArguments = ethers.utils.defaultAbiCoder.encode(
                  ['address', 'uint256', 'address'],
                  [roles.airnode.address, chainId, roles.requester.address]
                );
                await requesterAuthorizerWithErc721
                  .connect(roles.airnode)
                  .setRequesterBlockStatus(roles.airnode.address, chainId, roles.requester.address, true);
                await expect(
                  erc721
                    .connect(roles.user) // eslint-disable-next-line no-unexpected-multiline
                    ['safeTransferFrom(address,address,uint256,bytes)'](
                      roles.user.address,
                      requesterAuthorizerWithErc721.address,
                      tokenId,
                      onERC721ReceivedArguments
                    )
                ).to.be.revertedWith('Requester blocked');
              });
            });
          });
          context('Requester address is zero', function () {
            it('reverts', async function () {
              const { roles, requesterAuthorizerWithErc721, erc721 } = await helpers.loadFixture(deploy);
              const chainId = 123;
              const tokenId = 5;
              const onERC721ReceivedArguments = ethers.utils.defaultAbiCoder.encode(
                ['address', 'uint256', 'address'],
                [roles.airnode.address, chainId, ethers.constants.AddressZero]
              );
              await expect(
                erc721
                  .connect(roles.user) // eslint-disable-next-line no-unexpected-multiline
                  ['safeTransferFrom(address,address,uint256,bytes)'](
                    roles.user.address,
                    requesterAuthorizerWithErc721.address,
                    tokenId,
                    onERC721ReceivedArguments
                  )
              ).to.be.revertedWith('Requester address zero');
            });
          });
        });
        context('Chain ID is zero', function () {
          it('reverts', async function () {
            const { roles, requesterAuthorizerWithErc721, erc721 } = await helpers.loadFixture(deploy);
            const tokenId = 5;
            const onERC721ReceivedArguments = ethers.utils.defaultAbiCoder.encode(
              ['address', 'uint256', 'address'],
              [roles.airnode.address, 0, roles.requester.address]
            );
            await expect(
              erc721
                .connect(roles.user) // eslint-disable-next-line no-unexpected-multiline
                ['safeTransferFrom(address,address,uint256,bytes)'](
                  roles.user.address,
                  requesterAuthorizerWithErc721.address,
                  tokenId,
                  onERC721ReceivedArguments
                )
            ).to.be.revertedWith('Chain ID zero');
          });
        });
      });
      context('Airnode address is zero', function () {
        it('reverts', async function () {
          const { roles, requesterAuthorizerWithErc721, erc721 } = await helpers.loadFixture(deploy);
          const chainId = 123;
          const tokenId = 5;
          const onERC721ReceivedArguments = ethers.utils.defaultAbiCoder.encode(
            ['address', 'uint256', 'address'],
            [ethers.constants.AddressZero, chainId, roles.requester.address]
          );
          await expect(
            erc721
              .connect(roles.user) // eslint-disable-next-line no-unexpected-multiline
              ['safeTransferFrom(address,address,uint256,bytes)'](
                roles.user.address,
                requesterAuthorizerWithErc721.address,
                tokenId,
                onERC721ReceivedArguments
              )
          ).to.be.revertedWith('Airnode address zero');
        });
      });
    });
    context('Data length is not as expected', function () {
      it('reverts', async function () {
        const { roles, requesterAuthorizerWithErc721, erc721 } = await helpers.loadFixture(deploy);
        const chainId = 123;
        const tokenId = 5;
        const onERC721ReceivedArguments = ethers.utils.defaultAbiCoder.encode(
          ['address', 'uint256', 'address'],
          [roles.airnode.address, chainId, roles.requester.address]
        );
        await expect(
          erc721
            .connect(roles.user) // eslint-disable-next-line no-unexpected-multiline
            ['safeTransferFrom(address,address,uint256,bytes)'](
              roles.user.address,
              requesterAuthorizerWithErc721.address,
              tokenId,
              onERC721ReceivedArguments + '00'
            )
        ).to.be.revertedWith('Unexpected data length');
        await expect(
          erc721
            .connect(roles.user) // eslint-disable-next-line no-unexpected-multiline
            ['safeTransferFrom(address,address,uint256,bytes)'](
              roles.user.address,
              requesterAuthorizerWithErc721.address,
              tokenId,
              onERC721ReceivedArguments.slice(0, -2)
            )
        ).to.be.revertedWith('Unexpected data length');
      });
    });
  });

  describe('updateDepositRequester', function () {
    context('Previous requester address is not blocked for the Airnode', function () {
      context('Next requester address is not blocked for the Airnode', function () {
        context('Token has been deposited', function () {
          context('Token withdrawal has not been initiated', function () {
            context('User has not already deposited token for the Next requester', function () {
              it('updates deposit requester', async function () {
                const { roles, requesterAuthorizerWithErc721, erc721 } = await helpers.loadFixture(deploy);
                const chainId = 123;
                const chainIdNew = 456;
                const tokenId = 5;
                const onERC721ReceivedArguments = ethers.utils.defaultAbiCoder.encode(
                  ['address', 'uint256', 'address'],
                  [roles.airnode.address, chainId, roles.requester.address]
                );
                await erc721
                  .connect(roles.user) // eslint-disable-next-line no-unexpected-multiline
                  ['safeTransferFrom(address,address,uint256,bytes)'](
                    roles.user.address,
                    requesterAuthorizerWithErc721.address,
                    tokenId,
                    onERC721ReceivedArguments
                  );
                await expect(
                  requesterAuthorizerWithErc721
                    .connect(roles.user)
                    .updateDepositRequester(
                      roles.airnode.address,
                      chainId,
                      roles.requester.address,
                      chainIdNew,
                      roles.requesterNew.address,
                      erc721.address
                    )
                )
                  .to.emit(requesterAuthorizerWithErc721, 'UpdatedDepositRequesterTo')
                  .withArgs(
                    roles.airnode.address,
                    roles.requesterNew.address,
                    roles.user.address,
                    chainIdNew,
                    erc721.address,
                    tokenId,
                    1
                  )
                  .to.emit(requesterAuthorizerWithErc721, 'UpdatedDepositRequesterFrom')
                  .withArgs(
                    roles.airnode.address,
                    roles.requester.address,
                    roles.user.address,
                    chainId,
                    erc721.address,
                    tokenId,
                    0
                  );
                expect(
                  await requesterAuthorizerWithErc721.airnodeToChainIdToRequesterToTokenAddressToTokenDeposits(
                    roles.airnode.address,
                    chainId,
                    roles.requester.address,
                    erc721.address
                  )
                ).to.equal(0);
                expect(
                  await requesterAuthorizerWithErc721.airnodeToChainIdToRequesterToTokenAddressToTokenDeposits(
                    roles.airnode.address,
                    chainIdNew,
                    roles.requesterNew.address,
                    erc721.address
                  )
                ).to.equal(1);
                const depositRequesterPrevious =
                  await requesterAuthorizerWithErc721.airnodeToChainIdToRequesterToTokenToDepositorToDeposit(
                    roles.airnode.address,
                    chainId,
                    roles.requester.address,
                    erc721.address,
                    roles.user.address
                  );
                expect(depositRequesterPrevious.tokenId).to.equal(0);
                expect(depositRequesterPrevious.withdrawalLeadTime).to.equal(0);
                expect(depositRequesterPrevious.earliestWithdrawalTime).to.equal(0);
                const depositRequesterNext =
                  await requesterAuthorizerWithErc721.airnodeToChainIdToRequesterToTokenToDepositorToDeposit(
                    roles.airnode.address,
                    chainIdNew,
                    roles.requesterNew.address,
                    erc721.address,
                    roles.user.address
                  );
                expect(depositRequesterNext.tokenId).to.equal(tokenId);
                expect(depositRequesterNext.withdrawalLeadTime).to.equal(0);
                expect(depositRequesterNext.earliestWithdrawalTime).to.equal(0);
              });
            });
            context('User has already deposited token for the Next requester', function () {
              it('reverts', async function () {
                const { roles, requesterAuthorizerWithErc721, erc721 } = await helpers.loadFixture(deploy);
                const chainId = 123;
                const chainIdNew = 456;
                const tokenIdFirst = 5;
                const tokenIdSecond = 7;
                const onERC721ReceivedArgumentsFirst = ethers.utils.defaultAbiCoder.encode(
                  ['address', 'uint256', 'address'],
                  [roles.airnode.address, chainId, roles.requester.address]
                );
                const onERC721ReceivedArgumentsSecond = ethers.utils.defaultAbiCoder.encode(
                  ['address', 'uint256', 'address'],
                  [roles.airnode.address, chainIdNew, roles.requesterNew.address]
                );
                await erc721
                  .connect(roles.user) // eslint-disable-next-line no-unexpected-multiline
                  ['safeTransferFrom(address,address,uint256,bytes)'](
                    roles.user.address,
                    requesterAuthorizerWithErc721.address,
                    tokenIdFirst,
                    onERC721ReceivedArgumentsFirst
                  );
                await erc721
                  .connect(roles.user) // eslint-disable-next-line no-unexpected-multiline
                  ['safeTransferFrom(address,address,uint256,bytes)'](
                    roles.user.address,
                    requesterAuthorizerWithErc721.address,
                    tokenIdSecond,
                    onERC721ReceivedArgumentsSecond
                  );
                await expect(
                  requesterAuthorizerWithErc721
                    .connect(roles.user)
                    .updateDepositRequester(
                      roles.airnode.address,
                      chainId,
                      roles.requester.address,
                      chainIdNew,
                      roles.requesterNew.address,
                      erc721.address
                    )
                ).to.be.revertedWith('Token already deposited');
              });
            });
          });
          context('Token withdrawal has been initiated', function () {
            it('reverts', async function () {
              const { roles, requesterAuthorizerWithErc721, erc721 } = await helpers.loadFixture(deploy);
              const chainId = 123;
              const chainIdNew = 456;
              const tokenId = 5;
              const onERC721ReceivedArguments = ethers.utils.defaultAbiCoder.encode(
                ['address', 'uint256', 'address'],
                [roles.airnode.address, chainId, roles.requester.address]
              );
              await erc721
                .connect(roles.user) // eslint-disable-next-line no-unexpected-multiline
                ['safeTransferFrom(address,address,uint256,bytes)'](
                  roles.user.address,
                  requesterAuthorizerWithErc721.address,
                  tokenId,
                  onERC721ReceivedArguments
                );
              await requesterAuthorizerWithErc721
                .connect(roles.user)
                .initiateTokenWithdrawal(roles.airnode.address, chainId, roles.requester.address, erc721.address);
              await expect(
                requesterAuthorizerWithErc721
                  .connect(roles.user)
                  .updateDepositRequester(
                    roles.airnode.address,
                    chainId,
                    roles.requester.address,
                    chainIdNew,
                    roles.requesterNew.address,
                    erc721.address
                  )
              ).to.be.revertedWith('Withdrawal initiated');
            });
          });
        });
        context('Token has not been deposited', function () {
          it('reverts', async function () {
            const { roles, requesterAuthorizerWithErc721, erc721 } = await helpers.loadFixture(deploy);
            const chainId = 123;
            const chainIdNew = 456;
            await expect(
              requesterAuthorizerWithErc721
                .connect(roles.user)
                .updateDepositRequester(
                  roles.airnode.address,
                  chainId,
                  roles.requester.address,
                  chainIdNew,
                  roles.requesterNew.address,
                  erc721.address
                )
            ).to.be.revertedWith('Token not deposited');
          });
        });
      });
      context('Next requester address is blocked for the Airnode', function () {
        it('reverts', async function () {
          const { roles, requesterAuthorizerWithErc721, erc721 } = await helpers.loadFixture(deploy);
          const chainId = 123;
          const chainIdNew = 456;
          const tokenId = 5;
          const onERC721ReceivedArguments = ethers.utils.defaultAbiCoder.encode(
            ['address', 'uint256', 'address'],
            [roles.airnode.address, chainId, roles.requester.address]
          );
          await erc721
            .connect(roles.user) // eslint-disable-next-line no-unexpected-multiline
            ['safeTransferFrom(address,address,uint256,bytes)'](
              roles.user.address,
              requesterAuthorizerWithErc721.address,
              tokenId,
              onERC721ReceivedArguments
            );
          await requesterAuthorizerWithErc721
            .connect(roles.airnode)
            .setRequesterBlockStatus(roles.airnode.address, chainIdNew, roles.requesterNew.address, erc721.address);
          await expect(
            requesterAuthorizerWithErc721
              .connect(roles.user)
              .updateDepositRequester(
                roles.airnode.address,
                chainId,
                roles.requester.address,
                chainIdNew,
                roles.requesterNew.address,
                erc721.address
              )
          ).to.be.revertedWith('Next requester blocked');
        });
      });
    });
    context('Previous requester address is blocked for the Airnode', function () {
      it('reverts', async function () {
        const { roles, requesterAuthorizerWithErc721, erc721 } = await helpers.loadFixture(deploy);
        const chainId = 123;
        const chainIdNew = 456;
        const tokenId = 5;
        const onERC721ReceivedArguments = ethers.utils.defaultAbiCoder.encode(
          ['address', 'uint256', 'address'],
          [roles.airnode.address, chainId, roles.requester.address]
        );
        await erc721
          .connect(roles.user) // eslint-disable-next-line no-unexpected-multiline
          ['safeTransferFrom(address,address,uint256,bytes)'](
            roles.user.address,
            requesterAuthorizerWithErc721.address,
            tokenId,
            onERC721ReceivedArguments
          );
        await requesterAuthorizerWithErc721
          .connect(roles.airnode)
          .setRequesterBlockStatus(roles.airnode.address, chainId, roles.requester.address, erc721.address);
        await expect(
          requesterAuthorizerWithErc721
            .connect(roles.user)
            .updateDepositRequester(
              roles.airnode.address,
              chainId,
              roles.requester.address,
              chainIdNew,
              roles.requesterNew.address,
              erc721.address
            )
        ).to.be.revertedWith('Previous requester blocked');
      });
    });
  });

  describe('initiateTokenWithdrawal', function () {
    context('Token has been deposited', function () {
      context('Token withdrawal has not been initiated', function () {
        it('initiates token withdrawal', async function () {
          const { roles, requesterAuthorizerWithErc721, erc721 } = await helpers.loadFixture(deploy);
          const withdrawalLeadTime = 7 * 24 * 30 * 30;
          const chainId = 123;
          const tokenId = 5;
          const onERC721ReceivedArguments = ethers.utils.defaultAbiCoder.encode(
            ['address', 'uint256', 'address'],
            [roles.airnode.address, chainId, roles.requester.address]
          );
          await requesterAuthorizerWithErc721
            .connect(roles.airnode)
            .setWithdrawalLeadTime(roles.airnode.address, withdrawalLeadTime);
          await erc721
            .connect(roles.user) // eslint-disable-next-line no-unexpected-multiline
            ['safeTransferFrom(address,address,uint256,bytes)'](
              roles.user.address,
              requesterAuthorizerWithErc721.address,
              tokenId,
              onERC721ReceivedArguments
            );
          expect(
            await requesterAuthorizerWithErc721.airnodeToChainIdToRequesterToTokenAddressToTokenDeposits(
              roles.airnode.address,
              chainId,
              roles.requester.address,
              erc721.address
            )
          ).to.equal(1);
          const depositBefore =
            await requesterAuthorizerWithErc721.airnodeToChainIdToRequesterToTokenToDepositorToDeposit(
              roles.airnode.address,
              chainId,
              roles.requester.address,
              erc721.address,
              roles.user.address
            );
          expect(depositBefore.tokenId).to.equal(tokenId);
          expect(depositBefore.withdrawalLeadTime).to.equal(withdrawalLeadTime);
          expect(depositBefore.earliestWithdrawalTime).to.equal(ethers.BigNumber.from(2).pow(32).sub(1));
          // Updating the withdrawal lead time will not affect the deposit
          await requesterAuthorizerWithErc721.connect(roles.airnode).setWithdrawalLeadTime(roles.airnode.address, 0);
          const nextTimestamp = (await helpers.time.latest()) + 1;
          await helpers.time.setNextBlockTimestamp(nextTimestamp);
          const expectedEarliestWithdrawalTime = nextTimestamp + withdrawalLeadTime;
          await expect(
            requesterAuthorizerWithErc721
              .connect(roles.user)
              .initiateTokenWithdrawal(roles.airnode.address, chainId, roles.requester.address, erc721.address)
          )
            .to.emit(requesterAuthorizerWithErc721, 'InitiatedTokenWithdrawal')
            .withArgs(
              roles.airnode.address,
              roles.requester.address,
              roles.user.address,
              chainId,
              erc721.address,
              tokenId,
              expectedEarliestWithdrawalTime,
              0
            );
          expect(
            await requesterAuthorizerWithErc721.airnodeToChainIdToRequesterToTokenAddressToTokenDeposits(
              roles.airnode.address,
              chainId,
              roles.requester.address,
              erc721.address
            )
          ).to.equal(0);
          const depositAfter =
            await requesterAuthorizerWithErc721.airnodeToChainIdToRequesterToTokenToDepositorToDeposit(
              roles.airnode.address,
              chainId,
              roles.requester.address,
              erc721.address,
              roles.user.address
            );
          expect(depositAfter.tokenId).to.equal(tokenId);
          expect(depositAfter.withdrawalLeadTime).to.equal(withdrawalLeadTime);
          expect(depositAfter.earliestWithdrawalTime).to.equal(expectedEarliestWithdrawalTime);
        });
      });
      context('Token withdrawal has been initiated', function () {
        it('reverts', async function () {
          const { roles, requesterAuthorizerWithErc721, erc721 } = await helpers.loadFixture(deploy);
          const withdrawalLeadTime = 7 * 24 * 30 * 30;
          const chainId = 123;
          const tokenId = 5;
          const onERC721ReceivedArguments = ethers.utils.defaultAbiCoder.encode(
            ['address', 'uint256', 'address'],
            [roles.airnode.address, chainId, roles.requester.address]
          );
          await requesterAuthorizerWithErc721
            .connect(roles.airnode)
            .setWithdrawalLeadTime(roles.airnode.address, withdrawalLeadTime);
          await erc721
            .connect(roles.user) // eslint-disable-next-line no-unexpected-multiline
            ['safeTransferFrom(address,address,uint256,bytes)'](
              roles.user.address,
              requesterAuthorizerWithErc721.address,
              tokenId,
              onERC721ReceivedArguments
            );
          await requesterAuthorizerWithErc721
            .connect(roles.user)
            .initiateTokenWithdrawal(roles.airnode.address, chainId, roles.requester.address, erc721.address);
          await expect(
            requesterAuthorizerWithErc721
              .connect(roles.user)
              .initiateTokenWithdrawal(roles.airnode.address, chainId, roles.requester.address, erc721.address)
          ).to.be.revertedWith('Withdrawal already initiated');
        });
      });
    });
    context('Token has not been deposited', function () {
      it('reverts', async function () {
        const { roles, requesterAuthorizerWithErc721, erc721 } = await helpers.loadFixture(deploy);
        const withdrawalLeadTime = 7 * 24 * 30 * 30;
        const chainId = 123;
        await requesterAuthorizerWithErc721
          .connect(roles.airnode)
          .setWithdrawalLeadTime(roles.airnode.address, withdrawalLeadTime);
        await expect(
          requesterAuthorizerWithErc721
            .connect(roles.user)
            .initiateTokenWithdrawal(roles.airnode.address, chainId, roles.requester.address, erc721.address)
        ).to.be.revertedWith('Token not deposited');
      });
    });
  });

  describe('withdrawToken', function () {
    context('Requester address is not blocked for the Airnode', function () {
      context('Token has been deposited', function () {
        context('Withdrawal has not been initiated', function () {
          context('Withdrawal lead time is zero', function () {
            it('withdraws', async function () {
              const { roles, requesterAuthorizerWithErc721, erc721 } = await helpers.loadFixture(deploy);
              const chainId = 123;
              const tokenId = 5;
              const onERC721ReceivedArguments = ethers.utils.defaultAbiCoder.encode(
                ['address', 'uint256', 'address'],
                [roles.airnode.address, chainId, roles.requester.address]
              );
              await erc721
                .connect(roles.user) // eslint-disable-next-line no-unexpected-multiline
                ['safeTransferFrom(address,address,uint256,bytes)'](
                  roles.user.address,
                  requesterAuthorizerWithErc721.address,
                  tokenId,
                  onERC721ReceivedArguments
                );
              expect(
                await requesterAuthorizerWithErc721.airnodeToChainIdToRequesterToTokenAddressToTokenDeposits(
                  roles.airnode.address,
                  chainId,
                  roles.requester.address,
                  erc721.address
                )
              ).to.equal(1);
              const depositBefore =
                await requesterAuthorizerWithErc721.airnodeToChainIdToRequesterToTokenToDepositorToDeposit(
                  roles.airnode.address,
                  chainId,
                  roles.requester.address,
                  erc721.address,
                  roles.user.address
                );
              expect(depositBefore.tokenId).to.equal(tokenId);
              expect(depositBefore.withdrawalLeadTime).to.equal(0);
              expect(depositBefore.earliestWithdrawalTime).to.equal(ethers.BigNumber.from(2).pow(32).sub(1));
              expect(await erc721.ownerOf(tokenId)).to.equal(requesterAuthorizerWithErc721.address);
              expect(await erc721.balanceOf(requesterAuthorizerWithErc721.address)).to.equal(1);
              await expect(
                requesterAuthorizerWithErc721
                  .connect(roles.user)
                  .withdrawToken(roles.airnode.address, chainId, roles.requester.address, erc721.address)
              )
                .to.emit(requesterAuthorizerWithErc721, 'WithdrewToken')
                .withArgs(
                  roles.airnode.address,
                  roles.requester.address,
                  roles.user.address,
                  chainId,
                  erc721.address,
                  tokenId,
                  0
                );
              expect(
                await requesterAuthorizerWithErc721.airnodeToChainIdToRequesterToTokenAddressToTokenDeposits(
                  roles.airnode.address,
                  chainId,
                  roles.requester.address,
                  erc721.address
                )
              ).to.equal(0);
              const depositAfter =
                await requesterAuthorizerWithErc721.airnodeToChainIdToRequesterToTokenToDepositorToDeposit(
                  roles.airnode.address,
                  chainId,
                  roles.requester.address,
                  erc721.address,
                  roles.user.address
                );
              expect(depositAfter.tokenId).to.equal(0);
              expect(depositAfter.withdrawalLeadTime).to.equal(0);
              expect(depositAfter.earliestWithdrawalTime).to.equal(0);
              expect(await erc721.ownerOf(tokenId)).to.equal(roles.user.address);
              expect(await erc721.balanceOf(requesterAuthorizerWithErc721.address)).to.equal(0);
            });
          });
          context('Withdrawal lead time is not zero', function () {
            it('reverts', async function () {
              const { roles, requesterAuthorizerWithErc721, erc721 } = await helpers.loadFixture(deploy);
              const withdrawalLeadTime = 7 * 24 * 30 * 30;
              const chainId = 123;
              const tokenId = 5;
              const onERC721ReceivedArguments = ethers.utils.defaultAbiCoder.encode(
                ['address', 'uint256', 'address'],
                [roles.airnode.address, chainId, roles.requester.address]
              );
              await requesterAuthorizerWithErc721
                .connect(roles.airnode)
                .setWithdrawalLeadTime(roles.airnode.address, withdrawalLeadTime);
              await erc721
                .connect(roles.user) // eslint-disable-next-line no-unexpected-multiline
                ['safeTransferFrom(address,address,uint256,bytes)'](
                  roles.user.address,
                  requesterAuthorizerWithErc721.address,
                  tokenId,
                  onERC721ReceivedArguments
                );
              await expect(
                requesterAuthorizerWithErc721
                  .connect(roles.user)
                  .withdrawToken(roles.airnode.address, chainId, roles.requester.address, erc721.address)
              ).to.be.revertedWith('Withdrawal not initiated');
            });
          });
        });
        context('Withdrawal has been initiated', function () {
          context('It is past earliest withdrawal time', function () {
            it('withdraws', async function () {
              const { roles, requesterAuthorizerWithErc721, erc721 } = await helpers.loadFixture(deploy);
              const withdrawalLeadTime = 7 * 24 * 30 * 30;
              const chainId = 123;
              const tokenId = 5;
              const onERC721ReceivedArguments = ethers.utils.defaultAbiCoder.encode(
                ['address', 'uint256', 'address'],
                [roles.airnode.address, chainId, roles.requester.address]
              );
              await requesterAuthorizerWithErc721
                .connect(roles.airnode)
                .setWithdrawalLeadTime(roles.airnode.address, withdrawalLeadTime);
              await erc721
                .connect(roles.user) // eslint-disable-next-line no-unexpected-multiline
                ['safeTransferFrom(address,address,uint256,bytes)'](
                  roles.user.address,
                  requesterAuthorizerWithErc721.address,
                  tokenId,
                  onERC721ReceivedArguments
                );
              const nextTimestamp = (await helpers.time.latest()) + 1;
              await helpers.time.setNextBlockTimestamp(nextTimestamp);
              const earliestWithdrawalTime = nextTimestamp + withdrawalLeadTime;
              await requesterAuthorizerWithErc721
                .connect(roles.user)
                .initiateTokenWithdrawal(roles.airnode.address, chainId, roles.requester.address, erc721.address);
              await helpers.time.setNextBlockTimestamp(earliestWithdrawalTime);
              expect(
                await requesterAuthorizerWithErc721.airnodeToChainIdToRequesterToTokenAddressToTokenDeposits(
                  roles.airnode.address,
                  chainId,
                  roles.requester.address,
                  erc721.address
                )
              ).to.equal(0);
              const depositBefore =
                await requesterAuthorizerWithErc721.airnodeToChainIdToRequesterToTokenToDepositorToDeposit(
                  roles.airnode.address,
                  chainId,
                  roles.requester.address,
                  erc721.address,
                  roles.user.address
                );
              expect(depositBefore.tokenId).to.equal(tokenId);
              expect(depositBefore.withdrawalLeadTime).to.equal(withdrawalLeadTime);
              expect(depositBefore.earliestWithdrawalTime).to.equal(earliestWithdrawalTime);
              expect(await erc721.ownerOf(tokenId)).to.equal(requesterAuthorizerWithErc721.address);
              expect(await erc721.balanceOf(requesterAuthorizerWithErc721.address)).to.equal(1);
              await expect(
                requesterAuthorizerWithErc721
                  .connect(roles.user)
                  .withdrawToken(roles.airnode.address, chainId, roles.requester.address, erc721.address)
              )
                .to.emit(requesterAuthorizerWithErc721, 'WithdrewToken')
                .withArgs(
                  roles.airnode.address,
                  roles.requester.address,
                  roles.user.address,
                  chainId,
                  erc721.address,
                  tokenId,
                  0
                );
              expect(
                await requesterAuthorizerWithErc721.airnodeToChainIdToRequesterToTokenAddressToTokenDeposits(
                  roles.airnode.address,
                  chainId,
                  roles.requester.address,
                  erc721.address
                )
              ).to.equal(0);
              const depositAfter =
                await requesterAuthorizerWithErc721.airnodeToChainIdToRequesterToTokenToDepositorToDeposit(
                  roles.airnode.address,
                  chainId,
                  roles.requester.address,
                  erc721.address,
                  roles.user.address
                );
              expect(depositAfter.tokenId).to.equal(0);
              expect(depositAfter.withdrawalLeadTime).to.equal(0);
              expect(depositAfter.earliestWithdrawalTime).to.equal(0);
              expect(await erc721.ownerOf(tokenId)).to.equal(roles.user.address);
              expect(await erc721.balanceOf(requesterAuthorizerWithErc721.address)).to.equal(0);
            });
          });
          context('It is not past earliest withdrawal time', function () {
            it('reverts', async function () {
              const { roles, requesterAuthorizerWithErc721, erc721 } = await helpers.loadFixture(deploy);
              const withdrawalLeadTime = 7 * 24 * 30 * 30;
              const chainId = 123;
              const tokenId = 5;
              const onERC721ReceivedArguments = ethers.utils.defaultAbiCoder.encode(
                ['address', 'uint256', 'address'],
                [roles.airnode.address, chainId, roles.requester.address]
              );
              await requesterAuthorizerWithErc721
                .connect(roles.airnode)
                .setWithdrawalLeadTime(roles.airnode.address, withdrawalLeadTime);
              await erc721
                .connect(roles.user) // eslint-disable-next-line no-unexpected-multiline
                ['safeTransferFrom(address,address,uint256,bytes)'](
                  roles.user.address,
                  requesterAuthorizerWithErc721.address,
                  tokenId,
                  onERC721ReceivedArguments
                );
              await requesterAuthorizerWithErc721
                .connect(roles.user)
                .initiateTokenWithdrawal(roles.airnode.address, chainId, roles.requester.address, erc721.address);
              await expect(
                requesterAuthorizerWithErc721
                  .connect(roles.user)
                  .withdrawToken(roles.airnode.address, chainId, roles.requester.address, erc721.address)
              ).to.be.revertedWith('Cannot withdraw yet');
            });
          });
        });
      });
      context('Token has not been deposited', function () {
        it('reverts', async function () {
          const { roles, requesterAuthorizerWithErc721, erc721 } = await helpers.loadFixture(deploy);
          const chainId = 123;
          await expect(
            requesterAuthorizerWithErc721
              .connect(roles.user)
              .withdrawToken(roles.airnode.address, chainId, roles.requester.address, erc721.address)
          ).to.be.revertedWith('Token not deposited');
        });
      });
    });
    context('Requester address is blocked for the Airnode', function () {
      it('reverts', async function () {
        const { roles, requesterAuthorizerWithErc721, erc721 } = await helpers.loadFixture(deploy);
        const chainId = 123;
        const tokenId = 5;
        const onERC721ReceivedArguments = ethers.utils.defaultAbiCoder.encode(
          ['address', 'uint256', 'address'],
          [roles.airnode.address, chainId, roles.requester.address]
        );
        await erc721
          .connect(roles.user) // eslint-disable-next-line no-unexpected-multiline
          ['safeTransferFrom(address,address,uint256,bytes)'](
            roles.user.address,
            requesterAuthorizerWithErc721.address,
            tokenId,
            onERC721ReceivedArguments
          );
        await requesterAuthorizerWithErc721
          .connect(roles.airnode)
          .setRequesterBlockStatus(roles.airnode.address, chainId, roles.requester.address, erc721.address);
        await expect(
          requesterAuthorizerWithErc721
            .connect(roles.user)
            .withdrawToken(roles.airnode.address, chainId, roles.requester.address, erc721.address)
        ).to.be.revertedWith('Requester blocked');
      });
    });
  });

  describe('revokeToken', function () {
    context('Requester address is blocked for the Airnode', function () {
      context('Token has been deposited', function () {
        context('Withdrawal has not been initiated', function () {
          it('revokes token', async function () {
            const { roles, requesterAuthorizerWithErc721, erc721 } = await helpers.loadFixture(deploy);
            const chainId = 123;
            const tokenId = 5;
            const onERC721ReceivedArguments = ethers.utils.defaultAbiCoder.encode(
              ['address', 'uint256', 'address'],
              [roles.airnode.address, chainId, roles.requester.address]
            );
            await erc721
              .connect(roles.user) // eslint-disable-next-line no-unexpected-multiline
              ['safeTransferFrom(address,address,uint256,bytes)'](
                roles.user.address,
                requesterAuthorizerWithErc721.address,
                tokenId,
                onERC721ReceivedArguments
              );
            expect(
              await requesterAuthorizerWithErc721.airnodeToChainIdToRequesterToTokenAddressToTokenDeposits(
                roles.airnode.address,
                chainId,
                roles.requester.address,
                erc721.address
              )
            ).to.equal(1);
            const depositBefore =
              await requesterAuthorizerWithErc721.airnodeToChainIdToRequesterToTokenToDepositorToDeposit(
                roles.airnode.address,
                chainId,
                roles.requester.address,
                erc721.address,
                roles.user.address
              );
            expect(depositBefore.tokenId).to.equal(tokenId);
            expect(depositBefore.withdrawalLeadTime).to.equal(0);
            expect(depositBefore.earliestWithdrawalTime).to.equal(ethers.BigNumber.from(2).pow(32).sub(1));
            expect(await erc721.ownerOf(tokenId)).to.equal(requesterAuthorizerWithErc721.address);
            expect(await erc721.balanceOf(requesterAuthorizerWithErc721.address)).to.equal(1);
            await requesterAuthorizerWithErc721
              .connect(roles.requesterBlocker)
              .setRequesterBlockStatus(roles.airnode.address, chainId, roles.requester.address, true);
            await expect(
              requesterAuthorizerWithErc721
                .connect(roles.user)
                .revokeToken(
                  roles.airnode.address,
                  chainId,
                  roles.requester.address,
                  erc721.address,
                  roles.user.address
                )
            )
              .to.emit(requesterAuthorizerWithErc721, 'RevokedToken')
              .withArgs(
                roles.airnode.address,
                roles.requester.address,
                roles.user.address,
                chainId,
                erc721.address,
                tokenId,
                0
              );
            expect(
              await requesterAuthorizerWithErc721.airnodeToChainIdToRequesterToTokenAddressToTokenDeposits(
                roles.airnode.address,
                chainId,
                roles.requester.address,
                erc721.address
              )
            ).to.equal(0);
            const depositAfter =
              await requesterAuthorizerWithErc721.airnodeToChainIdToRequesterToTokenToDepositorToDeposit(
                roles.airnode.address,
                chainId,
                roles.requester.address,
                erc721.address,
                roles.user.address
              );
            expect(depositAfter.tokenId).to.equal(0);
            expect(depositAfter.withdrawalLeadTime).to.equal(0);
            expect(depositAfter.earliestWithdrawalTime).to.equal(0);
            expect(await erc721.ownerOf(tokenId)).to.equal(roles.airnode.address);
            expect(await erc721.balanceOf(requesterAuthorizerWithErc721.address)).to.equal(0);
          });
        });
        context('Withdrawal has been initiated', function () {
          it('revokes token', async function () {
            const { roles, requesterAuthorizerWithErc721, erc721 } = await helpers.loadFixture(deploy);
            const withdrawalLeadTime = 7 * 24 * 30 * 30;
            const chainId = 123;
            const tokenId = 5;
            const onERC721ReceivedArguments = ethers.utils.defaultAbiCoder.encode(
              ['address', 'uint256', 'address'],
              [roles.airnode.address, chainId, roles.requester.address]
            );
            await requesterAuthorizerWithErc721
              .connect(roles.airnode)
              .setWithdrawalLeadTime(roles.airnode.address, withdrawalLeadTime);
            await erc721
              .connect(roles.user) // eslint-disable-next-line no-unexpected-multiline
              ['safeTransferFrom(address,address,uint256,bytes)'](
                roles.user.address,
                requesterAuthorizerWithErc721.address,
                tokenId,
                onERC721ReceivedArguments
              );
            const nextTimestamp = (await helpers.time.latest()) + 1;
            await helpers.time.setNextBlockTimestamp(nextTimestamp);
            const earliestWithdrawalTime = nextTimestamp + withdrawalLeadTime;
            await requesterAuthorizerWithErc721
              .connect(roles.user)
              .initiateTokenWithdrawal(roles.airnode.address, chainId, roles.requester.address, erc721.address);
            expect(
              await requesterAuthorizerWithErc721.airnodeToChainIdToRequesterToTokenAddressToTokenDeposits(
                roles.airnode.address,
                chainId,
                roles.requester.address,
                erc721.address
              )
            ).to.equal(0);
            const depositBefore =
              await requesterAuthorizerWithErc721.airnodeToChainIdToRequesterToTokenToDepositorToDeposit(
                roles.airnode.address,
                chainId,
                roles.requester.address,
                erc721.address,
                roles.user.address
              );
            expect(depositBefore.tokenId).to.equal(tokenId);
            expect(depositBefore.withdrawalLeadTime).to.equal(withdrawalLeadTime);
            expect(depositBefore.earliestWithdrawalTime).to.equal(earliestWithdrawalTime);
            expect(await erc721.ownerOf(tokenId)).to.equal(requesterAuthorizerWithErc721.address);
            expect(await erc721.balanceOf(requesterAuthorizerWithErc721.address)).to.equal(1);
            await requesterAuthorizerWithErc721
              .connect(roles.requesterBlocker)
              .setRequesterBlockStatus(roles.airnode.address, chainId, roles.requester.address, true);
            await expect(
              requesterAuthorizerWithErc721
                .connect(roles.user)
                .revokeToken(
                  roles.airnode.address,
                  chainId,
                  roles.requester.address,
                  erc721.address,
                  roles.user.address
                )
            )
              .to.emit(requesterAuthorizerWithErc721, 'RevokedToken')
              .withArgs(
                roles.airnode.address,
                roles.requester.address,
                roles.user.address,
                chainId,
                erc721.address,
                tokenId,
                0
              );
            expect(
              await requesterAuthorizerWithErc721.airnodeToChainIdToRequesterToTokenAddressToTokenDeposits(
                roles.airnode.address,
                chainId,
                roles.requester.address,
                erc721.address
              )
            ).to.equal(0);
            const depositAfter =
              await requesterAuthorizerWithErc721.airnodeToChainIdToRequesterToTokenToDepositorToDeposit(
                roles.airnode.address,
                chainId,
                roles.requester.address,
                erc721.address,
                roles.user.address
              );
            expect(depositAfter.tokenId).to.equal(0);
            expect(depositAfter.withdrawalLeadTime).to.equal(0);
            expect(depositAfter.earliestWithdrawalTime).to.equal(0);
            expect(await erc721.ownerOf(tokenId)).to.equal(roles.airnode.address);
            expect(await erc721.balanceOf(requesterAuthorizerWithErc721.address)).to.equal(0);
          });
        });
      });
      context('Token has not been deposited', function () {
        it('reverts', async function () {
          const { roles, requesterAuthorizerWithErc721, erc721 } = await helpers.loadFixture(deploy);
          const chainId = 123;
          await requesterAuthorizerWithErc721
            .connect(roles.requesterBlocker)
            .setRequesterBlockStatus(roles.airnode.address, chainId, roles.requester.address, true);
          await expect(
            requesterAuthorizerWithErc721
              .connect(roles.user)
              .revokeToken(roles.airnode.address, chainId, roles.requester.address, erc721.address, roles.user.address)
          ).to.be.revertedWith('Token not deposited');
        });
      });
    });
    context('Requester address is not blocked for the Airnode', function () {
      it('reverts', async function () {
        const { roles, requesterAuthorizerWithErc721, erc721 } = await helpers.loadFixture(deploy);
        const chainId = 123;
        const tokenId = 5;
        const onERC721ReceivedArguments = ethers.utils.defaultAbiCoder.encode(
          ['address', 'uint256', 'address'],
          [roles.airnode.address, chainId, roles.requester.address]
        );
        await erc721
          .connect(roles.user) // eslint-disable-next-line no-unexpected-multiline
          ['safeTransferFrom(address,address,uint256,bytes)'](
            roles.user.address,
            requesterAuthorizerWithErc721.address,
            tokenId,
            onERC721ReceivedArguments
          );
        await expect(
          requesterAuthorizerWithErc721
            .connect(roles.user)
            .revokeToken(roles.airnode.address, chainId, roles.requester.address, erc721.address, roles.user.address)
        ).to.be.revertedWith('Airnode did not block requester');
      });
    });
  });

  describe('isAuthorized', function () {
    context('Requester address is not blocked for the Airnode', function () {
      context('Token has been deposited', function () {
        context('Withdrawal has not been initiated', function () {
          it('returns true', async function () {
            const { roles, requesterAuthorizerWithErc721, erc721 } = await helpers.loadFixture(deploy);
            const chainId = 123;
            const tokenId = 5;
            const onERC721ReceivedArguments = ethers.utils.defaultAbiCoder.encode(
              ['address', 'uint256', 'address'],
              [roles.airnode.address, chainId, roles.requester.address]
            );
            await erc721
              .connect(roles.user) // eslint-disable-next-line no-unexpected-multiline
              ['safeTransferFrom(address,address,uint256,bytes)'](
                roles.user.address,
                requesterAuthorizerWithErc721.address,
                tokenId,
                onERC721ReceivedArguments
              );
            expect(
              await requesterAuthorizerWithErc721.isAuthorized(
                roles.airnode.address,
                chainId,
                roles.requester.address,
                erc721.address
              )
            ).to.equal(true);
          });
        });
        context('Withdrawal has been initiated', function () {
          it('returns false', async function () {
            const { roles, requesterAuthorizerWithErc721, erc721 } = await helpers.loadFixture(deploy);
            const chainId = 123;
            const tokenId = 5;
            const onERC721ReceivedArguments = ethers.utils.defaultAbiCoder.encode(
              ['address', 'uint256', 'address'],
              [roles.airnode.address, chainId, roles.requester.address]
            );
            await erc721
              .connect(roles.user) // eslint-disable-next-line no-unexpected-multiline
              ['safeTransferFrom(address,address,uint256,bytes)'](
                roles.user.address,
                requesterAuthorizerWithErc721.address,
                tokenId,
                onERC721ReceivedArguments
              );
            await requesterAuthorizerWithErc721
              .connect(roles.user)
              .initiateTokenWithdrawal(roles.airnode.address, chainId, roles.requester.address, erc721.address);
            expect(
              await requesterAuthorizerWithErc721.isAuthorized(
                roles.airnode.address,
                chainId,
                roles.requester.address,
                erc721.address
              )
            ).to.equal(false);
          });
        });
      });
      context('Token has not been deposited', function () {
        it('returns false', async function () {
          const { roles, requesterAuthorizerWithErc721, erc721 } = await helpers.loadFixture(deploy);
          const chainId = 123;
          expect(
            await requesterAuthorizerWithErc721.isAuthorized(
              roles.airnode.address,
              chainId,
              roles.requester.address,
              erc721.address
            )
          ).to.equal(false);
        });
      });
    });
    context('Requester address is blocked for the Airnode', function () {
      it('returns false', async function () {
        const { roles, requesterAuthorizerWithErc721, erc721 } = await helpers.loadFixture(deploy);
        const chainId = 123;
        await requesterAuthorizerWithErc721
          .connect(roles.requesterBlocker)
          .setRequesterBlockStatus(roles.airnode.address, chainId, roles.requester.address, true);
        expect(
          await requesterAuthorizerWithErc721.isAuthorized(
            roles.airnode.address,
            chainId,
            roles.requester.address,
            erc721.address
          )
        ).to.equal(false);
      });
    });
  });
});
