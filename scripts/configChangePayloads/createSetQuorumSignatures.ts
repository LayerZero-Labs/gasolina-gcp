import { GcpKmsSigner } from 'ethers-gcp-kms-signer'
import { ethers } from 'ethers'
import { parse } from 'ts-command-line-args'
import { GcpKmsKey, parseKmsKeyIds } from './kms'
import { getChainIdForNetwork } from '@layerzerolabs/lz-definitions'

import path from 'path'
import fs from 'fs'

const PATH = path.join(__dirname)
const FILE_PATH = `${PATH}/quorum-change-payloads.json`

/**
 * This script creates signature payloads to be submitted by an Admin of the DVN contract
 * that will change the quorum of the DVN contract
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
    oldQuorum: {
        type: Number,
        description:
            'old quorum, which is number of signatures required for change to happen',
    },
    newQuorum: {
        type: Number,
        description: 'new quorum',
    },
})

const setQuorumFunctionSig = 'function setQuorum(uint64 _quorum)'
const EXPIRATION = Date.now() + 7 * 24 * 60 * 60 * 1000 // 1 week expiration from now

const iface = new ethers.utils.Interface([setQuorumFunctionSig])

const getCallData = (newQuorum: number) => {
    return iface.encodeFunctionData('setQuorum', [newQuorum])
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
    const { environment, chainNames, oldQuorum, newQuorum } = args
    const dvnAddresses = require(`./data/dvn-addresses-${environment}.json`)
    const keyIds = require(`./data/kms-keyids-${environment}.json`)
    const signers = await Promise.all(
        keyIds.map(async (credentials: GcpKmsKey) => {
            return new GcpKmsSigner(credentials)
        }),
    )
    const availableChainNames = chainNames.split(',')

    const results: { [chainName: string]: { [sendVersion: string]: any } } = {}
    await Promise.all(
        availableChainNames.map(async (chainName) => {
            results[chainName] = results[chainName] || {}
            const vId = getChainIdForNetwork(chainName, environment, '2')
            const callData = getCallData(newQuorum)
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
            const signaturesForQuorum = signatures.slice(0, oldQuorum)
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
                    oldQuorum,
                    newQuorum,
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
