import { ethers } from 'ethers'
import { GcpKmsSigner } from 'ethers-gcp-kms-signer'
import fs from 'fs'
import path from 'path'
import { parse } from 'ts-command-line-args'

import { getChainIdForNetwork } from '@layerzerolabs/lz-definitions'

import { GcpKmsKey } from './kms'

const PATH = path.join(__dirname)
const FILE_PATH = `${PATH}/signer-change-payloads.json`

/**
 * This script creates signature payloads to be submitted by an Admin of the DVN contract
 * that will add or remove a singer from the DVN contract
 */

const args = parse({
    environment: {
        alias: 'e',
        type: String,
        defaultValue: 'mainnet',
        description: 'environment',
    },
    chainNames: {
        alias: 'c',
        type: String,
        description: 'comma separated list of chain names',
    },
    quorum: {
        type: Number,
        alias: 'q',
        description: 'number of signatures required for quorum',
    },
    signerAddress: {
        type: String,
        description: 'public address of the signer',
    },
    shouldRevoke: {
        type: Number, // Not a boolean to make it required in the command line, so users be explicit about it
        description:
            'set to 1 if you want to remove signer, set to 0 if you want to add signer',
    },
})

const setSignerFunctionSig = 'function setSigner(address _signer, bool _active)'
const EXPIRATION = Date.now() + 7 * 24 * 60 * 60 * 1000 // 1 week expiration from now

const iface = new ethers.utils.Interface([setSignerFunctionSig])

const getCallData = (signerAddress: string, active: boolean) => {
    return iface.encodeFunctionData('setSigner', [signerAddress, active])
}

const hashCallData = (target: string, callData: string, vId: string) => {
    return ethers.utils.keccak256(
        ethers.utils.solidityPack(
            ['uint32', 'address', 'uint', 'bytes'],
            [vId, target, EXPIRATION, callData],
        ),
    )
}

interface Signature {
    signature: string
    address: string
}

const main = async () => {
    const { environment, chainNames, quorum, signerAddress, shouldRevoke } =
        args
    if (shouldRevoke !== 0 && shouldRevoke !== 1) {
        throw new Error('shouldRevoke must be 0 or 1')
    }
    const dvnAddresses = require(`./data/dvn-addresses-${environment}.json`)
    const keyIds = require(`./data/kms-keyids-${environment}.json`)
    const signers = await Promise.all(
        keyIds.map(async (credentials: GcpKmsKey) => {
            return new GcpKmsSigner(credentials)
        }),
    )
    const availableChainNames = chainNames.split(',')

    const results: { [chainName: string]: any } = {}
    await Promise.all(
        availableChainNames.map(async (chainName) => {
            results[chainName] = results[chainName] || {}
            const vId = getChainIdForNetwork(chainName, environment, '2')
            const callData = getCallData(
                signerAddress,
                shouldRevoke === 1 ? false : true,
            )
            const hash = hashCallData(dvnAddresses[chainName], callData, vId)
            // sign
            const signatures = await Promise.all(
                signers.map(async (signer) => ({
                    signature: await signer.signMessage(
                        ethers.utils.arrayify(hash),
                    ),
                    address: await signer.getAddress(),
                })),
            )

            signatures.sort((a: Signature, b: Signature) =>
                a.address.localeCompare(b.address),
            )
            const signaturesForQuorum = signatures.slice(0, quorum)
            const signaturePayload = ethers.utils.solidityPack(
                signaturesForQuorum.map(() => 'bytes'),
                signaturesForQuorum.map((s: Signature) => s.signature),
            )

            results[chainName] = {
                args: {
                    target: dvnAddresses[chainName],
                    signatures: signaturePayload,
                    callData,
                    expiration: EXPIRATION,
                    vid: vId,
                },
                info: {
                    signatures,
                    hashCallData: hash,
                    quorum,
                    signerAddress,
                    shouldRevoke: shouldRevoke === 1,
                },
            }
        }),
    )
    fs.writeFileSync(FILE_PATH, JSON.stringify(results))
    console.log(`Results written to: ${FILE_PATH}`)
}

main()
    .then(() => {
        process.exit(0)
    })
    .catch((err: any) => {
        console.error(err)
        process.exit(1)
    })
