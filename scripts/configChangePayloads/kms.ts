import { KeyManagementServiceClient } from '@google-cloud/kms'
import { BN } from 'bn.js'
import crypto from 'crypto'
import { ec as EC } from 'elliptic'
import { GcpKmsSigner } from 'ethers-gcp-kms-signer'

import { bytesToHexPrefixed, hexToUint8Array } from './utils'

const asn1 = require('asn1.js')

/**
 * Defines a GCP KMS Key.
 */
export interface GcpKmsKey {
    projectId: string
    locationId: string
    keyRingId: string
    keyId: string
    keyVersion: string
}

export async function getGcpKmsSigners(
    keyIds: GcpKmsKey[],
): Promise<GcpKmsSigner[]> {
    return await Promise.all(
        keyIds.map(async (credentials: GcpKmsKey) => {
            return new GcpKmsSigner(credentials)
        }),
    )
}

const calculateRecoveryId = (
    ec: EC,
    r: string,
    s: string,
    digest: string,
    expectedKey: string,
): number => {
    // Recover the public key
    // Is R.y even and R.x less than the curve order n: recovery_id := 0
    // Is R.y odd and R.x less than the curve order n: recovery_id := 1
    // Is R.y even and R.x more than the curve order n: recovery_id := 2
    // Is R.y odd and R.x more than the curve order n: recovery_id := 3
    for (let i = 0; i <= 3; i++) {
        const recoveredKey = ec.recoverPubKey(
            Buffer.from(hexToUint8Array(digest)),
            {
                r: Buffer.from(hexToUint8Array(r)),
                s: Buffer.from(hexToUint8Array(s)),
            },
            i,
        )
        // Raw ECDSA public key - remove first byte (0x04) which signifies that it is uncompressed
        const publicKeyHex = `0x${recoveredKey.encode('hex', false).slice(2)}`
        if (publicKeyHex === expectedKey) {
            return i
        }
    }
    throw new Error('Could not find recoveryId')
}

const EcdsaSigAsnParse = asn1.define('EcdsaSig', function (this: any) {
    this.seq().obj(this.key('r').int(), this.key('s').int())
})

const getRSFromDER = (signature: Uint8Array): { r: string; s: string } => {
    if (signature == undefined) {
        throw new Error('Signature is undefined.')
    }

    const decoded = EcdsaSigAsnParse.decode(signature, 'der')

    const r = new BN(decoded.r)
    let s = new BN(decoded.s)

    // The group order n in secp256k1 (number of points on the curve)
    const secp256k1N = new BN(
        hexToUint8Array(
            '0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141',
        ),
    )
    const secp256k1halfN = secp256k1N.div(new BN(2))

    if (s.gt(secp256k1halfN)) {
        s = secp256k1N.sub(s)
    }

    return {
        r: bytesToHexPrefixed(r.toBuffer('be', 32)),
        s: bytesToHexPrefixed(s.toBuffer('be', 32)),
    }
}

const getRSVFromDERSignature = (
    ec: EC,
    derSignature: Uint8Array,
    digest: string,
    expectedPublicKey: string,
): { r: string; s: string; v: number } => {
    const { r, s } = getRSFromDER(derSignature as Uint8Array)
    const v = calculateRecoveryId(ec, r, s, digest, expectedPublicKey)
    return {
        r,
        s,
        v,
    }
}

const appendRecoveryIdToSignature = (
    ec: EC,
    derSignature: Uint8Array,
    digest: string,
    expectedPublicKey: string,
) => {
    const { r, s, v } = getRSVFromDERSignature(
        ec,
        derSignature,
        digest,
        expectedPublicKey,
    )
    // join r, s and v
    const signature = bytesToHexPrefixed(
        Buffer.concat([
            Buffer.from(hexToUint8Array(r)),
            Buffer.from(hexToUint8Array(s)),
            new BN(v).toBuffer('be', 1),
        ]),
    )
    return signature
}

export async function signUsingGcpKmsClinet(keyId: GcpKmsKey, data: string) {
    const client = new KeyManagementServiceClient({})
    const ec = new EC('secp256k1')

    const kmsVersionName = client.cryptoKeyVersionPath(
        keyId.projectId,
        keyId.locationId,
        keyId.keyRingId,
        keyId.keyId,
        keyId.keyVersion,
    )

    const [publicKey] = await client.getPublicKey({
        name: kmsVersionName,
    })
    if (!publicKey || !publicKey.pem)
        throw new Error(`Can not find key: ${keyId.keyId}`)

    const x509der = crypto
        .createPublicKey(publicKey.pem)
        .export({ format: 'der', type: 'spki' })

    const address = bytesToHexPrefixed(Uint8Array.from(x509der.subarray(-64)))

    const [response] = await client.asymmetricSign({
        name: kmsVersionName,
        digest: {
            sha256: Buffer.from(hexToUint8Array(data)),
        },
    })
    if (!response || !response.signature) {
        throw new Error(`GCP KMS: asymmetricSign() failed`)
    }

    return {
        signature: appendRecoveryIdToSignature(
            ec,
            response.signature as Uint8Array,
            data,
            address,
        ),
        address,
    }
}
