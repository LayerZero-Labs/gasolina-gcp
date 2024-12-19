import { ethers } from 'ethers'
import fs from 'fs'
import path from 'path'
import { parse } from 'ts-command-line-args'

import { getGcpKmsSigners } from './kms'
import {
    getSignatures,
    getSignaturesPayload,
    getVId,
    hashCallData,
} from './utils'

const PATH = path.join(__dirname)
const FILE_PATH = `${PATH}/signer-change-payloads.json`
const EXPIRATION = Date.now() + 7 * 24 * 60 * 60 * 1000 // 1 week expiration from now

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
const iface = new ethers.utils.Interface([setSignerFunctionSig])
const getCallData = (signerAddress: string, active: boolean) => {
    return iface.encodeFunctionData('setSigner', [signerAddress, active])
}

const main = async () => {
    const { environment, chainNames, quorum, signerAddress, shouldRevoke } =
        args
    if (shouldRevoke !== 0 && shouldRevoke !== 1) {
        throw new Error('shouldRevoke must be 0 or 1')
    }

    const dvnAddresses = require(`./data/dvn-addresses-${environment}.json`)

    const keyIds = require(`./data/kms-keyids-${environment}.json`)
    const signers = await getGcpKmsSigners(keyIds)

    const availableChainNames = chainNames.split(',')

    const results: { [chainName: string]: any } = {}
    await Promise.all(
        availableChainNames.map(async (chainName) => {
            results[chainName] = results[chainName] || {}
            const vId = getVId(chainName, environment)
            const callData = getCallData(
                signerAddress,
                shouldRevoke === 1 ? false : true,
            )

            const hash = hashCallData(
                dvnAddresses[chainName],
                vId,
                EXPIRATION,
                callData,
            )

            const signatures = await getSignatures(signers, hash)
            const signaturesPayload = getSignaturesPayload(signatures, quorum)

            results[chainName] = {
                args: {
                    target: dvnAddresses[chainName],
                    signatures: signaturesPayload,
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
