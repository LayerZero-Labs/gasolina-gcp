import { GcpKmsSigner } from 'ethers-gcp-kms-signer'

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
